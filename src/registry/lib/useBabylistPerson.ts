/**
 * Resolve the current Kristory user to an existing babylist_people row.
 *
 * Read-only by design. The registry is locked to two profiles — purple Chris
 * (kristory_user_id = 9df51388-…) and Krista (cab9d09c-…). Both rows already
 * exist in babylist_people; this hook only looks one of them up by
 * kristory_user_id. It never inserts, upserts, or assigns colors.
 *
 * If the lookup finds nothing (any user other than Chris or Krista), the
 * hook surfaces a "registry is locked" error so /registry shows a clear
 * message rather than silently failing or — worse — minting a third profile.
 */
import { useEffect, useState } from 'react'
import { useUser } from '../../hooks/useUser'
import { REGISTRY_ID } from '../config'
import { findPersonByKristoryUser } from '../data/queries'

export interface BabylistPersonResult {
  loading: boolean
  error: string | null
  personId: string | null
}

export function useBabylistPerson(): BabylistPersonResult {
  const { user } = useUser()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [personId, setPersonId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      setLoading(false)
      setPersonId(null)
      return
    }
    let alive = true
    ;(async () => {
      try {
        const existing = await findPersonByKristoryUser(REGISTRY_ID, user.id)
        if (!alive) return
        if (existing) {
          setPersonId(existing.id)
          setError(null)
        } else {
          setPersonId(null)
          setError('This registry is locked to Chris and Krista.')
        }
        setLoading(false)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [user])

  return { loading, error, personId }
}
