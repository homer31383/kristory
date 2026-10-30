import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { useBooks, useCreateBook, type NewBook } from '../hooks/useBooks'
import { useTrips } from '../hooks/useTrips'
import type { Book, BookAuthors } from '../types'

const inputStyle = {
  backgroundColor: 'var(--input-bg)',
  borderColor: 'var(--border-card)',
  color: 'var(--text-primary)',
}

const AUTHOR_OPTIONS: { value: BookAuthors; label: string }[] = [
  { value: 'both', label: 'Both of us' },
  { value: 'chris', label: 'Chris only' },
  { value: 'krista', label: 'Krista only' },
]

/** Trim sizes the builder knows. Size and bleed are book settings so another printer can be added. */
const TRIM_SIZES = [{ value: '7x7', label: '7 x 7 in softcover' }]

function shortDate(d: string) {
  return format(parse(d, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')
}

function bookSubtitle(book: Book, tripTitle?: string) {
  if (book.trip_id) return tripTitle ? `Trip: ${tripTitle}` : 'Trip'
  if (book.date_from && book.date_to) return `${shortDate(book.date_from)} to ${shortDate(book.date_to)}`
  return 'All entries'
}

export default function BookBuilder() {
  const navigate = useNavigate()
  const { data: books = [], isLoading } = useBooks()
  const { data: trips = [] } = useTrips()
  const createBook = useCreateBook()
  const [showForm, setShowForm] = useState(false)

  const [title, setTitle] = useState('')
  const [source, setSource] = useState<'range' | 'trip'>('range')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [tripId, setTripId] = useState('')
  const [authors, setAuthors] = useState<BookAuthors>('both')
  const [trimSize, setTrimSize] = useState('7x7')
  const [pageLimit, setPageLimit] = useState(140)
  const [error, setError] = useState<string | null>(null)

  const tripTitle = new Map(trips.map((t) => [t.id, t.title]))

  const canCreate =
    title.trim() !== '' &&
    pageLimit > 0 &&
    (source === 'trip' ? !!tripId : !!dateFrom && !!dateTo && dateFrom <= dateTo)

  const handleCreate = async () => {
    if (!canCreate) return
    setError(null)
    const trip = trips.find((t) => t.id === tripId)
    const input: NewBook = {
      title: title.trim(),
      date_from: source === 'trip' ? trip?.start_date ?? null : dateFrom,
      date_to: source === 'trip' ? trip?.end_date ?? null : dateTo,
      trip_id: source === 'trip' ? tripId : null,
      include_authors: authors,
      trim_size: trimSize,
      page_limit: pageLimit,
    }
    try {
      const book = await createBook.mutateAsync(input)
      navigate(`/book/${book.id}`)
    } catch (err) {
      console.error('[book] Create failed:', err)
      setError(err instanceof Error ? err.message : 'Could not create the book.')
    }
  }

  return (
    <div className="pb-24">
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "'Playfair Display', serif", color: 'var(--text-primary)' }}>
          Book Builder
        </h1>
      </div>
      <p className="text-sm mb-5 ml-[52px]" style={{ color: 'var(--text-secondary)' }}>
        Turn a stretch of the journal into a printed book. The journal itself never changes.
      </p>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed cursor-pointer mb-5"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          + New book
        </button>
      ) : (
        <div
          className="rounded-xl border p-4 space-y-4 mb-5"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Our First Year"
              className="w-full rounded-xl border p-3 text-sm"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Entries from</label>
            <div className="flex gap-2 mb-2">
              {(['range', 'trip'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSource(s)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium border cursor-pointer"
                  style={{
                    borderColor: source === s ? 'var(--accent)' : 'var(--border-card)',
                    backgroundColor: source === s ? 'var(--accent)' : 'transparent',
                    color: source === s ? 'white' : 'var(--text-primary)',
                  }}
                >
                  {s === 'range' ? 'Date range' : 'A trip'}
                </button>
              ))}
            </div>
            {source === 'range' ? (
              <div className="flex gap-3">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg border p-2.5 text-sm"
                  style={inputStyle}
                  aria-label="From"
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="flex-1 min-w-0 rounded-lg border p-2.5 text-sm"
                  style={inputStyle}
                  aria-label="To"
                />
              </div>
            ) : (
              <select
                value={tripId}
                onChange={(e) => setTripId(e.target.value)}
                className="w-full rounded-lg border p-2.5 text-sm"
                style={inputStyle}
              >
                <option value="">Choose a trip</option>
                {trips.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({shortDate(t.start_date)})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Whose writing</label>
            <div className="flex gap-2">
              {AUTHOR_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setAuthors(o.value)}
                  className="flex-1 py-2 rounded-lg text-xs font-medium border cursor-pointer"
                  style={{
                    borderColor: authors === o.value ? 'var(--accent)' : 'var(--border-card)',
                    backgroundColor: authors === o.value ? 'var(--accent)' : 'transparent',
                    color: authors === o.value ? 'white' : 'var(--text-primary)',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Size</label>
              <select value={trimSize} onChange={(e) => setTrimSize(e.target.value)} className="w-full rounded-lg border p-2.5 text-sm" style={inputStyle}>
                {TRIM_SIZES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="w-28">
              <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Page limit</label>
              <input
                type="number"
                min={2}
                step={2}
                value={pageLimit}
                onChange={(e) => setPageLimit(Number(e.target.value) || 0)}
                className="w-full rounded-lg border p-2.5 text-sm"
                style={inputStyle}
              />
            </div>
          </div>

          {error && <p className="text-xs" style={{ color: '#E0504A' }}>{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
              style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!canCreate || createBook.isPending}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {createBook.isPending ? 'Drafting…' : 'Create and draft'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
          ))}
        </div>
      ) : books.length === 0 ? (
        !showForm && (
          <div className="text-center py-10">
            <div className="text-3xl mb-2">📕</div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              No books yet. Pick a date range or a trip to draft your first one.
            </p>
          </div>
        )
      ) : (
        <div className="space-y-3">
          {books.map((b) => (
            <button
              key={b.id}
              onClick={() => navigate(`/book/${b.id}`)}
              className="w-full text-left rounded-xl border p-4 flex items-center gap-3 transition-all duration-150 hover:shadow-md cursor-pointer"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <span className="text-2xl">📕</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{b.title}</div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {bookSubtitle(b, b.trip_id ? tripTitle.get(b.trip_id) : undefined)} · {b.trim_size.replace('x', ' x ')} in
                </div>
              </div>
              <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
