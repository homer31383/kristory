import { useState } from 'react'
import type { Alternative, BabylistPerson, CatalogTier } from '../types'
import PickBadges from './PickBadges'

export type DisplayTier =
  | { kind: 'catalog'; tier: CatalogTier }
  | { kind: 'alternative'; alt: Alternative }

interface Props {
  display: DisplayTier
  parentItemName: string
  pickedBy: { person: BabylistPerson; pickId: string; qty: number }[]
  myPickId: string | null
  myQty: number
  defaultQty: number
  remotePickIds: Set<string>
  removingPickIds: Set<string>
  clearRemote: (id: string) => void
  onTogglePick: () => void
  onChangeQty: (qty: number) => void
  onEditAlternative?: () => void
  onDeleteAlternative?: () => void
}

export default function TierCard(props: Props) {
  const {
    display,
    parentItemName,
    pickedBy,
    myPickId,
    myQty,
    defaultQty,
    onTogglePick,
    onChangeQty,
    remotePickIds,
    removingPickIds,
    clearRemote,
    onEditAlternative,
    onDeleteAlternative,
  } = props

  const tierLabel = display.kind === 'catalog' ? display.tier.tier : 'Alternative'
  const product = display.kind === 'catalog' ? display.tier.product : display.alt.product
  const priceStr = display.kind === 'catalog' ? display.tier.price_str : display.alt.price_str
  const unitCost = display.kind === 'catalog' ? display.tier.unit_cost : display.alt.unit_cost
  const note = display.kind === 'catalog' ? display.tier.note : display.alt.note
  const url = display.kind === 'catalog' ? display.tier.url : display.alt.url

  const isPicked = !!myPickId
  const labelColors: Record<string, { bg: string; fg: string }> = {
    Budget: { bg: '#e6ede0', fg: '#4d6037' },
    Mid: { bg: '#dde9f2', fg: '#2c4a66' },
    Premium: { bg: '#ece2ed', fg: '#533a55' },
    Alternative: { bg: '#f0e4d0', fg: '#6a5a2f' },
  }
  const lc = labelColors[tierLabel] ?? labelColors.Alternative

  function handleCardClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('a, button, input, select')) return
    onTogglePick()
  }

  return (
    <div
      onClick={handleCardClick}
      style={{
        border: isPicked ? '1px solid var(--terracotta)' : '1px solid var(--line)',
        background: isPicked ? 'var(--tier-bg-picked)' : 'var(--tier-bg)',
        boxShadow: isPicked ? '0 0 0 2px var(--terracotta) inset' : undefined,
        padding: 22,
        position: 'relative',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
      }}
    >
      {display.kind === 'alternative' && (
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 12,
            display: 'flex',
            gap: 8,
            zIndex: 2,
          }}
        >
          {onEditAlternative && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onEditAlternative()
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--ink-faint)',
                fontSize: 11,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '4px 4px',
              }}
            >
              Edit
            </button>
          )}
          {onDeleteAlternative && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDeleteAlternative()
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--ink-faint)',
                fontSize: 11,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '4px 4px',
              }}
            >
              Remove
            </button>
          )}
        </div>
      )}

      <span
        style={{
          display: 'inline-block',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          marginBottom: 14,
          padding: '3px 10px',
          borderRadius: 100,
          background: lc.bg,
          color: lc.fg,
        }}
      >
        {tierLabel}
      </span>

      <div
        style={{
          fontFamily: 'Fraunces',
          fontSize: 19,
          fontWeight: 500,
          lineHeight: 1.25,
          marginBottom: 8,
          color: 'var(--ink)',
        }}
      >
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              color: 'inherit',
              textDecoration: 'none',
              borderBottom: '1px solid var(--line)',
            }}
          >
            {product || parentItemName}
          </a>
        ) : (
          product || parentItemName
        )}
      </div>

      <a
        href={`https://www.google.com/search?q=${encodeURIComponent((product || parentItemName) + ' review')}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          marginBottom: 8,
          fontFamily: 'Manrope',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          textDecoration: 'none',
          padding: '2px 0',
          borderBottom: '1px dotted var(--ink-faint)',
          width: 'fit-content',
        }}
      >
        Search reviews ↗
      </a>

      {priceStr && (
        <div
          style={{
            fontFamily: 'Fraunces',
            fontStyle: 'italic',
            fontSize: 15,
            color: 'var(--terracotta)',
            marginBottom: 12,
          }}
        >
          {priceStr}
          {unitCost != null && defaultQty > 1 && (
            <span
              style={{
                fontSize: 11,
                color: 'var(--ink-faint)',
                fontStyle: 'normal',
                fontFamily: 'Manrope',
                marginLeft: 4,
              }}
            >
              · {defaultQty}× = ${Math.round(unitCost * defaultQty).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {note && (
        <div
          style={{
            fontSize: 13,
            color: 'var(--ink-soft)',
            lineHeight: 1.5,
            marginBottom: 16,
          }}
        >
          {note}
        </div>
      )}

      {isPicked && (
        <QtyControls value={myQty} onChange={onChangeQty} unitCost={unitCost ?? null} />
      )}

      <button
        onClick={(e) => {
          e.stopPropagation()
          onTogglePick()
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: isPicked ? 'var(--terracotta)' : 'transparent',
          color: isPicked ? 'var(--cream)' : 'var(--ink)',
          border: `1px solid ${isPicked ? 'var(--terracotta)' : 'var(--ink)'}`,
          padding: '6px 14px',
          borderRadius: 100,
          fontFamily: 'Manrope',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        {isPicked ? '✓ Picked by you' : pickedBy.length > 0 ? 'Pick this too' : 'Pick this'}
      </button>

      <PickBadges
        pickedBy={pickedBy.map(({ person, pickId }) => ({ person, pickId }))}
        remotePickIds={remotePickIds}
        removingPickIds={removingPickIds}
        clearRemote={clearRemote}
      />
    </div>
  )
}

function QtyControls({
  value,
  onChange,
  unitCost,
}: {
  value: number
  onChange: (n: number) => void
  unitCost: number | null
}) {
  const [local, setLocal] = useState(String(value))
  const total = unitCost != null ? Math.round(unitCost * value) : null
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: 'rgba(200, 99, 59, 0.06)',
        border: '1px dashed var(--terracotta-soft)',
        borderRadius: 6,
        marginBottom: 12,
      }}
    >
      <span
        style={{
          fontFamily: 'Manrope',
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--ink-soft)',
        }}
      >
        Qty
      </span>
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '1px solid var(--line)',
          background: 'white',
          cursor: 'pointer',
        }}
      >
        −
      </button>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = Math.max(1, parseInt(local, 10) || 1)
          setLocal(String(n))
          if (n !== value) onChange(n)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        style={{
          width: 40,
          textAlign: 'center',
          border: '1px solid var(--line)',
          padding: '2px 4px',
          borderRadius: 4,
          fontFamily: 'Manrope',
          fontSize: 13,
        }}
      />
      <button
        onClick={() => onChange(value + 1)}
        style={{
          width: 24,
          height: 24,
          borderRadius: '50%',
          border: '1px solid var(--line)',
          background: 'white',
          cursor: 'pointer',
        }}
      >
        +
      </button>
      {total != null && (
        <span
          style={{
            marginLeft: 'auto',
            fontFamily: 'Fraunces',
            fontStyle: 'italic',
            color: 'var(--terracotta)',
            fontSize: 13,
          }}
        >
          ${total.toLocaleString()}
        </span>
      )}
    </div>
  )
}
