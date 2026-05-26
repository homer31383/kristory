/**
 * Scan Bookshelf modal — pick a photo of a bookshelf, send it to the Claude
 * vision endpoint, then check the books you want to add. Each selected book
 * is enriched with an Open Library cover/ISBN lookup before insertion. New
 * books default to status = "read" because that's the common case for
 * shelves you already own.
 */
import { useState } from 'react'
import { resizeImage } from '../lib/helpers'
import { blobToBase64 } from '../lib/scanRecipe'
import { scanBookshelf } from '../lib/scanBookshelf'
import type { DetectedBook } from '../lib/scanBookshelf'
import { searchBooks } from '../lib/bookLookup'
import { useCreateBook } from '../hooks/useLibrary'
import { useUser } from '../hooks/useUser'

interface Props {
  categoryId: string
  onClose: () => void
}

type Stage = 'pick' | 'scanning' | 'review' | 'saving' | 'done'

interface Row {
  detected: DetectedBook
  selected: boolean
}

export default function ScanBookshelfModal({ categoryId, onClose }: Props) {
  const { user } = useUser()
  const create = useCreateBook()
  const [stage, setStage] = useState<Stage>('pick')
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [summary, setSummary] = useState<{ added: number; failed: number } | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setStage('scanning')
    try {
      // Bookshelves benefit from sharper text; keep a wider edge than the
      // 1600 default since spines are tall and thin.
      const blob = await resizeImage(file, 2000, 0.9)
      const b64 = await blobToBase64(blob)
      const detected = await scanBookshelf({ image: b64, media_type: 'image/jpeg' })
      if (detected.length === 0) {
        setError("Couldn't read any books from that photo. Try a closer or sharper shot.")
        setStage('pick')
        return
      }
      setRows(detected.map((d) => ({ detected: d, selected: true })))
      setStage('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Scan failed')
      setStage('pick')
    }
  }

  function toggleRow(i: number) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, selected: !r.selected } : r)))
  }

  function setAll(selected: boolean) {
    setRows((prev) => prev.map((r) => ({ ...r, selected })))
  }

  async function addSelected() {
    if (!user) return
    const picks = rows.filter((r) => r.selected)
    if (picks.length === 0) return
    setStage('saving')
    setProgress({ done: 0, total: picks.length })
    let failures = 0
    for (let i = 0; i < picks.length; i++) {
      const { detected } = picks[i]
      try {
        // Best-effort enrichment — if Open Library / Google Books are slow
        // or 0-hit, we still save what Claude saw.
        let coverUrl: string | null = null
        let isbn: string | null = null
        let pageCount: number | null = null
        let summary: string | null = null
        try {
          const q = detected.author ? `${detected.title} ${detected.author}` : detected.title
          const found = await searchBooks(q)
          if (found.length > 0) {
            coverUrl = found[0].coverUrl
            isbn = found[0].isbn
            pageCount = found[0].pageCount
            summary = found[0].description
          }
        } catch {
          // swallow lookup errors per-row
        }
        await create.mutateAsync({
          categoryId,
          userId: user.id,
          name: detected.title,
          author: detected.author,
          status: 'read',
          cover_url: coverUrl,
          isbn,
          page_count: pageCount,
          summary,
        })
      } catch {
        failures++
      } finally {
        setProgress({ done: i + 1, total: picks.length })
      }
    }
    setSummary({ added: picks.length - failures, failed: failures })
    if (failures > 0) {
      setError(`${failures} ${failures === 1 ? 'book' : 'books'} failed to save.`)
    }
    setStage('done')
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
            📷 Scan Bookshelf
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
          {stage === 'pick' && (
            <>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Take a photo of one shelf so spines are clearly legible. Claude will read the
                titles, and you'll pick which ones to add to your library.
              </p>
              <label
                className="block rounded-xl border-2 border-dashed text-center px-4 py-8 cursor-pointer"
                style={{
                  borderColor: 'var(--border-card)',
                  backgroundColor: 'var(--bg-page)',
                  color: 'var(--text-secondary)',
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                  }}
                />
                <div className="text-3xl mb-2">📷</div>
                <div className="text-sm font-medium">Tap to pick a photo</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  Or take a new one
                </div>
              </label>
            </>
          )}

          {stage === 'scanning' && (
            <div className="text-center py-10">
              <div className="text-3xl mb-3 animate-pulse">📚</div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Reading your bookshelf…
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                This can take 30 seconds for a packed shelf.
              </div>
            </div>
          )}

          {stage === 'review' && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Found {rows.length} {rows.length === 1 ? 'book' : 'books'} — {rows.filter((r) => r.selected).length} selected
                </div>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => setAll(true)} className="cursor-pointer underline" style={{ color: 'var(--accent)' }}>All</button>
                  <button onClick={() => setAll(false)} className="cursor-pointer underline" style={{ color: 'var(--text-muted)' }}>None</button>
                </div>
              </div>
              <ul className="space-y-1 max-h-[50vh] overflow-y-auto -mx-1 px-1">
                {rows.map((r, i) => (
                  <li key={i}>
                    <label
                      className="flex gap-2 items-start p-2 rounded cursor-pointer"
                      style={{ backgroundColor: r.selected ? 'var(--bg-page)' : 'transparent' }}
                    >
                      <input
                        type="checkbox"
                        checked={r.selected}
                        onChange={() => toggleRow(i)}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {r.detected.title}
                        </div>
                        {r.detected.author && (
                          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                            {r.detected.author}
                          </div>
                        )}
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          {stage === 'saving' && (
            <div className="text-center py-10">
              <div className="text-3xl mb-3 animate-pulse">💾</div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Adding {progress.done} / {progress.total}…
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                Looking up covers from Open Library.
              </div>
            </div>
          )}

          {stage === 'done' && summary && (
            <div className="text-center py-8">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
                Added {summary.added} {summary.added === 1 ? 'book' : 'books'} to your library.
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs px-3 py-2 rounded" style={{ backgroundColor: '#F4DADA', color: '#7A2A2A' }}>
              {error}
            </div>
          )}

          <div className="flex gap-2 justify-end pt-2">
            {stage === 'review' && (
              <button
                onClick={addSelected}
                disabled={rows.filter((r) => r.selected).length === 0}
                className="text-sm px-4 py-2 rounded font-medium cursor-pointer"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  opacity: rows.filter((r) => r.selected).length === 0 ? 0.5 : 1,
                }}
              >
                Add {rows.filter((r) => r.selected).length} to library
              </button>
            )}
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              {stage === 'done' ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
