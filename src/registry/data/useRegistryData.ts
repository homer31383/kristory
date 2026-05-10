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
  CatalogTierOverride,
  CustomItem,
  ItemState,
  Pick,
  SectionState,
} from '../types'
import {
  loadAlternatives,
  loadCatalog,
  loadCatalogTierOverrides,
  loadCustomItems,
  loadItemStates,
  loadPeople,
  loadPicks,
  loadSectionStates,
  mergeOverridesIntoCatalog,
  type ItemWithTiers,
} from './queries'

export interface RegistryData {
  loading: boolean
  error: string | null
  /** Catalog with per-registry tier overrides already merged in. Each tier
   *  carries `hasOverride: true` if it was customized for this registry. */
  catalog: ItemWithTiers[]
  /** Raw override rows. Exposed for the modal's "Reset to default" path
   *  and the import flow, which need to act on the canonical row directly. */
  catalogTierOverrides: CatalogTierOverride[]
  people: BabylistPerson[]
  customItems: CustomItem[]
  alternatives: Alternative[]
  picks: Pick[]
  itemStates: ItemState[]
  sectionStates: SectionState[]
  remotePickIds: Set<string>
  remoteCustomIds: Set<string>
  remoteAlternativeIds: Set<string>
  remoteStateChangeIds: Set<string>
  /** Catalog tier IDs whose override just changed remotely — drives the
   *  highlight-ring on the tier card the next render. */
  remoteOverrideTierIds: Set<string>
  /** Section names whose collapse state just changed remotely — drives the
   *  brief header highlight when Krista collapses something on her side. */
  remoteSectionChangeNames: Set<string>
  removingPickIds: Set<string>
  clearRemoteFlag: (
    kind: 'pick' | 'custom' | 'alt' | 'state' | 'override' | 'section',
    id: string,
  ) => void
}

export function useRegistryData(
  registryId: string,
  currentPersonId: string | null,
): RegistryData {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [rawCatalog, setRawCatalog] = useState<ItemWithTiers[]>([])
  const [catalogTierOverrides, setCatalogTierOverrides] = useState<CatalogTierOverride[]>([])
  const [people, setPeople] = useState<BabylistPerson[]>([])
  const [customItems, setCustomItems] = useState<CustomItem[]>([])
  const [alternatives, setAlternatives] = useState<Alternative[]>([])
  const [picks, setPicks] = useState<Pick[]>([])
  const [itemStates, setItemStates] = useState<ItemState[]>([])
  const [sectionStates, setSectionStates] = useState<SectionState[]>([])

  const [remotePickIds, setRemotePickIds] = useState<Set<string>>(new Set())
  const [remoteCustomIds, setRemoteCustomIds] = useState<Set<string>>(new Set())
  const [remoteAlternativeIds, setRemoteAlternativeIds] = useState<Set<string>>(new Set())
  const [remoteStateChangeIds, setRemoteStateChangeIds] = useState<Set<string>>(new Set())
  const [remoteOverrideTierIds, setRemoteOverrideTierIds] = useState<Set<string>>(new Set())
  const [remoteSectionChangeNames, setRemoteSectionChangeNames] = useState<Set<string>>(new Set())
  const [removingPickIds, setRemovingPickIds] = useState<Set<string>>(new Set())

  const personRef = useRef(currentPersonId)
  useEffect(() => {
    personRef.current = currentPersonId
  }, [currentPersonId])

  const clearRemoteFlag = useCallback(
    (
      kind: 'pick' | 'custom' | 'alt' | 'state' | 'override' | 'section',
      id: string,
    ) => {
      if (kind === 'pick') setRemotePickIds((s) => { const n = new Set(s); n.delete(id); return n })
      if (kind === 'custom') setRemoteCustomIds((s) => { const n = new Set(s); n.delete(id); return n })
      if (kind === 'alt') setRemoteAlternativeIds((s) => { const n = new Set(s); n.delete(id); return n })
      if (kind === 'state') setRemoteStateChangeIds((s) => { const n = new Set(s); n.delete(id); return n })
      if (kind === 'override') setRemoteOverrideTierIds((s) => { const n = new Set(s); n.delete(id); return n })
      if (kind === 'section') setRemoteSectionChangeNames((s) => { const n = new Set(s); n.delete(id); return n })
    },
    [],
  )

  // ─── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [cat, ppl, customs, alts, pks, states, overrides, sectionsState] =
          await Promise.all([
            loadCatalog(),
            loadPeople(registryId),
            loadCustomItems(registryId),
            loadAlternatives(registryId),
            loadPicks(registryId),
            loadItemStates(registryId),
            loadCatalogTierOverrides(registryId),
            loadSectionStates(registryId),
          ])
        if (!alive) return
        setRawCatalog(cat)
        setCatalogTierOverrides(overrides)
        setPeople(ppl)
        setCustomItems(customs)
        setAlternatives(alts)
        setPicks(pks)
        setItemStates(states)
        setSectionStates(sectionsState)
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
          table: 'babylist_section_states',
          filter: `registry_id=eq.${registryId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as SectionState
          const isRemote =
            (payload.new as SectionState | null)?.updated_by !== personRef.current
          if (payload.eventType === 'INSERT') {
            const r = payload.new as SectionState
            setSectionStates((prev) => (prev.some((s) => s.id === r.id) ? prev : [...prev, r]))
            if (isRemote && r.section)
              setRemoteSectionChangeNames((s) => new Set(s).add(r.section))
          } else if (payload.eventType === 'UPDATE') {
            const r = payload.new as SectionState
            setSectionStates((prev) => prev.map((s) => (s.id === r.id ? r : s)))
            if (isRemote && r.section)
              setRemoteSectionChangeNames((s) => new Set(s).add(r.section))
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as SectionState
            setSectionStates((prev) => prev.filter((s) => s.id !== old.id))
            // Even the local-origin "expand" triggers a brief flicker because
            // we don't know the originator from payload.old reliably; that's
            // OK — the highlight ring is subtle and only ~1s.
            if (row.section)
              setRemoteSectionChangeNames((s) => new Set(s).add(row.section))
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'babylist_catalog_tier_overrides',
          filter: `registry_id=eq.${registryId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as CatalogTierOverride
          const isRemote =
            (payload.new as CatalogTierOverride | null)?.updated_by !== personRef.current
          if (payload.eventType === 'INSERT') {
            const r = payload.new as CatalogTierOverride
            setCatalogTierOverrides((prev) =>
              prev.some((o) => o.id === r.id) ? prev : [...prev, r],
            )
            if (isRemote && r.catalog_tier_id)
              setRemoteOverrideTierIds((s) => new Set(s).add(r.catalog_tier_id))
          } else if (payload.eventType === 'UPDATE') {
            const r = payload.new as CatalogTierOverride
            setCatalogTierOverrides((prev) => prev.map((o) => (o.id === r.id ? r : o)))
            if (isRemote && r.catalog_tier_id)
              setRemoteOverrideTierIds((s) => new Set(s).add(r.catalog_tier_id))
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as CatalogTierOverride
            setCatalogTierOverrides((prev) => prev.filter((o) => o.id !== old.id))
            // Reset-to-default also animates so the user sees the revert.
            if (row.catalog_tier_id)
              setRemoteOverrideTierIds((s) => new Set(s).add(row.catalog_tier_id))
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'babylist_item_states',
          filter: `registry_id=eq.${registryId}`,
        },
        (payload) => {
          // Animate any remote-origin change. We can't tell who made the change
          // from updated_by alone reliably (it may be null), so we compare the
          // new updated_by against the current person.
          const recordForFlag = (payload.new ?? payload.old) as ItemState
          const itemId = recordForFlag.catalog_item_id ?? recordForFlag.custom_item_id
          const isRemote =
            (payload.new as ItemState | null)?.updated_by !== personRef.current
          if (payload.eventType === 'INSERT') {
            const row = payload.new as ItemState
            setItemStates((prev) => (prev.some((s) => s.id === row.id) ? prev : [...prev, row]))
            if (isRemote && itemId) setRemoteStateChangeIds((s) => new Set(s).add(itemId))
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as ItemState
            setItemStates((prev) => prev.map((s) => (s.id === row.id ? row : s)))
            if (isRemote && itemId) setRemoteStateChangeIds((s) => new Set(s).add(itemId))
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as ItemState
            setItemStates((prev) => prev.filter((s) => s.id !== old.id))
            if (itemId) setRemoteStateChangeIds((s) => new Set(s).add(itemId))
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(ch)
    }
  }, [registryId])

  // Merge the per-registry overrides on top of the raw catalog so every
  // downstream consumer sees a single, already-resolved view of each tier.
  const catalog = mergeOverridesIntoCatalog(rawCatalog, catalogTierOverrides)

  return {
    loading,
    error,
    catalog,
    catalogTierOverrides,
    people,
    customItems,
    alternatives,
    picks,
    itemStates,
    sectionStates,
    remotePickIds,
    remoteCustomIds,
    remoteAlternativeIds,
    remoteStateChangeIds,
    remoteOverrideTierIds,
    remoteSectionChangeNames,
    removingPickIds,
    clearRemoteFlag,
  }
}
