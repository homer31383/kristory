/**
 * Batch generator — fills in missing summary / themes for every book in
 * the user's library. Runs sequentially so we don't fan out a dozen
 * Anthropic requests at once; the user can cancel mid-batch and we
 * still report whatever we managed to save.
 *
 * Per-book order:
 *   1. Skip if summary AND themes are both already set.
 *   2. If summary missing: try Open Library / Google Books first (free,
 *      no token cost). Fall back to Claude if the free lookup misses.
 *   3. If themes missing: ask Claude.
 *
 * Errors on one book don't stop the batch — they're counted and we
 * keep moving.
 */
import { useRef, useState } from 'react'
import { useUpdateBook } from '../hooks/useLibrary'
import { lookupBookDescription } from '../lib/bookLookup'
import { generateBookAI } from '../lib/bookAi'
import type { TaggedItem } from '../types'

type Stage = 'confirm' | 'running' | 'done'

interface Props {
  books: TaggedItem[]
  onClose: () => void
}

export default function GenerateAllModal({ books, onClose }: Props) {
  const update = useUpdateBook()
  const cancelRef = useRef(false)

  const pending = books.filter((b) => !b.summary || !b.themes)

  const [stage, setStage] = useState<Stage>('confirm')
  const [progress, setProgress] = useState({ index: 0, total: pending.length, title: '' })
  const [results, setResults] = useState({
    summariesAdded: 0,
    themesAdded: 0,
    failed: 0,
    cancelled: false,
  })

  function backdrop() {
    // Don't allow clicking out while running — easy to cancel by accident.
    if (stage === 'running') return
    onClose()
  }

  async function run() {
    setStage('running')
    cancelRef.current = false
    let summariesAdded = 0
    let themesAdded = 0
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
        // ─── Summary ──────────────────────────────────────────────────
        let summaryText = book.summary ?? null
        if (!summaryText) {
          // Free lookup first.
          summaryText = await lookupBookDescription(book.name, book.author ?? null)
          if (cancelRef.current) {
            cancelled = true
            break
          }
          if (!summaryText) {
            // Claude fallback.
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
            description: summaryText, // give Claude what we now know
          })
          if (themesText) {
            await update.mutateAsync({ id: book.id, themes: themesText })
            themesAdded++
          }
        }
      } catch {
        failed++
      }
    }

    setProgress({ index: pending.length, total: pending.length, title: '' })
    setResults({ summariesAdded, themesAdded, failed, cancelled })
    setStage('done')
  }

  function cancel() {
    cancelRef.current = true
  }

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
            ✨ Generate All
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
            <ConfirmStage
              total={pending.length}
              onRun={run}
              onClose={onClose}
            />
          )}

          {stage === 'running' && (
            <RunningStage progress={progress} onCancel={cancel} />
          )}

          {stage === 'done' && (
            <DoneStage results={results} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Confirm stage ─────────────────────────────────────────────────────
function ConfirmStage({
  total,
  onRun,
  onClose,
}: {
  total: number
  onRun: () => void
  onClose: () => void
}) {
  if (total === 0) {
    return (
      <>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Every book in your library already has a summary and themes. Nothing to generate.
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
  return (
    <>
      <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
        Generate summaries and themes for{' '}
        <strong>
          {total} book{total === 1 ? '' : 's'}
        </strong>
        ?
      </p>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
        We'll check Open Library and Google Books first (free) and fall back to the AI for anything
        they don't cover. Books that already have both are skipped. This may take several minutes —
        you can cancel mid-batch.
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
          Generate
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
  results,
  onClose,
}: {
  results: { summariesAdded: number; themesAdded: number; failed: number; cancelled: boolean }
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
        <li>
          Generated <strong>{results.summariesAdded}</strong>{' '}
          {results.summariesAdded === 1 ? 'summary' : 'summaries'}.
        </li>
        <li>
          Generated <strong>{results.themesAdded}</strong>{' '}
          {results.themesAdded === 1 ? 'theme list' : 'theme lists'}.
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
