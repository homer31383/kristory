import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../hooks/useUser'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { parseImportFile, contentToHtml, type ParseResult } from '../lib/import-parser'

type ImportStage = 'idle' | 'preview' | 'year-prompt' | 'importing' | 'done'

export default function ImportJournal() {
  const { user } = useUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<ImportStage>('idle')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [yearInput, setYearInput] = useState('')
  const [rawText, setRawText] = useState('')

  // Import progress
  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [importedCount, setImportedCount] = useState(0)
  const [skippedCount, setSkippedCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    setRawText(text)

    const result = parseImportFile(text)
    setParseResult(result)

    if (result.needsYear) {
      setYearInput(result.inferredStartYear?.toString() ?? new Date().getFullYear().toString())
      setStage('year-prompt')
    } else {
      setStage('preview')
    }

    // Reset the input so re-selecting the same file works
    e.target.value = ''
  }

  const handleYearSubmit = () => {
    const year = parseInt(yearInput)
    if (isNaN(year) || year < 1900 || year > 2100) return

    const result = parseImportFile(rawText, year)
    setParseResult(result)
    setStage('preview')
  }

  const handleImport = async () => {
    if (!parseResult || !user) return

    const entries = parseResult.entries
    setStage('importing')
    setImportTotal(entries.length)
    setImportProgress(0)
    setImportedCount(0)
    setSkippedCount(0)
    setFailedCount(0)

    let imported = 0
    let skipped = 0
    let failed = 0

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      setImportProgress(i + 1)

      try {
        // Check if entry already exists
        const { data: existing } = await supabase
          .from('journal_entries')
          .select('id')
          .eq('entry_date', entry.date)
          .maybeSingle()

        if (existing) {
          // Check if this user already has a section
          const { data: existingSection } = await supabase
            .from('entry_sections')
            .select('id')
            .eq('entry_id', existing.id)
            .eq('user_id', user.id)
            .maybeSingle()

          if (existingSection) {
            skipped++
            setSkippedCount(skipped)
            continue
          }

          // Entry exists but user has no section — add one
          const html = contentToHtml(entry.content)
          const { error: sectionError } = await supabase
            .from('entry_sections')
            .insert({ entry_id: existing.id, user_id: user.id, content: html })

          if (sectionError) {
            failed++
            setFailedCount(failed)
            console.error(`Failed section for ${entry.date}:`, sectionError)
            continue
          }
          imported++
          setImportedCount(imported)
          continue
        }

        // Create journal entry
        const { data: newEntry, error: entryError } = await supabase
          .from('journal_entries')
          .insert({ entry_date: entry.date })
          .select()
          .single()

        if (entryError) {
          // Might be a unique constraint race — try to get existing
          const { data: raceExisting } = await supabase
            .from('journal_entries')
            .select('id')
            .eq('entry_date', entry.date)
            .maybeSingle()

          if (raceExisting) {
            const html = contentToHtml(entry.content)
            await supabase
              .from('entry_sections')
              .upsert({ entry_id: raceExisting.id, user_id: user.id, content: html }, { onConflict: 'entry_id,user_id' })
            imported++
            setImportedCount(imported)
          } else {
            failed++
            setFailedCount(failed)
            console.error(`Failed entry for ${entry.date}:`, entryError)
          }
          continue
        }

        // Create section
        const html = contentToHtml(entry.content)
        const { error: sectionError } = await supabase
          .from('entry_sections')
          .insert({ entry_id: newEntry.id, user_id: user.id, content: html })

        if (sectionError) {
          failed++
          setFailedCount(failed)
          console.error(`Failed section for ${entry.date}:`, sectionError)
          continue
        }

        imported++
        setImportedCount(imported)
      } catch (err) {
        failed++
        setFailedCount(failed)
        console.error(`Error on ${entry.date}:`, err)
      }
    }

    // Invalidate all entry caches
    queryClient.invalidateQueries({ queryKey: ['entries'] })
    queryClient.invalidateQueries({ queryKey: ['entry'] })
    setStage('done')
  }

  const handleReset = () => {
    setStage('idle')
    setParseResult(null)
    setRawText('')
    setYearInput('')
    setImportProgress(0)
    setImportTotal(0)
    setImportedCount(0)
    setSkippedCount(0)
    setFailedCount(0)
  }

  // Idle state — just the button
  if (stage === 'idle') {
    return (
      <div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 rounded-lg text-sm font-medium border border-dashed cursor-pointer"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          Import from Google Doc
        </button>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Import entries from a plain text export of your Google Doc
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.text,text/plain"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    )
  }

  // Year prompt
  if (stage === 'year-prompt') {
    return (
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          What year do these entries start?
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          The dates in your file don't include years. Enter the year the first entry was written.
          {parseResult && parseResult.entries.length === 0 && parseResult.warnings.length > 0 && (
            <span className="block mt-1" style={{ color: '#E5534B' }}>
              Warning: No valid entries could be parsed from this file.
            </span>
          )}
        </p>
        <input
          type="number"
          value={yearInput}
          onChange={(e) => setYearInput(e.target.value)}
          min={1900}
          max={2100}
          className="w-full rounded-lg border p-2.5 text-sm"
          style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
        />
        <div className="flex gap-2">
          <button
            onClick={handleYearSubmit}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Continue
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2.5 rounded-lg text-sm cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Preview
  if (stage === 'preview' && parseResult) {
    const { entries, warnings } = parseResult
    const earliest = entries.length > 0 ? entries[0].date : ''
    const latest = entries.length > 0 ? entries[entries.length - 1].date : ''

    return (
      <div
        className="rounded-xl border p-4 space-y-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Found {entries.length} entries
          </h3>
          {entries.length > 0 && (
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              From {earliest} to {latest}
            </p>
          )}
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold" style={{ color: '#E5534B' }}>
              {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
            </p>
            {warnings.slice(0, 5).map((w, i) => (
              <p key={i} className="text-xs" style={{ color: '#E5534B' }}>
                Line {w.line}: {w.reason}
              </p>
            ))}
            {warnings.length > 5 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ...and {warnings.length - 5} more
              </p>
            )}
          </div>
        )}

        {/* Entry list */}
        {entries.length > 0 && (
          <div
            className="max-h-60 overflow-y-auto rounded-lg border divide-y"
            style={{ borderColor: 'var(--border-card)' }}
          >
            {entries.map((entry, i) => (
              <div key={i} className="px-3 py-2" style={{ borderColor: 'var(--border-divider)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
                  {entry.date}
                </span>
                <span className="text-xs ml-2" style={{ color: 'var(--text-secondary)' }}>
                  {entry.content.slice(0, 80).replace(/\n/g, ' ')}
                  {entry.content.length > 80 ? '...' : ''}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleImport}
            disabled={entries.length === 0}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Import All ({entries.length})
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2.5 rounded-lg text-sm cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Importing
  if (stage === 'importing') {
    const pct = importTotal > 0 ? Math.round((importProgress / importTotal) * 100) : 0

    return (
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Importing entries...
        </h3>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-card)' }}>
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ backgroundColor: 'var(--accent)', width: `${pct}%` }}
          />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {importProgress} of {importTotal} ({pct}%)
        </p>
        <div className="text-xs space-y-0.5" style={{ color: 'var(--text-muted)' }}>
          <p>Imported: {importedCount}</p>
          {skippedCount > 0 && <p>Skipped (already exist): {skippedCount}</p>}
          {failedCount > 0 && <p style={{ color: '#E5534B' }}>Failed: {failedCount}</p>}
        </div>
      </div>
    )
  }

  // Done
  if (stage === 'done') {
    return (
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Import complete!
        </h3>
        <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <p>Successfully imported {importedCount} entries</p>
          {skippedCount > 0 && <p>{skippedCount} dates skipped — entries already exist</p>}
          {failedCount > 0 && <p style={{ color: '#E5534B' }}>{failedCount} entries failed</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate('/journal')}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Go to Journal
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2.5 rounded-lg text-sm cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  return null
}
