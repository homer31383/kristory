import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { PRIORITY_OPTIONS, WHERE_OPTIONS } from '../config'
import { parsePriceStr } from '../lib/money'
import type { Alternative, CustomItem } from '../types'

export type AddItemMode =
  | { kind: 'custom' }
  | {
      kind: 'alternative-new'
      parentLabel: string
      targetCatalogItemId: string | null
      targetCustomItemId: string | null
    }
  | { kind: 'alternative-edit'; alt: Alternative; parentLabel: string }

interface Props {
  mode: AddItemMode
  onClose: () => void
  onSubmitCustom: (
    data: Omit<CustomItem, 'id' | 'registry_id' | 'created_at' | 'added_by'>,
  ) => Promise<void>
  onSubmitAlternativeNew: (data: {
    product: string
    price_str: string | null
    unit_cost: number | null
    note: string | null
    url: string | null
    targetCatalogItemId: string | null
    targetCustomItemId: string | null
  }) => Promise<void>
  onSubmitAlternativeEdit: (
    id: string,
    data: {
      product: string
      price_str: string | null
      unit_cost: number | null
      note: string | null
      url: string | null
    },
  ) => Promise<void>
}

export default function AddItemModal({
  mode,
  onClose,
  onSubmitCustom,
  onSubmitAlternativeNew,
  onSubmitAlternativeEdit,
}: Props) {
  const [name, setName] = useState('')
  const [section, setSection] = useState('')
  const [priority, setPriority] = useState<string>(PRIORITY_OPTIONS[0])
  const [where, setWhere] = useState<string>(WHERE_OPTIONS[0])
  const [qty, setQty] = useState('1')
  const [product, setProduct] = useState('')
  const [priceStr, setPriceStr] = useState('')
  const [note, setNote] = useState('')
  const [url, setUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode.kind === 'alternative-edit') {
      setProduct(mode.alt.product)
      setPriceStr(mode.alt.price_str ?? '')
      setNote(mode.alt.note ?? '')
      setUrl(mode.alt.url ?? '')
    }
  }, [mode])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const parsedCost = parsePriceStr(priceStr)
      if (mode.kind === 'custom') {
        await onSubmitCustom({
          section: section.trim() || 'Other',
          item_name: name.trim() || 'Untitled',
          priority,
          where_to_buy: where,
          suggested_qty: Math.max(1, parseInt(qty, 10) || 1),
          product: product.trim() || null,
          price_str: priceStr.trim() || null,
          unit_cost: parsedCost,
          note: note.trim() || null,
          url: url.trim() || null,
        })
      } else if (mode.kind === 'alternative-new') {
        await onSubmitAlternativeNew({
          product: product.trim() || name.trim() || 'Untitled',
          price_str: priceStr.trim() || null,
          unit_cost: parsedCost,
          note: note.trim() || null,
          url: url.trim() || null,
          targetCatalogItemId: mode.targetCatalogItemId,
          targetCustomItemId: mode.targetCustomItemId,
        })
      } else {
        await onSubmitAlternativeEdit(mode.alt.id, {
          product: product.trim() || 'Untitled',
          price_str: priceStr.trim() || null,
          unit_cost: parsedCost,
          note: note.trim() || null,
          url: url.trim() || null,
        })
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  const isAlt = mode.kind !== 'custom'
  const title =
    mode.kind === 'custom'
      ? 'Add a custom item'
      : mode.kind === 'alternative-new'
        ? `Add alternative for ${mode.parentLabel}`
        : `Edit alternative for ${mode.parentLabel}`

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(29, 36, 51, 0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{
          background: 'var(--cream)',
          border: '1px solid var(--line)',
          borderRadius: 8,
          padding: 24,
          width: '100%',
          maxWidth: 520,
          maxHeight: '90vh',
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <h3 style={{ fontFamily: 'Fraunces', fontWeight: 400, fontSize: 24 }}>{title}</h3>

        {!isAlt && (
          <>
            <Field label="Item name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={inputStyle}
              />
            </Field>
            <Field label="Section">
              <input
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="Other"
                style={inputStyle}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Priority">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={inputStyle}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Where">
                <select
                  value={where}
                  onChange={(e) => setWhere(e.target.value)}
                  style={inputStyle}
                >
                  {WHERE_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Suggested quantity">
              <input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                style={inputStyle}
              />
            </Field>
          </>
        )}

        <Field label={isAlt ? 'Product' : 'Product (optional)'}>
          <input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            required={isAlt}
            style={inputStyle}
          />
        </Field>
        <Field label="Price (display string, e.g. $89.99)">
          <input value={priceStr} onChange={(e) => setPriceStr(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Notes">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </Field>
        <Field label="Link">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={inputStyle}
          />
        </Field>

        {error && <div style={{ color: 'var(--priority-before)', fontSize: 13 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={btnSecondaryStyle}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} style={btnPrimaryStyle}>
            {submitting ? 'Saving…' : mode.kind === 'alternative-edit' ? 'Save changes' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontFamily: 'Manrope',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
        }}
      >
        {label}
      </span>
      {children}
    </label>
  )
}

const inputStyle: CSSProperties = {
  border: '1px solid var(--line)',
  background: 'white',
  padding: '8px 12px',
  borderRadius: 4,
  fontFamily: 'Manrope',
  fontSize: 14,
  color: 'var(--ink)',
}

const btnPrimaryStyle: CSSProperties = {
  background: 'var(--terracotta)',
  color: 'var(--cream)',
  border: 'none',
  padding: '10px 18px',
  borderRadius: 100,
  fontFamily: 'Manrope',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}

const btnSecondaryStyle: CSSProperties = {
  background: 'transparent',
  color: 'var(--ink-soft)',
  border: '1px solid var(--line)',
  padding: '10px 18px',
  borderRadius: 100,
  fontFamily: 'Manrope',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
