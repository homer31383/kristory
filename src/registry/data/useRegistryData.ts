/**
 * Single hook that loads + subscribes to all registry data.
 *
 * Realtime strategy:
 *   - Subscribe to babylist_picks / babylist_custom_items / babylist_alternatives
 *     filtered by registry_id.
 *   - On INSERT/UPDATE/DELETE, mutate the local state slice — never invalidate
 *     and re-fetch (avoids the "whole list re-renders, you lose your scroll
 *     position" jank).
 *   - Track the *origin* of each pick (local vs remote) so badge components
 *     know whether to play the entrance animation. We tag a pick as "remote"
 *     iff its person_id !== current babylist_people.id.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type {
  Alternative,
  BabylistPerson,
  CustomItem,
  Pick,
} from '../types'
import {
  loadAlternatives,
  loadCatalog,
  loadCustomItems,
  loadPeople,
  loadPicks,
  type ItemWithTiers,
} from './queries'

export interface RegistryData {
  loading: boolean
  error: string | null
  catalog: ItemWithTiers[]
  people: BabylistPerson[]
  customItems: CustomItem[]
  alternatives: Alternative[]
  picks: Pick[]
  remotePickIds: Set<string>
  remoteCustomIds: Set<string>
  remoteAlternativeIds: Set<string>
  removingPickIds: Set<string>
  clearRemoteFlag: (kind: 'pick' | 'custom' | 'alt', id: string) => void
}

export function useRegistryData(
  registryId: string,
  currentPersonId: string | null,
): RegistryData {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [catalog, setCatalog] = useState<ItemWithTiers[]>([])
  const [people, setPeople] = useState<BabylistPerson[]>([])
  const [customItems, setCustomItems] = useState<CustomItem[]>([])
  const [alternatives, setAlternatives] = useState<Alternative[]>([])
  const [picks, setPicks] = useState<Pick[]>([])

  const [remotePickIds, setRemotePickIds] = useState<Set<string>>(new Set())
  const [remoteCustomIds, setRemoteCustomIds] = useState<Set<string>>(new Set())
  const [remoteAlternativeIds, setRemoteAlternativeIds] = useState<Set<string>>(new Set())
  const [removingPickIds, setRemovingPickIds] = useState<Set<string>>(new Set())

  const personRef = useRef(currentPersonId)
  useEffect(() => {
    personRef.current = currentPersonId
  }, [currentPersonId])

  const clearRemoteFlag = useCallback((kind: 'pick' | 'custom' | 'alt', id: string) => {
    if (kind === 'pick') setRemotePickIds((s) => { const n = new Set(s); n.delete(id); return n })
    if (kind === 'custom') setRemoteCustomIds((s) => { const n = new Set(s); n.delete(id); return n })
    if (kind === 'alt') setRemoteAlternativeIds((s) => { const n = new Set(s); n.delete(id); return n })
  }, [])

  // ─── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cat, ppl, customs, alts, pks] = await Promise.all([
          loadCatalog(),
          loadPeople(registryId),
          loadCustomItems(registryId),
          loadAlternatives(registryId),
          loadPicks(registryId),
        ])
        if (!alive) return
        setCatalog(cat)
        setPeople(ppl)
        setCustomItems(customs)
        setAlternatives(alts)
        setPicks(pks)
        setLoading(false)
      } catch (e) {
        if (!alive) return
        setError(e instanceof Error ? e.message : String(e))
        setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [registryId])

  // ─── Realtime subscriptions ──────────────────────────────────────────────
  useEffect(() => {
    const ch = supabase
      .channel(`registry:${registryId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'babylist_picks',
          filter: `registry_id=eq.${registryId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Pick
            const isRemote = row.person_id !== personRef.current
            setPicks((prev) => (prev.some((p) => p.id === row.id) ? prev : [...prev, row]))
            if (isRemote) setRemotePickIds((s) => new Set(s).add(row.id))
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Pick
            setPicks((prev) => prev.map((p) => (p.id === row.id ? row : p)))
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as Pick
            const isRemote = old.person_id !== personRef.current
            if (isRemote) {
              setRemovingPickIds((s) => new Set(s).add(old.id))
              setTimeout(() => {
                setPicks((prev) => prev.filter((p) => p.id !== old.id))
                setRemovingPickIds((s) => { const n = new Set(s); n.delete(old.id); return n })
              }, 220)
            } else {
              setPicks((prev) => prev.filter((p) => p.id !== old.id))
            }
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'babylist_custom_items',
          filter: `registry_id=eq.${registryId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as CustomItem
            const isRemote = row.added_by !== personRef.current
            setCustomItems((prev) => (prev.some((c) => c.id === row.id) ? prev : [...prev, row]))
            if (isRemote) setRemoteCustomIds((s) => new Set(s).add(row.id))
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as CustomItem
            setCustomItems((prev) => prev.map((c) => (c.id === row.id ? row : c)))
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as CustomItem
            setCustomItems((prev) => prev.filter((c) => c.id !== old.id))
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'babylist_alternatives',
          filter: `registry_id=eq.${registryId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Alternative
            const isRemote = row.added_by !== personRef.current
            setAlternatives((prev) => (prev.some((a) => a.id === row.id) ? prev : [...prev, row]))
            if (isRemote) setRemoteAlternativeIds((s) => new Set(s).add(row.id))
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Alternative
            setAlternatives((prev) => prev.map((a) => (a.id === row.id ? row : a)))
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as Alternative
            setAlternatives((prev) => prev.filter((a) => a.id !== old.id))
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'babylist_people',
          filter: `registry_id=eq.${registryId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as BabylistPerson
            setPeople((prev) => (prev.some((p) => p.id === row.id) ? prev : [...prev, row]))
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as BabylistPerson
            setPeople((prev) => prev.map((p) => (p.id === row.id ? row : p)))
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as BabylistPerson
            setPeople((prev) => prev.filter((p) => p.id !== old.id))
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [registryId])

  return {
    loading,
    error,
    catalog,
    people,
    customItems,
    alternatives,
    picks,
    remotePickIds,
    remoteCustomIds,
    remoteAlternativeIds,
    removingPickIds,
    clearRemoteFlag,
  }
}
