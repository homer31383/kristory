/**
 * /registry — Babylist baby registry hosted inside Kristory.
 *
 * The standalone Babylist app used localStorage for identity and a URL-as-secret
 * trust model. Inside Kristory:
 *   - Identity comes from Kristory's useUser() (custom users table).
 *   - First load syncs the Kristory user into a babylist_people row via
 *     useBabylistPerson(); subsequent loads find the row by kristory_user_id.
 *   - The Kristory Layout (sidebar + bottomnav) provides outer chrome.
 *   - All registry colors/typography stay scoped inside .registry-theme so the
 *     cream+terracotta aesthetic doesn't leak into the rest of Kristory.
 */
import { useMemo, useState } from 'react'
import Header from '../registry/components/Header'
import Dashboard from '../registry/components/Dashboard'
import FilterBar from '../registry/components/FilterBar'
import type { Filters } from '../registry/components/FilterBar'
import ItemCard from '../registry/components/ItemCard'
import type { DisplayItem } from '../registry/components/ItemCard'
import FloatingBar from '../registry/components/FloatingBar'
import AddItemModal from '../registry/components/AddItemModal'
import type { AddItemMode } from '../registry/components/AddItemModal'
import PairExtensionModal from '../registry/components/PairExtensionModal'
import { useRegistryData } from '../registry/data/useRegistryData'
import { useBabylistPerson } from '../registry/lib/useBabylistPerson'
import { REGISTRY_ID } from '../registry/config'
import {
  addAlternative,
  addCustomItem,
  addPick,
  clearItemState,
  clearSectionState,
  deleteAlternative,
  deleteCatalogTierOverride,
  deleteCustomItem,
  deletePick,
  updateAlternative,
  updateCustomItem,
  updatePickQty,
  upsertCatalogTierOverride,
  upsertItemState,
  upsertSectionState,
} from '../registry/data/queries'
import type { ItemStateValue, Pick } from '../registry/types'
import { buildCsv, downloadCsv, parseCsv, summarizeImport, todayStamp } from '../registry/lib/csv'
import { importCsv } from '../registry/lib/import'
import CategoryJumpMenu from '../registry/components/CategoryJumpMenu'
import type { SectionEntry } from '../registry/components/CategoryJumpMenu'
import { useUser } from '../hooks/useUser'

/** DOM id helper for scroll-into-view from the jump menu. */
function sectionDomId(name: string): string {
  return 'registry-section-' + name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
}

export default function Registry() {
  const { user } = useUser()
  const { loading: idLoading, error: idError, personId } = useBabylistPerson()
  const data = useRegistryData(REGISTRY_ID, personId)

  const [filters, setFilters] = useState<Filters>({
    priority: new Set<string>(),
    where: new Set<string>(),
    myPicksOnly: false,
    hideMuted: false,
    showOnlySaved: false,
  })
  const [modal, setModal] = useState<AddItemMode | null>(null)
  const [pairOpen, setPairOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [importPending, setImportPending] = useState<{
    rows: ReturnType<typeof parseCsv>
    personName: string
  } | null>(null)

  // ─── Build the unified display list (must be unconditional for hook order) ─
  const allItems: DisplayItem[] = useMemo(
    () => [
      ...data.catalog.map((it): DisplayItem => ({ kind: 'catalog', item: it })),
      ...data.customItems.map((it): DisplayItem => ({ kind: 'custom', item: it })),
    ],
    [data.catalog, data.customItems],
  )

  /**
   * Map of itemId → state. Items not present are 'active'. itemId is the
   * catalog_item_id or custom_item_id (both are globally unique).
   */
  const stateByItem = useMemo(() => {
    const m = new Map<string, ItemStateValue>()
    for (const s of data.itemStates) {
      const key = s.catalog_item_id ?? s.custom_item_id
      if (key) m.set(key, s.state)
    }
    return m
  }, [data.itemStates])

  function stateOf(itemId: string): ItemStateValue {
    return stateByItem.get(itemId) ?? 'active'
  }

  const filtered = useMemo(() => {
    return allItems.filter((di) => {
      const item = di.item
      const state = stateByItem.get(item.id) ?? 'active'
      if (filters.showOnlySaved && state !== 'saved') return false
      if (filters.hideMuted && state === 'muted') return false
      if (filters.priority.size > 0 && !filters.priority.has(item.priority ?? '')) return false
      if (filters.where.size > 0 && !filters.where.has(item.where_to_buy ?? '')) return false
      if (filters.myPicksOnly) {
        if (!anyPickForItem(di, data.picks, personId, data.alternatives)) return false
      }
      return true
    })
  }, [allItems, filters, data.picks, data.alternatives, personId, stateByItem])

  /**
   * Section order from the catalog's natural ordering — preserved even when a
   * filter would otherwise hide every item in the section. We render an empty
   * header with a "0 visible" indicator in that case so the user knows the
   * category still exists.
   */
  const sectionsInOrder = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const di of allItems) {
      const s = di.item.section
      if (!seen.has(s)) {
        seen.add(s)
        ordered.push(s)
      }
    }
    return ordered
  }, [allItems])

  const grouped = useMemo(() => {
    const g = new Map<string, DisplayItem[]>()
    for (const di of filtered) {
      const sec = di.item.section
      if (!g.has(sec)) g.set(sec, [])
      g.get(sec)!.push(di)
    }
    return g
  }, [filtered])

  /** Per-section unfiltered totals + picked-by-me count, used for header
   *  counts and the jump menu. */
  const sectionTotals = useMemo(() => {
    const m = new Map<string, { total: number; picked: number }>()
    for (const di of allItems) {
      const sec = di.item.section
      if (!m.has(sec)) m.set(sec, { total: 0, picked: 0 })
      const entry = m.get(sec)!
      entry.total++
      if (anyPickForItem(di, data.picks, personId, data.alternatives)) entry.picked++
    }
    return m
  }, [allItems, data.picks, data.alternatives, personId])

  /** Collapsed-state lookup. A section without a row is expanded. */
  const collapsedSections = useMemo(() => {
    const s = new Set<string>()
    for (const r of data.sectionStates) {
      if (r.collapsed) s.add(r.section)
    }
    return s
  }, [data.sectionStates])

  const flatTiers = useMemo(() => data.catalog.flatMap((it) => it.tiers), [data.catalog])
  const tierMap = useMemo(() => new Map(flatTiers.map((t) => [t.id, t])), [flatTiers])
  const customMap = useMemo(
    () => new Map(data.customItems.map((c) => [c.id, c])),
    [data.customItems],
  )
  const altMap = useMemo(
    () => new Map(data.alternatives.map((a) => [a.id, a])),
    [data.alternatives],
  )

  /**
   * Dashboard totals exclude muted items (per spec). Saved-for-later items
   * count normally. We pass stateByItem so the helper can look up the parent
   * item of each tier/custom/alt.
   */
  const totals = useMemo(
    () =>
      computeTotals(data.catalog, (catalogItemId) => stateByItem.get(catalogItemId) ?? 'active'),
    [data.catalog, stateByItem],
  )

  /**
   * Resolve the parent item for a pick, so we can check whether it's muted.
   * For tier picks → parent is the catalog item. For custom-item picks →
   * parent is the custom item itself. For alternative picks → walk through
   * the alternative to find its parent.
   */
  function parentItemIdForPick(p: Pick): string | null {
    if (p.catalog_tier_id) {
      const t = tierMap.get(p.catalog_tier_id)
      return t?.catalog_item_id ?? null
    }
    if (p.custom_item_id) return p.custom_item_id
    if (p.alternative_id) {
      const a = altMap.get(p.alternative_id)
      return a?.catalog_item_id ?? a?.custom_item_id ?? null
    }
    return null
  }

  function pickCost(p: Pick): number {
    // Muted items contribute 0 — picks are preserved but zeroed.
    const parentId = parentItemIdForPick(p)
    if (parentId && stateByItem.get(parentId) === 'muted') return 0
    const unit =
      (p.catalog_tier_id && tierMap.get(p.catalog_tier_id)?.unit_cost) ??
      (p.custom_item_id && customMap.get(p.custom_item_id)?.unit_cost) ??
      (p.alternative_id && altMap.get(p.alternative_id)?.unit_cost) ??
      0
    return Number(unit ?? 0) * (p.qty ?? 1)
  }

  // ─── Gates ──────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="registry-theme" style={loadingStyle}>
        Pick a user first.
      </div>
    )
  }
  if (idLoading || data.loading) {
    return (
      <div className="registry-theme" style={loadingStyle}>
        Loading registry…
      </div>
    )
  }
  if (idError || data.error) {
    return (
      <div className="registry-theme" style={loadingStyle}>
        Error: {idError ?? data.error}
      </div>
    )
  }
  if (!personId) {
    return (
      <div className="registry-theme" style={loadingStyle}>
        Couldn't resolve your registry identity.
      </div>
    )
  }

  const myTotalCost = data.picks
    .filter((p) => p.person_id === personId)
    .reduce((s, p) => s + pickCost(p), 0)
  const myPickCount = data.picks.filter((p) => p.person_id === personId).length

  // ─── Handlers ─────────────────────────────────────────────────────────
  async function handleTogglePickCatalog(tierId: string) {
    if (!personId) return
    const existing = data.picks.find(
      (p) => p.person_id === personId && p.catalog_tier_id === tierId,
    )
    if (existing) {
      await deletePick(existing.id)
    } else {
      const tier = tierMap.get(tierId)
      const it = data.catalog.find((c) => c.id === tier?.catalog_item_id)
      const qty = it?.suggested_qty ?? 1
      await addPick(REGISTRY_ID, personId, { kind: 'tier', catalog_tier_id: tierId }, qty)
    }
  }

  async function handleTogglePickCustom(customItemId: string) {
    if (!personId) return
    const existing = data.picks.find(
      (p) => p.person_id === personId && p.custom_item_id === customItemId,
    )
    if (existing) {
      await deletePick(existing.id)
    } else {
      const c = customMap.get(customItemId)
      await addPick(
        REGISTRY_ID,
        personId,
        { kind: 'custom', custom_item_id: customItemId },
        c?.suggested_qty ?? 1,
      )
    }
  }

  async function handleTogglePickAlternative(altId: string) {
    if (!personId) return
    const existing = data.picks.find(
      (p) => p.person_id === personId && p.alternative_id === altId,
    )
    if (existing) {
      await deletePick(existing.id)
    } else {
      const a = altMap.get(altId)
      let qty = 1
      if (a?.catalog_item_id) {
        const it = data.catalog.find((c) => c.id === a.catalog_item_id)
        qty = it?.suggested_qty ?? 1
      } else if (a?.custom_item_id) {
        qty = customMap.get(a.custom_item_id)?.suggested_qty ?? 1
      }
      await addPick(
        REGISTRY_ID,
        personId,
        { kind: 'alternative', alternative_id: altId },
        qty,
      )
    }
  }

  async function handleChangePickQty(pickId: string, qty: number) {
    await updatePickQty(pickId, qty)
  }

  async function handleAddCustomItem(input: {
    section: string
    item_name: string
    priority: string | null
    where_to_buy: string | null
    suggested_qty: number | null
    product: string | null
    price_str: string | null
    unit_cost: number | null
    note: string | null
    url: string | null
    image_url: string | null
  }) {
    await addCustomItem({ ...input, registry_id: REGISTRY_ID, added_by: personId })
  }

  async function handleEditCustomItem(
    id: string,
    input: {
      section: string
      item_name: string
      priority: string | null
      where_to_buy: string | null
      suggested_qty: number | null
      product: string | null
      price_str: string | null
      unit_cost: number | null
      note: string | null
      url: string | null
      image_url: string | null
    },
  ) {
    await updateCustomItem(id, input)
  }

  async function handleAddAlternative(input: {
    product: string
    price_str: string | null
    unit_cost: number | null
    note: string | null
    url: string | null
    targetCatalogItemId: string | null
    targetCustomItemId: string | null
  }) {
    await addAlternative({
      registry_id: REGISTRY_ID,
      added_by: personId,
      catalog_item_id: input.targetCatalogItemId,
      custom_item_id: input.targetCustomItemId,
      product: input.product,
      price_str: input.price_str,
      unit_cost: input.unit_cost,
      note: input.note,
      url: input.url,
      image_url: null,
    })
  }

  async function handleEditAlternative(
    id: string,
    patch: {
      product: string
      price_str: string | null
      unit_cost: number | null
      note: string | null
      url: string | null
    },
  ) {
    await updateAlternative(id, patch)
  }

  async function handleSubmitCatalogEdit(
    catalogTierId: string,
    patch: {
      product: string
      price_str: string | null
      unit_cost: number | null
      note: string | null
      url: string | null
    },
  ) {
    await upsertCatalogTierOverride({
      registryId: REGISTRY_ID,
      catalogTierId,
      product: patch.product,
      priceStr: patch.price_str,
      unitCost: patch.unit_cost,
      note: patch.note,
      url: patch.url,
      updatedBy: personId,
    })
  }

  async function handleResetCatalog(catalogTierId: string) {
    await deleteCatalogTierOverride({ registryId: REGISTRY_ID, catalogTierId })
  }

  async function setSectionCollapsedState(section: string, collapsed: boolean) {
    try {
      if (collapsed) {
        await upsertSectionState({
          registryId: REGISTRY_ID,
          section,
          collapsed: true,
          updatedBy: personId,
        })
      } else {
        // Back-to-expanded = delete the row (matches babylist_item_states).
        await clearSectionState({ registryId: REGISTRY_ID, section })
      }
    } catch (e) {
      setToast(`Couldn't update section: ${e instanceof Error ? e.message : String(e)}`)
      setTimeout(() => setToast(null), 6000)
    }
  }

  async function handleToggleSection(section: string) {
    const isCollapsed = collapsedSections.has(section)
    await setSectionCollapsedState(section, !isCollapsed)
  }

  async function handleCollapseAll() {
    for (const s of sectionsInOrder) {
      if (!collapsedSections.has(s)) {
        // Fire and forget; realtime will deliver each one. Awaiting in sequence
        // means the UI updates progressively rather than waiting for the slowest.
        void setSectionCollapsedState(s, true)
      }
    }
  }

  async function handleExpandAll() {
    for (const s of sectionsInOrder) {
      if (collapsedSections.has(s)) {
        void setSectionCollapsedState(s, false)
      }
    }
  }

  function handleJumpToSection(section: string) {
    // Auto-expand if collapsed (the user is clearly trying to see it).
    if (collapsedSections.has(section)) {
      void setSectionCollapsedState(section, false)
    }
    // Scroll the section header into view. Defer one tick so the expansion
    // animation has a chance to start; scrollIntoView still anchors to the
    // section header element, which is positionally stable regardless of
    // whether content below is shown.
    const el = document.getElementById(sectionDomId(section))
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  /** Build the jump menu's section list with current counts. */
  const jumpMenuSections: SectionEntry[] = sectionsInOrder.map((name) => {
    const totals = sectionTotals.get(name) ?? { total: 0, picked: 0 }
    const visible = grouped.get(name)?.length ?? 0
    return {
      name,
      total: totals.total,
      visible,
      picked: totals.picked,
      collapsed: collapsedSections.has(name),
    }
  })

  async function handleDeleteCustom(id: string) {
    if (!confirm('Delete this custom item? This will remove all picks attached to it.')) return
    await deleteCustomItem(id)
  }

  async function handleDeleteAlternative(id: string) {
    if (!confirm('Remove this alternative? Any picks for it will be cleared.')) return
    await deleteAlternative(id)
  }

  async function handleChangeItemState(di: DisplayItem, next: ItemStateValue) {
    const itemKind = di.kind
    const itemId = di.item.id
    try {
      if (next === 'active') {
        await clearItemState({ registryId: REGISTRY_ID, itemKind, itemId })
      } else {
        await upsertItemState({
          registryId: REGISTRY_ID,
          itemKind,
          itemId,
          state: next,
          updatedBy: personId,
        })
      }
    } catch (e) {
      // Surface DB failures rather than swallowing them — silent rejections
      // here were the root of bug 1 (partial-index ON CONFLICT mismatch).
      setToast(`Couldn't change state: ${e instanceof Error ? e.message : String(e)}`)
      setTimeout(() => setToast(null), 6000)
    }
  }

  function handleExport() {
    const csv = buildCsv({
      catalogItems: data.catalog,
      catalogTiers: flatTiers,
      customItems: data.customItems,
      alternatives: data.alternatives,
      people: data.people,
      picks: data.picks,
      itemStates: data.itemStates,
    })
    downloadCsv(`registry-picks-${user!.name.toLowerCase()}-${todayStamp()}.csv`, csv)
  }

  async function handleImportFile(file: File) {
    const text = await file.text()
    const rows = parseCsv(text)
    if (rows.length === 0) {
      setToast('CSV had no rows.')
      return
    }
    let personName = rows.find((r) => r.person)?.person ?? ''
    if (!personName) {
      const v = window.prompt('Whose picks are these? Enter a name:', user!.name)
      if (!v) return
      personName = v.trim()
    }
    const exists = data.people.some((p) => p.name.toLowerCase() === personName.toLowerCase())
    if (!exists) {
      setToast(
        `No matching profile for "${personName}". This registry is locked to Chris and Krista.`,
      )
      setTimeout(() => setToast(null), 6000)
      return
    }
    setImportPending({ rows, personName })
  }

  async function performImport(mode: 'replace' | 'merge') {
    if (!importPending) return
    try {
      const summary = await importCsv(REGISTRY_ID, importPending.rows, importPending.personName, {
        mode,
      })
      setToast(summarizeImport(summary))
      setTimeout(() => setToast(null), 6000)
    } catch (e) {
      setToast(`Import failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setImportPending(null)
    }
  }

  return (
    <div className="registry-theme" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px 220px' }}>
        <Header onPairExtension={() => setPairOpen(true)} />
        <Dashboard
          registryId={REGISTRY_ID}
          myPersonId={personId}
          totals={{ ...totals, itemCount: data.catalog.length }}
          picks={data.picks}
          people={data.people}
          pickCost={pickCost}
        />
        <FilterBar filters={filters} setFilters={setFilters} />

        <main>
          {sectionsInOrder.map((section, i) => {
            const items = grouped.get(section) ?? []
            const totalsForSec = sectionTotals.get(section) ?? { total: 0, picked: 0 }
            const isCollapsed = collapsedSections.has(section)
            const isRemoteSectionChange = data.remoteSectionChangeNames.has(section)

            return (
              <SectionBlock
                key={section}
                section={section}
                idx={i + 1}
                visible={items.length}
                total={totalsForSec.total}
                picked={totalsForSec.picked}
                collapsed={isCollapsed}
                isRemoteSectionChange={isRemoteSectionChange}
                onToggleCollapsed={() => handleToggleSection(section)}
                onAnimationEndHeader={() => data.clearRemoteFlag('section', section)}
              >
                {items.map((di) => {
                  const id = di.item.id
                  return (
                    <ItemCard
                      key={`${di.kind}:${id}`}
                      display={di}
                      alternatives={data.alternatives}
                      picks={data.picks}
                      people={data.people}
                      myPersonId={personId}
                      itemState={stateOf(id)}
                      isRemoteStateChange={data.remoteStateChangeIds.has(id)}
                      remotePickIds={data.remotePickIds}
                      removingPickIds={data.removingPickIds}
                      remoteAlternativeIds={data.remoteAlternativeIds}
                      remoteCustomIds={data.remoteCustomIds}
                      remoteOverrideTierIds={data.remoteOverrideTierIds}
                      clearRemote={data.clearRemoteFlag}
                      onAddAlternative={(t) =>
                        setModal({
                          kind: 'alternative-new',
                          parentLabel: t.parentLabel,
                          targetCatalogItemId: t.catalogItemId,
                          targetCustomItemId: t.customItemId,
                        })
                      }
                      onEditAlternative={(alt, parentLabel) =>
                        setModal({ kind: 'alternative-edit', alt, parentLabel })
                      }
                      onDeleteAlternative={handleDeleteAlternative}
                      onEditCatalogTier={(tier, parentLabel) =>
                        setModal({
                          kind: 'catalog-edit',
                          tier,
                          parentLabel,
                          hasOverride: data.catalogTierOverrides.some(
                            (o) => o.catalog_tier_id === tier.id,
                          ),
                        })
                      }
                      onTogglePickCatalog={handleTogglePickCatalog}
                      onTogglePickCustom={handleTogglePickCustom}
                      onTogglePickAlternative={handleTogglePickAlternative}
                      onChangePickQty={handleChangePickQty}
                      onChangeItemState={(next) => handleChangeItemState(di, next)}
                      onEditCustom={
                        di.kind === 'custom'
                          ? () => setModal({ kind: 'custom-edit', item: di.item })
                          : undefined
                      }
                      onDeleteCustom={
                        di.kind === 'custom' ? () => handleDeleteCustom(id) : undefined
                      }
                    />
                  )
                })}
              </SectionBlock>
            )
          })}
          {sectionsInOrder.length > 0 && grouped.size === 0 && (
            <div
              style={{
                padding: '40px 0',
                textAlign: 'center',
                color: 'var(--ink-faint)',
                fontFamily: 'Fraunces',
                fontStyle: 'italic',
              }}
            >
              No items match these filters.
            </div>
          )}
        </main>
      </div>

      <CategoryJumpMenu
        sections={jumpMenuSections}
        onJump={handleJumpToSection}
        onCollapseAll={handleCollapseAll}
        onExpandAll={handleExpandAll}
      />

      <FloatingBar
        pickCount={myPickCount}
        totalCost={myTotalCost}
        onExport={handleExport}
        onImport={handleImportFile}
        onAddCustom={() => setModal({ kind: 'custom' })}
      />

      {modal && (
        <AddItemModal
          mode={modal}
          onClose={() => setModal(null)}
          onSubmitCustom={handleAddCustomItem}
          onSubmitCustomEdit={handleEditCustomItem}
          onSubmitAlternativeNew={handleAddAlternative}
          onSubmitAlternativeEdit={handleEditAlternative}
          onSubmitCatalogEdit={handleSubmitCatalogEdit}
          onResetCatalog={handleResetCatalog}
        />
      )}

      {importPending && (
        <ImportConfirm
          name={importPending.personName}
          onCancel={() => setImportPending(null)}
          onConfirm={performImport}
        />
      )}

      {pairOpen && (
        <PairExtensionModal
          personId={personId}
          registryId={REGISTRY_ID}
          onClose={() => setPairOpen(false)}
        />
      )}

      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--ink)',
            color: 'var(--cream)',
            padding: '12px 20px',
            borderRadius: 8,
            fontFamily: 'Manrope',
            fontSize: 13,
            zIndex: 200,
            boxShadow: '0 8px 24px -8px rgba(0,0,0,0.4)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

/**
 * One section block — collapsible header + content. Kept as its own component
 * so the `useEffect` that drives the remote-change highlight on the header
 * lives in a stable place.
 */
function SectionBlock({
  section,
  idx,
  visible,
  total,
  picked,
  collapsed,
  isRemoteSectionChange,
  onToggleCollapsed,
  onAnimationEndHeader,
  children,
}: {
  section: string
  idx: number
  visible: number
  total: number
  picked: number
  collapsed: boolean
  isRemoteSectionChange: boolean
  onToggleCollapsed: () => void
  onAnimationEndHeader: () => void
  children: React.ReactNode
}) {
  const filterReducesVisible = visible < total
  const zeroVisible = visible === 0

  const countText = zeroVisible
    ? '0 visible'
    : filterReducesVisible
      ? `${visible} of ${total} visible`
      : `${total} ${total === 1 ? 'item' : 'items'}`

  return (
    <section
      id={sectionDomId(section)}
      style={{ marginTop: 56, marginBottom: 24, scrollMarginTop: 16 }}
    >
      <div
        className={isRemoteSectionChange ? 'card-remote-in' : ''}
        onAnimationEnd={() => {
          if (isRemoteSectionChange) onAnimationEndHeader()
        }}
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 16,
          paddingBottom: 12,
          borderBottom: collapsed ? '1px dashed var(--line)' : '1px solid var(--ink)',
          marginBottom: collapsed ? 0 : 32,
        }}
      >
        <button
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
          title={collapsed ? 'Expand section' : 'Collapse section'}
          style={{
            background: 'transparent',
            border: 'none',
            padding: '4px 6px',
            cursor: 'pointer',
            color: 'var(--ink-soft)',
            display: 'inline-flex',
            alignItems: 'center',
            marginLeft: -6,
          }}
        >
          <span className={collapsed ? 'section-chevron collapsed' : 'section-chevron'}>
            <Chevron />
          </span>
        </button>

        <span
          style={{
            fontFamily: 'Fraunces',
            fontWeight: 300,
            fontStyle: 'italic',
            fontSize: 18,
            color: 'var(--terracotta)',
          }}
        >
          {String(idx).padStart(2, '0')}
        </span>

        <h2
          onClick={onToggleCollapsed}
          style={{
            fontFamily: 'Fraunces',
            fontWeight: 400,
            fontSize: 32,
            letterSpacing: '-0.01em',
            color: collapsed ? 'var(--ink-soft)' : 'var(--ink)',
            flex: 1,
            cursor: 'pointer',
            margin: 0,
          }}
        >
          {section}
        </h2>

        <span
          style={{
            fontSize: 12,
            color: zeroVisible ? 'var(--ink-faint)' : 'var(--ink-soft)',
            fontFamily: 'Manrope',
            fontWeight: 500,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            fontStyle: zeroVisible ? 'italic' : 'normal',
          }}
        >
          {countText}
          {picked > 0 && (
            <span style={{ marginLeft: 8, color: 'var(--terracotta)' }}>
              · {picked} picked
            </span>
          )}
        </span>
      </div>

      <div
        className={collapsed ? 'section-content collapsed' : 'section-content expanded'}
        aria-hidden={collapsed}
      >
        <div style={{ paddingTop: collapsed ? 0 : 0 }}>{children}</div>
      </div>
    </section>
  )
}

function Chevron() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function anyPickForItem(
  di: DisplayItem,
  picks: Pick[],
  personId: string | null,
  alternatives: { id: string; catalog_item_id: string | null; custom_item_id: string | null }[],
): boolean {
  if (!personId) return false
  if (di.kind === 'catalog') {
    const altIds = alternatives
      .filter((a) => a.catalog_item_id === di.item.id)
      .map((a) => a.id)
    return picks.some(
      (p) =>
        p.person_id === personId &&
        ((p.catalog_tier_id && di.item.tiers.some((t) => t.id === p.catalog_tier_id)) ||
          (p.alternative_id && altIds.includes(p.alternative_id))),
    )
  } else {
    const altIds = alternatives
      .filter((a) => a.custom_item_id === di.item.id)
      .map((a) => a.id)
    return picks.some(
      (p) =>
        p.person_id === personId &&
        (p.custom_item_id === di.item.id ||
          (p.alternative_id && altIds.includes(p.alternative_id))),
    )
  }
}

function computeTotals(
  catalog: {
    id: string
    tiers: { tier: string; unit_cost: number | null }[]
    suggested_qty: number | null
  }[],
  stateOf: (catalogItemId: string) => ItemStateValue,
) {
  let allBudget = 0
  let allMid = 0
  let allPremium = 0
  for (const it of catalog) {
    if (stateOf(it.id) === 'muted') continue
    const qty = it.suggested_qty ?? 1
    for (const t of it.tiers) {
      const c = (t.unit_cost ?? 0) * qty
      if (t.tier === 'Budget') allBudget += c
      else if (t.tier === 'Mid') allMid += c
      else if (t.tier === 'Premium') allPremium += c
    }
  }
  return { allBudget, allMid, allPremium }
}

function ImportConfirm({
  name,
  onCancel,
  onConfirm,
}: {
  name: string
  onCancel: () => void
  onConfirm: (mode: 'replace' | 'merge') => void
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(29, 36, 51, 0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--cream)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 24,
          width: '100%',
          maxWidth: 420,
        }}
      >
        <h3 style={{ fontFamily: 'Fraunces', fontWeight: 400, fontSize: 22, marginBottom: 12 }}>
          Import picks for {name}?
        </h3>
        <p
          style={{
            color: 'var(--ink-soft)',
            fontFamily: 'Fraunces',
            fontStyle: 'italic',
            marginBottom: 16,
          }}
        >
          "{name}" already has picks here. Replace them with the CSV's picks, or merge in any new ones?
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--ink-soft)',
              padding: '8px 16px',
              borderRadius: 100,
              cursor: 'pointer',
              fontFamily: 'Manrope',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm('replace')}
            style={{
              background: 'var(--priority-before)',
              color: 'var(--cream)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 100,
              cursor: 'pointer',
              fontFamily: 'Manrope',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Replace
          </button>
          <button
            onClick={() => onConfirm('merge')}
            style={{
              background: 'var(--terracotta)',
              color: 'var(--cream)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 100,
              cursor: 'pointer',
              fontFamily: 'Manrope',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Merge
          </button>
        </div>
      </div>
    </div>
  )
}

const loadingStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontFamily: 'Fraunces',
  fontStyle: 'italic',
  fontSize: 18,
  color: 'var(--ink-soft)',
}
