import {
  GLOBAL_KEY,
  LIMITS,
  PIN_RE,
  clientIp,
  deviceId,
  hmacHex,
  jsonResponse,
  loadPin,
  pinMatches,
  serviceClient,
  sessionCookie,
  sessionSecret,
} from './_lib/babory.js'

/**
 * POST { pin } from the Babory PIN screen (/family).
 *
 * 1. Lock check FIRST: the IP key, the device key or the global key locked
 *    means "Wrong PIN" without even looking at the PIN.
 * 2. scrypt + timingSafeEqual against babory_family_pin.
 * 3. Wrong: +1 on the IP, device and global counters (atomic SQL functions).
 *    Right: clear the IP and device counters, set the 30-day session cookie.
 *
 * Every failure (wrong PIN, malformed PIN, no PIN set, locked out) gets the
 * identical 401 {"error":"Wrong PIN"}: no hints, counts or lock times.
 * The PIN and the request body are never logged.
 */

export const maxDuration = 15

const WRONG = { error: 'Wrong PIN' }

export async function POST(req: Request): Promise<Response> {
  const secret = sessionSecret()
  if (!secret) return jsonResponse({ error: 'Server is not configured.' }, 500)
  const db = serviceClient()
  if (!db) return jsonResponse({ error: 'Server is not configured.' }, 500)

  const device = deviceId(req)
  const extra: Record<string, string> = {}
  if (device.setCookie) extra['set-cookie'] = device.setCookie
  const wrong = () => jsonResponse(WRONG, 401, extra)

  let pin = ''
  try {
    const body = (await req.json()) as { pin?: unknown }
    pin = typeof body?.pin === 'string' ? body.pin : ''
  } catch {
    pin = ''
  }

  const ipKey = `ip:${hmacHex(secret, `ip:${clientIp(req)}`)}`
  const devKey = `dev:${hmacHex(secret, `dev:${device.id}`)}`

  try {
    // 1. Locks before anything else.
    const locked = await db.rpc<boolean>('babory_attempts_locked', { p_keys: [ipKey, devKey, GLOBAL_KEY] })
    if (locked) return wrong()

    // 2. Verify.
    const row = await loadPin(db)
    const ok = !!row && PIN_RE.test(pin) && (await pinMatches(pin, row.pin_hash, row.salt))

    if (!ok || !row) {
      // 3a. Count the failure everywhere. Sequential so a failure to count is
      // never silently ignored.
      const d = LIMITS.device
      const g = LIMITS.global
      await db.rpc('babory_attempt_failed', { p_key: ipKey, p_max: d.max, p_window: d.window, p_lock: d.lock })
      await db.rpc('babory_attempt_failed', { p_key: devKey, p_max: d.max, p_window: d.window, p_lock: d.lock })
      await db.rpc('babory_attempt_failed', { p_key: GLOBAL_KEY, p_max: g.max, p_window: g.window, p_lock: g.lock })
      return wrong()
    }

    // 3b. Right PIN.
    await db.rpc('babory_attempts_clear', { p_keys: [ipKey, devKey] })
    const headers = new Headers(extra)
    headers.append('set-cookie', sessionCookie(secret, row.version))
    return jsonResponse({ ok: true }, 200, headers)
  } catch (err) {
    console.log('babory-unlock: error:', err instanceof Error ? err.message : String(err))
    // Fail closed, indistinguishable from a wrong PIN.
    return wrong()
  }
}
