import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type {
  Alternative,
  BabylistPerson,
  CatalogTier,
  CustomItem,
  ItemStateValue,
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
  /** Current state of THIS item (muted / saved / active). */
  itemState: ItemStateValue
  /** True if the most recent state change came from the other person. */
  isRemoteStateChange: boolean
  remotePickIds: Set<string>
  removingPickIds: Set<string>
  remoteAlternativeIds: Set<string>
  remoteCustomIds: Set<string>
  /** Catalog tier IDs whose override just changed remotely — drives the
   *  highlight-ring animation on the affected tier card. */
  remoteOverrideTierIds: Set<string>
  clearRemote: (kind: 'pick' | 'custom' | 'alt' | 'state' | 'override', id: string) => void
  onAddAlternative: (target: {
    catalogItemId: string | null
    customItemId: string | null
    parentLabel: string
  }) => void
  onEditAlternative: (alt: Alternative, parentLabel: string) => void
  onDeleteAlternative: (id: string) => void
  /** Open the catalog-tier-edit modal. ItemCard wires this to TierCard for
   *  real catalog tiers (skipping synthetic custom-as-tier cards). */
  onEditCatalogTier: (tier: CatalogTier, parentLabel: string) => void
  onTogglePickCatalog: (tierId: string) => void
  onTogglePickCustom: (customItemId: string) => void
  onTogglePickAlternative: (altId: string) => void
  onChangePickQty: (pickId: string, qty: number) => void
  onChangeItemState: (next: ItemStateValue) => void
  onDeleteCustom?: () => void
}

export default function ItemCard(props: Props) {
  const {
    display,
    alternatives,
    picks,
    people,
    myPersonId,
    itemState,
    isRemoteStateChange,
    remotePickIds,
    removingPickIds,
    remoteAlternativeIds,
    remoteCustomIds,
    remoteOverrideTierIds,
    clearRemote,
    onAddAlternative,
    onEditAlternative,
    onDeleteAlternative,
    onEditCatalogTier,
    onTogglePickCatalog,
    onTogglePickCustom,
    onTogglePickAlternative,
    onChangePickQty,
    onChangeItemState,
    onDeleteCustom,
  } = props

  const itemId = display.item.id
  const itemName = display.item.item_name
  const priority = display.item.priority
  const where = display.item.where_to_buy
  const defaultQty = display.item.suggested_qty ?? 1
  const isCollapsedState = itemState === 'muted' || itemState === 'saved'

  /**
   * Local-only "expand back from slim row" toggle. The DB state stays muted/
   * saved; this just unfolds the card for review without changing intent.
   */
  const [locallyExpanded, setLocallyExpanded] = useState(false)
  const showSlim = isCollapsedState && !locallyExpanded

  // Animation ref — fires when the new layout first appears.
  const rowRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!isRemoteStateChange) return
    const el = rowRef.current
    if (!el) return
    const handler = () => clearRemote('state', itemId)
    el.addEventListener('animationend', handler, { once: true })
    return () => el.removeEventListener('animationend', handler)
  }, [isRemoteStateChange, itemId, clearRemote])

  // Remote custom-item appear animation (existing behavior).
  const isRemoteCustom = display.kind === 'custom' && remoteCustomIds.has(itemId)

  // ─── Slim row (muted / saved, not expanded) ────────────────────────────
  if (showSlim) {
    return (
      <SlimRow
        itemName={itemName}
        priority={priority}
        where={where}
        itemState={itemState}
        isRemoteStateChange={isRemoteStateChange}
        rowRef={rowRef}
        onExpand={() => setLocallyExpanded(true)}
        onChangeItemState={onChangeItemState}
      />
    )
  }

  // ─── Full card ─────────────────────────────────────────────────────────
  const myAlts = alternatives.filter((a) =>
    display.kind === 'catalog' ? a.catalog_item_id === itemId : a.custom_item_id === itemId,
  )

  type TierDisplayEntry = {
    display: DisplayTier
    tierKey: string
    /** True if this card's remote-arrival animation should play. */
    isRemoteIn: boolean
    /** Which set we should clear when the animation ends. */
    remoteSource: 'alt' | 'override' | null
  }
  const tierDisplays: TierDisplayEntry[] = []

  if (display.kind === 'catalog') {
    for (const t of display.item.tiers) {
      tierDisplays.push({
        display: { kind: 'catalog', tier: t },
        tierKey: `tier:${t.id}`,
        isRemoteIn: remoteOverrideTierIds.has(t.id),
        remoteSource: remoteOverrideTierIds.has(t.id) ? 'override' : null,
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
      remoteSource: null,
    })
  }

  for (const a of myAlts) {
    tierDisplays.push({
      display: { kind: 'alternative', alt: a },
      tierKey: `alt:${a.id}`,
      isRemoteIn: remoteAlternativeIds.has(a.id),
      remoteSource: remoteAlternativeIds.has(a.id) ? 'alt' : null,
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

  // The full-card branch reuses the existing remote-card-appear animation
  // when (a) the custom item just appeared remotely OR (b) the state just
  // flipped back to active remotely (so the slim row gave way to a card).
  const cardAnimationCls =
    isRemoteCustom || (isRemoteStateChange && itemState === 'active')
      ? 'card-remote-in'
      : locallyExpanded
        ? 'card-expand-appear'
        : ''

  return (
    <div
      ref={rowRef}
      className={cardAnimationCls}
      style={{
        marginBottom: 48,
        paddingBottom: 48,
        borderBottom: '1px dashed var(--line-faint)',
      }}
    >
      {/* "Currently muted/saved" banner shown only when the user has locally
          expanded a collapsed item — a reminder + one-click recollapse. */}
      {isCollapsedState && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '8px 12px',
            marginBottom: 16,
            background:
              itemState === 'muted'
                ? 'rgba(141, 150, 168, 0.12)'
                : 'rgba(106, 122, 79, 0.12)',
            border: `1px dashed ${itemState === 'muted' ? 'var(--ink-faint)' : 'var(--moss)'}`,
            borderRadius: 6,
            fontFamily: 'Manrope',
            fontSize: 12,
            color: itemState === 'muted' ? 'var(--ink-soft)' : 'var(--moss)',
          }}
        >
          <span>
            {itemState === 'muted'
              ? 'This item is muted and not counted in totals.'
              : 'This item is saved for later — still counted in totals.'}
          </span>
          <button
            onClick={() => setLocallyExpanded(false)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              textDecoration: 'underline',
              cursor: 'pointer',
              fontFamily: 'Manrope',
              fontSize: 12,
              padding: 0,
            }}
          >
            Collapse
          </button>
        </div>
      )}

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
        <OverflowMenu
          items={[
            ...(itemState === 'muted'
              ? []
              : [{ label: 'Mute', onClick: () => onChangeItemState('muted') }]),
            ...(itemState === 'saved'
              ? []
              : [{ label: 'Save for later', onClick: () => onChangeItemState('saved') }]),
            ...(itemState === 'active'
              ? []
              : [{ label: 'Activate', onClick: () => onChangeItemState('active') }]),
          ]}
        />
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
        {tierDisplays.map(({ display: td, tierKey, isRemoteIn, remoteSource }) => {
          const info = resolvePickInfo(td)
          const myQty = info.myPick?.qty ?? defaultQty
          const isRealCatalogTier =
            td.kind === 'catalog' && !td.tier.id.startsWith('custom-as-tier:')
          return (
            <div
              key={tierKey}
              className={isRemoteIn ? 'card-remote-in' : ''}
              onAnimationEnd={() => {
                if (!isRemoteIn) return
                if (remoteSource === 'alt' && td.kind === 'alternative')
                  clearRemote('alt', td.alt.id)
                else if (remoteSource === 'override' && td.kind === 'catalog')
                  clearRemote('override', td.tier.id)
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
                onEditCatalog={
                  isRealCatalogTier && td.kind === 'catalog'
                    ? () => onEditCatalogTier(td.tier, itemName)
                    : undefined
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

// ─── Slim collapsed row (muted / saved) ──────────────────────────────────────

function SlimRow({
  itemName,
  priority,
  where,
  itemState,
  isRemoteStateChange,
  rowRef,
  onExpand,
  onChangeItemState,
}: {
  itemName: string
  priority: string | null
  where: string | null
  itemState: ItemStateValue
  isRemoteStateChange: boolean
  rowRef: React.RefObject<HTMLDivElement | null>
  onExpand: () => void
  onChangeItemState: (next: ItemStateValue) => void
}) {
  const isMuted = itemState === 'muted'
  const chipColor = isMuted ? 'var(--ink-faint)' : 'var(--moss)'
  const chipLabel = isMuted ? 'Muted' : 'Saved'
  const ChipIcon = isMuted ? null : <BookmarkIcon />

  function handleRowClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('button')) return
    onExpand()
  }

  const animationCls = isRemoteStateChange ? 'card-remote-in' : 'slim-row-appear'

  return (
    <div
      ref={rowRef}
      onClick={handleRowClick}
      className={animationCls}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        minHeight: 48,
        padding: '8px 14px',
        marginBottom: 12,
        background: isMuted ? 'rgba(141, 150, 168, 0.06)' : 'rgba(106, 122, 79, 0.06)',
        border: `1px solid ${isMuted ? 'rgba(141, 150, 168, 0.25)' : 'rgba(106, 122, 79, 0.3)'}`,
        borderRadius: 6,
        cursor: 'pointer',
        opacity: isMuted ? 0.55 : 1,
        transition: 'opacity 200ms ease',
      }}
    >
      {priority && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '3px 8px',
            borderRadius: 4,
            background: isMuted ? 'var(--ink-faint)' : 'var(--cream-deep)',
            color: isMuted ? 'var(--cream)' : 'var(--ink-soft)',
            filter: isMuted ? 'grayscale(1)' : 'none',
            flexShrink: 0,
          }}
        >
          {priority}
        </span>
      )}

      <span
        style={{
          fontFamily: 'Fraunces',
          fontSize: 17,
          fontWeight: 400,
          color: isMuted ? 'var(--ink-faint)' : 'var(--ink)',
          textDecoration: isMuted ? 'line-through' : 'none',
          flex: 1,
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={itemName}
      >
        {itemName}
      </span>

      {where && (
        <span
          style={{
            fontFamily: 'Manrope',
            fontSize: 11,
            color: 'var(--ink-faint)',
            display: 'inline-flex',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          {where}
        </span>
      )}

      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          padding: '3px 10px',
          borderRadius: 100,
          background: chipColor,
          color: 'var(--cream)',
          flexShrink: 0,
        }}
      >
        {ChipIcon}
        {chipLabel}
      </span>

      <button
        onClick={() => onChangeItemState('active')}
        style={{
          background: 'transparent',
          border: `1px solid ${isMuted ? 'var(--ink-faint)' : 'var(--moss)'}`,
          color: isMuted ? 'var(--ink-soft)' : 'var(--moss)',
          padding: '4px 12px',
          borderRadius: 100,
          fontFamily: 'Manrope',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {isMuted ? 'Unmute' : 'Activate'}
      </button>

      <OverflowMenu
        items={[
          ...(isMuted
            ? [{ label: 'Save for later instead', onClick: () => onChangeItemState('saved') }]
            : [{ label: 'Mute instead', onClick: () => onChangeItemState('muted') }]),
          { label: 'Activate', onClick: () => onChangeItemState('active') },
        ]}
      />
    </div>
  )
}

// ─── Tiny inline overflow menu ───────────────────────────────────────────────

function OverflowMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (items.length === 0) return null

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        aria-label="More options"
        title="More options"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        style={{
          marginLeft: 6,
          background: 'transparent',
          border: '1px solid var(--line)',
          borderRadius: 100,
          width: 26,
          height: 26,
          padding: 0,
          cursor: 'pointer',
          color: 'var(--ink-soft)',
          fontFamily: 'Manrope',
          fontSize: 14,
          fontWeight: 700,
          letterSpacing: '0.1em',
          flexShrink: 0,
        }}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            right: 0,
            zIndex: 30,
            minWidth: 180,
            background: 'var(--cream)',
            border: '1px solid var(--line)',
            borderRadius: 6,
            boxShadow: '0 8px 24px -8px rgba(29, 36, 51, 0.25)',
            padding: 4,
          }}
        >
          {items.map((it) => (
            <button
              key={it.label}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                it.onClick()
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                padding: '8px 12px',
                cursor: 'pointer',
                fontFamily: 'Manrope',
                fontSize: 13,
                color: 'var(--ink)',
                borderRadius: 4,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cream-deep)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function BookmarkIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
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
