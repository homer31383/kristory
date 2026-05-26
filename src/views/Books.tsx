/**
 * The Books surface — rich list view for the Books category.
 *
 * Status pills + tag pills + sort + search filter the same useBooks query.
 * The "Art" pill is a cross-cut over media_tags (filtered client-side in
 * the hook). "Favorites" is just `favorite = true`. The default sort is
 * recent.
 */
import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useBooksCategoryId, useBooks, useMediaTags } from '../hooks/useLibrary'
import { useDebouncedValue } from '../hooks/useDebounce'
import AddBookSheet from '../components/AddBookSheet'
import type { BookStatus, TaggedItem } from '../types'

type StatusPill = 'all' | 'want' | 'reading' | 'read' | 'art' | 'favorites'

const STATUS_PILLS: { id: StatusPill; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'want', label: 'Want to Read' },
  { id: 'reading', label: 'Reading' },
  { id: 'read', label: 'Read' },
  { id: 'art', label: 'Art Books' },
  { id: 'favorites', label: 'Favorites' },
]

const SORTS: { id: 'recent' | 'rating' | 'title' | 'author'; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'rating', label: 'Highest Rated' },
  { id: 'title', label: 'Title' },
  { id: 'author', label: 'Author' },
]

export default function Books() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStatus = (searchParams.get('status') as StatusPill | null) ?? 'all'
  const [status, setStatus] = useState<StatusPill>(initialStatus)
  const [tagIds, setTagIds] = useState<string[]>([])
  const [sort, setSort] = useState<'recent' | 'rating' | 'title' | 'author'>('recent')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput, 250)
  const [addOpen, setAddOpen] = useState(false)

  const { data: booksCategoryId, isLoading: catLoading } = useBooksCategoryId()
  const { data: tags = [] } = useMediaTags('books')
  const { data: books = [], isLoading } = useBooks(booksCategoryId, {
    status,
    mediaTagIds: tagIds,
    search,
    sort,
  })

  const counts = useMemo(() => {
    // Lightweight per-status counts for the pills (driven off the unfiltered
    // list isn't quite right since the server filtered; for now show "()" on
    // pills only for the active count via books.length under "all").
    return { total: books.length }
  }, [books])

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  function changeStatus(s: StatusPill) {
    setStatus(s)
    const next = new URLSearchParams(searchParams)
    if (s === 'all') next.delete('status')
    else next.set('status', s)
    setSearchParams(next, { replace: true })
  }

  if (catLoading) {
    return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</div>
  }
  if (!booksCategoryId) {
    return (
      <div className="pb-24">
        <button
          onClick={() => navigate('/explore')}
          className="text-sm mb-4 cursor-pointer"
          style={{ color: 'var(--accent)' }}
        >
          ← Library
        </button>
        <h1
          className="text-2xl mb-3"
          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
        >
          📖 Books
        </h1>
        <div
          className="rounded-xl border p-6 text-center"
          style={{ borderColor: 'var(--border-card)', backgroundColor: 'var(--bg-card)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No "Books" category exists yet. Create one from <button onClick={() => navigate('/lists')} className="underline cursor-pointer" style={{ color: 'var(--accent)' }}>Lists</button> to start logging.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="pb-24">
      <button
        onClick={() => navigate('/explore')}
        className="text-sm mb-4 cursor-pointer"
        style={{ color: 'var(--accent)' }}
      >
        ← Library
      </button>

      <div className="flex items-center justify-between mb-4">
        <h1
          className="text-2xl"
          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
        >
          📖 Books
        </h1>
        <button
          onClick={() => setAddOpen(true)}
          className="text-sm px-3 py-2 rounded-lg font-medium cursor-pointer"
          style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        >
          + Add Book
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <input
          type="text"
          placeholder="Search title, author, themes, what stuck..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full rounded-xl border py-2.5 px-4 text-sm"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--border-card)',
            color: 'var(--text-primary)',
          }}
        />
      </div>

      {/* Status pills */}
      <div className="flex flex-wrap gap-2 mb-3">
        {STATUS_PILLS.map((p) => {
          const active = status === p.id
          return (
            <button
              key={p.id}
              onClick={() => changeStatus(p.id)}
              className="text-xs px-3 py-1.5 rounded-full cursor-pointer transition-colors"
              style={{
                backgroundColor: active ? 'var(--accent)' : 'var(--bg-card)',
                color: active ? 'white' : 'var(--text-secondary)',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-card)'),
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      {/* Tag pills */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {tags.map((t) => {
            const active = tagIds.includes(t.id)
            return (
              <button
                key={t.id}
                onClick={() => toggleTag(t.id)}
                className="text-[11px] px-2.5 py-1 rounded-full cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'var(--bg-page)',
                  color: active ? 'white' : 'var(--text-muted)',
                  border: '1px solid ' + (active ? 'var(--accent)' : 'transparent'),
                }}
              >
                {t.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Sort */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Sort</span>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="text-xs px-2 py-1 rounded border cursor-pointer"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--border-card)',
            color: 'var(--text-primary)',
          }}
        >
          {SORTS.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
        <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
          {counts.total} {counts.total === 1 ? 'book' : 'books'}
        </span>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl animate-pulse"
              style={{ backgroundColor: 'var(--bg-card)' }}
            />
          ))}
        </div>
      ) : books.length === 0 ? (
        <div
          className="rounded-xl border p-6 text-center"
          style={{ borderColor: 'var(--border-card)', backgroundColor: 'var(--bg-card)' }}
        >
          <div className="text-2xl mb-2">📖</div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {search.trim()
              ? `No books matching "${search}"`
              : 'No books here yet. Add one to start your library.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {books.map((b) => (
            <BookRow key={b.id} book={b} onClick={() => navigate(`/library/books/${b.id}`)} />
          ))}
        </ul>
      )}

      {addOpen && booksCategoryId && (
        <AddBookSheet
          categoryId={booksCategoryId}
          onClose={() => setAddOpen(false)}
          onCreated={(id) => {
            setAddOpen(false)
            navigate(`/library/books/${id}`)
          }}
        />
      )}
    </div>
  )
}

// ─── Book row ──────────────────────────────────────────────────────────
function BookRow({ book, onClick }: { book: TaggedItem; onClick: () => void }) {
  const pill = statusPill(book.status ?? null)
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full text-left rounded-xl border p-3 transition-shadow hover:shadow-md cursor-pointer flex gap-3 items-start"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-card)',
        }}
      >
        {/* Cover */}
        <div
          className="w-12 h-16 rounded overflow-hidden flex-shrink-0"
          style={{ border: '1px solid var(--border-card)', backgroundColor: 'var(--bg-page)' }}
        >
          {book.cover_url ? (
            <img src={book.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg" style={{ color: 'var(--text-muted)' }}>📖</div>
          )}
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-sm leading-tight" style={{ color: 'var(--text-primary)' }}>
              {book.name}
            </div>
            <div className="flex gap-1 flex-shrink-0 text-xs">
              {book.hall_of_fame && <span title="Hall of Fame">🏆</span>}
              {book.favorite && <span title="Favorite">❤️</span>}
            </div>
          </div>
          {book.author && (
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {book.author}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1.5">
            {pill && (
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wide"
                style={{ backgroundColor: pill.bg, color: pill.color }}
              >
                {pill.label}
              </span>
            )}
            {book.rating != null && (
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {'★'.repeat(book.rating)}{'☆'.repeat(Math.max(0, 5 - book.rating))}
              </span>
            )}
            {(book.media_tags ?? []).slice(0, 3).map((mt) => (
              <span
                key={mt.tag.id}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-muted)' }}
              >
                {mt.tag.name}
              </span>
            ))}
          </div>
        </div>
      </button>
    </li>
  )
}

function statusPill(s: BookStatus | null): { label: string; bg: string; color: string } | null {
  switch (s) {
    case 'want':      return { label: 'Want', bg: '#E8E2D8', color: '#6A5F55' }
    case 'reading':   return { label: 'Reading', bg: '#F0C987', color: '#5A3E10' }
    case 'read':      return { label: 'Read', bg: '#D4E7D6', color: '#2E5A33' }
    case 'abandoned': return { label: 'Abandoned', bg: '#E8DCDC', color: '#7A4444' }
    case 'reference': return { label: 'Reference', bg: '#DEDAEE', color: '#3F356F' }
    default:          return null
  }
}
