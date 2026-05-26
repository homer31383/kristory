import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parse, differenceInWeeks, differenceInDays, differenceInMonths } from 'date-fns'
import { useCategoryCounts } from '../hooks/useCategories'
import { useTrips, useSuggestTrips, useCreateTrip } from '../hooks/useTrips'
import type { SuggestedTrip } from '../hooks/useTrips'
import { useBabyProfile, useBabyMilestones } from '../hooks/useBaby'
import { getStorageUrl } from '../lib/helpers'
import {
  isLibraryCategory,
  DEFAULT_LIST_CATEGORIES,
  matchDefaultSlot,
  type DefaultCategory,
} from '../lib/constants'
import { useCreateCategory } from '../hooks/useCategories'
import { useUser } from '../hooks/useUser'

const DISMISSED_KEY = 'kristory-dismissed-trip-suggestions'

function loadDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveDismissed(ids: Set<string>) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]))
}

/**
 * Lists sections collapse/expand state — defaults to collapsed (false). We
 * persist per-section open state so a user who keeps Trips open doesn't
 * have to re-open it every visit.
 */
const LISTS_OPEN_KEY = 'kristory-lists-open'
function loadOpenState(id: string): boolean {
  try {
    const raw = localStorage.getItem(LISTS_OPEN_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return !!parsed[id]
  } catch {
    return false
  }
}
function saveOpenState(id: string, open: boolean) {
  try {
    const raw = localStorage.getItem(LISTS_OPEN_KEY)
    const parsed = (raw ? JSON.parse(raw) : {}) as Record<string, boolean>
    parsed[id] = open
    localStorage.setItem(LISTS_OPEN_KEY, JSON.stringify(parsed))
  } catch {
    // ignore
  }
}

function SuggestedTripCard({
  suggestion,
  onConfirm,
  onDismiss,
  isCreating,
}: {
  suggestion: SuggestedTrip
  onConfirm: (s: SuggestedTrip, editedTitle: string) => void
  onDismiss: (id: string) => void
  isCreating: boolean
}) {
  const [title, setTitle] = useState(suggestion.title)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const start = parse(suggestion.startDate, 'yyyy-MM-dd', new Date())
  const end = parse(suggestion.endDate, 'yyyy-MM-dd', new Date())

  return (
    <div
      className="rounded-xl border-2 border-dashed p-4 space-y-3"
      style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-card)' }}
    >
      {/* Title (editable) */}
      <div className="flex items-center gap-2">
        <span className="text-lg">✈️</span>
        {isEditingTitle ? (
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setIsEditingTitle(false)}
            onKeyDown={(e) => { if (e.key === 'Enter') setIsEditingTitle(false) }}
            autoFocus
            className="flex-1 rounded-lg border px-2 py-1 text-sm font-medium"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-primary)',
            }}
          />
        ) : (
          <button
            onClick={() => setIsEditingTitle(true)}
            className="flex-1 text-left text-sm font-semibold cursor-pointer hover:underline"
            style={{ color: 'var(--text-primary)' }}
            title="Click to edit title"
          >
            {title}
            <svg
              className="inline-block ml-1.5 w-3 h-3"
              style={{ color: 'var(--text-muted)' }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        )}
      </div>

      {/* Date range + entry count */}
      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
        <span>{format(start, 'MMM d')} — {format(end, 'MMM d, yyyy')}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          {suggestion.entryCount} {suggestion.entryCount === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Locations */}
      {suggestion.locations.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestion.locations.map((loc, i) => (
            <span
              key={i}
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: 'var(--accent)', color: 'white' }}
            >
              📍 {loc}
            </span>
          ))}
        </div>
      )}

      {/* Entry previews */}
      <div
        className="rounded-lg p-2.5 space-y-1.5"
        style={{ backgroundColor: 'var(--bg-page)' }}
      >
        {suggestion.entryPreviews.map((ep) => {
          const d = parse(ep.date, 'yyyy-MM-dd', new Date())
          return (
            <div key={ep.date} className="flex gap-2">
              <span
                className="text-xs font-medium flex-shrink-0 w-14"
                style={{ color: 'var(--text-muted)' }}
              >
                {format(d, 'MMM d')}
              </span>
              <span
                className="text-xs leading-relaxed"
                style={{ color: ep.preview ? 'var(--text-secondary)' : 'var(--text-muted)' }}
              >
                {ep.preview || '(no text)'}
              </span>
            </div>
          )
        })}
      </div>

      {/* Keyword signals */}
      {suggestion.signals.filter(s => s.startsWith('keyword:')).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestion.signals
            .filter(s => s.startsWith('keyword:'))
            .slice(0, 5)
            .map((signal, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-muted)' }}
              >
                {signal.replace('keyword: ', '')}
              </span>
            ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onConfirm(suggestion, title)}
          disabled={isCreating || !title.trim()}
          className="flex-1 py-2 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {isCreating ? 'Creating...' : 'Create Trip'}
        </button>
        <button
          onClick={() => onDismiss(suggestion.id)}
          className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
          style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-page)' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}

export default function Lists() {
  const navigate = useNavigate()
  const { data: categoryCounts = [], isLoading } = useCategoryCounts()
  const { data: trips = [] } = useTrips()
  const { data: suggestions = [], isLoading: suggestionsLoading } = useSuggestTrips()
  const createTrip = useCreateTrip()
  const createCategory = useCreateCategory()
  const { user } = useUser()
  const [showTrips, setShowTrips] = useState(() => loadOpenState('trips'))
  const [showBaby, setShowBaby] = useState(() => loadOpenState('baby'))
  const [showCategories, setShowCategories] = useState(() => loadOpenState('categories'))
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [dismissed, setDismissed] = useState<Set<string>>(() => loadDismissed())
  const [creatingId, setCreatingId] = useState<string | null>(null)
  const [creatingCatName, setCreatingCatName] = useState<string | null>(null)

  useEffect(() => { saveOpenState('trips', showTrips) }, [showTrips])
  useEffect(() => { saveOpenState('baby', showBaby) }, [showBaby])
  useEffect(() => { saveOpenState('categories', showCategories) }, [showCategories])

  /** Open a category card: navigate if it exists, lazily create otherwise. */
  async function openListSlot(slot: DefaultCategory, dbId: string | null) {
    if (dbId) {
      navigate(`/lists/${dbId}`)
      return
    }
    if (!user) return
    setCreatingCatName(slot.name)
    try {
      const created = await createCategory.mutateAsync({
        name: slot.name,
        emoji: slot.emoji,
        userId: user.id,
      })
      navigate(`/lists/${created.id}`)
    } catch {
      // ignore; the user can tap again
    } finally {
      setCreatingCatName(null)
    }
  }

  // Persist dismissed to localStorage whenever it changes
  useEffect(() => {
    saveDismissed(dismissed)
  }, [dismissed])

  const visibleSuggestions = suggestions.filter(s => !dismissed.has(s.id))

  const handleConfirm = useCallback(async (suggestion: SuggestedTrip, editedTitle: string) => {
    setCreatingId(suggestion.id)
    try {
      const trip = await createTrip.mutateAsync({
        title: editedTitle.trim(),
        startDate: suggestion.startDate,
        endDate: suggestion.endDate,
        entryIds: suggestion.entryIds,
      })
      // Auto-dismiss after creation
      setDismissed(prev => {
        const next = new Set(prev)
        next.add(suggestion.id)
        return next
      })
      navigate(`/trips/${trip.id}`)
    } catch (err) {
      console.error('Failed to create trip from suggestion:', err)
    }
    setCreatingId(null)
  }, [createTrip, navigate])

  const handleDismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const handleUndoDismissAll = useCallback(() => {
    setDismissed(new Set())
  }, [])

  return (
    <div className="pb-24">
      <h1
        className="text-2xl mb-4"
        style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
      >
        Lists
      </h1>

      {/* Trips section */}
      <div className="mb-5">
        <button
          onClick={() => setShowTrips(!showTrips)}
          className="w-full text-left rounded-xl border p-4 flex items-center gap-3 transition-all duration-150 hover:shadow-md cursor-pointer"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderColor: 'var(--border-card)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <span className="text-2xl">✈️</span>
          <div className="flex-1">
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Trips
            </div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {trips.length} trip{trips.length !== 1 ? 's' : ''}
            </div>
          </div>
          <svg
            className="w-4 h-4 transition-transform duration-200"
            style={{ color: 'var(--text-muted)', transform: showTrips ? 'rotate(0deg)' : 'rotate(-90deg)' }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div className={`collapsible-content ${showTrips ? 'open' : ''}`}>
          <div>
            {trips.length > 0 ? (
              <div className="space-y-2 mt-2">
                {trips.map((trip) => {
                  const start = parse(trip.start_date, 'yyyy-MM-dd', new Date())
                  const end = parse(trip.end_date, 'yyyy-MM-dd', new Date())
                  const entryCount = (trip as { trip_entries?: [{ count: number }] }).trip_entries?.[0]?.count ?? 0

                  return (
                    <button
                      key={trip.id}
                      onClick={() => navigate(`/trips/${trip.id}`)}
                      className="w-full text-left rounded-xl border p-3 flex items-center gap-3 transition-all duration-150 hover:shadow-md cursor-pointer"
                      style={{
                        backgroundColor: 'var(--bg-card)',
                        borderColor: 'var(--border-card)',
                      }}
                    >
                      {/* Thumbnail */}
                      {trip.cover_photo_path ? (
                        <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                          <img
                            src={getStorageUrl(trip.cover_photo_path)}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div
                          className="w-12 h-12 rounded-lg flex-shrink-0 flex items-center justify-center"
                          style={{ background: 'linear-gradient(135deg, var(--accent), #D4708F)' }}
                        >
                          <span className="text-white text-lg">✈️</span>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {trip.title}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {format(start, 'MMM d')} — {format(end, 'MMM d, yyyy')}
                        </div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          {entryCount} {entryCount === 1 ? 'entry' : 'entries'}
                        </div>
                      </div>

                      <svg
                        className="w-4 h-4 flex-shrink-0"
                        style={{ color: 'var(--text-muted)' }}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  )
                })}

                {/* Create Trip button */}
                <button
                  onClick={() => navigate('/trips/new')}
                  className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed cursor-pointer"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  + Create Trip
                </button>
              </div>
            ) : (
              <div className="text-center py-8 mt-2">
                <div className="text-3xl mb-2">🗺️</div>
                <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  No trips yet
                </h3>
                <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                  Group your travel days into trips to relive them together!
                </p>
                <button
                  onClick={() => navigate('/trips/new')}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Create Your First Trip
                </button>
              </div>
            )}

            {/* Suggested Trips */}
            {!suggestionsLoading && visibleSuggestions.length > 0 && (
              <div className="mt-4">
                <button
                  onClick={() => setShowSuggestions(!showSuggestions)}
                  className="flex items-center gap-2 w-full text-left py-2 cursor-pointer"
                >
                  <span
                    className="text-xs font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--accent)' }}
                  >
                    Suggested Trips ({visibleSuggestions.length})
                  </span>
                  <svg
                    className="w-3.5 h-3.5 transition-transform duration-200"
                    style={{ color: 'var(--accent)', transform: showSuggestions ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <div className={`collapsible-content ${showSuggestions ? 'open' : ''}`}>
                  <div>
                    <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
                      We found journal entries that look like trips. Review and create, or dismiss.
                    </p>
                    <div className="space-y-3">
                      {visibleSuggestions.map((suggestion) => (
                        <SuggestedTripCard
                          key={suggestion.id}
                          suggestion={suggestion}
                          onConfirm={handleConfirm}
                          onDismiss={handleDismiss}
                          isCreating={creatingId === suggestion.id}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Show "reset dismissed" if we had suggestions but all dismissed */}
            {!suggestionsLoading && suggestions.length > 0 && visibleSuggestions.length === 0 && (
              <div className="mt-3 text-center">
                <button
                  onClick={handleUndoDismissAll}
                  className="text-xs font-medium cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Show dismissed suggestions ({suggestions.length})
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Baby section */}
      <BabyCard open={showBaby} onToggle={() => setShowBaby((v) => !v)} />

      {/* Categories grid — defaults always show, even with 0 items. */}
      {(() => {
        const dbNonLibrary = categoryCounts.filter((cat) => !isLibraryCategory(cat.name))
        type Card = {
          key: string
          dbId: string | null
          slot: DefaultCategory
          name: string
          emoji: string
          count: number
        }
        const cards: Card[] = []
        // Defaults first, in the canonical order — synthetic if missing.
        for (const slot of DEFAULT_LIST_CATEGORIES) {
          const match = matchDefaultSlot(slot, dbNonLibrary)
          if (match) {
            cards.push({
              key: match.id,
              dbId: match.id,
              slot,
              name: match.name,
              emoji: match.emoji ?? slot.emoji,
              count: match.count,
            })
          } else {
            cards.push({
              key: 'default:' + slot.name,
              dbId: null,
              slot,
              name: slot.name,
              emoji: slot.emoji,
              count: 0,
            })
          }
        }
        // Then any other non-Library DB categories that aren't already covered.
        const usedIds = new Set(cards.map((c) => c.dbId).filter((v): v is string => v !== null))
        for (const cat of dbNonLibrary) {
          if (usedIds.has(cat.id)) continue
          cards.push({
            key: cat.id,
            dbId: cat.id,
            slot: { name: cat.name, emoji: cat.emoji ?? '📁' },
            name: cat.name,
            emoji: cat.emoji ?? '📁',
            count: cat.count,
          })
        }

        return (
          <div className="mb-5">
            <button
              onClick={() => setShowCategories(!showCategories)}
              className="w-full text-left rounded-xl border p-4 flex items-center gap-3 transition-all duration-150 hover:shadow-md cursor-pointer"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-card)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <span className="text-2xl">📋</span>
              <div className="flex-1">
                <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Categories
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {cards.length} {cards.length === 1 ? 'category' : 'categories'}
                </div>
              </div>
              <svg
                className="w-4 h-4 transition-transform duration-200"
                style={{ color: 'var(--text-muted)', transform: showCategories ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div className={`collapsible-content ${showCategories ? 'open' : ''}`}>
              <div className="mt-2">
                {isLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="h-28 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {cards.map((c) => {
                      const busy = creatingCatName === c.slot.name
                      return (
                        <button
                          key={c.key}
                          onClick={() => openListSlot(c.slot, c.dbId)}
                          disabled={busy}
                          className="rounded-xl border p-5 text-left transition-all duration-150 hover:shadow-md cursor-pointer"
                          style={{
                            backgroundColor: 'var(--bg-card)',
                            borderColor: 'var(--border-card)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                            opacity: busy ? 0.6 : 1,
                          }}
                        >
                          <div className="text-3xl mb-2">{c.emoji}</div>
                          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {c.name}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {busy ? 'Creating…' : `${c.count} item${c.count !== 1 ? 's' : ''}`}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function BabyCard({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const navigate = useNavigate()
  const { data: profile } = useBabyProfile()
  const { data: milestones = [] } = useBabyMilestones()

  const subtitle = (() => {
    if (profile?.birth_date) {
      const birth = parse(profile.birth_date, 'yyyy-MM-dd', new Date())
      const months = differenceInMonths(new Date(), birth)
      const days = differenceInDays(new Date(), birth) - months * 30
      const name = profile.name || 'Baby'
      return `${name} is ${months > 0 ? `${months}mo ` : ''}${Math.max(0, days)}d old`
    }
    if (profile?.due_date) {
      const due = parse(profile.due_date, 'yyyy-MM-dd', new Date())
      const weeks = differenceInWeeks(due, new Date())
      if (weeks >= 0) return `Week ${40 - weeks} — ${weeks}w to go`
      return `Past due by ${Math.abs(differenceInDays(due, new Date()))}d`
    }
    return `${milestones.length} milestone${milestones.length !== 1 ? 's' : ''}`
  })()

  const recent = milestones.slice(0, 3)

  return (
    <div className="mb-5">
      <button
        onClick={onToggle}
        className="w-full text-left rounded-xl border p-4 flex items-center gap-3 transition-all duration-150 hover:shadow-md cursor-pointer"
        style={{
          backgroundColor: '#FFF8E7',
          borderColor: '#F0C987',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <span className="text-2xl">👶</span>
        <div className="flex-1">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {profile?.name || 'Baby'}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </div>
        </div>
        <svg
          className="w-4 h-4 transition-transform duration-200"
          style={{ color: 'var(--text-muted)', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className={`collapsible-content ${open ? 'open' : ''}`}>
        <div className="mt-2 space-y-2">
          {recent.length > 0 ? (
            <ul className="space-y-1.5">
              {recent.map((m) => {
                const d = parse(m.milestone_date, 'yyyy-MM-dd', new Date())
                return (
                  <li
                    key={m.id}
                    className="rounded-lg border p-2.5 flex items-start gap-2"
                    style={{
                      backgroundColor: 'var(--bg-card)',
                      borderColor: 'var(--border-card)',
                    }}
                  >
                    <span className="text-xs flex-shrink-0 w-14 font-medium" style={{ color: 'var(--text-muted)' }}>
                      {format(d, 'MMM d')}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
                      {m.title}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="text-xs px-2 py-3 text-center" style={{ color: 'var(--text-muted)' }}>
              No milestones logged yet.
            </div>
          )}
          <button
            onClick={() => navigate('/baby')}
            className="w-full py-2 rounded-lg text-xs font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            Open Baby →
          </button>
        </div>
      </div>
    </div>
  )
}
