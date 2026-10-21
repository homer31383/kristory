import { verifyHousehold } from './_lib/household.js'
import { PIN_RE, hashPin, isWeakPin, jsonResponse, serviceClient } from './_lib/babory.js'

/**
 * Household-only management of the Babory family PIN.
 *   GET  -> { set, updated_at, lockouts: { device, global } }
 *        never the hash; lockouts are counts for the last 7 days only.
 *   POST { pin } -> { updated_at }   exactly 4 digits, not too easy to guess
 *        (isWeakPin, which reads the baby's birth/due date); scrypt hash + new salt;
 *        the version goes up on every change, which signs out every family
 *        device (their session cookies carry the old version).
 * Request bodies are never logged.
 */

export const maxDuration = 15

export async function GET(req: Request): Promise<Response> {
  const auth = await verifyHousehold(req)
  if (!auth.ok) return auth.response
  const db = serviceClient()
  if (!db) return jsonResponse({ error: 'Server is not configured.' }, 500)
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [rows, events] = await Promise.all([
      db.rest<{ updated_at: string }[]>('babory_family_pin?select=updated_at&id=eq.true&limit=1'),
      db.rest<{ kind: string }[]>(`babory_family_lockouts?select=kind&created_at=gte.${encodeURIComponent(since)}`),
    ])
    const lockouts = {
      device: events.filter((e) => e.kind === 'device').length,
      global: events.filter((e) => e.kind === 'global').length,
    }
    return jsonResponse({ set: rows.length > 0, updated_at: rows[0]?.updated_at ?? null, lockouts }, 200)
  } catch (err) {
    console.log('babory-pin: read failed:', err instanceof Error ? err.message : String(err))
    return jsonResponse({ error: 'Could not read the family PIN status.' }, 500)
  }
}

export async function POST(req: Request): Promise<Response> {
  const auth = await verifyHousehold(req)
  if (!auth.ok) return auth.response
  const db = serviceClient()
  if (!db) return jsonResponse({ error: 'Server is not configured.' }, 500)

  let pin = ''
  try {
    const body = (await req.json()) as { pin?: unknown }
    pin = typeof body?.pin === 'string' ? body.pin : ''
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }
  if (!PIN_RE.test(pin)) return jsonResponse({ error: 'The PIN must be exactly 4 digits.' }, 400)

  try {
    const profiles = await db.rest<{ birth_date: string | null; due_date: string | null }[]>(
      'baby_profile?select=birth_date,due_date&limit=1',
    )
    const profile = profiles[0]
    if (isWeakPin(pin, profile?.birth_date ?? null, profile?.due_date ?? null)) {
      return jsonResponse({ error: 'That PIN is too easy to guess. Please choose another.' }, 400)
    }

    const { hash, salt } = await hashPin(pin)
    const updatedAt = await db.rpc<string>('babory_set_pin', { p_hash: hash, p_salt: salt, p_by: auth.caller.id })
    return jsonResponse({ updated_at: updatedAt }, 200)
  } catch (err) {
    console.log('babory-pin: save failed:', err instanceof Error ? err.message : String(err))
    return jsonResponse({ error: 'Could not save the family PIN.' }, 500)
  }
}
