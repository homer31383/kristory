import { verifyHousehold } from './_lib/household.js'
import { PIN_RE, hashPin, jsonResponse, serviceClient } from './_lib/babory.js'

/**
 * Household-only management of the Babory family PIN.
 *   GET  -> { set: boolean, updated_at: string | null }   (never the hash)
 *   POST { pin } -> { updated_at }   6-32 digits; scrypt hash + new salt;
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
    const rows = await db.rest<{ updated_at: string }[]>('babory_family_pin?select=updated_at&id=eq.true&limit=1')
    return jsonResponse({ set: rows.length > 0, updated_at: rows[0]?.updated_at ?? null }, 200)
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
  if (!PIN_RE.test(pin)) return jsonResponse({ error: 'The PIN must be 6 or more digits (numbers only).' }, 400)

  try {
    const { hash, salt } = await hashPin(pin)
    const updatedAt = await db.rpc<string>('babory_set_pin', { p_hash: hash, p_salt: salt, p_by: auth.caller.id })
    return jsonResponse({ updated_at: updatedAt }, 200)
  } catch (err) {
    console.log('babory-pin: save failed:', err instanceof Error ? err.message : String(err))
    return jsonResponse({ error: 'Could not save the family PIN.' }, 500)
  }
}
