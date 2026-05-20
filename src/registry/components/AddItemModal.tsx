import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { PRIORITY_OPTIONS, WHERE_OPTIONS } from '../config'
import { parsePriceStr } from '../lib/money'
import type { Alternative, CatalogTier, CustomItem } from '../types'

export type AddItemMode =
  | { kind: 'custom' }
  | { kind: 'custom-edit'; item: CustomItem }
  | {
      kind: 'alternative-new'
      parentLabel: string
      targetCatalogItemId: string | null
      targetCustomItemId: string | null
    }
  | { kind: 'alternative-edit'; alt: Alternative; parentLabel: string }
  | {
      kind: 'catalog-edit'
      tier: CatalogTier
      parentLabel: string
      /** True if a per-registry override exists; toggles the Reset button. */
      hasOverride: boolean
    }

interface Props {
  mode: AddItemMode
  onClose: () => void
  onSubmitCustom: (
    data: Omit<CustomItem, 'id' | 'registry_id' | 'created_at' | 'added_by'>,
  ) => Promise<void>
  onSubmitCustomEdit: (
    id: string,
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
  onSubmitCatalogEdit: (
    catalogTierId: string,
    data: {
      product: string
      price_str: string | null
      unit_cost: number | null
      note: string | null
      url: string | null
    },
  ) => Promise<void>
  onResetCatalog: (catalogTierId: string) => Promise<void>
}

export default function AddItemModal({
  mode,
  onClose,
  onSubmitCustom,
  onSubmitCustomEdit,
  onSubmitAlternativeNew,
  onSubmitAlternativeEdit,
  onSubmitCatalogEdit,
  onResetCatalog,
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
  const [includeImage, setIncludeImage] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode.kind === 'custom-edit') {
      const it = mode.item
      setName(it.item_name)
      setSection(it.section)
      setPriority(it.priority ?? PRIORITY_OPTIONS[0])
      setWhere(it.where_to_buy ?? WHERE_OPTIONS[0])
      setQty(String(it.suggested_qty ?? 1))
      setProduct(it.product ?? '')
      setPriceStr(it.price_str ?? '')
      setNote(it.note ?? '')
      setUrl(it.url ?? '')
      setIncludeImage(!!it.image_url)
      setImageUrl(it.image_url ?? '')
    } else if (mode.kind === 'alternative-edit') {
      setProduct(mode.alt.product)
      setPriceStr(mode.alt.price_str ?? '')
      setNote(mode.alt.note ?? '')
      setUrl(mode.alt.url ?? '')
    } else if (mode.kind === 'catalog-edit') {
      setProduct(mode.tier.product ?? '')
      setPriceStr(mode.tier.price_str ?? '')
      setNote(mode.tier.note ?? '')
      setUrl(mode.tier.url ?? '')
    }
  }, [mode])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const parsedCost = parsePriceStr(priceStr)
      if (mode.kind === 'custom' || mode.kind === 'custom-edit') {
        const customData = {
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
          image_url: includeImage ? imageUrl.trim() || null : null,
        }
        if (mode.kind === 'custom') await onSubmitCustom(customData)
        else await onSubmitCustomEdit(mode.item.id, customData)
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
      } else if (mode.kind === 'alternative-edit') {
        await onSubmitAlternativeEdit(mode.alt.id, {
          product: product.trim() || 'Untitled',
          price_str: priceStr.trim() || null,
          unit_cost: parsedCost,
          note: note.trim() || null,
          url: url.trim() || null,
        })
      } else {
        await onSubmitCatalogEdit(mode.tier.id, {
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

  async function handleReset() {
    if (mode.kind !== 'catalog-edit') return
    if (!confirm('Discard your edits and revert this tier to the original suggestion?')) return
    setSubmitting(true)
    setError(null)
    try {
      await onResetCatalog(mode.tier.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSubmitting(false)
    }
  }

  // Structural fields (name/section/priority/where/qty) only show in the
  // "custom" mode. Alternatives and catalog-edits inherit from their parent.
  const showStructuralFields = mode.kind === 'custom' || mode.kind === 'custom-edit'
  const showResetButton = mode.kind === 'catalog-edit' && mode.hasOverride
  const title =
    mode.kind === 'custom'
      ? 'Add a custom item'
      : mode.kind === 'custom-edit'
        ? 'Edit item'
        : mode.kind === 'alternative-new'
          ? `Add alternative for ${mode.parentLabel}`
          : mode.kind === 'alternative-edit'
            ? `Edit alternative for ${mode.parentLabel}`
            : `Edit ${mode.tier.tier} for ${mode.parentLabel}`

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

        {showStructuralFields && (
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

        <Field label={showStructuralFields ? 'Product (optional)' : 'Product'}>
          <input
            value={product}
            onChange={(e) => setProduct(e.target.value)}
            required={!showStructuralFields}
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

        {showStructuralFields && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                fontFamily: 'Manrope',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: 'var(--ink-faint)',
              }}
            >
              <input
                type="checkbox"
                checked={includeImage}
                onChange={(e) => setIncludeImage(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Include image
            </label>
            {includeImage && (
              <Field label="Image URL">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://…"
                  style={inputStyle}
                />
              </Field>
            )}
          </div>
        )}

        {error && <div style={{ color: 'var(--priority-before)', fontSize: 13 }}>{error}</div>}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            marginTop: 8,
            flexWrap: 'wrap',
          }}
        >
          <div>
            {showResetButton && (
              <button type="button" onClick={handleReset} disabled={submitting} style={btnResetStyle}>
                Reset to default
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={btnSecondaryStyle}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} style={btnPrimaryStyle}>
              {submitting
                ? 'Saving…'
                : mode.kind === 'alternative-edit' ||
                    mode.kind === 'catalog-edit' ||
                    mode.kind === 'custom-edit'
                  ? 'Save changes'
                  : 'Add'}
            </button>
          </div>
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

const btnResetStyle: CSSProperties = {
  background: 'transparent',
  color: 'var(--priority-before)',
  border: '1px solid var(--priority-before)',
  padding: '8px 14px',
  borderRadius: 100,
  fontFamily: 'Manrope',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
