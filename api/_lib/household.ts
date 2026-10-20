/**
 * Caller verification shared by every function under api/.
 *
 * The browser sends the signed-in user's Supabase access token as
 * `Authorization: Bearer <token>`. We validate it against Supabase Auth and
 * then check the user is in `household_members` (Chris or Krista).
 *
 * This talks to Supabase with plain fetch rather than supabase-js on
 * purpose: supabase-js 2.98 sends its key as `Authorization: Bearer` when
 * there is no session, and the new `sb_secret_...` keys are not JWTs and
 * must only go in the `apikey` header. Legacy JWT service-role keys still
 * get a Bearer header, because PostgREST needs one to pick the role.
 *
 * The leading underscore keeps Vercel from deploying this file as a function.
 */

export interface HouseholdCaller {
  id: string
  name: string | null
}

type VerifyResult = { ok: true; caller: HouseholdCaller } | { ok: false; response: Response }

function deny(status: number, error: string): { ok: false; response: Response } {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  }
}

function serviceHeaders(serviceKey: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: serviceKey }
  // Legacy service_role keys are JWTs ("eyJ..."); new sb_secret_ keys are not.
  if (serviceKey.startsWith('eyJ')) headers.Authorization = `Bearer ${serviceKey}`
  return headers
}

export async function verifyHousehold(req: Request): Promise<VerifyResult> {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !serviceKey) {
    console.log('auth: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured')
    return deny(500, 'Server auth is not configured.')
  }

  const header = req.headers.get('authorization') || ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  const token = match?.[1]?.trim()
  if (!token) return deny(401, 'Sign in required.')

  // 1. Validate the access token (equivalent to auth.getUser(token)).
  let userId: string
  let name: string | null = null
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return deny(401, 'Your session has expired. Please sign in again.')
    const user = (await res.json()) as { id?: string; user_metadata?: { name?: unknown } }
    if (!user?.id) return deny(401, 'Your session has expired. Please sign in again.')
    userId = user.id
    if (typeof user.user_metadata?.name === 'string') name = user.user_metadata.name
  } catch (err) {
    console.log('auth: getUser failed:', err instanceof Error ? err.message : String(err))
    return deny(502, 'Could not verify your session. Please try again.')
  }

  // 2. Household membership, looked up with the service key.
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/household_members?select=user_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      { headers: serviceHeaders(serviceKey) },
    )
    if (!res.ok) {
      console.log('auth: household lookup failed with HTTP', res.status)
      return deny(502, 'Could not verify your account. Please try again.')
    }
    const rows = (await res.json()) as unknown[]
    if (!Array.isArray(rows) || rows.length === 0) return deny(403, 'This account is not allowed here.')
  } catch (err) {
    console.log('auth: household lookup error:', err instanceof Error ? err.message : String(err))
    return deny(502, 'Could not verify your account. Please try again.')
  }

  return { ok: true, caller: { id: userId, name } }
}
