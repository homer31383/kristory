import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, parse, differenceInDays } from 'date-fns'
import { useTrip, useUpdateTrip, useDeleteTrip, useEntriesInRange } from '../hooks/useTrips'
import { getStorageUrl, truncateText } from '../lib/helpers'
import type { JournalEntry } from '../types'

export default function TripDetail() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const { data: trip, isLoading } = useTrip(tripId ?? '')
  const updateTrip = useUpdateTrip()
  const deleteTrip = useDeleteTrip()

  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editSummary, setEditSummary] = useState('')
  const [editCover, setEditCover] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editEntryIds, setEditEntryIds] = useState<Set<string>>(new Set())
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null)

  // Fetch entries in range when editing with changed dates
  const { data: rangeEntries = [] } = useEntriesInRange(editStart, editEnd)

  if (!tripId) return null

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-48 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
        <div className="h-8 w-48 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
        <div className="h-24 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="text-center py-16">
        <p style={{ color: 'var(--text-secondary)' }}>Trip not found</p>
      </div>
    )
  }

  const startDate = parse(trip.start_date, 'yyyy-MM-dd', new Date())
  const endDate = parse(trip.end_date, 'yyyy-MM-dd', new Date())
  const entries = trip.entries ?? []
  const allPhotos = entries.flatMap((e) => e.photos ?? [])
  const allTags = entries.flatMap((e) => e.tagged_items ?? [])
  const days = differenceInDays(endDate, startDate) + 1

  // Group tags by category
  const tagsByCategory = useMemo(() => {
    const groups: Record<string, { name: string; emoji: string; items: typeof allTags }> = {}
    for (const tag of allTags) {
      const catName = tag.category?.name ?? 'Other'
      const catEmoji = tag.category?.emoji ?? '📌'
      if (!groups[catName]) groups[catName] = { name: catName, emoji: catEmoji, items: [] }
      groups[catName].items.push(tag)
    }
    return Object.values(groups)
  }, [allTags])

  const startEditing = () => {
    setEditTitle(trip.title)
    setEditSummary(trip.summary ?? '')
    setEditCover(trip.cover_photo_path)
    setEditStart(trip.start_date)
    setEditEnd(trip.end_date)
    setEditEntryIds(new Set(entries.map(e => e.id)))
    setIsEditing(true)
  }

  const handleSave = async () => {
    await updateTrip.mutateAsync({
      id: tripId,
      title: editTitle.trim(),
      summary: editSummary.trim() || undefined,
      coverPhotoPath: editCover,
      startDate: editStart,
      endDate: editEnd,
      entryIds: Array.from(editEntryIds),
    })
    setIsEditing(false)
  }

  const handleDelete = async () => {
    if (!confirm('Delete this trip? Entries will not be deleted.')) return
    await deleteTrip.mutateAsync(tripId)
    navigate('/lists')
  }

  // Collect all photos from edit-range entries for cover picker
  const editAllPhotos = isEditing
    ? rangeEntries.filter(e => editEntryIds.has(e.id)).flatMap(e => e.photos ?? [])
    : []

  return (
    <div className="pb-24">
      {/* Hero header */}
      {!isEditing ? (
        <>
          {trip.cover_photo_path ? (
            <div className="relative -mx-4 -mt-4 md:-mx-6 md:-mt-6 mb-4">
              <div className="aspect-video overflow-hidden">
                <img
                  src={getStorageUrl(trip.cover_photo_path)}
                  alt={trip.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6), rgba(0,0,0,0.2) 50%, transparent)' }}
              />
              {/* Back button */}
              <button
                onClick={() => navigate(-1)}
                className="absolute top-4 left-4 w-10 h-10 flex items-center justify-center rounded-full cursor-pointer"
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'white' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              {/* Edit button */}
              <button
                onClick={startEditing}
                className="absolute top-4 right-4 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
                style={{ backgroundColor: 'rgba(0,0,0,0.3)', color: 'white' }}
              >
                Edit
              </button>
              {/* Title overlay */}
              <div className="absolute bottom-4 left-4 right-4">
                <h1
                  className="text-2xl md:text-3xl text-white"
                  style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, textShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
                >
                  {trip.title}
                </h1>
                <p className="text-sm text-white/80 mt-1">
                  {format(startDate, 'MMM d')} — {format(endDate, 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          ) : (
            <div
              className="relative -mx-4 -mt-4 md:-mx-6 md:-mt-6 mb-4"
              style={{ background: 'linear-gradient(135deg, var(--accent), #D4708F)' }}
            >
              <div className="aspect-[2.5/1] flex flex-col justify-end p-4">
                {/* Back button */}
                <button
                  onClick={() => navigate(-1)}
                  className="absolute top-4 left-4 w-10 h-10 flex items-center justify-center rounded-full cursor-pointer"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                {/* Edit button */}
                <button
                  onClick={startEditing}
                  className="absolute top-4 right-4 px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
                  style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }}
                >
                  Edit
                </button>
                <h1
                  className="text-2xl md:text-3xl text-white"
                  style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700 }}
                >
                  {trip.title}
                </h1>
                <p className="text-sm text-white/80 mt-1">
                  {format(startDate, 'MMM d')} — {format(endDate, 'MMM d, yyyy')}
                </p>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Edit mode header */
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setIsEditing(false)}
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
            Edit Trip
          </h1>
          <button
            onClick={handleSave}
            disabled={updateTrip.isPending}
            className="px-4 py-1.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {updateTrip.isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      )}

      {isEditing ? (
        <EditMode
          editTitle={editTitle}
          setEditTitle={setEditTitle}
          editSummary={editSummary}
          setEditSummary={setEditSummary}
          editCover={editCover}
          setEditCover={setEditCover}
          editStart={editStart}
          setEditStart={setEditStart}
          editEnd={editEnd}
          setEditEnd={setEditEnd}
          editEntryIds={editEntryIds}
          setEditEntryIds={setEditEntryIds}
          rangeEntries={rangeEntries}
          editAllPhotos={editAllPhotos}
          showCoverPicker={showCoverPicker}
          setShowCoverPicker={setShowCoverPicker}
          onDelete={handleDelete}
        />
      ) : (
        <ViewMode
          trip={trip}
          entries={entries}
          allPhotos={allPhotos}
          allTags={allTags}
          tagsByCategory={tagsByCategory}
          days={days}
          lightboxPhoto={lightboxPhoto}
          setLightboxPhoto={setLightboxPhoto}
          navigate={navigate}
        />
      )}

      {/* Photo Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxPhoto(null)}
        >
          <img src={lightboxPhoto} alt="" className="max-w-full max-h-full object-contain p-4" />
          <button
            onClick={() => setLightboxPhoto(null)}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full text-white text-xl cursor-pointer"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function ViewMode({
  trip,
  entries,
  allPhotos,
  allTags,
  tagsByCategory,
  days,
  lightboxPhoto: _,
  setLightboxPhoto,
  navigate,
}: {
  trip: { summary: string | null }
  entries: JournalEntry[]
  allPhotos: { id: string; storage_path: string }[]
  allTags: { id: string; name: string; rating: number | null; category?: { name: string; emoji: string | null } }[]
  tagsByCategory: { name: string; emoji: string; items: typeof allTags }[]
  days: number
  lightboxPhoto: string | null
  setLightboxPhoto: (v: string | null) => void
  navigate: (path: string) => void
}) {
  return (
    <>
      {/* Summary */}
      {trip.summary && (
        <p className="text-sm leading-relaxed mb-5" style={{ color: 'var(--text-primary)' }}>
          {trip.summary}
        </p>
      )}

      {/* Stats bar */}
      <div
        className="flex gap-4 justify-around rounded-xl border p-3 mb-6"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <Stat value={days} label={days === 1 ? 'Day' : 'Days'} />
        <Stat value={entries.length} label={entries.length === 1 ? 'Entry' : 'Entries'} />
        <Stat value={allPhotos.length} label={allPhotos.length === 1 ? 'Photo' : 'Photos'} />
        <Stat value={allTags.length} label={allTags.length === 1 ? 'Item' : 'Items'} />
      </div>

      {/* Mini-timeline */}
      {entries.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Daily Entries
          </h3>
          <div className="space-y-3">
            {entries.map((entry) => {
              const date = parse(entry.entry_date, 'yyyy-MM-dd', new Date())
              const preview = entry.sections?.[0]?.content
                ? truncateText(entry.sections[0].content, 120)
                : ''
              const photos = entry.photos ?? []
              const tags = entry.tagged_items ?? []

              return (
                <button
                  key={entry.id}
                  onClick={() => navigate(`/journal/${entry.entry_date}`)}
                  className="w-full text-left rounded-xl border p-3.5 transition-all duration-150 hover:shadow-md cursor-pointer"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                >
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {format(date, 'EEE, MMM d')}
                  </div>
                  {preview && (
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                      {preview}
                    </p>
                  )}
                  {/* Photo strip */}
                  {photos.length > 0 && (
                    <div className="flex gap-1.5 mt-2 overflow-x-auto">
                      {photos.slice(0, 5).map((photo) => (
                        <img
                          key={photo.id}
                          src={getStorageUrl(photo.storage_path)}
                          alt=""
                          className="w-12 h-12 rounded-md object-cover flex-shrink-0"
                          loading="lazy"
                        />
                      ))}
                      {photos.length > 5 && (
                        <div
                          className="w-12 h-12 rounded-md flex items-center justify-center text-xs font-medium flex-shrink-0"
                          style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-muted)' }}
                        >
                          +{photos.length - 5}
                        </div>
                      )}
                    </div>
                  )}
                  {/* Tag pills */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-secondary)' }}
                        >
                          {tag.category?.emoji} {tag.name}
                        </span>
                      ))}
                      {tags.length > 3 && (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          +{tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* All Photos grid */}
      {allPhotos.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
            Photos ({allPhotos.length})
          </h3>
          <div className="grid grid-cols-3 gap-1.5 rounded-xl overflow-hidden">
            {allPhotos.map((photo) => (
              <img
                key={photo.id}
                src={getStorageUrl(photo.storage_path)}
                alt=""
                className="w-full aspect-square object-cover cursor-pointer"
                onClick={() => setLightboxPhoto(getStorageUrl(photo.storage_path))}
                loading="lazy"
              />
            ))}
          </div>
        </div>
      )}

      {/* Tagged Items grouped by category */}
      {tagsByCategory.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Things We Did
          </h3>
          <div className="space-y-4">
            {tagsByCategory.map((group) => (
              <div key={group.name}>
                <div className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  {group.emoji} {group.name} ({group.items.length})
                </div>
                <div className="space-y-2">
                  {group.items.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center gap-3 rounded-xl border p-3"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                    >
                      <span className="text-lg">{tag.category?.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {tag.name}
                        </div>
                      </div>
                      {tag.rating && (
                        <div className="flex gap-0.5 text-sm">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <span key={star} style={{ color: star <= tag.rating! ? '#F59E0B' : 'var(--border-card)' }}>
                              ★
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

function EditMode({
  editTitle,
  setEditTitle,
  editSummary,
  setEditSummary,
  editCover,
  setEditCover,
  editStart,
  setEditStart,
  editEnd,
  setEditEnd,
  editEntryIds,
  setEditEntryIds,
  rangeEntries,
  editAllPhotos,
  showCoverPicker,
  setShowCoverPicker,
  onDelete,
}: {
  editTitle: string
  setEditTitle: (v: string) => void
  editSummary: string
  setEditSummary: (v: string) => void
  editCover: string | null
  setEditCover: (v: string | null) => void
  editStart: string
  setEditStart: (v: string) => void
  editEnd: string
  setEditEnd: (v: string) => void
  editEntryIds: Set<string>
  setEditEntryIds: (v: Set<string>) => void
  rangeEntries: JournalEntry[]
  editAllPhotos: { id: string; storage_path: string }[]
  showCoverPicker: boolean
  setShowCoverPicker: (v: boolean) => void
  onDelete: () => void
}) {
  const toggleEntry = (entryId: string) => {
    const next = new Set(editEntryIds)
    if (next.has(entryId)) {
      next.delete(entryId)
    } else {
      next.add(entryId)
    }
    setEditEntryIds(next)
  }

  return (
    <div className="space-y-5">
      {/* Title */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Title
        </label>
        <input
          type="text"
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="w-full rounded-xl border p-3 text-sm"
          style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
        />
      </div>

      {/* Summary */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Summary
        </label>
        <textarea
          value={editSummary}
          onChange={(e) => setEditSummary(e.target.value)}
          rows={3}
          className="w-full rounded-xl border p-3 text-sm resize-none"
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
              value={editStart}
              onChange={(e) => setEditStart(e.target.value)}
              className="w-full rounded-lg border p-2.5 text-sm"
              style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>End</label>
            <input
              type="date"
              value={editEnd}
              onChange={(e) => setEditEnd(e.target.value)}
              min={editStart}
              className="w-full rounded-lg border p-2.5 text-sm"
              style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* Entries */}
      {rangeEntries.length > 0 && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Entries ({editEntryIds.size} selected)
          </label>
          <div className="space-y-2">
            {rangeEntries.map((entry) => {
              const date = parse(entry.entry_date, 'yyyy-MM-dd', new Date())
              const isChecked = editEntryIds.has(entry.id)
              return (
                <button
                  key={entry.id}
                  onClick={() => toggleEntry(entry.id)}
                  className="w-full text-left rounded-xl border p-3 flex items-center gap-3 cursor-pointer"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    borderColor: isChecked ? 'var(--accent)' : 'var(--border-card)',
                    borderWidth: isChecked ? '2px' : '1px',
                  }}
                >
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
                  <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {format(date, 'EEE, MMM d')}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Cover photo */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
          Cover Photo
        </label>
        {editCover ? (
          <div className="relative rounded-xl overflow-hidden mb-2">
            <img
              src={getStorageUrl(editCover)}
              alt="Cover"
              className="w-full aspect-video object-cover"
            />
            <div className="absolute top-2 right-2 flex gap-2">
              <button
                onClick={() => setShowCoverPicker(!showCoverPicker)}
                className="px-3 py-1 rounded-lg text-xs font-medium cursor-pointer"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}
              >
                Change
              </button>
              <button
                onClick={() => setEditCover(null)}
                className="px-3 py-1 rounded-lg text-xs font-medium cursor-pointer"
                style={{ backgroundColor: 'rgba(0,0,0,0.5)', color: 'white' }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCoverPicker(!showCoverPicker)}
            className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-medium cursor-pointer"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            + Choose Cover Photo
          </button>
        )}
        {showCoverPicker && editAllPhotos.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5 mt-2">
            {editAllPhotos.map((photo) => (
              <button
                key={photo.id}
                onClick={() => {
                  setEditCover(photo.storage_path)
                  setShowCoverPicker(false)
                }}
                className="aspect-square rounded-lg overflow-hidden cursor-pointer"
              >
                <img
                  src={getStorageUrl(photo.storage_path)}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={onDelete}
        className="w-full py-3 rounded-xl text-sm font-medium cursor-pointer"
        style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}
      >
        Delete Trip
      </button>
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}
