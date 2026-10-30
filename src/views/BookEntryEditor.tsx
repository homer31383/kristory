import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { addDays, endOfMonth, format, parse, startOfMonth } from 'date-fns'
import { useQueryClient } from '@tanstack/react-query'
import {
  ensurePhotoSize,
  invalidateBookPhotos,
  useBookItems,
  useBookItemsRealtime,
  useJournalPhotos,
  useKristoryUsers,
  useReplaceWithOriginal,
  useUpdateBookItems,
} from '../hooks/useBooks'
import { useBookPagination } from '../hooks/useBookPagination'
import { getStorageUrl } from '../lib/helpers'
import { LAYOUTS, isEntryLayout, matTone, rankLayouts, type LayoutId } from '../book/catalog'
import { cropOf, type CropValue } from '../book/crop'
import { CropControl } from '../book/CropControl'
import { AuthorBadge, FlagChip } from '../book/components'
import { BookDefs, type CoverData } from '../book/layouts'
import { ScaledPage } from '../book/ScaledPage'
import { useElementWidth } from '../book/useElementWidth'
import { useTextFitter } from '../book/fit'
import { paginate, type BookPage } from '../book/paginate'
import type { BookPhoto, ItemSectionView, ItemView } from '../book/model'
import {
  applyCrops,
  cropsOf,
  itemFlags,
  itemPages,
  pageSlotInches,
  rewriteHidden,
  sectionHidden,
  snapToWords,
  withCrop,
  withoutCrops,
} from '../book/editing'
import type { Book, BookHiddenRange, BookItem, BookPhotoSlot } from '../types'

/** What the editor changes; include and done save at once, outside the draft. */
type Fields = Pick<BookItem, 'photo_ids' | 'hero_photo_id' | 'hidden_text' | 'layout_override' | 'caption_override'>

const fieldsOf = (i: BookItem): Fields => ({
  photo_ids: i.photo_ids,
  hero_photo_id: i.hero_photo_id,
  hidden_text: i.hidden_text,
  layout_override: i.layout_override,
  caption_override: i.caption_override,
})

const SAVE_DEBOUNCE_MS = 700
const NEARBY_DAYS = 3

const card = { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }
const smallButton =
  'px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-default'

/**
 * /book/:bookId/entry/:itemId: one entry's page in the book. Photos (order,
 * hero, add from nearby days or the library, crop), layout, caption and
 * hidden passages. Changes preview on the real pages and save on their own
 * (last save wins); the journal is never changed.
 */
export default function BookEntryEditor() {
  const { bookId, itemId } = useParams<{ bookId: string; itemId: string }>()
  // A new item is a new editor, so the old one saves on its way out.
  return <Editor key={itemId} bookId={bookId ?? ''} itemId={itemId ?? ''} />
}

function Editor({ bookId, itemId }: { bookId: string; itemId: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: users = [] } = useKristoryUsers()
  const updateItems = useUpdateBookItems(bookId)
  const fit = useTextFitter()
  useBookItemsRealtime(bookId)

  // The draft starts as the saved row and only splits off on the first edit.
  const [fields, setFields] = useState<Fields | null>(null)
  const [base, setBase] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  // The saved rows; useBookPagination's items carry the draft overlay.
  const itemsQ = useBookItems(bookId)
  const saved = itemsQ.data?.find((i) => i.id === itemId) ?? null
  const current = fields ?? (saved ? fieldsOf(saved) : null)

  // Pages are computed without this item's crops, which are applied to its
  // pages here, so dragging a crop does not repaginate the book.
  const structJson = saved && current ? JSON.stringify(withoutCrops({ ...saved, ...current })) : null
  const structural = useParsed<BookItem>(structJson)
  const { book, isLoading, error, views, viewById, pagination, coverData, photoById, entryById } =
    useBookPagination(bookId, structural)

  const savedJson = saved ? JSON.stringify(fieldsOf(saved)) : null
  const fieldsJson = current ? JSON.stringify(current) : null
  const baseJson = base ?? savedJson

  // Another person (or device) saved this entry while it was open here.
  const theirs = !!fields && !saveError && savedJson !== baseJson && savedJson !== fieldsJson
  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])

  const edit = (fn: (f: Fields) => Fields) => {
    if (!current) return
    if (!fields) setBase(savedJson)
    setFields(fn(current))
  }

  // Autosave, debounced; whatever is pending saves when the editor closes.
  const latest = useRef({ fieldsJson, baseJson, current })
  useEffect(() => {
    latest.current = { fieldsJson, baseJson, current }
  })
  const save = useRef(() => {})
  useEffect(() => {
    save.current = () => {
      const { fieldsJson: json, baseJson: b, current: f } = latest.current
      if (!f || !json || json === b) return
      setBase(json)
      setSaveError(null)
      updateItems.mutate({ ids: [itemId], patch: f }, { onError: (e) => setSaveError((e as Error).message) })
    }
  })
  useEffect(() => {
    if (!fields || fieldsJson === baseJson) return
    const t = setTimeout(() => save.current(), SAVE_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [fields, fieldsJson, baseJson])
  useEffect(() => {
    const flush = () => document.visibilityState === 'hidden' && save.current()
    document.addEventListener('visibilitychange', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      save.current()
    }
  }, [])

  const view = viewById.get(itemId)
  const slotsParsed = useParsed<BookPhotoSlot[]>(current ? JSON.stringify(current.photo_ids) : null)
  const crops = useMemo(() => cropsOf(slotsParsed ?? []), [slotsParsed])
  const pages = useMemo(() => itemPages(pagination, itemId).map((p) => applyCrops(p, crops)), [pagination, itemId, crops])
  const flags = book ? itemFlags(book, pagination, itemId, pages) : []

  const [previewRef, previewWidth] = useElementWidth<HTMLDivElement>()
  const [selected, setSelected] = useState<string | null>(null)

  if (isLoading || (!!book && !itemsQ.data)) return <Shell>Loading...</Shell>
  if (error) return <Shell>Could not load the book: {error.message}</Shell>
  if (!book) return <Shell>This book does not exist.</Shell>
  if (!saved || !current || !coverData) return <Shell>This entry is not in the book.</Shell>

  const entry = entryById.get(saved.entry_id)
  const date = entry ? parse(entry.entry_date, 'yyyy-MM-dd', new Date()) : null
  const order = views.map((v) => v.item.id)
  const at = order.indexOf(itemId)
  const prev = at > 0 ? order[at - 1] : null
  const next = at >= 0 && at < order.length - 1 ? order[at + 1] : null
  const goTo = (id: string) => navigate(`/book/${bookId}/entry/${id}`, { replace: true })

  const slots = current.photo_ids
  const used = new Set(slots.map((s) => s.photo_id))
  const selectedId = selected && used.has(selected) ? selected : slots[0]?.photo_id ?? null

  const setSlots = (next: BookPhotoSlot[]) =>
    edit((f) => ({ ...f, photo_ids: next, hero_photo_id: next[0]?.photo_id ?? null }))
  const move = (from: number, to: number) => {
    if (to < 0 || to >= slots.length || from === to) return
    const next = [...slots]
    const [s] = next.splice(from, 1)
    next.splice(to, 0, s)
    setSlots(next)
  }
  const addPhoto = (photo: BookPhoto) => {
    if (used.has(photo.id)) return
    setSlots([...slots, { photo_id: photo.id }])
    setSelected(photo.id)
    if (!photo.width || !photo.height) ensurePhotoSize(photo).then(() => invalidateBookPhotos(queryClient))
  }
  const setCrop = (photoId: string, crop: CropValue) =>
    edit((f) => ({ ...f, photo_ids: f.photo_ids.map((s) => (s.photo_id === photoId ? withCrop(s, crop) : s)) }))

  const pageSize = Math.min(previewWidth, 560)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      <BookDefs />
      {/* Header */}
      <div className="sticky top-0 z-20 border-b" style={{ ...card }}>
        <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => navigate(`/book/${bookId}`)}
            className="w-9 h-9 flex items-center justify-center rounded-lg cursor-pointer flex-shrink-0"
            style={{ color: 'var(--text-secondary)' }}
            aria-label="Back to the book"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold truncate">{date ? format(date, 'EEE, MMM d, yyyy') : 'Entry'}</div>
            <div className="text-[11px] truncate" style={{ color: 'var(--text-secondary)' }}>
              {book.title}
              {pages.length > 0 && ` · p. ${pages[0].number}${pages.length > 1 ? `-${pages[pages.length - 1].number}` : ''}`}
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={saved.included}
              onChange={(e) => updateItems.mutate({ ids: [itemId], patch: { included: e.target.checked } })}
              style={{ accentColor: 'var(--accent)' }}
            />
            In book
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={saved.done}
              onChange={(e) => updateItems.mutate({ ids: [itemId], patch: { done: e.target.checked } })}
              style={{ accentColor: 'var(--accent)' }}
            />
            Done
          </label>
          <button onClick={() => prev && goTo(prev)} disabled={!prev} className={smallButton} style={{ borderColor: 'var(--border-card)' }}>
            Previous
          </button>
          <button onClick={() => next && goTo(next)} disabled={!next} className={smallButton} style={{ borderColor: 'var(--border-card)' }}>
            Next
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-6">
        {/* Banners */}
        <div className="md:col-span-2 space-y-2">
          {theirs && (
            <Banner>
              {userName.get(saved.updated_by ?? '') ?? 'Someone'} changed this entry.
              <button className={smallButton} style={{ borderColor: 'var(--border-card)' }} onClick={() => { setFields(null); setBase(null) }}>
                Load their version
              </button>
              <button className={smallButton} style={{ borderColor: 'var(--border-card)' }} onClick={() => setBase(savedJson)}>
                Keep mine
              </button>
            </Banner>
          )}
          {saveError && (
            <Banner>
              Could not save: {saveError}
              <button className={smallButton} style={{ borderColor: 'var(--border-card)' }} onClick={() => { setSaveError(null); setBase(savedJson) }}>
                Try again
              </button>
            </Banner>
          )}
          {!saved.included && <Banner>This entry is skipped. Turn on "In book" to place it.</Banner>}
        </div>

        {/* Live pages */}
        <div className="md:sticky md:top-16 md:self-start mb-4 md:mb-0">
          <div ref={previewRef} className="w-full">
            {pageSize > 0 && pages.length > 0 && (
              <div className="flex flex-col items-center gap-3">
                {pages.map((p) => (
                  <div key={p.number} className="flex flex-col items-center gap-1">
                    <ScaledPage page={p} cover={coverData.cover} size={pageSize} />
                    <span className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                      Page {p.number} · {LAYOUTS[p.layout].label}
                      {p.textScale && p.textScale < 1 ? ' · smaller type' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2 justify-center">
              {flags.map((f) => (
                <FlagChip key={f.kind} flag={f} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4 min-w-0">
          <PhotoTray
            entryDate={entry?.entry_date ?? null}
            entryPhotos={(entry?.photos ?? []).map((p) => ({ ...p, entry_date: entry!.entry_date }))}
            slots={slots}
            photoById={photoById}
            selectedId={selectedId}
            onSelect={setSelected}
            onMove={move}
            onRemove={(i) => setSlots(slots.filter((_, k) => k !== i))}
            onAdd={addPhoto}
          />

          {selectedId && (
            <CropPanel
              photo={photoById.get(selectedId) ?? null}
              pages={pages}
              photoId={selectedId}
              crop={cropOf(slots.find((s) => s.photo_id === selectedId))}
              onChange={(c) => setCrop(selectedId, c)}
              book={book}
              isHero={slots[0]?.photo_id === selectedId}
            />
          )}

          {view && (
            <LayoutPicker
              view={view}
              book={book}
              fit={fit}
              crops={crops}
              cover={coverData.cover}
              value={isEntryLayout(current.layout_override) ? current.layout_override : null}
              onChange={(id) => edit((f) => ({ ...f, layout_override: id }))}
            />
          )}

          <Section title="Caption">
            <textarea
              value={current.caption_override ?? ''}
              onChange={(e) => edit((f) => ({ ...f, caption_override: e.target.value || null }))}
              rows={2}
              placeholder="A line for the photo"
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Shows on Full photo and Navy framed portrait pages, and as the quote on Arch photo pages.
            </p>
          </Section>

          {view && (
            <TextEditor
              sections={view.sections}
              hiddenText={current.hidden_text}
              onChange={(sectionId, text, change) =>
                edit((f) => ({ ...f, hidden_text: rewriteHidden(f.hidden_text, sectionId, text, change) }))
              }
            />
          )}
        </div>
      </div>
    </div>
  )
}

/** The value a JSON string holds, the same object for as long as the string is the same. */
function useParsed<T>(json: string | null): T | null {
  return useMemo(() => (json ? (JSON.parse(json) as T) : null), [json])
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen p-6 text-sm" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
      {children}
    </div>
  )
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border text-xs" style={{ ...card, color: 'var(--text-primary)' }}>
      {children}
    </div>
  )
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border p-3" style={card}>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold flex-1" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        {right}
      </div>
      {children}
    </section>
  )
}

// ── Photos ───────────────────────────────────────────────────────────────────

function Thumb({ photo, size = 72, children }: { photo: BookPhoto | undefined; size?: number; children?: ReactNode }) {
  return (
    <div className="relative rounded-lg overflow-hidden flex-shrink-0" style={{ width: size, height: size, backgroundColor: 'var(--border-card)' }}>
      {photo && (
        <img src={getStorageUrl(photo.storage_path)} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" />
      )}
      {children}
    </div>
  )
}

function AddGrid({ photos, onAdd, empty }: { photos: BookPhoto[]; onAdd: (p: BookPhoto) => void; empty: string }) {
  if (photos.length === 0) return <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{empty}</p>
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => (
        <button key={p.id} onClick={() => onAdd(p)} className="cursor-pointer text-left" title={`Add (${p.entry_date})`}>
          <Thumb photo={p}>
            <span className="absolute bottom-0 inset-x-0 text-[10px] text-white text-center py-0.5" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
              + {format(parse(p.entry_date, 'yyyy-MM-dd', new Date()), 'MMM d')}
            </span>
          </Thumb>
        </button>
      ))}
    </div>
  )
}

function PhotoTray({
  entryDate,
  entryPhotos,
  slots,
  photoById,
  selectedId,
  onSelect,
  onMove,
  onRemove,
  onAdd,
}: {
  entryDate: string | null
  entryPhotos: BookPhoto[]
  slots: BookPhotoSlot[]
  photoById: Map<string, BookPhoto>
  selectedId: string | null
  onSelect: (id: string) => void
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
  onAdd: (photo: BookPhoto) => void
}) {
  const used = new Set(slots.map((s) => s.photo_id))
  const day = entryDate ? parse(entryDate, 'yyyy-MM-dd', new Date()) : null
  const nearbyQ = useJournalPhotos(
    day ? format(addDays(day, -NEARBY_DAYS), 'yyyy-MM-dd') : null,
    day ? format(addDays(day, NEARBY_DAYS), 'yyyy-MM-dd') : null,
  )
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [month, setMonth] = useState(() => (entryDate ? entryDate.slice(0, 7) : format(new Date(), 'yyyy-MM')))
  const monthDay = parse(`${month}-01`, 'yyyy-MM-dd', new Date())
  const monthOk = !Number.isNaN(monthDay.getTime())
  const libraryQ = useJournalPhotos(
    libraryOpen && monthOk ? format(startOfMonth(monthDay), 'yyyy-MM-dd') : null,
    libraryOpen && monthOk ? format(endOfMonth(monthDay), 'yyyy-MM-dd') : null,
  )
  const dragFrom = useRef<number | null>(null)

  const unusedOwn = entryPhotos.filter((p) => !used.has(p.id)).sort((a, b) => a.display_order - b.display_order)
  const nearby = (nearbyQ.data ?? []).filter((p) => p.entry_date !== entryDate && !used.has(p.id))
  const library = (libraryQ.data ?? []).filter((p) => !used.has(p.id))

  return (
    <Section title="Photos">
      <h3 className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        In the book {slots.length > 0 && <span style={{ color: 'var(--text-muted)' }}>(first is the hero; drag or use the arrows to reorder)</span>}
      </h3>
      {slots.length === 0 && <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>No photos on this page.</p>}
      <div className="flex flex-wrap gap-2 mb-3">
        {slots.map((s, i) => {
          const photo = photoById.get(s.photo_id)
          const isSel = s.photo_id === selectedId
          return (
            <div
              key={s.photo_id}
              draggable
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current !== null) onMove(dragFrom.current, i)
                dragFrom.current = null
              }}
              className="flex flex-col items-center gap-1"
            >
              <button
                onClick={() => onSelect(s.photo_id)}
                className="cursor-pointer rounded-lg"
                style={{ outline: isSel ? '2px solid var(--accent)' : 'none', outlineOffset: 2 }}
                title="Crop this photo"
              >
                <Thumb photo={photo}>
                  {i === 0 && (
                    <span className="absolute top-1 left-1 text-[10px] px-1.5 rounded-full text-white" style={{ backgroundColor: 'var(--accent)' }}>
                      Hero
                    </span>
                  )}
                </Thumb>
              </button>
              <div className="flex gap-1">
                <IconButton label="Move earlier" disabled={i === 0} onClick={() => onMove(i, i - 1)}>‹</IconButton>
                <IconButton label="Make hero" disabled={i === 0} onClick={() => onMove(i, 0)}>★</IconButton>
                <IconButton label="Remove from the book" onClick={() => onRemove(i)}>×</IconButton>
                <IconButton label="Move later" disabled={i === slots.length - 1} onClick={() => onMove(i, i + 1)}>›</IconButton>
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
        Removing a photo only takes it out of the book; it stays in the journal.
      </p>

      <h3 className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>From this entry</h3>
      <div className="mb-3">
        <AddGrid photos={unusedOwn} onAdd={onAdd} empty="Every photo from this entry is in the book." />
      </div>

      <h3 className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nearby days</h3>
      <div className="mb-3">
        {nearbyQ.isLoading ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : (
          <AddGrid photos={nearby} onAdd={onAdd} empty={`No other photos within ${NEARBY_DAYS} days.`} />
        )}
      </div>

      <div className="flex items-center gap-2 mb-1.5">
        <h3 className="text-xs font-medium flex-1" style={{ color: 'var(--text-secondary)' }}>Library</h3>
        {libraryOpen && (
          <input
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
            className="px-2 py-1 rounded-lg border text-xs"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
          />
        )}
        <button onClick={() => setLibraryOpen(!libraryOpen)} className={smallButton} style={{ borderColor: 'var(--border-card)' }}>
          {libraryOpen ? 'Hide' : 'Browse by month'}
        </button>
      </div>
      {libraryOpen &&
        (libraryQ.isLoading ? (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</p>
        ) : (
          <AddGrid photos={library} onAdd={onAdd} empty="No journal photos that month." />
        ))}
    </Section>
  )
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="w-7 h-7 rounded-md border text-sm leading-none cursor-pointer disabled:opacity-30 disabled:cursor-default"
      style={{ borderColor: 'var(--border-card)', color: 'var(--text-primary)', backgroundColor: 'var(--input-bg)' }}
    >
      {children}
    </button>
  )
}

function CropPanel({
  photo,
  photoId,
  pages,
  crop,
  onChange,
  book,
  isHero,
}: {
  photo: BookPhoto | null
  photoId: string
  pages: BookPage[]
  crop: CropValue
  onChange: (c: CropValue) => void
  book: Book
  isHero: boolean
}) {
  const replace = useReplaceWithOriginal()
  const fileRef = useRef<HTMLInputElement>(null)
  const page = pages.find((p) => p.photoIds.includes(photoId))
  const slotIn = page ? pageSlotInches(book, page, page.photoIds.indexOf(photoId)) : null

  return (
    <Section title="Crop">
      {!photo ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading the photo...</p>
      ) : !page || !slotIn ? (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This photo is not placed on a page yet.</p>
      ) : (
        <>
          <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
            Page {page.number}, {LAYOUTS[page.layout].label}. Tap or drag to choose what stays in view; slide toward Whole photo to show
            more of it on a {matTone(page.layout) === 'light' ? 'white' : 'navy'} mat.
          </p>
          <CropControl photo={photo} slotIn={slotIn} value={crop} onChange={onChange} />
        </>
      )}

      {photo && isHero && !photo.print_path && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-divider)' }}>
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            This photo was saved before print copies. Pick the original file to print it sharper; the journal photo stays as it is.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) replace.mutate({ photo, file })
            }}
          />
          <button onClick={() => fileRef.current?.click()} disabled={replace.isPending} className={smallButton} style={{ borderColor: 'var(--border-card)' }}>
            {replace.isPending ? 'Making print copy...' : 'Replace with original'}
          </button>
          {replace.isError && <p className="text-[11px] mt-1" style={{ color: '#B23A35' }}>{(replace.error as Error).message}</p>}
          {replace.isSuccess && <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>Print copy saved.</p>}
        </div>
      )}
    </Section>
  )
}

// ── Layout ───────────────────────────────────────────────────────────────────

function LayoutPicker({
  view,
  book,
  fit,
  crops,
  cover,
  value,
  onChange,
}: {
  view: ItemView
  book: Book
  fit: ReturnType<typeof useTextFitter>
  crops: Map<string, CropValue>
  cover: CoverData
  value: LayoutId | null
  onChange: (id: LayoutId | null) => void
}) {
  const options = useMemo(() => {
    const ids = [...rankLayouts({ photoCount: view.photos.length, portraitCount: view.portraitCount, words: view.words, milestone: !!view.milestone })]
    if (view.photos.length === 1 && !ids.includes('mid-arch')) ids.push('mid-arch')
    if (value && !ids.includes(value)) ids.push(value)
    return [null, ...ids].map((id) => {
      const v = { ...view, item: { ...view.item, included: true, layout_override: id } }
      const page = paginate(book, [v], null, fit).pages.find((p) => p.kind === 'entry' && p.itemIds.includes(view.item.id))
      return { id, page: page ? applyCrops(page, crops) : null }
    })
  }, [view, book, fit, crops, value])

  return (
    <Section title="Layout">
      <div className="flex gap-3 overflow-x-auto pb-1">
        {options.map(({ id, page }) => {
          const active = id === value
          const label = id ? LAYOUTS[id].label : `Auto${page ? ` (${LAYOUTS[page.layout].label})` : ''}`
          return (
            <button
              key={id ?? 'auto'}
              onClick={() => onChange(id)}
              className="flex flex-col items-center gap-1 cursor-pointer flex-shrink-0"
              style={{ width: 120 }}
            >
              <div className="rounded" style={{ outline: active ? '2px solid var(--accent)' : 'none', outlineOffset: 3 }}>
                {page ? <ScaledPage page={page} cover={cover} size={120} /> : <div style={{ width: 120, height: 120 }} />}
              </div>
              <span className="text-[11px] text-center leading-tight" style={{ color: active ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
        Only layouts with a slot for every photo here are shown. Text that does not fit continues on the next page.
      </p>
    </Section>
  )
}

// ── Text ─────────────────────────────────────────────────────────────────────

type HideChange = { hide: { start: number; end: number } } | { restore: { start: number; end: number } }

function offsetIn(node: Node | null, offset: number): { sectionId: string; at: number } | null {
  const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element | null)
  const span = el?.closest<HTMLElement>('[data-start]')
  const section = el?.closest<HTMLElement>('[data-section-id]')
  if (!span || !section) return null
  const at = Number(span.dataset.start) + (node?.nodeType === Node.TEXT_NODE ? offset : 0)
  return { sectionId: section.dataset.sectionId!, at }
}

function TextEditor({
  sections,
  hiddenText,
  onChange,
}: {
  sections: ItemSectionView[]
  hiddenText: BookHiddenRange[]
  onChange: (sectionId: string, text: string, change?: HideChange) => void
}) {
  const [pending, setPending] = useState<{ sectionId: string; start: number; end: number } | null>(null)

  useEffect(() => {
    const onSel = () => {
      const sel = document.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setPending(null)
      const a = offsetIn(sel.anchorNode, sel.anchorOffset)
      const b = offsetIn(sel.focusNode, sel.focusOffset)
      if (!a || !b || a.sectionId !== b.sectionId || a.at === b.at) return setPending(null)
      setPending({ sectionId: a.sectionId, start: Math.min(a.at, b.at), end: Math.max(a.at, b.at) })
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])

  if (sections.length === 0) {
    return (
      <Section title="Text">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No text from the chosen authors on this day.</p>
      </Section>
    )
  }

  return (
    <Section title="Text">
      <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
        Select words and tap Hide to leave them out of the book. Hidden words are struck through; tap them to put them back. The journal is
        not changed.
      </p>
      <div className="space-y-4">
        {sections.map((s) => {
          const hidden = sectionHidden(s.text, s.section.id, hiddenText)
          return (
            <SectionText
              key={s.section.id}
              view={s}
              hidden={hidden}
              pending={pending?.sectionId === s.section.id ? pending : null}
              onHide={(span) => {
                onChange(s.section.id, s.text, { hide: snapToWords(s.text, span.start, span.end) })
                document.getSelection()?.removeAllRanges()
                setPending(null)
              }}
              onRestore={(span) => onChange(s.section.id, s.text, { restore: span })}
              onAccept={() => onChange(s.section.id, s.text)}
            />
          )
        })}
      </div>
    </Section>
  )
}

function SectionText({
  view,
  hidden,
  pending,
  onHide,
  onRestore,
  onAccept,
}: {
  view: ItemSectionView
  hidden: { start: number; end: number }[]
  pending: { start: number; end: number } | null
  onHide: (span: { start: number; end: number }) => void
  onRestore: (span: { start: number; end: number }) => void
  onAccept: () => void
}) {
  const { text } = view
  const parts: { start: number; end: number; hidden: boolean }[] = []
  let at = 0
  for (const h of hidden) {
    if (h.start > at) parts.push({ start: at, end: h.start, hidden: false })
    parts.push({ start: h.start, end: h.end, hidden: true })
    at = h.end
  }
  if (at < text.length) parts.push({ start: at, end: text.length, hidden: false })

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        {view.author && <AuthorBadge author={view.author} size={18} />}
        <span className="text-xs font-medium flex-1" style={{ color: 'var(--text-secondary)' }}>
          {view.name} · {view.words} words in the book
        </span>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => pending && onHide(pending)}
          disabled={!pending}
          className={smallButton}
          style={{ borderColor: 'var(--border-card)' }}
        >
          Hide selection
        </button>
      </div>
      {view.changed && (
        <div className="flex flex-wrap items-center gap-2 text-[11px] mb-1.5 px-2 py-1.5 rounded-lg" style={{ backgroundColor: 'rgba(224,80,74,0.1)', color: '#B23A35' }}>
          This text was edited in the journal after passages were hidden. Check the struck-through parts.
          <button className={smallButton} style={{ borderColor: 'var(--border-card)' }} onClick={onAccept}>
            Accept new text
          </button>
        </div>
      )}
      <div data-section-id={view.section.id} className="text-sm leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'Lora, Georgia, serif' }}>
        {parts.map((p) =>
          p.hidden ? (
            <span
              key={p.start}
              data-start={p.start}
              role="button"
              tabIndex={0}
              title="Hidden from the book. Tap to put back."
              onClick={() => onRestore({ start: p.start, end: p.end })}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onRestore({ start: p.start, end: p.end })}
              className="cursor-pointer"
              style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}
            >
              {text.slice(p.start, p.end)}
            </span>
          ) : (
            <span key={p.start} data-start={p.start}>
              {text.slice(p.start, p.end)}
            </span>
          ),
        )}
      </div>
    </div>
  )
}
