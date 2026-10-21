/**
 * Shared server code for the Babory family PIN (api/babory-*.ts).
 *
 * - PINs are hashed with scrypt (16-byte random salt, 64-byte key). The PIN
 *   is never stored or logged in plain text, and request bodies are never logged.
 * - A right PIN sets the `babory_session` cookie: base64url(JSON {v, exp}) + "."
 *   + base64url(HMAC-SHA256(payload, BABORY_SESSION_SECRET)). `v` is the PIN
 *   version, so changing the PIN signs every family device out.
 * - Wrong-PIN counters are keyed by an HMAC of the client IP and of a random
 *   httpOnly device-id cookie (`babory_device`), plus one '*global*' row.
 *
 * The leading underscore keeps Vercel from deploying this file as a function.
 */
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { serviceHeaders, supabaseServerConfig } from './household.js'

export const SESSION_COOKIE = 'babory_session'
export const DEVICE_COOKIE = 'babory_device'
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60 // 30 days
const DEVICE_MAX_AGE = 365 * 24 * 60 * 60

export const PIN_RE = /^\d{6,32}$/

/** Limits. Device and IP: 5 wrong tries in 15 min lock that key for 15 min. Global: >30 in an hour locks the page for an hour. */
export const LIMITS = {
  device: { max: 5, window: '15 minutes', lock: '15 minutes' },
  global: { max: 31, window: '1 hour', lock: '1 hour' },
} as const
export const GLOBAL_KEY = '*global*'

export const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } as const

export function jsonResponse(body: unknown, status: number, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra)
  headers.set('cache-control', NO_STORE['cache-control'])
  headers.set('x-robots-tag', NO_STORE['x-robots-tag'])
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(body), { status, headers })
}

/** The HMAC secret, or null (callers fail closed with 500 and log only the name). */
export function sessionSecret(): string | null {
  const secret = process.env.BABORY_SESSION_SECRET || ''
  if (!secret) {
    console.log('babory: BABORY_SESSION_SECRET is not set')
    return null
  }
  return secret
}

// ─── Encoding / HMAC ─────────────────────────────────────────────────────────

function b64url(buf: Buffer): string {
  return buf.toString('base64url')
}

function hmac(secret: string, data: string): Buffer {
  return createHmac('sha256', secret).update(data, 'utf8').digest()
}

export function hmacHex(secret: string, data: string): string {
  return hmac(secret, data).toString('hex')
}

// ─── PIN hashing ─────────────────────────────────────────────────────────────

function scrypt(pin: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scryptCb(pin, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key))),
  )
}

export async function hashPin(pin: string): Promise<{ hash: string; salt: string }> {
  const salt = randomBytes(16)
  const key = await scrypt(pin, salt)
  return { hash: key.toString('hex'), salt: salt.toString('hex') }
}

export async function pinMatches(pin: string, hashHex: string, saltHex: string): Promise<boolean> {
  const want = Buffer.from(hashHex, 'hex')
  const have = await scrypt(pin, Buffer.from(saltHex, 'hex'))
  return want.length === have.length && timingSafeEqual(want, have)
}

// ─── Cookies ─────────────────────────────────────────────────────────────────

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie') || ''
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`
}

export function sessionCookie(secret: string, version: number): string {
  const payload = b64url(Buffer.from(JSON.stringify({ v: version, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE })))
  return cookie(SESSION_COOKIE, `${payload}.${b64url(hmac(secret, payload))}`, SESSION_MAX_AGE)
}

export function clearSessionCookie(): string {
  return cookie(SESSION_COOKIE, '', 0)
}

/** The signed session's PIN version if the cookie is authentic and unexpired, else null. */
export function readSession(req: Request, secret: string): number | null {
  const raw = readCookie(req, SESSION_COOKIE)
  if (!raw) return null
  const dot = raw.indexOf('.')
  if (dot <= 0) return null
  const payload = raw.slice(0, dot)
  const sig = Buffer.from(raw.slice(dot + 1), 'base64url')
  const want = hmac(secret, payload)
  if (sig.length !== want.length || !timingSafeEqual(sig, want)) return null
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { v?: unknown; exp?: unknown }
    if (typeof data.v !== 'number' || typeof data.exp !== 'number') return null
    if (data.exp <= Math.floor(Date.now() / 1000)) return null
    return data.v
  } catch {
    return null
  }
}

/** The device id from its cookie, or a new one plus the Set-Cookie to store it. */
export function deviceId(req: Request): { id: string; setCookie: string | null } {
  const existing = readCookie(req, DEVICE_COOKIE)
  if (existing && /^[A-Za-z0-9_-]{32,64}$/.test(existing)) return { id: existing, setCookie: null }
  const id = b64url(randomBytes(32))
  return { id, setCookie: cookie(DEVICE_COOKIE, id, DEVICE_MAX_AGE) }
}

/** Client IP on Vercel: first x-forwarded-for entry, else x-real-ip. */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return (req.headers.get('x-real-ip') || 'unknown').trim()
}

// ─── Supabase (service key) ──────────────────────────────────────────────────

export interface ServiceClient {
  rest<T>(path: string, init?: RequestInit): Promise<T>
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<T>
}

/** PostgREST with the service key (apikey only for sb_secret_ keys), or null if unconfigured. */
export function serviceClient(): ServiceClient | null {
  const { supabaseUrl, serviceKey } = supabaseServerConfig()
  if (!supabaseUrl || !serviceKey) {
    console.log('babory: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured')
    return null
  }
  const headers = { ...serviceHeaders(serviceKey), Accept: 'application/json', 'Content-Type': 'application/json' }
  const call = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> | undefined) } })
    // Never echo the response body or the key.
    if (!res.ok) throw new Error(`${path.split('?')[0]}: HTTP ${res.status}`)
    const text = await res.text()
    return (text ? JSON.parse(text) : null) as T
  }
  return {
    rest: call,
    rpc: (fn, args) => call(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }),
  }
}

export interface PinRow {
  pin_hash: string
  salt: string
  version: number
  updated_at: string
}

export async function loadPin(db: ServiceClient): Promise<PinRow | null> {
  const rows = await db.rest<PinRow[]>('babory_family_pin?select=pin_hash,salt,version,updated_at&id=eq.true&limit=1')
  return rows[0] ?? null
}
