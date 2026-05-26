/**
 * Single book detail view — editable in place. Field-level on-blur saves
 * for text/number; toggles save immediately. AI-generated summary and
 * themes (wired in a later layer) show with a small "AI" badge so the
 * user knows what was machine-written vs hand-typed.
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { format, parse } from 'date-fns'
import {
  useBook,
  useUpdateBook,
  useDeleteBook,
  useToggleFavorite,
  useToggleHallOfFame,
  useMediaTags,
} from '../hooks/useLibrary'
import type { BookFormat, BookStatus } from '../types'

const STATUSES: { id: BookStatus; label: string }[] = [
  { id: 'want', label: 'Want to Read' },
  { id: 'reading', label: 'Reading' },
  { id: 'read', label: 'Read' },
  { id: 'abandoned', label: 'Abandoned' },
  { id: 'reference', label: 'Reference' },
]

const FORMATS: { id: BookFormat; label: string }[] = [
  { id: 'physical', label: 'Physical' },
  { id: 'ebook', label: 'eBook' },
  { id: 'audiobook', label: 'Audiobook' },
]

export default function BookDetail() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const { data: book, isLoading } = useBook(bookId)
  const { data: mediaTags = [] } = useMediaTags('books')
  const update = useUpdateBook()
  const remove = useDeleteBook()
  const toggleFav = useToggleFavorite()
  const toggleHoF = useToggleHallOfFame()

  // Mirror server state into local state for edit-in-place. Reset whenever
  // the loaded book changes.
  const [name, setName] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [author, setAuthor] = useState('')
  const [recommendedBy, setRecommendedBy] = useState('')
  const [summary, setSummary] = useState('')
  const [themes, setThemes] = useState('')
  const [whatStuck, setWhatStuck] = useState('')
  const [coverUrl, setCoverUrl] = useState('')
  const [isbn, setIsbn] = useState('')
  const [pageCount, setPageCount] = useState<string>('')
  const [startDate, setStartDate] = useState('')
  const [finishDate, setFinishDate] = useState('')

  const selectedTagIds = useMemo(
    () => new Set((book?.media_tags ?? []).map((mt) => mt.tag.id)),
    [book],
  )

  useEffect(() => {
    if (!book) return
    setName(book.name ?? '')
    setSubtitle(book.subtitle ?? '')
    setAuthor(book.author ?? '')
    setRecommendedBy(book.recommended_by ?? '')
    setSummary(book.summary ?? '')
    setThemes(book.themes ?? '')
    setWhatStuck(book.what_stuck ?? '')
    setCoverUrl(book.cover_url ?? '')
    setIsbn(book.isbn ?? '')
    setPageCount(book.page_count != null ? String(book.page_count) : '')
    setStartDate(book.start_date ?? '')
    setFinishDate(book.finish_date ?? '')
  }, [book])

  if (isLoading || !book) {
    return <div className="p-6 text-sm" style={{ color: 'var(--text-secondary)' }}>Loading…</div>
  }

  async function saveField(patch: Omit<Parameters<typeof update.mutate>[0], 'id'>) {
    if (!bookId) return
    update.mutate({ id: bookId, ...patch })
  }

  function toggleTag(tagId: string) {
    const next = new Set(selectedTagIds)
    if (next.has(tagId)) next.delete(tagId)
    else next.add(tagId)
    saveField({mediaTagIds: [...next] })
  }

  return (
    <div className="pb-24 max-w-2xl">
      <button
        onClick={() => navigate(-1)}
        className="text-sm mb-4 cursor-pointer"
        style={{ color: 'var(--accent)' }}
      >
        ← Back
      </button>

      <div className="flex gap-4 mb-6">
        {/* Cover */}
        <div className="flex-shrink-0">
          <div
            className="w-32 h-48 rounded-lg overflow-hidden"
            style={{ border: '1px solid var(--border-card)', backgroundColor: 'var(--bg-card)' }}
          >
            {coverUrl ? (
              <img src={coverUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl" style={{ color: 'var(--text-muted)' }}>📖</div>
            )}
          </div>
          <input
            type="url"
            placeholder="Cover image URL"
            value={coverUrl}
            onChange={(e) => setCoverUrl(e.target.value)}
            onBlur={() => coverUrl !== (book.cover_url ?? '') && saveField({cover_url: coverUrl || null })}
            className="mt-2 text-[10px] w-32 px-2 py-1 rounded border"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-secondary)',
            }}
          />
        </div>

        {/* Title block */}
        <div className="flex-1 min-w-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== book.name && saveField({name })}
            className="w-full text-xl font-bold bg-transparent"
            style={{ fontFamily: "'Playfair Display', serif", color: 'var(--text-primary)' }}
            placeholder="Title"
          />
          <input
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            onBlur={() => subtitle !== (book.subtitle ?? '') && saveField({subtitle: subtitle || null })}
            className="w-full text-sm bg-transparent mt-0.5"
            style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}
            placeholder="Subtitle"
          />
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            onBlur={() => author !== (book.author ?? '') && saveField({author: author || null })}
            className="w-full text-sm bg-transparent mt-1"
            style={{ color: 'var(--text-secondary)' }}
            placeholder="Author"
          />

          {/* Rating */}
          <div className="flex items-center gap-1 mt-3" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => saveField({rating: book.rating === n ? null : n })}
                className="text-xl leading-none cursor-pointer"
                style={{ color: (book.rating ?? 0) >= n ? '#F0C987' : 'var(--text-muted)' }}
              >
                ★
              </button>
            ))}
          </div>

          {/* Favorite / Hall of Fame */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => toggleFav.mutate({ id: bookId!, favorite: !book.favorite })}
              className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
              style={{
                backgroundColor: book.favorite ? '#FFE6EC' : 'var(--bg-page)',
                color: book.favorite ? '#A33B5C' : 'var(--text-secondary)',
                border: '1px solid ' + (book.favorite ? '#F2C7D2' : 'var(--border-card)'),
              }}
            >
              {book.favorite ? '❤️ Favorite' : '♡ Favorite'}
            </button>
            <button
              onClick={() => {
                toggleHoF.mutate(
                  { id: bookId!, hall_of_fame: !book.hall_of_fame },
                  {
                    onError: (err) => {
                      // The hook throws when at cap — surface it.
                      alert(err instanceof Error ? err.message : 'Could not toggle Hall of Fame')
                    },
                  },
                )
              }}
              className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
              style={{
                backgroundColor: book.hall_of_fame ? '#FFF4D6' : 'var(--bg-page)',
                color: book.hall_of_fame ? '#7A5A10' : 'var(--text-secondary)',
                border: '1px solid ' + (book.hall_of_fame ? '#E6C97A' : 'var(--border-card)'),
              }}
            >
              {book.hall_of_fame ? '🏆 Hall of Fame' : 'Add to Hall of Fame'}
            </button>
          </div>
        </div>
      </div>

      {/* Status */}
      <section className="mb-5">
        <SectionLabel>Status</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const active = book.status === s.id
            return (
              <button
                key={s.id}
                onClick={() => saveField({status: s.id })}
                className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'var(--bg-card)',
                  color: active ? 'white' : 'var(--text-secondary)',
                  border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-card)'),
                }}
              >
                {s.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Format */}
      <section className="mb-5">
        <SectionLabel>Format</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {FORMATS.map((f) => {
            const active = book.format === f.id
            return (
              <button
                key={f.id}
                onClick={() => saveField({format: active ? null : f.id })}
                className="text-xs px-3 py-1.5 rounded-full cursor-pointer"
                style={{
                  backgroundColor: active ? 'var(--accent)' : 'var(--bg-card)',
                  color: active ? 'white' : 'var(--text-secondary)',
                  border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border-card)'),
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Dates */}
      <section className="mb-5 grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>Started</SectionLabel>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onBlur={() => startDate !== (book.start_date ?? '') && saveField({start_date: startDate || null })}
            className="w-full text-sm px-3 py-2 rounded border"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-primary)',
            }}
          />
          {startDate && (
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {format(parse(startDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
            </div>
          )}
        </div>
        <div>
          <SectionLabel>Finished</SectionLabel>
          <input
            type="date"
            value={finishDate}
            onChange={(e) => setFinishDate(e.target.value)}
            onBlur={() => finishDate !== (book.finish_date ?? '') && saveField({finish_date: finishDate || null })}
            className="w-full text-sm px-3 py-2 rounded border"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-primary)',
            }}
          />
          {finishDate && (
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {format(parse(finishDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
            </div>
          )}
        </div>
      </section>

      {/* Tags */}
      {mediaTags.length > 0 && (
        <section className="mb-5">
          <SectionLabel>Tags</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {mediaTags.map((t) => {
              const active = selectedTagIds.has(t.id)
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
        </section>
      )}

      {/* Recommended by */}
      <section className="mb-5">
        <SectionLabel>Recommended by</SectionLabel>
        <input
          value={recommendedBy}
          onChange={(e) => setRecommendedBy(e.target.value)}
          onBlur={() => recommendedBy !== (book.recommended_by ?? '') && saveField({recommended_by: recommendedBy || null })}
          className="w-full text-sm px-3 py-2 rounded border"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--border-card)',
            color: 'var(--text-primary)',
          }}
          placeholder="A friend, podcast, NYT review..."
        />
      </section>

      {/* Summary */}
      <section className="mb-5">
        <SectionLabel>Summary</SectionLabel>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          onBlur={() => summary !== (book.summary ?? '') && saveField({summary: summary || null })}
          rows={4}
          className="w-full text-sm px-3 py-2 rounded border resize-y"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--border-card)',
            color: 'var(--text-primary)',
          }}
          placeholder="What the book is about."
        />
      </section>

      {/* Themes */}
      <section className="mb-5">
        <SectionLabel>Themes</SectionLabel>
        <textarea
          value={themes}
          onChange={(e) => setThemes(e.target.value)}
          onBlur={() => themes !== (book.themes ?? '') && saveField({themes: themes || null })}
          rows={3}
          className="w-full text-sm px-3 py-2 rounded border resize-y"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--border-card)',
            color: 'var(--text-primary)',
          }}
          placeholder="Identity, memory, loss…"
        />
      </section>

      {/* What Stuck */}
      <section className="mb-5">
        <SectionLabel>What Stuck With You</SectionLabel>
        <textarea
          value={whatStuck}
          onChange={(e) => setWhatStuck(e.target.value)}
          onBlur={() => whatStuck !== (book.what_stuck ?? '') && saveField({what_stuck: whatStuck || null })}
          rows={4}
          className="w-full text-sm px-3 py-2 rounded border resize-y"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--border-card)',
            color: 'var(--text-primary)',
          }}
          placeholder="Your own words — quotes, ideas, what changed for you."
        />
      </section>

      {/* Metadata */}
      <section className="mb-5 grid grid-cols-2 gap-3">
        <div>
          <SectionLabel>ISBN</SectionLabel>
          <input
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            onBlur={() => isbn !== (book.isbn ?? '') && saveField({isbn: isbn || null })}
            className="w-full text-sm px-3 py-2 rounded border"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <div>
          <SectionLabel>Pages</SectionLabel>
          <input
            type="number"
            value={pageCount}
            onChange={(e) => setPageCount(e.target.value)}
            onBlur={() => {
              const n = pageCount ? parseInt(pageCount, 10) : null
              if (n !== (book.page_count ?? null)) saveField({page_count: n })
            }}
            className="w-full text-sm px-3 py-2 rounded border"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </section>

      {/* Delete */}
      <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--border-card)' }}>
        <button
          onClick={() => {
            if (!confirm(`Delete "${book.name}"? This cannot be undone.`)) return
            remove.mutate(bookId!, {
              onSuccess: () => navigate('/library/books'),
            })
          }}
          className="text-xs px-3 py-2 rounded cursor-pointer"
          style={{ backgroundColor: '#F4DADA', color: '#7A2A2A', border: '1px solid #E2C0C0' }}
        >
          Delete book
        </button>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-semibold uppercase tracking-wider mb-2"
      style={{ color: 'var(--text-muted)' }}
    >
      {children}
    </div>
  )
}
