/**
 * Batch processor for the Books library. Two modes share the same UI shell:
 *
 *   mode = 'all'      ✨ Generate All — summary + themes + classification
 *   mode = 'classify' 🏷 Classify All — classification only, on every book
 *
 * Both run sequentially so we don't fan out a dozen Anthropic requests at
 * once; the user can cancel mid-batch and we still report whatever we
 * managed to save.
 *
 * Per-book "all" mode flow:
 *   1. If summary missing: try Google Books description, fall back to Open
 *      Library, fall back to Claude.
 *   2. If themes missing: ask Claude (passing whatever description we have).
 *   3. If no media tags assigned: ask Claude to pick from the existing
 *      media_tags taxonomy; insert matches.
 *
 * Per-book "classify" mode flow:
 *   1. Skip if the book already has any media tags.
 *   2. Otherwise: ask Claude to classify against the existing taxonomy.
 *
 * Errors on one book don't stop the batch — they're counted and we keep
 * moving.
 */
import { useRef, useState } from 'react'
import { useUpdateBook, useMediaTags } from '../hooks/useLibrary'
import { lookupBookDescription } from '../lib/bookLookup'
import { generateBookAI, matchTagsToIds } from '../lib/bookAi'
import type { MediaTag, TaggedItem } from '../types'

type Stage = 'confirm' | 'running' | 'done'
export type BatchMode = 'all' | 'classify'

interface Props {
  mode: BatchMode
  books: TaggedItem[]
  onClose: () => void
}

interface BatchResults {
  summariesAdded: number
  themesAdded: number
  taggedAdded: number
  failed: number
  cancelled: boolean
}

function hasTags(b: TaggedItem): boolean {
  return (b.media_tags?.length ?? 0) > 0
}

function bookNeedsAll(b: TaggedItem): boolean {
  return !b.summary || !b.themes || !hasTags(b)
}

function bookNeedsClassify(b: TaggedItem): boolean {
  return !hasTags(b)
}

export default function BookBatchModal({ mode, books, onClose }: Props) {
  const update = useUpdateBook()
  const { data: mediaTags = [] } = useMediaTags('books')
  const cancelRef = useRef(false)

  const pending = books.filter(mode === 'all' ? bookNeedsAll : bookNeedsClassify)

  const [stage, setStage] = useState<Stage>('confirm')
  const [progress, setProgress] = useState({ index: 0, total: pending.length, title: '' })
  const [results, setResults] = useState<BatchResults>({
    summariesAdded: 0,
    themesAdded: 0,
    taggedAdded: 0,
    failed: 0,
    cancelled: false,
  })

  function backdrop() {
    if (stage === 'running') return
    onClose()
  }

  async function classifyBook(book: TaggedItem, knownSummary: string | null): Promise<boolean> {
    if (mediaTags.length === 0) return false
    const csv = await generateBookAI({
      action: 'classify',
      title: book.name,
      author: book.author ?? null,
      description: knownSummary ?? book.summary ?? null,
      availableTags: mediaTags.map((t) => t.name),
    })
    const ids = matchTagsToIds(csv, mediaTags as MediaTag[])
    if (ids.length === 0) return false
    await update.mutateAsync({ id: book.id, mediaTagIds: ids })
    return true
  }

  async function run() {
    setStage('running')
    cancelRef.current = false
    let summariesAdded = 0
    let themesAdded = 0
    let taggedAdded = 0
    let failed = 0
    let cancelled = false

    for (let i = 0; i < pending.length; i++) {
      if (cancelRef.current) {
        cancelled = true
        break
      }
      const book = pending[i]
      setProgress({ index: i, total: pending.length, title: book.name })

      try {
        let summaryText = book.summary ?? null

        if (mode === 'all') {
          // ─── Summary ──────────────────────────────────────────────────
          if (!summaryText) {
            summaryText = await lookupBookDescription(book.name, book.author ?? null)
            if (cancelRef.current) {
              cancelled = true
              break
            }
            if (!summaryText) {
              summaryText = await generateBookAI({
                action: 'summary',
                title: book.name,
                author: book.author ?? null,
              })
            }
            if (summaryText) {
              await update.mutateAsync({ id: book.id, summary: summaryText })
              summariesAdded++
            }
          }

          if (cancelRef.current) {
            cancelled = true
            break
          }

          // ─── Themes ───────────────────────────────────────────────────
          if (!book.themes) {
            const themesText = await generateBookAI({
              action: 'themes',
              title: book.name,
              author: book.author ?? null,
              description: summaryText,
            })
            if (themesText) {
              await update.mutateAsync({ id: book.id, themes: themesText })
              themesAdded++
            }
          }

          if (cancelRef.current) {
            cancelled = true
            break
          }
        }

        // ─── Classify ─────────────────────────────────────────────────
        // Both modes run classification when the book has no tags. In
        // 'all' mode this is the third step; in 'classify' mode it's the
        // only step.
        if (!hasTags(book)) {
          const did = await classifyBook(book, summaryText)
          if (did) taggedAdded++
        }
      } catch {
        failed++
      }
    }

    setProgress({ index: pending.length, total: pending.length, title: '' })
    setResults({ summariesAdded, themesAdded, taggedAdded, failed, cancelled })
    setStage('done')
  }

  function cancel() {
    cancelRef.current = true
  }

  const title = mode === 'all' ? '✨ Generate All' : '🏷 Classify All'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={backdrop}
    >
      <div
        className="w-full max-w-md rounded-2xl"
        style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <h2
            className="text-lg"
            style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
          >
            {title}
          </h2>
          {stage !== 'running' && (
            <button
              onClick={onClose}
              className="text-xl cursor-pointer"
              style={{ color: 'var(--text-muted)' }}
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        <div className="px-5 pb-5 space-y-4">
          {stage === 'confirm' && (
            <ConfirmStage mode={mode} total={pending.length} onRun={run} onClose={onClose} />
          )}

          {stage === 'running' && (
            <RunningStage progress={progress} onCancel={cancel} />
          )}

          {stage === 'done' && (
            <DoneStage mode={mode} results={results} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Confirm stage ─────────────────────────────────────────────────────
function ConfirmStage({
  mode,
  total,
  onRun,
  onClose,
}: {
  mode: BatchMode
  total: number
  onRun: () => void
  onClose: () => void
}) {
  if (total === 0) {
    return (
      <>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {mode === 'all'
            ? 'Every book in your library already has a summary, themes, and tags. Nothing to generate.'
            : 'Every book in your library already has tags. Nothing to classify.'}
        </p>
        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            Done
          </button>
        </div>
      </>
    )
  }
  const question =
    mode === 'all'
      ? `Generate summaries, themes, and tags for ${total} book${total === 1 ? '' : 's'}?`
      : `Auto-assign tags for ${total} book${total === 1 ? '' : 's'}?`
  const notes =
    mode === 'all'
      ? "We'll check Open Library and Google Books first (free) and fall back to the AI for anything they don't cover. Books that already have all three are skipped. Books with existing tags keep them."
      : 'Each book gets the 2-4 most appropriate tags picked from your existing tag taxonomy. Books that already have tags are skipped.'
  return (
    <>
      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
        {question}
      </p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        {notes} This may take several minutes — you can cancel mid-batch.
      </p>
      <div className="flex gap-2 justify-end pt-2">
        <button
          onClick={onClose}
          className="text-sm px-4 py-2 rounded cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          Cancel
        </button>
        <button
          onClick={onRun}
          className="text-sm px-4 py-2 rounded font-medium cursor-pointer"
          style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        >
          {mode === 'all' ? 'Generate' : 'Classify'}
        </button>
      </div>
    </>
  )
}

// ─── Running stage ─────────────────────────────────────────────────────
function RunningStage({
  progress,
  onCancel,
}: {
  progress: { index: number; total: number; title: string }
  onCancel: () => void
}) {
  const pct = progress.total === 0 ? 0 : Math.round((progress.index / progress.total) * 100)
  return (
    <>
      <div className="text-center">
        <div className="text-3xl mb-2 animate-pulse">✨</div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Processing {Math.min(progress.index + 1, progress.total)} of {progress.total}…
        </div>
        {progress.title && (
          <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
            {progress.title}
          </div>
        )}
      </div>
      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: 'var(--bg-page)' }}
      >
        <div
          className="h-full transition-all duration-200"
          style={{ width: `${pct}%`, backgroundColor: 'var(--accent)' }}
        />
      </div>
      <div className="flex justify-end pt-1">
        <button
          onClick={onCancel}
          className="text-sm px-4 py-2 rounded cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          Cancel
        </button>
      </div>
    </>
  )
}

// ─── Done stage ────────────────────────────────────────────────────────
function DoneStage({
  mode,
  results,
  onClose,
}: {
  mode: BatchMode
  results: BatchResults
  onClose: () => void
}) {
  return (
    <>
      <div className="text-center">
        <div className="text-3xl mb-2">{results.cancelled ? '🛑' : '✅'}</div>
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {results.cancelled ? 'Cancelled.' : 'Done.'}
        </div>
      </div>
      <ul
        className="text-sm rounded-lg p-3 space-y-1"
        style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}
      >
        {mode === 'all' && (
          <>
            <li>
              Generated <strong>{results.summariesAdded}</strong>{' '}
              {results.summariesAdded === 1 ? 'summary' : 'summaries'}.
            </li>
            <li>
              Generated <strong>{results.themesAdded}</strong>{' '}
              {results.themesAdded === 1 ? 'theme list' : 'theme lists'}.
            </li>
          </>
        )}
        <li>
          Classified <strong>{results.taggedAdded}</strong>{' '}
          {results.taggedAdded === 1 ? 'book' : 'books'}.
        </li>
        {results.failed > 0 && (
          <li style={{ color: '#7A2A2A' }}>
            <strong>{results.failed}</strong> book{results.failed === 1 ? '' : 's'} failed —
            try again later.
          </li>
        )}
      </ul>
      <div className="flex justify-end pt-1">
        <button
          onClick={onClose}
          className="text-sm px-4 py-2 rounded font-medium cursor-pointer"
          style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        >
          Close
        </button>
      </div>
    </>
  )
}
