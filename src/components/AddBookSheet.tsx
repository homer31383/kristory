/**
 * Add Book modal. The user types a title (and optionally an author), hits
 * "Look up" to query Open Library + Google Books, and picks a result to
 * auto-fill cover/description/isbn/pages. They can also skip lookup and
 * fill manually. Status defaults to "Want to Read".
 */
import { useState } from 'react'
import { useCreateBook, useMediaTags } from '../hooks/useLibrary'
import { useUser } from '../hooks/useUser'
import { searchBooks } from '../lib/bookLookup'
import type { BookLookupResult } from '../lib/bookLookup'
import type { BookStatus } from '../types'

const STATUSES: { id: BookStatus; label: string }[] = [
  { id: 'want', label: 'Want to Read' },
  { id: 'reading', label: 'Reading' },
  { id: 'read', label: 'Read' },
  { id: 'reference', label: 'Reference' },
]

interface Props {
  categoryId: string
  onClose: () => void
  onCreated: (id: string) => void
}

export default function AddBookSheet({ categoryId, onClose, onCreated }: Props) {
  const { user } = useUser()
  const { data: tags = [] } = useMediaTags('books')
  const create = useCreateBook()

  const [name, setName] = useState('')
  const [author, setAuthor] = useState('')
  const [status, setStatus] = useState<BookStatus>('want')
  const [coverUrl, setCoverUrl] = useState('')
  const [summary, setSummary] = useState('')
  const [isbn, setIsbn] = useState('')
  const [pageCount, setPageCount] = useState('')
  const [tagIds, setTagIds] = useState<string[]>([])

  const [looking, setLooking] = useState(false)
  const [results, setResults] = useState<BookLookupResult[]>([])
  const [lookedUp, setLookedUp] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function doLookup() {
    if (!name.trim()) return
    setLooking(true)
    setError(null)
    try {
      const q = author.trim() ? `${name} ${author}` : name
      const found = await searchBooks(q)
      setResults(found)
      setLookedUp(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed')
    } finally {
      setLooking(false)
    }
  }

  function applyResult(r: BookLookupResult) {
    setName(r.title)
    if (r.author) setAuthor(r.author)
    if (r.coverUrl) setCoverUrl(r.coverUrl)
    if (r.description) setSummary(r.description)
    if (r.isbn) setIsbn(r.isbn)
    if (r.pageCount) setPageCount(String(r.pageCount))
    setResults([])
    setLookedUp(false)
  }

  function toggleTag(id: string) {
    setTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]))
  }

  async function save() {
    if (!user || !name.trim()) return
    try {
      const book = await create.mutateAsync({
        categoryId,
        userId: user.id,
        name: name.trim(),
        author: author.trim() || null,
        status,
        cover_url: coverUrl || null,
        summary: summary || null,
        isbn: isbn || null,
        page_count: pageCount ? parseInt(pageCount, 10) || null : null,
        mediaTagIds: tagIds,
      })
      onCreated(book.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl max-h-[90vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between sticky top-0" style={{ backgroundColor: 'var(--bg-card)' }}>
          <h2
            className="text-lg"
            style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
          >
            Add Book
          </h2>
          <button
            onClick={onClose}
            className="text-xl cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5 space-y-4">
          {/* Lookup */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              Title
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="A Little Life"
              className="w-full text-sm px-3 py-2 rounded border"
              style={{
                backgroundColor: 'var(--input-bg)',
                borderColor: 'var(--border-card)',
                color: 'var(--text-primary)',
              }}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              Author
            </label>
            <div className="flex gap-2">
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Hanya Yanagihara"
                className="flex-1 text-sm px-3 py-2 rounded border"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  borderColor: 'var(--border-card)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={doLookup}
                disabled={!name.trim() || looking}
                className="text-sm px-3 py-2 rounded font-medium cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: 'var(--bg-page)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-card)',
                  opacity: looking || !name.trim() ? 0.5 : 1,
                }}
              >
                {looking ? 'Looking…' : '🔍 Look up'}
              </button>
            </div>
          </div>

          {/* Lookup results */}
          {lookedUp && results.length === 0 && !looking && (
            <div className="text-xs px-3 py-2 rounded" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-muted)' }}>
              No matches found. Fill the fields manually below.
            </div>
          )}
          {results.length > 0 && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                Pick a match
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {results.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => applyResult(r)}
                    className="w-full text-left rounded-lg border p-2 flex gap-2 items-start cursor-pointer hover:shadow-sm"
                    style={{ backgroundColor: 'var(--bg-page)', borderColor: 'var(--border-card)' }}
                  >
                    <div
                      className="w-10 h-14 rounded overflow-hidden flex-shrink-0"
                      style={{ backgroundColor: 'var(--bg-card)' }}
                    >
                      {r.coverUrl ? (
                        <img src={r.coverUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>📖</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
                        {r.title}
                      </div>
                      {r.author && (
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {r.author}
                        </div>
                      )}
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {r.source === 'openlibrary' ? 'Open Library' : 'Google Books'}
                        {r.pageCount ? ` · ${r.pageCount}p` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Cover preview */}
          {coverUrl && (
            <div className="flex items-start gap-3">
              <div
                className="w-16 h-24 rounded overflow-hidden flex-shrink-0"
                style={{ border: '1px solid var(--border-card)', backgroundColor: 'var(--bg-page)' }}
              >
                <img src={coverUrl} alt="" className="w-full h-full object-cover" />
              </div>
              <button
                onClick={() => setCoverUrl('')}
                className="text-xs px-2 py-1 rounded cursor-pointer"
                style={{ color: 'var(--text-muted)' }}
              >
                Remove cover
              </button>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              Status
            </label>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map((s) => {
                const active = status === s.id
                return (
                  <button
                    key={s.id}
                    onClick={() => setStatus(s.id)}
                    className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
                    style={{
                      backgroundColor: active ? 'var(--accent)' : 'var(--bg-page)',
                      color: active ? 'white' : 'var(--text-secondary)',
                      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-card)'),
                    }}
                  >
                    {s.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                Tags
              </label>
              <div className="flex flex-wrap gap-1.5">
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
            </div>
          )}

          {/* Optional metadata */}
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              More details
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Cover URL</label>
                <input
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded border"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    borderColor: 'var(--border-card)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div>
                <label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Summary</label>
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  rows={3}
                  className="w-full text-sm px-3 py-2 rounded border resize-y"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    borderColor: 'var(--border-card)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>ISBN</label>
                  <input
                    value={isbn}
                    onChange={(e) => setIsbn(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded border"
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--border-card)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Pages</label>
                  <input
                    type="number"
                    value={pageCount}
                    onChange={(e) => setPageCount(e.target.value)}
                    className="w-full text-sm px-3 py-2 rounded border"
                    style={{
                      backgroundColor: 'var(--input-bg)',
                      borderColor: 'var(--border-card)',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>
            </div>
          </details>

          {error && (
            <div className="text-xs px-3 py-2 rounded" style={{ backgroundColor: '#F4DADA', color: '#7A2A2A' }}>
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2 sticky bottom-0 -mx-5 px-5 pb-1" style={{ backgroundColor: 'var(--bg-card)' }}>
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!name.trim() || create.isPending}
              className="text-sm px-4 py-2 rounded font-medium cursor-pointer"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'white',
                opacity: !name.trim() || create.isPending ? 0.5 : 1,
              }}
            >
              {create.isPending ? 'Saving…' : 'Save book'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
