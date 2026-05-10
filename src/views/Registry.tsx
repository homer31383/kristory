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
import { useRegistryData } from '../registry/data/useRegistryData'
import { useBabylistPerson } from '../registry/lib/useBabylistPerson'
import { REGISTRY_ID } from '../registry/config'
import {
  addAlternative,
  addCustomItem,
  addPick,
  deleteAlternative,
  deleteCustomItem,
  deletePick,
  updateAlternative,
  updatePickQty,
} from '../registry/data/queries'
import type { Pick } from '../registry/types'
import { buildCsv, downloadCsv, parseCsv, summarizeImport, todayStamp } from '../registry/lib/csv'
import { importCsv } from '../registry/lib/import'
import { useUser } from '../hooks/useUser'

export default function Registry() {
  const { user } = useUser()
  const { loading: idLoading, error: idError, personId } = useBabylistPerson()
  const data = useRegistryData(REGISTRY_ID, personId)

  const [filters, setFilters] = useState<Filters>({
    priority: new Set<string>(),
    where: new Set<string>(),
    myPicksOnly: false,
  })
  const [modal, setModal] = useState<AddItemMode | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [importPending, setImportPending] = useState<{
    rows: ReturnType<typeof parseCsv>
    personName: string
    personExists: boolean
  } | null>(null)

  // ─── Build the unified display list (must be unconditional for hook order) ─
  const allItems: DisplayItem[] = useMemo(
    () => [
      ...data.catalog.map((it): DisplayItem => ({ kind: 'catalog', item: it })),
      ...data.customItems.map((it): DisplayItem => ({ kind: 'custom', item: it })),
    ],
    [data.catalog, data.customItems],
  )

  const filtered = useMemo(() => {
    return allItems.filter((di) => {
      const item = di.item
      if (filters.priority.size > 0 && !filters.priority.has(item.priority ?? '')) return false
      if (filters.where.size > 0 && !filters.where.has(item.where_to_buy ?? '')) return false
      if (filters.myPicksOnly) {
        if (!anyPickForItem(di, data.picks, personId, data.alternatives)) return false
      }
      return true
    })
  }, [allItems, filters, data.picks, data.alternatives, personId])

  const grouped = useMemo(() => {
    const g = new Map<string, DisplayItem[]>()
    for (const di of filtered) {
      const sec = di.item.section
      if (!g.has(sec)) g.set(sec, [])
      g.get(sec)!.push(di)
    }
    return g
  }, [filtered])

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

  const totals = useMemo(() => computeTotals(data.catalog), [data.catalog])

  function pickCost(p: Pick): number {
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
  }) {
    await addCustomItem({ ...input, registry_id: REGISTRY_ID, added_by: personId })
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

  async function handleDeleteCustom(id: string) {
    if (!confirm('Delete this custom item? This will remove all picks attached to it.')) return
    await deleteCustomItem(id)
  }

  async function handleDeleteAlternative(id: string) {
    if (!confirm('Remove this alternative? Any picks for it will be cleared.')) return
    await deleteAlternative(id)
  }

  function handleExport() {
    const csv = buildCsv({
      catalogItems: data.catalog,
      catalogTiers: flatTiers,
      customItems: data.customItems,
      alternatives: data.alternatives,
      people: data.people,
      picks: data.picks,
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
    setImportPending({ rows, personName, personExists: exists })
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

  let sectionIdx = 0

  return (
    <div className="registry-theme" style={{ minHeight: '100vh' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px 220px' }}>
        <Header />
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
          {Array.from(grouped.entries()).map(([section, items]) => {
            sectionIdx++
            return (
              <section key={section} style={{ marginTop: 48, marginBottom: 24 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 16,
                    paddingBottom: 12,
                    borderBottom: '1px solid var(--ink)',
                    marginBottom: 32,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'Fraunces',
                      fontWeight: 300,
                      fontStyle: 'italic',
                      fontSize: 18,
                      color: 'var(--terracotta)',
                    }}
                  >
                    {String(sectionIdx).padStart(2, '0')}
                  </span>
                  <h2
                    style={{
                      fontFamily: 'Fraunces',
                      fontWeight: 400,
                      fontSize: 32,
                      letterSpacing: '-0.01em',
                      color: 'var(--ink)',
                      flex: 1,
                    }}
                  >
                    {section}
                  </h2>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--ink-faint)',
                      fontFamily: 'Manrope',
                      fontWeight: 500,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {items.length} {items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
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
                      remotePickIds={data.remotePickIds}
                      removingPickIds={data.removingPickIds}
                      remoteAlternativeIds={data.remoteAlternativeIds}
                      remoteCustomIds={data.remoteCustomIds}
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
                      onTogglePickCatalog={handleTogglePickCatalog}
                      onTogglePickCustom={handleTogglePickCustom}
                      onTogglePickAlternative={handleTogglePickAlternative}
                      onChangePickQty={handleChangePickQty}
                      onDeleteCustom={
                        di.kind === 'custom' ? () => handleDeleteCustom(id) : undefined
                      }
                    />
                  )
                })}
              </section>
            )
          })}
          {grouped.size === 0 && (
            <div
              style={{
                padding: '80px 0',
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
          onSubmitAlternativeNew={handleAddAlternative}
          onSubmitAlternativeEdit={handleEditAlternative}
        />
      )}

      {importPending && (
        <ImportConfirm
          name={importPending.personName}
          exists={importPending.personExists}
          onCancel={() => setImportPending(null)}
          onConfirm={performImport}
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
  catalog: { tiers: { tier: string; unit_cost: number | null }[]; suggested_qty: number | null }[],
) {
  let allBudget = 0
  let allMid = 0
  let allPremium = 0
  for (const it of catalog) {
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
  exists,
  onCancel,
  onConfirm,
}: {
  name: string
  exists: boolean
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
        {exists ? (
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
        ) : (
          <p
            style={{
              color: 'var(--ink-soft)',
              fontFamily: 'Fraunces',
              fontStyle: 'italic',
              marginBottom: 16,
            }}
          >
            We'll add a new person "{name}" and attribute the imported picks to them.
          </p>
        )}
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
          {exists && (
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
          )}
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
            {exists ? 'Merge' : 'Import'}
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
