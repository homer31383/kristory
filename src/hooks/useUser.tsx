import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { User } from '../types'

/**
 * Who is signed in. Chris and Krista each have a Supabase Auth account
 * (email + password, sign-ups disabled). The account's user_metadata.name
 * ("Chris" / "Krista") is matched to the Kristory `users` row, whose id is
 * what every user_id column in the journal references.
 */

type AuthStatus =
  | 'loading' // reading the stored session
  | 'signed-out'
  | 'resolving' // signed in, looking up the Kristory user row
  | 'ready'
  | 'not-household' // signed in, but is_household() said no
  | 'no-profile' // signed in, but no Kristory user matches the account name

interface UserContextValue {
  status: AuthStatus
  session: Session | null
  /** The Kristory `users` row for the signed-in account. */
  user: User | null
  /** The account's display name from user_metadata.name. */
  displayName: string | null
  error: string | null
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const UserContext = createContext<UserContextValue | null>(null)

function metadataName(session: Session | null): string | null {
  const name = session?.user?.user_metadata?.name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

interface Resolution {
  forUserId: string
  forName: string | null
  status: 'ready' | 'not-household' | 'no-profile'
  user: User | null
  error: string | null
}

async function resolveKristoryUser(name: string | null): Promise<Omit<Resolution, 'forUserId' | 'forName'>> {
  // Membership check. If the function is unavailable we let the server and
  // database policies have the final say rather than lock people out.
  const { data: isHousehold, error: rpcError } = await supabase.rpc('is_household')
  if (rpcError) {
    console.warn('[auth] is_household check failed:', rpcError.message)
  } else if (isHousehold === false) {
    return { status: 'not-household', user: null, error: null }
  }

  if (!name) return { status: 'no-profile', user: null, error: 'This account has no name set.' }
  const { data, error } = await supabase.from('users').select('id, name')
  if (error) return { status: 'no-profile', user: null, error: error.message }
  const match = (data as User[] | null)?.find((u) => u.name.trim().toLowerCase() === name.toLowerCase())
  if (!match) return { status: 'no-profile', user: null, error: `No Kristory user named "${name}".` }
  return { status: 'ready', user: match, error: null }
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [resolution, setResolution] = useState<Resolution | null>(null)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return
      setSession(next)
      setSessionLoaded(true)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const userId = session?.user?.id ?? null
  const name = metadataName(session)

  // Resolve the Kristory user row whenever the signed-in account changes
  // (not on every token refresh).
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    resolveKristoryUser(name).then((result) => {
      if (!cancelled) setResolution({ ...result, forUserId: userId, forName: name })
    })
    return () => {
      cancelled = true
    }
  }, [userId, name])

  const current = resolution && resolution.forUserId === userId && resolution.forName === name ? resolution : null
  const status: AuthStatus = !sessionLoaded
    ? 'loading'
    : !userId
      ? 'signed-out'
      : current
        ? current.status
        : 'resolving'
  const user = status === 'ready' ? current?.user ?? null : null
  const error = current?.error ?? null

  const signIn = useCallback(async (email: string, password: string) => {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return signInError ? signInError.message : null
  }, [])

  const signOut = useCallback(async () => {
    // Tear down any realtime channels before the token goes (none are used
    // since the registry was retired; kept as a safety net).
    await supabase.removeAllChannels()
    await supabase.auth.signOut()
  }, [])

  return (
    <UserContext.Provider value={{ status, session, user, displayName: name, error, signIn, signOut }}>
      {children}
    </UserContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
