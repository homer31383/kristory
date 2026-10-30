import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { useBookItemsRealtime, useUpdateBookItems } from '../hooks/useBooks'
import { useBookPagination } from '../hooks/useBookPagination'
import { LAYOUTS, matTone } from '../book/catalog'
import { cropOf, type CropValue, type Size } from '../book/crop'
import { CropControl } from '../book/CropControl'
import { FlagChip } from '../book/components'
import { BookDefs } from '../book/layouts'
import { ScaledPage, SlotThumb } from '../book/ScaledPage'
import { useElementWidth } from '../book/useElementWidth'
import { applyCrops, pageSlotInches, withCrop } from '../book/editing'
import { cropFlag, dpiFlag, photoReadings, type BookPage, type ItemFlag } from '../book/paginate'
import type { BookPhoto } from '../book/model'

const SAVE_DEBOUNCE_MS = 700

/** One placed photo: where it is, who owns the crop, and how it prints. */
interface Placed {
  key: string
  page: BookPage
  index: number
  itemId: string
  photo: BookPhoto
  slotIn: Size
  flags: ItemFlag[]
  rank: number
}

const keyOf = (itemId: string, photoId: string) => `${itemId}:${photoId}`

/**
 * /book/:bookId/crops: every photo placed in the book, in the shape of its
 * slot, flagged ones (low DPI, crop loss) first. Tap one to set its focal
 * point and fit zoom with the page beside it. Each crop belongs to the book
 * item (last save wins); the journal photo is never changed.
 */
export default function BookCrops() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const { book, items, isLoading, error, pagination, coverData } = useBookPagination(bookId)
  const updateItems = useUpdateBookItems(bookId ?? '')
  useBookItemsRealtime(bookId)

  // Crops being changed here, by item and photo, until they are saved.
  const [local, setLocal] = useState<Map<string, CropValue>>(new Map())
  const [open, setOpen] = useState<string | null>(null)
  const [onlyFlagged, setOnlyFlagged] = useState(false)

  const itemById = useMemo(() => new Map((items ?? []).map((i) => [i.id, i])), [items])

  const placed = useMemo<Placed[]>(() => {
    if (!book || !pagination) return []
    const out: Placed[] = []
    for (const page of pagination.pages) {
      if (page.kind !== 'entry' && page.kind !== 'continued') continue
      const cropped = applyCrops(page, cropsFor(page, local))
      const readings = photoReadings(book, cropped)
      cropped.photos.forEach((p, index) => {
        const itemId = page.itemIds.find((id) => itemById.get(id)?.photo_ids.some((s) => s.photo_id === p.photo.id))
        const slotIn = pageSlotInches(book, page, index)
        if (!itemId || !slotIn) return
        const r = readings[index]
        const flags = [r?.dpi != null ? dpiFlag(r.dpi) : null, r?.crop ? cropFlag(r.crop) : null].filter((f): f is ItemFlag => !!f)
        const rank = flags.some((f) => f.severity === 'hard') ? 0 : flags.length ? 1 : 2
        out.push({ key: keyOf(itemId, p.photo.id), page, index, itemId, photo: p.photo, slotIn, flags, rank })
      })
    }
    return out.sort((a, b) => a.rank - b.rank || a.page.number - b.page.number || a.index - b.index)
  }, [book, pagination, itemById, local])

  // Save each changed crop after a pause; the optimistic update then carries it.
  const latest = useRef({ local, itemById })
  useEffect(() => {
    latest.current = { local, itemById }
  })
  const flush = useRef(() => {})
  useEffect(() => {
    flush.current = () => {
      const { local: pending, itemById: rows } = latest.current
      if (pending.size === 0) return
      const byItem = new Map<string, Map<string, CropValue>>()
      for (const [key, crop] of pending) {
        const [itemId, photoId] = key.split(':')
        const m = byItem.get(itemId) ?? new Map<string, CropValue>()
        m.set(photoId, crop)
        byItem.set(itemId, m)
      }
      for (const [itemId, crops] of byItem) {
        const row = rows.get(itemId)
        if (!row) continue
        const photo_ids = row.photo_ids.map((s) => (crops.has(s.photo_id) ? withCrop(s, crops.get(s.photo_id)!) : s))
        updateItems.mutate({ ids: [itemId], patch: { photo_ids } })
      }
      setLocal(new Map())
    }
  })
  useEffect(() => {
    if (local.size === 0) return
    const t = setTimeout(() => flush.current(), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [local])
  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush.current()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      flush.current()
    }
  }, [])

  const cropOfPlaced = (p: Placed): CropValue =>
    local.get(p.key) ?? cropOf(itemById.get(p.itemId)?.photo_ids.find((s) => s.photo_id === p.photo.id))
  const setCrop = (p: Placed, crop: CropValue) => setLocal((m) => new Map(m).set(p.key, crop))

  if (isLoading) return <Shell>Loading...</Shell>
  if (error) return <Shell>Could not load the book: {error.message}</Shell>
  if (!book) return <Shell>This book does not exist.</Shell>

  const flaggedCount = placed.filter((p) => p.rank < 2).length
  const shown = onlyFlagged ? placed.filter((p) => p.rank < 2) : placed
  const active = open ? placed.find((p) => p.key === open) ?? null : null

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <BookDefs />
      <div className="sticky top-0 z-20 border-b" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate(`/book/${book.id}`)}
            className="w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer flex-shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Back to the book"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">Crops</div>
            <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
              {book.title} · {placed.length} photos · {flaggedCount} flagged
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            Flagged only
          </label>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4">
        {shown.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {onlyFlagged ? 'No photo is flagged.' : 'No photos are placed in this book yet.'}
          </p>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {shown.map((p) => (
              <button
                key={p.key + p.page.number}
                onClick={() => setOpen(p.key)}
                className="flex flex-col items-center gap-1 p-2 rounded-xl border cursor-pointer text-left"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
              >
                <div className="w-full flex items-center justify-center" style={{ height: 130 }}>
                  <SlotThumb
                    photo={p.photo}
                    slotIn={p.slotIn}
                    crop={cropOfPlaced(p)}
                    mat={matTone(p.page.layout)}
                    width={Math.round(Math.min(130, (130 * p.slotIn.w) / p.slotIn.h))}
                  />
                </div>
                <div className="w-full text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  p. {p.page.number}
                  {p.page.entryDate && ` · ${format(parse(p.page.entryDate, 'yyyy-MM-dd', new Date()), 'MMM d')}`}
                </div>
                {p.flags.length > 0 && (
                  <div className="w-full flex flex-wrap gap-1">
                    {p.flags.map((f) => (
                      <FlagChip key={f.kind} flag={f} />
                    ))}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {active && coverData && (
        <CropSheet
          placed={active}
          crop={cropOfPlaced(active)}
          onChange={(c) => setCrop(active, c)}
          onClose={() => {
            flush.current()
            setOpen(null)
          }}
          onOpenEntry={() => navigate(`/book/${book.id}/entry/${active.itemId}`)}
          page={applyCrops(active.page, cropsFor(active.page, local))}
          cover={coverData.cover}
        />
      )}
    </div>
  )
}

/** The crops to show on a page: local changes over what pagination placed. */
function cropsFor(page: BookPage, local: Map<string, CropValue>): Map<string, CropValue> {
  const out = new Map<string, CropValue>()
  for (const p of page.photos) {
    for (const itemId of page.itemIds) {
      const c = local.get(keyOf(itemId, p.photo.id))
      if (c) out.set(p.photo.id, c)
    }
  }
  return out
}

function CropSheet({
  placed,
  crop,
  onChange,
  onClose,
  onOpenEntry,
  page,
  cover,
}: {
  placed: Placed
  crop: CropValue
  onChange: (c: CropValue) => void
  onClose: () => void
  onOpenEntry: () => void
  page: BookPage
  cover: Parameters<typeof ScaledPage>[0]['cover']
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>()
  const size = Math.min(width, 440)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 flex items-end md:items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div
        className="w-full md:max-w-4xl max-h-[92dvh] overflow-y-auto rounded-t-2xl md:rounded-2xl p-4"
        style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 min-w-0 text-sm font-semibold truncate">
            Page {page.number} · {LAYOUTS[page.layout].label}
          </div>
          <button onClick={onOpenEntry} className="px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer" style={{ borderColor: 'var(--border-card)' }}>
            Edit entry
          </button>
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white cursor-pointer" style={{ backgroundColor: 'var(--accent)' }}>
            Done
          </button>
        </div>
        <div className="md:grid md:grid-cols-2 md:gap-5">
          <div ref={ref} className="mb-4 md:mb-0 flex justify-center">
            {size > 0 && <ScaledPage page={page} cover={cover} size={size} />}
          </div>
          <CropControl photo={placed.photo} slotIn={placed.slotIn} value={crop} onChange={onChange} />
        </div>
      </div>
    </div>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen p-6 text-sm" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
      {children}
    </div>
  )
}
