import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type {
  Alternative,
  BabylistPerson,
  CatalogTier,
  CustomItem,
  Pick,
} from '../types'
import type { ItemWithTiers } from '../data/queries'
import TierCard from './TierCard'
import type { DisplayTier } from './TierCard'
import SearchBestPopover from './SearchBestPopover'

export type DisplayItem =
  | { kind: 'catalog'; item: ItemWithTiers }
  | { kind: 'custom'; item: CustomItem }

interface Props {
  display: DisplayItem
  alternatives: Alternative[]
  picks: Pick[]
  people: BabylistPerson[]
  myPersonId: string | null
  remotePickIds: Set<string>
  removingPickIds: Set<string>
  remoteAlternativeIds: Set<string>
  remoteCustomIds: Set<string>
  clearRemote: (kind: 'pick' | 'custom' | 'alt', id: string) => void
  onAddAlternative: (target: {
    catalogItemId: string | null
    customItemId: string | null
    parentLabel: string
  }) => void
  onEditAlternative: (alt: Alternative, parentLabel: string) => void
  onDeleteAlternative: (id: string) => void
  onTogglePickCatalog: (tierId: string) => void
  onTogglePickCustom: (customItemId: string) => void
  onTogglePickAlternative: (altId: string) => void
  onChangePickQty: (pickId: string, qty: number) => void
  onDeleteCustom?: () => void
}

export default function ItemCard(props: Props) {
  const {
    display,
    alternatives,
    picks,
    people,
    myPersonId,
    remotePickIds,
    removingPickIds,
    remoteAlternativeIds,
    remoteCustomIds,
    clearRemote,
    onAddAlternative,
    onEditAlternative,
    onDeleteAlternative,
    onTogglePickCatalog,
    onTogglePickCustom,
    onTogglePickAlternative,
    onChangePickQty,
    onDeleteCustom,
  } = props

  const itemId = display.item.id
  const itemName = display.item.item_name
  const priority = display.item.priority
  const where = display.item.where_to_buy
  const defaultQty = display.item.suggested_qty ?? 1

  const myAlts = alternatives.filter((a) =>
    display.kind === 'catalog' ? a.catalog_item_id === itemId : a.custom_item_id === itemId,
  )

  const isRemoteCustom = display.kind === 'custom' && remoteCustomIds.has(itemId)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isRemoteCustom) return
    const el = ref.current
    if (!el) return
    const handler = () => clearRemote('custom', itemId)
    el.addEventListener('animationend', handler, { once: true })
    return () => el.removeEventListener('animationend', handler)
  }, [isRemoteCustom, itemId, clearRemote])

  const tierDisplays: { display: DisplayTier; tierKey: string; isRemoteIn: boolean }[] = []

  if (display.kind === 'catalog') {
    for (const t of display.item.tiers) {
      tierDisplays.push({
        display: { kind: 'catalog', tier: t },
        tierKey: `tier:${t.id}`,
        isRemoteIn: false,
      })
    }
  } else {
    const c = display.item
    const synthetic: CatalogTier = {
      id: `custom-as-tier:${c.id}`,
      catalog_item_id: c.id,
      tier: 'Mid',
      product: c.product,
      price_str: c.price_str,
      unit_cost: c.unit_cost,
      note: c.note,
      url: c.url,
      display_order: 0,
    }
    tierDisplays.push({
      display: { kind: 'catalog', tier: synthetic },
      tierKey: `custom:${c.id}`,
      isRemoteIn: false,
    })
  }

  for (const a of myAlts) {
    tierDisplays.push({
      display: { kind: 'alternative', alt: a },
      tierKey: `alt:${a.id}`,
      isRemoteIn: remoteAlternativeIds.has(a.id),
    })
  }

  const personMap = new Map(people.map((p) => [p.id, p]))

  function resolvePickInfo(d: DisplayTier) {
    let relevantPicks: Pick[] = []
    if (d.kind === 'catalog') {
      const tierId = d.tier.id
      if (tierId.startsWith('custom-as-tier:') && display.kind === 'custom') {
        relevantPicks = picks.filter((p) => p.custom_item_id === display.item.id)
      } else {
        relevantPicks = picks.filter((p) => p.catalog_tier_id === tierId)
      }
    } else {
      relevantPicks = picks.filter((p) => p.alternative_id === d.alt.id)
    }
    const pickedBy = relevantPicks
      .map((p) => {
        const person = personMap.get(p.person_id)
        if (!person) return null
        return { person, pickId: p.id, qty: p.qty }
      })
      .filter(
        (x): x is { person: BabylistPerson; pickId: string; qty: number } => x !== null,
      )
    const myPick = relevantPicks.find((p) => p.person_id === myPersonId)
    return { pickedBy, myPick }
  }

  const allUrls = tierDisplays.flatMap(({ display: d }) => {
    if (d.kind === 'catalog' && d.tier.url) return [d.tier.url]
    if (d.kind === 'alternative' && d.alt.url) return [d.alt.url]
    return []
  })

  const [popover, setPopover] = useState<{ x: number; y: number } | null>(null)

  const priorityColorMap: Record<string, string> = {
    'Before birth': 'var(--priority-before)',
    '0-3 mo': 'var(--priority-0to3)',
    '3-6 mo': 'var(--priority-3to6)',
    'Nice to have': 'var(--priority-nice)',
  }

  return (
    <div
      ref={ref}
      className={isRemoteCustom ? 'card-remote-in' : ''}
      style={{
        marginBottom: 48,
        paddingBottom: 48,
        borderBottom: '1px dashed var(--line-faint)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {priority && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 4,
              background: priorityColorMap[priority] ?? 'var(--cream-deep)',
              color: 'var(--cream)',
            }}
          >
            {priority}
          </span>
        )}
        {where && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 4,
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--ink-soft)',
            }}
          >
            {where}
          </span>
        )}
        {display.kind === 'custom' && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 4,
              background: 'var(--moss)',
              color: 'var(--cream)',
            }}
          >
            Custom
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
        <h3
          style={{
            fontFamily: 'Fraunces',
            fontWeight: 400,
            fontSize: 26,
            letterSpacing: '-0.01em',
            color: 'var(--ink)',
          }}
        >
          {itemName}
        </h3>
        {allUrls.length >= 2 && (
          <button
            onClick={() =>
              allUrls.forEach((u) => window.open(u, '_blank', 'noopener,noreferrer'))
            }
            style={openAllStyle}
          >
            ⎘ Open all {allUrls.length}
          </button>
        )}
        <button
          onClick={(e) => {
            const r = (e.target as HTMLElement).getBoundingClientRect()
            setPopover({ x: r.left, y: r.bottom + 4 })
          }}
          style={searchBestStyle}
        >
          ↗ Search best
        </button>
        {display.kind === 'custom' && onDeleteCustom && (
          <button
            onClick={onDeleteCustom}
            style={{
              marginLeft: 8,
              background: 'transparent',
              border: 'none',
              color: 'var(--ink-faint)',
              fontSize: 12,
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
          >
            Delete
          </button>
        )}
      </div>

      {defaultQty > 1 && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--ink-faint)',
            fontStyle: 'italic',
            fontFamily: 'Fraunces',
            marginTop: 6,
            marginBottom: 24,
          }}
        >
          Suggested quantity: {defaultQty}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
          marginTop: 16,
        }}
      >
        {tierDisplays.map(({ display: td, tierKey, isRemoteIn }) => {
          const info = resolvePickInfo(td)
          const myQty = info.myPick?.qty ?? defaultQty
          const altId = td.kind === 'alternative' ? td.alt.id : null
          return (
            <div
              key={tierKey}
              className={isRemoteIn ? 'card-remote-in' : ''}
              onAnimationEnd={() => {
                if (altId && isRemoteIn) clearRemote('alt', altId)
              }}
            >
              <TierCard
                display={td}
                parentItemName={itemName}
                pickedBy={info.pickedBy}
                myPickId={info.myPick?.id ?? null}
                myQty={myQty}
                defaultQty={defaultQty}
                remotePickIds={remotePickIds}
                removingPickIds={removingPickIds}
                clearRemote={(id) => clearRemote('pick', id)}
                onTogglePick={() => {
                  if (!myPersonId) return
                  if (td.kind === 'alternative') onTogglePickAlternative(td.alt.id)
                  else if (
                    td.tier.id.startsWith('custom-as-tier:') &&
                    display.kind === 'custom'
                  )
                    onTogglePickCustom(display.item.id)
                  else onTogglePickCatalog(td.tier.id)
                }}
                onChangeQty={(q) => {
                  if (info.myPick) onChangePickQty(info.myPick.id, q)
                }}
                onEditAlternative={
                  td.kind === 'alternative'
                    ? () => onEditAlternative(td.alt, itemName)
                    : undefined
                }
                onDeleteAlternative={
                  td.kind === 'alternative' ? () => onDeleteAlternative(td.alt.id) : undefined
                }
              />
            </div>
          )
        })}

        <button
          onClick={() =>
            onAddAlternative({
              catalogItemId: display.kind === 'catalog' ? itemId : null,
              customItemId: display.kind === 'custom' ? itemId : null,
              parentLabel: itemName,
            })
          }
          style={{
            border: '1px dashed var(--line)',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            gap: 6,
            color: 'var(--ink-faint)',
            cursor: 'pointer',
            minHeight: 200,
            transition: 'all 0.18s ease',
          }}
        >
          <span style={{ fontFamily: 'Fraunces', fontSize: 32, fontWeight: 300, lineHeight: 1 }}>
            +
          </span>
          <span
            style={{
              fontSize: 10,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}
          >
            Add alternative
          </span>
        </button>
      </div>

      {popover && (
        <SearchBestPopover
          itemName={itemName}
          anchor={popover}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  )
}

const openAllStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  marginLeft: 8,
  fontFamily: 'Manrope',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--terracotta)',
  background: 'transparent',
  cursor: 'pointer',
  padding: '3px 10px',
  border: '1px solid var(--terracotta-soft)',
  borderRadius: 100,
}

const searchBestStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  marginLeft: 12,
  fontFamily: 'Manrope',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--moss)',
  background: 'transparent',
  cursor: 'pointer',
  padding: '3px 10px',
  border: '1px solid var(--sage)',
  borderRadius: 100,
}
