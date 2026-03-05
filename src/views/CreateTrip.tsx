import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { useCreateTrip, useEntriesInRange } from '../hooks/useTrips'
import { getStorageUrl, truncateText } from '../lib/helpers'

export default function CreateTrip() {
  const navigate = useNavigate()
  const createTrip = useCreateTrip()

  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [checkedEntries, setCheckedEntries] = useState<Set<string>>(new Set())
  const [hasInitializedChecked, setHasInitializedChecked] = useState(false)
  const [coverPhotoPath, setCoverPhotoPath] = useState<string | null>(null)

  const { data: entriesInRange = [] } = useEntriesInRange(startDate, endDate)

  // Initialize all entries as checked when they first load
  if (entriesInRange.length > 0 && !hasInitializedChecked) {
    setCheckedEntries(new Set(entriesInRange.map(e => e.id)))
    setHasInitializedChecked(true)
  }

  // Reset checked state when dates change
  const dateKey = `${startDate}-${endDate}`
  const [lastDateKey, setLastDateKey] = useState('')
  if (dateKey !== lastDateKey && dateKey !== '-') {
    setLastDateKey(dateKey)
    setHasInitializedChecked(false)
  }

  // All photos from checked entries
  const allPhotos = useMemo(() => {
    return entriesInRange
      .filter(e => checkedEntries.has(e.id))
      .flatMap(e => (e.photos ?? []).map(p => ({ ...p, entryDate: e.entry_date })))
  }, [entriesInRange, checkedEntries])

  const toggleEntry = (entryId: string) => {
    setCheckedEntries(prev => {
      const next = new Set(prev)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  const handleCreate = async () => {
    if (!title.trim() || !startDate || !endDate) return
    try {
      const trip = await createTrip.mutateAsync({
        title: title.trim(),
        summary: summary.trim() || undefined,
        startDate,
        endDate,
        coverPhotoPath: coverPhotoPath ?? undefined,
        entryIds: Array.from(checkedEntries),
      })
      navigate(`/trips/${trip.id}`)
    } catch (err) {
      console.error('Failed to create trip:', err)
    }
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1
          className="text-xl flex-1"
          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
        >
          Create Trip
        </h1>
      </div>

      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Italy 2025"
            className="w-full rounded-xl border p-3 text-sm"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Date range */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Date Range
          </label>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Start</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border p-2.5 text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>End</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full rounded-lg border p-2.5 text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
        </div>

        {/* Entry preview */}
        {startDate && endDate && entriesInRange.length > 0 && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Entries ({checkedEntries.size} of {entriesInRange.length} selected)
            </label>
            <div className="space-y-2">
              {entriesInRange.map((entry) => {
                const date = parse(entry.entry_date, 'yyyy-MM-dd', new Date())
                const preview = entry.sections?.[0]?.content
                  ? truncateText(entry.sections[0].content, 80)
                  : ''
                const firstPhoto = entry.photos?.[0]
                const isChecked = checkedEntries.has(entry.id)

                return (
                  <button
                    key={entry.id}
                    onClick={() => toggleEntry(entry.id)}
                    className="w-full text-left rounded-xl border p-3 flex items-center gap-3 transition-all duration-150 cursor-pointer"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: isChecked ? 'var(--accent)' : 'var(--border-card)',
                      borderWidth: isChecked ? '2px' : '1px',
                    }}
                  >
                    {/* Checkbox */}
                    <div
                      className="w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2"
                      style={{
                        borderColor: isChecked ? 'var(--accent)' : 'var(--border-card)',
                        backgroundColor: isChecked ? 'var(--accent)' : 'transparent',
                      }}
                    >
                      {isChecked && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {format(date, 'EEE, MMM d')}
                      </div>
                      {preview && (
                        <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>
                          {preview}
                        </p>
                      )}
                    </div>

                    {firstPhoto && (
                      <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={getStorageUrl(firstPhoto.storage_path)}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {startDate && endDate && entriesInRange.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
            No journal entries found in this date range.
          </p>
        )}

        {/* Cover photo picker */}
        {allPhotos.length > 0 && (
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Cover Photo (optional)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {allPhotos.map((photo) => {
                const isSelected = coverPhotoPath === photo.storage_path
                return (
                  <button
                    key={photo.id}
                    onClick={() => setCoverPhotoPath(isSelected ? null : photo.storage_path)}
                    className="relative aspect-square rounded-lg overflow-hidden cursor-pointer"
                    style={{
                      outline: isSelected ? '3px solid var(--accent)' : 'none',
                      outlineOffset: '-3px',
                    }}
                  >
                    <img
                      src={getStorageUrl(photo.storage_path)}
                      alt=""
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {isSelected && (
                      <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--accent)' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Summary */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Summary (optional)
          </label>
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="A few words about this trip..."
            rows={3}
            className="w-full rounded-xl border p-3 text-sm resize-none"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Create button */}
        <button
          onClick={handleCreate}
          disabled={!title.trim() || !startDate || !endDate || createTrip.isPending}
          className="w-full py-3.5 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-50 transition-all duration-150"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {createTrip.isPending ? 'Creating...' : 'Create Trip'}
        </button>
      </div>
    </div>
  )
}
