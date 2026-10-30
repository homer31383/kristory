import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, formatDistanceToNow, parse } from 'date-fns'
import {
  useBookItemsRealtime,
  useDeleteBook,
  useKristoryUsers,
  usePhotoSizeBackfill,
  useSyncBookItems,
  useUpdateBook,
  useUpdateBookItems,
} from '../hooks/useBooks'
import { useBookPagination } from '../hooks/useBookPagination'
import type { ItemView } from '../book/model'
import type { BookPage, ItemFlag } from '../book/paginate'
import { AuthorBadge, FlagChip, PageThumb } from '../book/components'
import type { Book, BookAuthors } from '../types'

const inputStyle = {
  backgroundColor: 'var(--input-bg)',
  borderColor: 'var(--border-card)',
  color: 'var(--text-primary)',
}

type Filter = 'all' | 'included' | 'skipped' | 'flagged' | 'not-done'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'included', label: 'In book' },
  { value: 'skipped', label: 'Skipped' },
  { value: 'flagged', label: 'Flagged' },
  { value: 'not-done', label: 'Not done' },
]

function pageRange(pages: number[] | undefined) {
  if (!pages || pages.length === 0) return null
  const lo = Math.min(...pages)
  const hi = Math.max(...pages)
  return lo === hi ? `p. ${lo}` : `p. ${lo}-${hi}`
}

export default function BookReview() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const { book, entries, items, isLoading, error: entriesError, views, pagination, bookTrip, measured } = useBookPagination(bookId)
  const { data: users = [] } = useKristoryUsers()
  const updateItems = useUpdateBookItems(bookId ?? '')
  const [filter, setFilter] = useState<Filter>('all')
  const [showSettings, setShowSettings] = useState(false)

  useBookItemsRealtime(bookId)
  useSyncBookItems(book, entries, items)
  const measuring = usePhotoSizeBackfill(book, entries)

  const userName = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users])

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
        ))}
      </div>
    )
  }
  if (!book) {
    return (
      <div className="text-center py-16">
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>This book does not exist.</p>
        <button onClick={() => navigate('/book')} className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer" style={{ backgroundColor: 'var(--accent)' }}>
          All books
        </button>
      </div>
    )
  }
  if (entriesError) {
    return <p className="text-sm" style={{ color: '#E0504A' }}>Could not load the entries: {(entriesError as Error).message}</p>
  }

  const pageCount = pagination?.pages.length ?? 0
  const includedCount = pagination?.includedCount ?? 0
  const doneCount = views.filter((v) => v.item.included && v.item.done).length
  const over = pageCount > book.page_limit

  const flagsOf = (v: ItemView): ItemFlag[] => pagination?.flagsByItem.get(v.item.id) ?? []
  const visible = views.filter((v) => {
    switch (filter) {
      case 'included': return v.item.included
      case 'skipped': return !v.item.included
      case 'flagged': return v.item.included && flagsOf(v).length > 0
      case 'not-done': return v.item.included && !v.item.done
      default: return true
    }
  })

  const setIncluded = (ids: string[], included: boolean) => {
    if (ids.length) updateItems.mutate({ ids, patch: { included } })
  }

  const scrollToItem = (itemId: string) => {
    setFilter('all')
    requestAnimationFrame(() =>
      document.getElementById(`book-item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
    )
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => navigate('/book')}
          className="w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer flex-shrink-0"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="All books"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="flex-1 min-w-0 text-xl font-bold truncate" style={{ fontFamily: "'Playfair Display', serif", color: 'var(--text-primary)' }}>
          {book.title}
        </h1>
        <button
          onClick={() => navigate(`/book/${book.id}/preview`)}
          className="px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer"
          style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
        >
          Preview
        </button>
        <button
          onClick={() => navigate(`/book/${book.id}/crops`)}
          className="px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer"
          style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
        >
          Crops
        </button>
        <button
          onClick={() => navigate(`/book/${book.id}/print`)}
          className="hidden md:block px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer"
          style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
        >
          Print
        </button>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer"
          style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
        >
          Settings
        </button>
      </div>

      {showSettings && <BookSettings book={book} onDeleted={() => navigate('/book')} />}

      {/* Summary and page meter */}
      <div className="rounded-xl border p-4 mb-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
        <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          {includedCount} of {views.length} entries, {pageCount} pages
        </div>
        <div className="h-2 rounded-full overflow-hidden mb-1.5" style={{ backgroundColor: 'var(--border-card)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (pageCount / book.page_limit) * 100)}%`,
              backgroundColor: over ? '#E0504A' : 'var(--accent)',
            }}
          />
        </div>
        <div className="flex justify-between text-xs" style={{ color: over ? '#E0504A' : 'var(--text-secondary)' }}>
          <span>
            {over ? `${pageCount - book.page_limit} pages over the ${book.page_limit} page limit` : `${book.page_limit - pageCount} pages left of ${book.page_limit}`}
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>{doneCount} of {includedCount} done</span>
        </div>
        {pagination && !measured && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Loading the book fonts. Page counts are estimates until they load.
          </p>
        )}
        {measuring && (
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            Measuring older photos ({measuring.done} of {measuring.total}). Layouts and DPI flags fill in as it goes.
          </p>
        )}
      </div>

      {pagination && (
        <Filmstrip pages={pagination.pages} onPick={scrollToItem} />
      )}

      <BulkActions views={views} onSetIncluded={setIncluded} />

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto mb-3 -mx-1 px-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap cursor-pointer border"
            style={{
              borderColor: filter === f.value ? 'var(--accent)' : 'var(--border-card)',
              backgroundColor: filter === f.value ? 'var(--accent)' : 'var(--bg-card)',
              color: filter === f.value ? 'white' : 'var(--text-secondary)',
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <p className="text-xs mb-2 md:hidden" style={{ color: 'var(--text-muted)' }}>
        Swipe left to skip an entry, right to put it back.
      </p>

      {visible.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
          {views.length === 0 ? 'No journal entries in this range.' : 'Nothing here.'}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((v) => (
            <EntryRow
              key={v.item.id}
              view={v}
              flags={flagsOf(v)}
              pages={pageRange(pagination?.pagesByItem.get(v.item.id))}
              changedBy={v.item.updated_by ? userName.get(v.item.updated_by) ?? null : null}
              onToggleIncluded={() => setIncluded([v.item.id], !v.item.included)}
              onToggleDone={() => updateItems.mutate({ ids: [v.item.id], patch: { done: !v.item.done } })}
              onOpenJournal={() => navigate(`/journal/${v.entry.entry_date}`)}
              onEdit={() => navigate(`/book/${book.id}/entry/${v.item.id}`)}
            />
          ))}
        </div>
      )}

      {bookTrip && (
        <p className="text-xs mt-4 text-center" style={{ color: 'var(--text-muted)' }}>
          Entries come from the trip "{bookTrip.title}".
        </p>
      )}
    </div>
  )
}

// ── Filmstrip of spreads ─────────────────────────────────────────────────────

function Filmstrip({
  pages,
  onPick,
}: {
  pages: BookPage[]
  onPick: (itemId: string) => void
}) {
  // Page 1 sits alone on the right of the first spread.
  const spreads: (BookPage | null)[][] = []
  spreads.push([null, pages[0] ?? null])
  for (let i = 1; i < pages.length; i += 2) spreads.push([pages[i], pages[i + 1] ?? null])

  const size = 84
  return (
    <div className="hidden md:block mb-4">
      <div className="flex gap-4 overflow-x-auto pb-3">
        {spreads.map((spread, s) => (
          <div key={s} className="flex-shrink-0">
            <div className="flex" style={{ gap: 1 }}>
              {spread.map((page, k) =>
                page ? (
                  <PageThumb
                    key={page.number}
                    page={page}
                    size={size}
                    onClick={page.itemIds[0] ? () => onPick(page.itemIds[0]) : undefined}
                  />
                ) : (
                  <div key={`empty-${k}`} style={{ width: size, height: size }} />
                ),
              )}
            </div>
            <div className="flex justify-between text-[10px] mt-1 px-0.5" style={{ color: 'var(--text-muted)' }}>
              <span>{spread[0]?.number ?? ''}</span>
              <span>{spread[1]?.number ?? ''}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Bulk skips ───────────────────────────────────────────────────────────────

function BulkActions({ views, onSetIncluded }: { views: ItemView[]; onSetIncluded: (ids: string[], included: boolean) => void }) {
  const [open, setOpen] = useState(false)
  const [minWords, setMinWords] = useState(20)
  const [categoryId, setCategoryId] = useState('')

  const included = views.filter((v) => v.item.included)
  const skipped = views.filter((v) => !v.item.included)
  const short = included.filter((v) => v.photos.length === 0 && v.words < minWords)
  const onlyChris = included.filter((v) => v.authors.length === 1 && v.authors[0] === 'chris')
  const onlyKrista = included.filter((v) => v.authors.length === 1 && v.authors[0] === 'krista')

  const categories = useMemo(() => {
    const map = new Map<string, { id: string; name: string; emoji: string | null }>()
    for (const v of views) for (const t of v.entry.tagged_items) if (t.category) map.set(t.category.id, t.category)
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [views])
  const byTag = categoryId ? included.filter((v) => v.categoryIds.includes(categoryId)) : []

  const ids = (list: ItemView[]) => list.map((v) => v.item.id)
  const actionButton = (label: string, list: ItemView[], included = false) => (
    <button
      onClick={() => onSetIncluded(ids(list), included)}
      disabled={list.length === 0}
      className="px-3 py-2 rounded-lg text-xs font-medium border cursor-pointer disabled:opacity-40 disabled:cursor-default"
      style={{ borderColor: 'var(--border-card)', color: 'var(--text-primary)', backgroundColor: 'var(--bg-page)' }}
    >
      {label} ({list.length})
    </button>
  )

  return (
    <div className="rounded-xl border mb-4" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-3 cursor-pointer">
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Quick skips</span>
        <svg
          className="w-4 h-4 transition-transform duration-200"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`collapsible-content ${open ? 'open' : ''}`}>
        <div>
          <div className="px-3 pb-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Under</span>
              <input
                type="number"
                min={1}
                value={minWords}
                onChange={(e) => setMinWords(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 rounded-lg border px-2 py-1.5 text-xs"
                style={inputStyle}
              />
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>words, no photo:</span>
              {actionButton('Skip', short)}
            </div>
            <div className="flex flex-wrap gap-2">
              {actionButton('Skip entries only Chris wrote', onlyChris)}
              {actionButton('Skip entries only Krista wrote', onlyKrista)}
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="rounded-lg border px-2 py-1.5 text-xs" style={inputStyle}>
                  <option value="">Skip by tag</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.emoji ? `${c.emoji} ` : ''}{c.name}</option>
                  ))}
                </select>
                {categoryId && actionButton('Skip tagged', byTag)}
              </div>
            )}
            <div className="pt-1 border-t" style={{ borderColor: 'var(--border-card)' }}>
              <div className="pt-3">{actionButton('Put every skipped entry back', skipped, true)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Book settings ────────────────────────────────────────────────────────────

function BookSettings({ book, onDeleted }: { book: Book; onDeleted: () => void }) {
  const updateBook = useUpdateBook()
  const deleteBook = useDeleteBook()
  const [title, setTitle] = useState(book.title)
  const [dateFrom, setDateFrom] = useState(book.date_from ?? '')
  const [dateTo, setDateTo] = useState(book.date_to ?? '')
  const [authors, setAuthors] = useState<BookAuthors>(book.include_authors)
  const [pageLimit, setPageLimit] = useState(book.page_limit)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const save = () => {
    updateBook.mutate({
      id: book.id,
      patch: {
        title: title.trim() || book.title,
        include_authors: authors,
        page_limit: pageLimit > 0 ? pageLimit : book.page_limit,
        ...(book.trip_id ? {} : dateFrom && dateTo && dateFrom <= dateTo ? { date_from: dateFrom, date_to: dateTo } : {}),
      },
    })
  }

  return (
    <div className="rounded-xl border p-4 mb-4 space-y-3" style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}>
      <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full rounded-lg border p-2.5 text-sm" style={inputStyle} aria-label="Title" />
      {!book.trip_id && (
        <div className="flex gap-3">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="flex-1 min-w-0 rounded-lg border p-2.5 text-sm" style={inputStyle} aria-label="From" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="flex-1 min-w-0 rounded-lg border p-2.5 text-sm" style={inputStyle} aria-label="To" />
        </div>
      )}
      <div className="flex gap-2">
        {(['both', 'chris', 'krista'] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAuthors(a)}
            className="flex-1 py-2 rounded-lg text-xs font-medium border cursor-pointer"
            style={{
              borderColor: authors === a ? 'var(--accent)' : 'var(--border-card)',
              backgroundColor: authors === a ? 'var(--accent)' : 'transparent',
              color: authors === a ? 'white' : 'var(--text-primary)',
            }}
          >
            {a === 'both' ? 'Both' : a === 'chris' ? 'Chris only' : 'Krista only'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Page limit</label>
        <input type="number" min={2} step={2} value={pageLimit} onChange={(e) => setPageLimit(Number(e.target.value) || 0)} className="w-24 rounded-lg border p-2 text-sm" style={inputStyle} />
        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{book.trim_size.replace('x', ' x ')} in</span>
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        A wider range adds the new days to the book. A narrower one hides days outside it but keeps their choices.
      </p>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={updateBook.isPending}
          className="flex-1 py-2 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {updateBook.isPending ? 'Saving…' : 'Save'}
        </button>
        {confirmDelete ? (
          <button
            onClick={() => deleteBook.mutate(book.id, { onSuccess: onDeleted })}
            className="flex-1 py-2 rounded-lg text-sm font-medium text-white cursor-pointer"
            style={{ backgroundColor: '#E0504A' }}
          >
            Delete for good
          </button>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="py-2 px-3 rounded-lg text-sm font-medium border cursor-pointer"
            style={{ borderColor: 'var(--border-card)', color: '#E0504A' }}
          >
            Delete book
          </button>
        )}
      </div>
      {confirmDelete && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Deletes the book and its choices. Journal entries and photos are not touched.
        </p>
      )}
    </div>
  )
}

// ── One entry row ────────────────────────────────────────────────────────────

const SWIPE_COMMIT_PX = 80

function EntryRow({
  view,
  flags,
  pages,
  changedBy,
  onToggleIncluded,
  onToggleDone,
  onOpenJournal,
  onEdit,
}: {
  view: ItemView
  flags: ItemFlag[]
  pages: string | null
  changedBy: string | null
  onToggleIncluded: () => void
  onToggleDone: () => void
  onOpenJournal: () => void
  onEdit: () => void
}) {
  const { item, entry } = view
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; horizontal: boolean | null } | null>(null)

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    start.current = { x: t.clientX, y: t.clientY, horizontal: null }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const s = start.current
    if (!s) return
    const t = e.touches[0]
    const mx = t.clientX - s.x
    const my = t.clientY - s.y
    if (s.horizontal === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) s.horizontal = Math.abs(mx) > Math.abs(my)
    if (s.horizontal) setDx(Math.max(-140, Math.min(140, mx)))
  }
  const onTouchEnd = () => {
    if ((dx <= -SWIPE_COMMIT_PX && item.included) || (dx >= SWIPE_COMMIT_PX && !item.included)) onToggleIncluded()
    start.current = null
    setDx(0)
  }

  const date = parse(entry.entry_date, 'yyyy-MM-dd', new Date())
  const preview = view.sections.map((s) => s.visible).join(' ').slice(0, 140)

  return (
    <div id={`book-item-${item.id}`} className="relative rounded-xl overflow-hidden">
      {/* Revealed behind the row while swiping */}
      <div
        className="absolute inset-0 flex items-center px-4 text-xs font-semibold text-white"
        style={{
          justifyContent: dx < 0 ? 'flex-end' : 'flex-start',
          backgroundColor: dx < 0 ? '#8C8078' : '#4FA3A5',
        }}
      >
        {dx < 0 ? 'Skip' : 'Put back'}
      </div>

      <div
        className="relative border rounded-xl p-3"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-card)',
          transform: `translateX(${dx}px)`,
          transition: dx === 0 ? 'transform 0.18s ease-out' : 'none',
          opacity: item.included ? 1 : 0.55,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-start gap-3">
          {/* Include switch */}
          <button
            onClick={onToggleIncluded}
            role="switch"
            aria-checked={item.included}
            aria-label={item.included ? 'In the book, tap to skip' : 'Skipped, tap to put back'}
            className="mt-0.5 w-10 h-6 rounded-full relative flex-shrink-0 cursor-pointer transition-colors"
            style={{ backgroundColor: item.included ? 'var(--accent)' : 'var(--border-card)' }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
              style={{ left: item.included ? 18 : 2 }}
            />
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <button onClick={onOpenJournal} className="text-sm font-semibold cursor-pointer hover:underline" style={{ color: 'var(--text-primary)' }}>
                {format(date, 'EEE, MMM d, yyyy')}
              </button>
              {view.authors.map((a) => (
                <AuthorBadge key={a} author={a} size={18} />
              ))}
              {view.milestone && <span className="text-xs" title={view.milestone.title}>⭐</span>}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {view.photos.length} photo{view.photos.length === 1 ? '' : 's'} · {view.words} words
              {item.included && pages ? ` · ${pages}` : ''}
              {view.trip ? ` · ${view.trip.title}` : ''}
            </div>
            {preview && (
              <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{preview}</p>
            )}
            {flags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {flags.map((f) => (
                  <FlagChip key={f.kind} flag={f} />
                ))}
              </div>
            )}
            {changedBy && (
              <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
                Changed by {changedBy} {formatDistanceToNow(new Date(item.updated_at), { addSuffix: true })}
              </div>
            )}
          </div>

          <button
            onClick={onEdit}
            className="px-2.5 py-1.5 rounded-lg border text-xs font-medium flex-shrink-0 cursor-pointer"
            style={{ borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
          >
            Edit
          </button>

          {/* Done */}
          <label className="flex flex-col items-center gap-0.5 flex-shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={item.done}
              onChange={onToggleDone}
              className="w-5 h-5 cursor-pointer"
              style={{ accentColor: '#4FA3A5' }}
            />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Done</span>
          </label>
        </div>
      </div>
    </div>
  )
}
