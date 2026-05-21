import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parse, differenceInWeeks, differenceInDays, differenceInMonths } from 'date-fns'
import { useEntriesByMonth, useCreateEntry } from '../hooks/useEntries'
import { useBabyProfile } from '../hooks/useBaby'
import { getTodayString, truncateText, getStorageUrl, formatDateHeading } from '../lib/helpers'
import { useBackupSettings, isBackupOverdue } from '../hooks/useBackup'
import type { JournalEntry, Trip } from '../types'

type TimelineSegment =
  | { type: 'single'; entry: JournalEntry }
  | { type: 'trip'; trip: Trip; entries: JournalEntry[] }

function groupEntriesWithTrips(entries: JournalEntry[]): TimelineSegment[] {
  const segments: TimelineSegment[] = []
  let currentTripId: string | null = null
  let currentTripEntries: JournalEntry[] = []
  let currentTrip: Trip | null = null

  for (const entry of entries) {
    const tripEntry = entry.trip_entries?.[0]
    const entryTripId = tripEntry?.trip?.id ?? null

    if (entryTripId && entryTripId === currentTripId) {
      // Continue current trip group
      currentTripEntries.push(entry)
    } else {
      // Flush previous trip group if any
      if (currentTripId && currentTrip && currentTripEntries.length > 0) {
        segments.push({ type: 'trip', trip: currentTrip, entries: currentTripEntries })
        currentTripId = null
        currentTrip = null
        currentTripEntries = []
      }

      if (entryTripId && tripEntry?.trip) {
        // Start new trip group
        currentTripId = entryTripId
        currentTrip = tripEntry.trip
        currentTripEntries = [entry]
      } else {
        segments.push({ type: 'single', entry })
      }
    }
  }

  // Flush final trip group
  if (currentTripId && currentTrip && currentTripEntries.length > 0) {
    segments.push({ type: 'trip', trip: currentTrip, entries: currentTripEntries })
  }

  return segments
}

function EntryCard({ entry, onClick }: { entry: JournalEntry; onClick: () => void }) {
  const date = parse(entry.entry_date, 'yyyy-MM-dd', new Date())
  const dateLabel = format(date, 'MMM d, EEEE')
  const firstSection = entry.sections?.[0]
  const preview = firstSection?.content ? truncateText(firstSection.content, 100) : ''
  const firstPhoto = entry.photos?.[0]
  const tags = entry.tagged_items ?? []
  const tripEntry = entry.trip_entries?.[0]

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border p-4 transition-all duration-150 hover:shadow-md cursor-pointer"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-card)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {dateLabel}
          </div>
          {preview && (
            <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {preview}
            </p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.slice(0, 4).map((tag) => (
                <span
                  key={tag.id}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-secondary)' }}
                >
                  {tag.category?.emoji} {tag.category?.name}
                </span>
              ))}
              {tags.length > 4 && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  +{tags.length - 4} more
                </span>
              )}
            </div>
          )}
          {tripEntry?.trip && (
            <div
              className="text-xs mt-2 px-2 py-1 rounded-md inline-block"
              style={{ backgroundColor: 'var(--accent)', color: 'white' }}
            >
              ✈️ {tripEntry.trip.title}
            </div>
          )}
        </div>
        {firstPhoto && (
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
            <img
              src={getStorageUrl(firstPhoto.storage_path)}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </button>
  )
}

function TripGroupCard({
  trip,
  entries,
  onEntryClick,
}: {
  trip: Trip
  entries: JournalEntry[]
  onEntryClick: (date: string) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const navigate = useNavigate()
  const start = parse(trip.start_date, 'yyyy-MM-dd', new Date())
  const end = parse(trip.end_date, 'yyyy-MM-dd', new Date())

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left rounded-xl border p-3.5 flex items-center gap-3 transition-all duration-150 hover:shadow-md cursor-pointer"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--accent)',
          borderWidth: '2px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        {/* Thumbnail */}
        {trip.cover_photo_path ? (
          <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
            <img
              src={getStorageUrl(trip.cover_photo_path)}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ) : (
          <div
            className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, var(--accent), #D4708F)' }}
          >
            <span className="text-white text-sm">✈️</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {trip.title}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {format(start, 'MMM d')} — {format(end, 'MMM d')} · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </div>
        </div>

        <svg
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200"
          style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className={`collapsible-content ${isOpen ? 'open' : ''}`}>
        <div>
          <div className="pl-4 mt-2 mb-1" style={{ borderLeft: '2px solid var(--accent)' }}>
            <div className="flex flex-col gap-2 pb-2">
              {entries.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onClick={() => onEntryClick(entry.entry_date)}
                />
              ))}
            </div>
            <button
              onClick={() => navigate(`/trips/${trip.id}`)}
              className="text-xs font-medium mb-2 cursor-pointer"
              style={{ color: 'var(--accent)' }}
            >
              View full trip →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthGroup({
  monthLabel,
  entries,
  onEntryClick,
  initialOpen = true,
}: {
  monthLabel: string
  entries: JournalEntry[]
  onEntryClick: (date: string) => void
  initialOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const segments = useMemo(() => groupEntriesWithTrips(entries), [entries])

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left py-2 cursor-pointer"
      >
        <span
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--text-muted)' }}
        >
          {monthLabel}
        </span>
        <svg
          className="w-3.5 h-3.5 transition-transform duration-200"
          style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`collapsible-content ${isOpen ? 'open' : ''}`}>
        <div>
          <div className="flex flex-col gap-3 pb-4">
            {segments.map((segment) => {
              if (segment.type === 'trip') {
                return (
                  <TripGroupCard
                    key={`trip-${segment.trip.id}`}
                    trip={segment.trip}
                    entries={segment.entries}
                    onEntryClick={onEntryClick}
                  />
                )
              }
              return (
                <EntryCard
                  key={segment.entry.id}
                  entry={segment.entry}
                  onClick={() => onEntryClick(segment.entry.entry_date)}
                />
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function YearGroup({
  year,
  months,
  totalEntries,
  onEntryClick,
  initialOpen = false,
}: {
  year: string
  months: [string, JournalEntry[]][]
  totalEntries: number
  onEntryClick: (date: string) => void
  initialOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(initialOpen)

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 w-full text-left py-3 cursor-pointer"
      >
        <span
          className="text-lg"
          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
        >
          {year}
        </span>
        <span
          className="text-xs font-medium"
          style={{ color: 'var(--text-muted)' }}
        >
          {totalEntries} {totalEntries === 1 ? 'entry' : 'entries'}
        </span>
        <svg
          className="w-4 h-4 ml-auto transition-transform duration-200"
          style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`collapsible-content ${isOpen ? 'open' : ''}`}>
        <div>
          <div className="space-y-1 pl-1">
            {months.map(([monthLabel, entries]) => (
              <MonthGroup
                key={monthLabel}
                monthLabel={monthLabel}
                entries={entries}
                onEntryClick={onEntryClick}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const BABY_WIDGET_KEY = 'kristory-baby-widget-hidden'

function BabyCountdownWidget() {
  const navigate = useNavigate()
  const { data: profile } = useBabyProfile()
  const [hidden, setHidden] = useState(() => localStorage.getItem(BABY_WIDGET_KEY) === 'true')

  if (hidden || !profile) return null
  if (!profile.due_date && !profile.birth_date) return null

  const today = new Date()
  let text = ''
  let emoji = '👶'

  if (profile.birth_date) {
    const birth = parse(profile.birth_date, 'yyyy-MM-dd', new Date())
    const months = differenceInMonths(today, birth)
    const days = differenceInDays(today, birth) - months * 30
    const name = profile.name || 'Baby'
    text = `${name} is ${months > 0 ? `${months} month${months !== 1 ? 's' : ''}, ` : ''}${Math.max(0, days)} day${days !== 1 ? 's' : ''} old`
  } else if (profile.due_date) {
    const due = parse(profile.due_date, 'yyyy-MM-dd', new Date())
    const weeks = differenceInWeeks(due, today)
    const days = differenceInDays(due, today) - weeks * 7
    emoji = '🍼'
    if (weeks >= 0) {
      text = `Week ${40 - weeks} — ${weeks} week${weeks !== 1 ? 's' : ''}, ${days} day${days !== 1 ? 's' : ''} to go`
    } else {
      text = `Past due date by ${Math.abs(differenceInDays(due, today))} days`
    }
  }

  return (
    <div
      className="rounded-xl p-3.5 mb-5"
      style={{ backgroundColor: '#FFF8E7', border: '1px solid #F0C987' }}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl">{emoji}</span>
        <button
          onClick={() => navigate('/baby')}
          className="flex-1 text-left cursor-pointer"
        >
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{text}</span>
        </button>
        <button
          onClick={() => { setHidden(true); localStorage.setItem(BABY_WIDGET_KEY, 'true') }}
          className="w-6 h-6 flex items-center justify-center rounded-full text-xs cursor-pointer"
          style={{ color: 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>
      <a
        href="/family"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium mt-2 ml-9 inline-block"
        style={{ color: 'var(--accent)', textDecoration: 'none' }}
      >
        View Family Feed →
      </a>
    </div>
  )
}

const BACKUP_SNOOZE_KEY = 'kristory-backup-snoozed'

function BackupReminderWidget() {
  const navigate = useNavigate()
  const { data: settings } = useBackupSettings()
  const [snoozed, setSnoozed] = useState(() => {
    const val = localStorage.getItem(BACKUP_SNOOZE_KEY)
    if (!val) return false
    // Snooze expires after 7 days
    return Date.now() - parseInt(val) < 7 * 24 * 60 * 60 * 1000
  })

  if (!settings?.reminderEnabled || snoozed) return null

  const { overdue, daysSince } = isBackupOverdue(
    settings.lastBackupDate,
    settings.reminderFrequency,
  )
  if (!overdue) return null

  const message = daysSince < 0
    ? "You haven't backed up yet"
    : `It's been ${daysSince} days since your last backup`

  return (
    <div
      className="rounded-xl p-3.5 mb-4 flex items-center gap-3"
      style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-card)' }}
    >
      <span className="text-lg">💾</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {message}
        </div>
        <div className="flex gap-2 mt-1.5">
          <button
            onClick={() => navigate('/settings')}
            className="text-xs font-medium px-2.5 py-1 rounded-lg cursor-pointer"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            Back Up Now
          </button>
          <button
            onClick={() => {
              localStorage.setItem(BACKUP_SNOOZE_KEY, String(Date.now()))
              setSnoozed(true)
            }}
            className="text-xs font-medium cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Journal() {
  const navigate = useNavigate()
  const today = getTodayString()
  const createEntry = useCreateEntry()
  const [showDatePicker, setShowDatePicker] = useState(false)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useEntriesByMonth(today)

  const observerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = observerRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const allEntries = useMemo(
    () => data?.pages.flatMap((page) => page) ?? [],
    [data]
  )

  const todayEntry = allEntries.find((e) => e.entry_date === today)

  const pastEntries = allEntries.filter((e) => e.entry_date !== today)

  // Group past entries by year → month
  const currentYear = new Date().getFullYear().toString()

  const yearGroups = useMemo(() => {
    // Group by year → numeric month, keeping entries per month
    const byYear: Record<string, Record<number, JournalEntry[]>> = {}
    for (const entry of pastEntries) {
      const date = parse(entry.entry_date, 'yyyy-MM-dd', new Date())
      const yearKey = format(date, 'yyyy')
      const monthNum = date.getMonth() // 0-11
      if (!byYear[yearKey]) byYear[yearKey] = {}
      if (!byYear[yearKey][monthNum]) byYear[yearKey][monthNum] = []
      byYear[yearKey][monthNum].push(entry)
    }
    // Sort years newest first, months newest first within each year,
    // and entries newest first within each month
    return Object.entries(byYear)
      .sort(([a], [b]) => parseInt(b) - parseInt(a))
      .map(([year, months]) => {
        const monthEntries = Object.entries(months)
          .sort(([a], [b]) => parseInt(b) - parseInt(a))
          .map(([monthNum, entries]) => {
            const sorted = [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date))
            const label = format(new Date(parseInt(year), parseInt(monthNum)), 'MMMM')
            return [label, sorted] as [string, JournalEntry[]]
          })
        const totalEntries = monthEntries.reduce((sum, [, entries]) => sum + entries.length, 0)
        return { year, months: monthEntries, totalEntries }
      })
  }, [pastEntries])

  const handleWriteToday = useCallback(async () => {
    if (todayEntry) {
      navigate(`/journal/${today}`)
      return
    }
    try {
      await createEntry.mutateAsync(today)
      navigate(`/journal/${today}`)
    } catch (err) {
      console.error('Failed to create entry:', err)
    }
  }, [todayEntry, today, navigate, createEntry])

  const handleEntryClick = (date: string) => {
    navigate(`/journal/${date}`)
  }

  const handlePastDateSelect = (dateStr: string) => {
    if (!dateStr) return
    setShowDatePicker(false)
    // Navigate to that date's entry detail — it will handle create-if-missing
    navigate(`/journal/${dateStr}`)
  }

  return (
    <div className="pb-4">
      {/* Baby Countdown Widget */}
      <BabyCountdownWidget />
      <BackupReminderWidget />

      {/* Today Section */}
      <div className="mb-8">
        <h1
          className="text-2xl mb-1"
          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
        >
          {formatDateHeading(today)}
        </h1>

        {isLoading ? (
          <div className="mt-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-24 rounded-xl animate-pulse"
                style={{ backgroundColor: 'var(--bg-card)' }}
              />
            ))}
          </div>
        ) : todayEntry ? (
          <div className="mt-4">
            <EntryCard entry={todayEntry} onClick={() => navigate(`/journal/${today}`)} />
          </div>
        ) : (
          <button
            onClick={handleWriteToday}
            disabled={createEntry.isPending}
            className="mt-4 w-full py-4 rounded-xl border-2 border-dashed text-base font-medium transition-all duration-150 hover:border-solid cursor-pointer"
            style={{
              borderColor: 'var(--accent)',
              color: 'var(--accent)',
              backgroundColor: 'transparent',
            }}
          >
            {createEntry.isPending ? 'Creating...' : "Write Today's Entry"}
          </button>
        )}
      </div>

      {/* Write a past entry */}
      <div className="mb-6">
        <button
          onClick={() => {
            setShowDatePicker(true)
            // Give the input time to mount, then focus
            setTimeout(() => dateInputRef.current?.showPicker?.(), 50)
          }}
          className="flex items-center gap-2 text-sm font-medium cursor-pointer"
          style={{ color: 'var(--accent)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Write a past entry...
        </button>
        {showDatePicker && (
          <div className="mt-2">
            <input
              ref={dateInputRef}
              type="date"
              max={today}
              onChange={(e) => handlePastDateSelect(e.target.value)}
              className="rounded-lg border p-2.5 text-sm"
              style={{
                backgroundColor: 'var(--input-bg)',
                borderColor: 'var(--border-card)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
        )}
      </div>

      {/* Past Entries */}
      {yearGroups.length > 0 && (
        <div className="space-y-4">
          {yearGroups.map(({ year, months, totalEntries }) => (
            <YearGroup
              key={year}
              year={year}
              months={months}
              totalEntries={totalEntries}
              onEntryClick={handleEntryClick}
              initialOpen={year === currentYear}
            />
          ))}
        </div>
      )}

      {!isLoading && allEntries.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">📖</div>
          <h3 className="text-lg font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            Your story starts here
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Write your first entry and begin documenting your journey together.
          </p>
        </div>
      )}

      {/* Infinite scroll trigger */}
      <div ref={observerRef} className="h-8" />

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <div
            className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-card)', borderTopColor: 'var(--accent)' }}
          />
        </div>
      )}

      {/* FAB */}
      <button
        onClick={handleWriteToday}
        className="fixed bottom-20 right-4 md:bottom-6 md:right-6 w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl shadow-lg transition-transform duration-150 hover:scale-110 active:scale-95 cursor-pointer z-40"
        style={{ backgroundColor: 'var(--accent)' }}
        title="Write today's entry"
      >
        +
      </button>
    </div>
  )
}
