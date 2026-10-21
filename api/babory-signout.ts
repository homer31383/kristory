import { NO_STORE, clearSessionCookie } from './_lib/babory.js'

/**
 * POST: clears the Babory family session cookie on this device. No auth
 * needed; it only removes the caller's own cookie.
 */

export const maxDuration = 10

export function POST(): Response {
  const headers = new Headers(NO_STORE)
  headers.append('set-cookie', clearSessionCookie())
  return new Response(null, { status: 204, headers })
}
