/**
 * Sync the current Kristory user to a babylist_people row.
 *
 * On first call:
 *   1. Look up babylist_people where registry_id = REGISTRY_ID AND
 *      kristory_user_id = current user's id.
 *   2. If found, return its id (this is the personId used everywhere else).
 *   3. If not found, create a new row. Color resolution priority:
 *      - "Chris" → #6B5CA5 (Kristory's --chris-color)
 *      - "Krista" → #D4708F (Kristory's --krista-color)
 *      - Anyone else → first unused Babylist palette color
 *      The resolved color is written to babylist_people.color so the badges
 *      look consistent in the dashboard and per-tier UI.
 *
 * No localStorage; identity always comes from Kristory's useUser().
 */
import { useEffect, useState } from 'react'
import { useUser } from '../../hooks/useUser'
import { REGISTRY_ID, PERSON_FALLBACK_COLORS } from '../config'
import { createPerson, findPersonByKristoryUser, loadPeople } from '../data/queries'

export interface BabylistPersonResult {
  loading: boolean
  error: string | null
  personId: string | null
}

const KRISTORY_NAME_COLORS: Record<string, string> = {
  chris: '#6B5CA5',
  krista: '#D4708F',
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
          setLoading(false)
          return
        }

        // Compute a fallback color so we don't pick the same one twice.
        const all = await loadPeople(REGISTRY_ID)
        if (!alive) return
        const used = new Set(all.map((p) => (p.color ?? '').toLowerCase()))
        const nameKey = user.name.trim().toLowerCase()
        const color =
          KRISTORY_NAME_COLORS[nameKey] ??
          PERSON_FALLBACK_COLORS.find((c) => !used.has(c.toLowerCase())) ??
          PERSON_FALLBACK_COLORS[0]

        const created = await createPerson(REGISTRY_ID, user.name, color, user.id)
        if (!alive) return
        setPersonId(created.id)
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
