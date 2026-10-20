import { createClient } from '@supabase/supabase-js'

// Supabase Auth (email + password) for Chris and Krista. The session is
// persisted in localStorage and refreshed automatically; once signed in,
// every PostgREST, Storage and Realtime call carries the user's access token.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'kristory-auth',
    },
  }
)

/** The signed-in user's access token, or null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/** Headers for calls to our own /api functions: JSON plus the session token. */
export async function apiHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken()
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}
