import { useState, useCallback, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useEntry, useCreateEntry, useUpsertSection, useUploadPhoto, useDeletePhoto, useAddTaggedItem, useDeleteTaggedItem } from '../hooks/useEntries'
import { useTrips, useAddEntryToTrip, useRemoveEntryFromTrip } from '../hooks/useTrips'
import { useBabyMilestones, useCreateBabyMilestone, PREGNANCY_MILESTONES, FIRST_YEAR_MILESTONES } from '../hooks/useBaby'
import { useFamilyPostForEntry, useCreateFamilyPost, useUpdateFamilyPost, useDeleteFamilyPost } from '../hooks/useFamilyFeed'
import { useUser } from '../hooks/useUser'
import { formatDateHeading, getStorageUrl, resizeImage, getTodayString } from '../lib/helpers'
import { DEBOUNCE_SAVE_MS } from '../lib/constants'
import RichTextEditor from '../components/RichTextEditor'
import AddItemSheet from '../components/AddItemSheet'
import BottomSheet from '../components/ui/BottomSheet'
import type { EntrySection } from '../types'

/** Returns the first image file found in a paste event's clipboard, or null. */
function getImageFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      return item.getAsFile()
    }
  }
  return null
}

export default function EntryDetail() {
  const { date } = useParams<{ date: string }>()
  const navigate = useNavigate()
  const { user } = useUser()
  const { data: entry, isLoading } = useEntry(date ?? '')
  const createEntry = useCreateEntry()
  const upsertSection = useUpsertSection()
  const uploadPhoto = useUploadPhoto()
  const deletePhoto = useDeletePhoto()
  const addTaggedItem = useAddTaggedItem()
  const deleteTaggedItem = useDeleteTaggedItem()
  const { data: allTrips = [] } = useTrips()
  const addEntryToTrip = useAddEntryToTrip()
  const removeEntryFromTrip = useRemoveEntryFromTrip()
  const { data: babyMilestones = [] } = useBabyMilestones()
  const createBabyMilestone = useCreateBabyMilestone()
  const { data: familyPost, isLoading: familyPostLoading } = useFamilyPostForEntry(entry?.id)
  const createFamilyPost = useCreateFamilyPost()
  const updateFamilyPost = useUpdateFamilyPost()
  const deleteFamilyPost = useDeleteFamilyPost()

  const [isEditing, setIsEditing] = useState(false)
  const [localContent, setLocalContent] = useState('')
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [showAddItem, setShowAddItem] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [pastingPhoto, setPastingPhoto] = useState(false)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [lightboxPhoto, setLightboxPhoto] = useState<string | null>(null)
  const [editingPhotos, setEditingPhotos] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [showTripSheet, setShowTripSheet] = useState(false)
  const [showMilestoneSheet, setShowMilestoneSheet] = useState(false)
  const [customMilestoneTitle, setCustomMilestoneTitle] = useState('')

  // Family feed share state
  const [familyShareOpen, setFamilyShareOpen] = useState(false)
  const [familyCaption, setFamilyCaption] = useState('')
  const [familySelectedPhotos, setFamilySelectedPhotos] = useState<Set<string>>(new Set())
  const [familySaving, setFamilySaving] = useState(false)
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const entryIdRef = useRef<string | null>(null)
  const pastingRef = useRef(false)

  const today = getTodayString()

  // Get or create entry
  useEffect(() => {
    if (entry) {
      entryIdRef.current = entry.id
      const mySection = entry.sections?.find((s: EntrySection) => s.user_id === user?.id)
      if (mySection?.content) {
        setLocalContent(mySection.content)
      }
    } else {
      entryIdRef.current = null
    }
  }, [entry, user?.id])

  // Sync family post state when data loads
  useEffect(() => {
    if (familyPost) {
      setFamilyShareOpen(true)
      setFamilyCaption(familyPost.caption ?? '')
      const photoIds = new Set((familyPost.photos ?? []).map(p => p.entry_photo_id))
      setFamilySelectedPhotos(photoIds)
    } else if (!familyPostLoading) {
      setFamilyShareOpen(false)
    }
  }, [familyPost, familyPostLoading])

  const ensureEntry = useCallback(async (): Promise<string> => {
    if (entryIdRef.current) return entryIdRef.current
    if (!date) throw new Error('No date')
    const newEntry = await createEntry.mutateAsync(date)
    entryIdRef.current = newEntry.id
    return newEntry.id
  }, [date, createEntry])

  const handleContentChange = useCallback(
    (html: string) => {
      setLocalContent(html)
      setSaveStatus('saving')

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(async () => {
        try {
          const entryId = await ensureEntry()
          if (!user) return
          await upsertSection.mutateAsync({
            entryId,
            userId: user.id,
            content: html,
            entryDate: date!,
          })
          setSaveStatus('saved')
          setTimeout(() => setSaveStatus('idle'), 2000)
        } catch (err) {
          console.error('Failed to save:', err)
          setSaveStatus('idle')
        }
      }, DEBOUNCE_SAVE_MS)
    },
    [ensureEntry, user, date, upsertSection]
  )

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.error('[PhotoUpload] onChange fired')
    const files = e.target.files
    if (!files || files.length === 0) {
      console.error('[PhotoUpload] No files selected')
      return
    }
    if (!user) {
      console.error('[PhotoUpload] No user — auth may not be loaded yet')
      setPhotoError('Not signed in. Please reload and try again.')
      return
    }
    if (!date) {
      console.error('[PhotoUpload] No date param')
      return
    }

    console.error(`[PhotoUpload] Starting upload of ${files.length} file(s)`)
    setUploadingPhoto(true)
    setPhotoError(null)
    try {
      console.error('[PhotoUpload] Ensuring entry exists...')
      const entryId = await ensureEntry()
      console.error(`[PhotoUpload] Entry ID: ${entryId}`)

      for (const file of Array.from(files)) {
        console.error(`[PhotoUpload] Resizing ${file.name} (${file.type}, ${file.size} bytes)...`)
        const blob = await resizeImage(file)
        console.error(`[PhotoUpload] Resized to ${blob.size} bytes, uploading to Supabase Storage...`)

        await uploadPhoto.mutateAsync({
          entryId,
          entryDate: date,
          userId: user.id,
          blob,
        })
        console.error('[PhotoUpload] Upload + DB insert succeeded')
      }
    } catch (err) {
      console.error('[PhotoUpload] FAILED:', err)
      const message = err instanceof Error ? err.message : 'Upload failed'
      setPhotoError(message)
    }
    setUploadingPhoto(false)
    e.target.value = ''
  }

  const pasteImage = useCallback(
    async (file: File) => {
      if (pastingRef.current) return
      if (!user) {
        setPhotoError('Not signed in. Please reload and try again.')
        return
      }
      if (!date) return

      pastingRef.current = true
      setPastingPhoto(true)
      setPhotoError(null)
      try {
        const entryId = await ensureEntry()
        const blob = await resizeImage(file)
        await uploadPhoto.mutateAsync({ entryId, entryDate: date, userId: user.id, blob })
      } catch (err) {
        console.error('[PhotoPaste] FAILED:', err)
        setPhotoError(err instanceof Error ? err.message : 'Paste failed')
      } finally {
        pastingRef.current = false
        setPastingPhoto(false)
      }
    },
    [user, date, ensureEntry, uploadPhoto]
  )

  // Paste an image from the clipboard (e.g. copied from Google Photos) straight
  // into the entry's photos. Capture phase so it runs before the rich-text
  // editor; only acts when the clipboard actually holds an image.
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const file = getImageFromClipboard(e)
      if (!file) return
      e.preventDefault()
      void pasteImage(file)
    }
    document.addEventListener('paste', handlePaste, true)
    return () => document.removeEventListener('paste', handlePaste, true)
  }, [pasteImage])

  const handleDeletePhoto = async (photoId: string, storagePath: string) => {
    if (!date) return
    try {
      await deletePhoto.mutateAsync({ photoId, storagePath, entryDate: date })
    } catch (err) {
      console.error('Failed to delete photo:', err)
    }
  }

  const handleAddItem = async (data: {
    categoryId: string
    name: string
    rating: number | null
    locationName: string | null
    ingredients?: string | null
    instructions?: string | null
    recipeTagIds?: string[]
  }) => {
    if (!user || !date) return
    try {
      const entryId = await ensureEntry()
      await addTaggedItem.mutateAsync({
        entryId,
        entryDate: date,
        categoryId: data.categoryId,
        userId: user.id,
        name: data.name,
        rating: data.rating,
        locationName: data.locationName,
        ingredients: data.ingredients,
        instructions: data.instructions,
        recipeTagIds: data.recipeTagIds,
      })
    } catch (err) {
      console.error('Failed to add item:', err)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!date) return
    try {
      await deleteTaggedItem.mutateAsync({ itemId, entryDate: date })
    } catch (err) {
      console.error('Failed to delete item:', err)
    }
  }

  const handleDateChange = (newDate: string) => {
    setShowDatePicker(false)
    if (newDate && newDate !== date) {
      // Reset local state for new date
      setLocalContent('')
      setIsEditing(false)
      entryIdRef.current = null
      navigate(`/journal/${newDate}`, { replace: true })
    }
  }

  const handleFamilyToggle = async () => {
    if (familyShareOpen && familyPost) {
      // Turning off — show confirmation
      setShowRemoveConfirm(true)
    } else if (!familyShareOpen) {
      // Turning on — initialize caption from user's section text
      setFamilyShareOpen(true)
      const mySection = entry?.sections?.find((s: EntrySection) => s.user_id === user?.id)
      const plainText = mySection?.content
        ? mySection.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
        : ''
      setFamilyCaption(plainText)
      // Select all photos by default
      setFamilySelectedPhotos(new Set((entry?.photos ?? []).map(p => p.id)))
    }
  }

  const handleFamilyRemove = async () => {
    if (!familyPost) return
    await deleteFamilyPost.mutateAsync(familyPost.id)
    setFamilyShareOpen(false)
    setFamilyCaption('')
    setFamilySelectedPhotos(new Set())
    setShowRemoveConfirm(false)
  }

  const handleFamilySave = async () => {
    if (!entry || !user) return
    setFamilySaving(true)
    try {
      const photoIds = Array.from(familySelectedPhotos)
      if (familyPost) {
        await updateFamilyPost.mutateAsync({
          postId: familyPost.id,
          caption: familyCaption.trim() || null,
          photoIds,
        })
      } else {
        await createFamilyPost.mutateAsync({
          entryId: entry.id,
          caption: familyCaption.trim() || null,
          userId: user.id,
          photoIds,
          entryDate: date!,
        })
      }
    } catch (err) {
      console.error('Failed to save family post:', err)
    }
    setFamilySaving(false)
  }

  const toggleFamilyPhoto = (photoId: string) => {
    setFamilySelectedPhotos(prev => {
      const next = new Set(prev)
      if (next.has(photoId)) {
        next.delete(photoId)
      } else {
        next.add(photoId)
      }
      return next
    })
  }

  if (!date) return null

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
        <div className="h-32 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
        <div className="h-32 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
      </div>
    )
  }

  const sections = entry?.sections ?? []
  const photos = entry?.photos ?? []
  const taggedItems = entry?.tagged_items ?? []
  const mySection = sections.find((s) => s.user_id === user?.id)
  const otherSections = sections.filter((s) => s.user_id !== user?.id)

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate('/journal')}
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
          {formatDateHeading(date)}
        </h1>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            Edit
          </button>
        )}
      </div>

      {/* Date picker */}
      <div className="mb-6 ml-13">
        <button
          onClick={() => setShowDatePicker(!showDatePicker)}
          className="flex items-center gap-1.5 text-xs font-medium cursor-pointer px-2 py-1 rounded-md transition-colors duration-150"
          style={showDatePicker ? { color: 'white', backgroundColor: 'var(--accent)' } : { color: 'var(--accent)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Change date
        </button>
        {showDatePicker && (
          <div className="mt-2">
            <input
              type="date"
              defaultValue={date}
              max={today}
              onChange={(e) => handleDateChange(e.target.value)}
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

      {/* Sections */}
      <div className="space-y-4 mb-6">
        {/* Other user's sections (read-only) */}
        {otherSections.map((section) => {
          const isChris = (section as EntrySection & { user?: { name: string } }).user?.name?.toLowerCase() === 'chris'
          const borderColor = isChris ? 'var(--chris-color)' : 'var(--krista-color)'
          const authorName = (section as EntrySection & { user?: { name: string } }).user?.name ?? 'Unknown'

          return (
            <div key={section.id}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                {authorName}'s Entry
              </div>
              <div
                className="rounded-xl border p-4"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-card)',
                  borderLeftWidth: '3px',
                  borderLeftColor: borderColor,
                }}
              >
                <div
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-primary)' }}
                  dangerouslySetInnerHTML={{ __html: section.content ?? '' }}
                />
              </div>
            </div>
          )
        })}

        {/* Current user's section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Your Entry
            </span>
            {saveStatus !== 'idle' && (
              <span className="text-xs" style={{ color: saveStatus === 'saved' ? 'var(--accent)' : 'var(--text-muted)' }}>
                {saveStatus === 'saving' ? 'Saving...' : 'Saved ✓'}
              </span>
            )}
          </div>

          {isEditing ? (
            <div>
              <div
                className="rounded-xl border overflow-hidden"
                style={{
                  borderLeftWidth: '3px',
                  borderLeftColor: user?.name?.toLowerCase() === 'chris' ? 'var(--chris-color)' : 'var(--krista-color)',
                  borderColor: 'var(--border-card)',
                }}
              >
                <div className="p-4" style={{ backgroundColor: 'var(--bg-card)' }}>
                  <RichTextEditor
                    content={localContent}
                    onChange={handleContentChange}
                    placeholder="What happened today?"
                  />
                </div>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                className="mt-2 text-sm font-medium cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                Done editing
              </button>
            </div>
          ) : (
            <div
              className="rounded-xl border p-4 cursor-pointer"
              onClick={() => setIsEditing(true)}
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: 'var(--border-card)',
                borderLeftWidth: '3px',
                borderLeftColor: user?.name?.toLowerCase() === 'chris' ? 'var(--chris-color)' : 'var(--krista-color)',
              }}
            >
              {mySection?.content ? (
                <div
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--text-primary)' }}
                  dangerouslySetInnerHTML={{ __html: mySection.content }}
                />
              ) : (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Tap to write your entry...
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Photos */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Photos
          </span>
          <div className="flex items-center gap-2">
            {photos.length > 0 && (
              <button
                onClick={() => setEditingPhotos(!editingPhotos)}
                className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer"
                style={{
                  backgroundColor: editingPhotos ? 'var(--accent)' : 'var(--bg-card)',
                  color: editingPhotos ? 'white' : 'var(--text-muted)',
                  border: editingPhotos ? 'none' : '1px solid var(--border-card)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                </svg>
              </button>
            )}
            <label
              className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
              style={{ backgroundColor: 'var(--accent)', color: 'white' }}
            >
              {uploadingPhoto ? 'Uploading...' : 'Add Photos'}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
                disabled={uploadingPhoto}
              />
            </label>
          </div>
        </div>

        {photoError && (
          <div className="mb-2 px-3 py-2 rounded-lg text-xs font-medium" style={{ backgroundColor: '#FEE2E2', color: '#991B1B' }}>
            Photo upload error: {photoError}
          </div>
        )}

        {photos.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto photo-scroll pb-2">
            {photos
              .sort((a, b) => a.display_order - b.display_order)
              .map((photo) => (
                <div key={photo.id} className="relative flex-shrink-0">
                  <img
                    src={getStorageUrl(photo.storage_path)}
                    alt=""
                    className="w-24 h-24 object-cover rounded-lg cursor-pointer"
                    onClick={() => {
                      if (!editingPhotos) setLightboxPhoto(getStorageUrl(photo.storage_path))
                    }}
                    style={editingPhotos ? { opacity: 0.7 } : undefined}
                    loading="lazy"
                  />
                  {editingPhotos && (
                    <button
                      onClick={() => handleDeletePhoto(photo.id, photo.storage_path)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white cursor-pointer"
                      style={{ backgroundColor: '#E5534B' }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
            No photos yet
          </p>
        )}
      </div>

      {/* Tagged Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Tagged Items
          </span>
          <button
            onClick={() => setShowAddItem(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            Add Item
          </button>
        </div>

        {taggedItems.length > 0 ? (
          <div className="space-y-2">
            {taggedItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl border p-3"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-card)',
                }}
              >
                <span className="text-lg">{item.category?.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {item.name}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {item.category?.name}
                    {item.location_name && ` · ${item.location_name}`}
                  </div>
                </div>
                {item.rating && (
                  <div className="flex gap-0.5 text-sm">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <span key={star} style={{ color: star <= item.rating! ? '#F59E0B' : 'var(--border-card)' }}>
                        ★
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => handleDeleteItem(item.id)}
                  className="w-6 h-6 flex items-center justify-center rounded-full text-xs cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
            No items tagged yet
          </p>
        )}
      </div>

      {/* Trip */}
      <div className="mt-6">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Trip
        </span>
        {entry?.trip_entries?.[0]?.trip ? (
          <div className="mt-2">
            <div
              className="flex items-center gap-3 rounded-xl border-2 p-3"
              style={{ borderColor: 'var(--accent)', backgroundColor: 'var(--bg-card)' }}
            >
              <span className="text-lg">✈️</span>
              <button
                onClick={() => navigate(`/trips/${entry.trip_entries![0].trip!.id}`)}
                className="flex-1 text-left cursor-pointer"
              >
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {entry.trip_entries[0].trip!.title}
                </div>
              </button>
              <button
                onClick={async () => {
                  const te = entry.trip_entries![0]
                  await removeEntryFromTrip.mutateAsync({
                    tripId: te.trip_id,
                    entryId: entry.id,
                    entryDate: date,
                  })
                }}
                className="text-xs font-medium cursor-pointer px-2 py-1 rounded-lg"
                style={{ color: '#991B1B', backgroundColor: '#FEE2E2' }}
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <button
              onClick={() => setShowTripSheet(true)}
              className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed cursor-pointer"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              + Add to Trip
            </button>
          </div>
        )}
      </div>

      {/* Baby Milestone */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
            Baby Milestone
          </span>
          <button
            onClick={() => setShowMilestoneSheet(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            style={{ backgroundColor: '#FFF8E7', color: '#D4A853', border: '1px solid #F0C987' }}
          >
            + Add Milestone
          </button>
        </div>
        {babyMilestones.filter(m => m.entry_id === entry?.id).map((m) => (
          <div
            key={m.id}
            className="rounded-xl border-2 p-3 flex items-center gap-2 mb-2"
            style={{ borderColor: '#F0C987', backgroundColor: '#FFF8E7' }}
          >
            <span className="text-lg">🌟</span>
            <div className="flex-1">
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{m.title}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Share to Family */}
      {entry && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              Family Feed
            </span>
            <button
              onClick={handleFamilyToggle}
              className="w-10 h-6 rounded-full relative cursor-pointer transition-colors duration-200"
              style={{ backgroundColor: familyShareOpen ? '#6B5CA5' : 'var(--border-card)' }}
            >
              <div
                className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all duration-200"
                style={{ left: familyShareOpen ? '22px' : '2px' }}
              />
            </button>
          </div>

          {familyShareOpen && (
            <div
              className="rounded-xl border p-4 space-y-3"
              style={{ backgroundColor: '#FFF8E7', borderColor: '#F0E6C8' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm">👨\u200D👩\u200D👧</span>
                <span className="text-xs font-medium" style={{ color: '#B8860B' }}>
                  {familyPost ? 'Shared to family feed' : 'Share this entry with family'}
                </span>
              </div>

              {/* Caption */}
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
                  Caption
                </label>
                <textarea
                  value={familyCaption}
                  onChange={(e) => setFamilyCaption(e.target.value)}
                  placeholder="Write a caption for family..."
                  rows={3}
                  className="w-full rounded-lg border p-2.5 text-sm resize-none"
                  style={{
                    backgroundColor: 'white',
                    borderColor: '#E8E4DE',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Photo selector */}
              {photos.length > 0 && (
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
                    Photos to share
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {photos
                      .sort((a, b) => a.display_order - b.display_order)
                      .map((photo) => {
                        const selected = familySelectedPhotos.has(photo.id)
                        return (
                          <button
                            key={photo.id}
                            onClick={() => toggleFamilyPhoto(photo.id)}
                            className="relative w-16 h-16 rounded-lg overflow-hidden cursor-pointer"
                            style={{
                              opacity: selected ? 1 : 0.4,
                              outline: selected ? '2px solid #6B5CA5' : 'none',
                              outlineOffset: 1,
                            }}
                          >
                            <img
                              src={getStorageUrl(photo.storage_path)}
                              alt=""
                              className="w-full h-full object-cover"
                              loading="lazy"
                            />
                            <div
                              className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs"
                              style={{
                                backgroundColor: selected ? '#6B5CA5' : 'rgba(255,255,255,0.7)',
                                color: selected ? 'white' : 'transparent',
                              }}
                            >
                              {selected ? '✓' : ''}
                            </div>
                          </button>
                        )
                      })}
                  </div>
                  {familySelectedPhotos.size === 0 && (
                    <p className="text-xs mt-1" style={{ color: '#B8860B' }}>
                      No photos selected (text-only post)
                    </p>
                  )}
                </div>
              )}

              {/* Save button */}
              <button
                onClick={handleFamilySave}
                disabled={familySaving}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: '#6B5CA5' }}
              >
                {familySaving ? 'Saving...' : familyPost ? 'Update Family Post' : 'Share to Family'}
              </button>
            </div>
          )}

          {/* Remove confirmation */}
          {showRemoveConfirm && (
            <div
              className="rounded-xl border p-4 mt-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <p className="text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
                Remove from family feed?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowRemoveConfirm(false)}
                  className="px-3 py-1.5 rounded-lg text-sm cursor-pointer"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleFamilyRemove}
                  className="px-3 py-1.5 rounded-lg text-sm font-medium text-white cursor-pointer"
                  style={{ backgroundColor: '#E5534B' }}
                >
                  Remove
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Milestone picker sheet */}
      <BottomSheet
        isOpen={showMilestoneSheet}
        onClose={() => { setShowMilestoneSheet(false); setCustomMilestoneTitle('') }}
        title="Add Baby Milestone"
      >
        {(() => {
          const completedTitles = new Set(babyMilestones.map(m => m.title))
          const uncompleted = [...PREGNANCY_MILESTONES, ...FIRST_YEAR_MILESTONES].filter(t => !completedTitles.has(t))

          const handleAdd = async (title: string, type: string) => {
            if (!entry || !date) return
            await createBabyMilestone.mutateAsync({
              title,
              milestone_type: type,
              milestone_date: date,
              entry_id: entry.id,
            })
            setShowMilestoneSheet(false)
            setCustomMilestoneTitle('')
          }

          return (
            <div className="space-y-2">
              {uncompleted.length > 0 && (
                <>
                  <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                    Preset Milestones
                  </div>
                  {uncompleted.map((title) => {
                    const type = PREGNANCY_MILESTONES.includes(title) ? 'pregnancy' : 'first_year'
                    return (
                      <button
                        key={title}
                        onClick={() => handleAdd(title, type)}
                        disabled={createBabyMilestone.isPending}
                        className="w-full text-left rounded-xl border p-3 flex items-center gap-3 cursor-pointer disabled:opacity-50"
                        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                      >
                        <span className="text-lg">🌟</span>
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</span>
                      </button>
                    )
                  })}
                  <hr className="my-2" style={{ borderColor: 'var(--border-card)' }} />
                </>
              )}
              <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
                Custom Milestone
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={customMilestoneTitle}
                  onChange={(e) => setCustomMilestoneTitle(e.target.value)}
                  placeholder="e.g. First time at the park"
                  className="flex-1 rounded-lg border p-2.5 text-sm"
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                />
                <button
                  onClick={() => handleAdd(customMilestoneTitle.trim(), 'custom')}
                  disabled={!customMilestoneTitle.trim() || createBabyMilestone.isPending}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Add
                </button>
              </div>
            </div>
          )
        })()}
      </BottomSheet>

      {/* Trip picker sheet */}
      <BottomSheet
        isOpen={showTripSheet}
        onClose={() => setShowTripSheet(false)}
        title="Add to Trip"
      >
        {(() => {
          // Split trips into overlapping (entry date within trip range) and others
          const overlapping = allTrips.filter(
            t => date! >= t.start_date && date! <= t.end_date
          )
          const others = allTrips.filter(
            t => !(date! >= t.start_date && date! <= t.end_date)
          )

          return (
            <div className="space-y-2">
              {overlapping.length > 0 && (
                <>
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    Matching Date Range
                  </div>
                  {overlapping.map(trip => (
                    <button
                      key={trip.id}
                      onClick={async () => {
                        if (!entry) return
                        await addEntryToTrip.mutateAsync({
                          tripId: trip.id,
                          entryId: entry.id,
                          entryDate: date,
                        })
                        setShowTripSheet(false)
                      }}
                      className="w-full text-left rounded-xl border p-3 flex items-center gap-3 cursor-pointer"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                    >
                      <span className="text-lg">✈️</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{trip.title}</div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {trip.start_date} — {trip.end_date}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {overlapping.length > 0 && others.length > 0 && (
                <hr style={{ borderColor: 'var(--border-card)' }} />
              )}
              {others.length > 0 && (
                <>
                  <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                    All Trips
                  </div>
                  {others.map(trip => (
                    <button
                      key={trip.id}
                      onClick={async () => {
                        if (!entry) return
                        await addEntryToTrip.mutateAsync({
                          tripId: trip.id,
                          entryId: entry.id,
                          entryDate: date,
                        })
                        setShowTripSheet(false)
                      }}
                      className="w-full text-left rounded-xl border p-3 flex items-center gap-3 cursor-pointer"
                      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                    >
                      <span className="text-lg">✈️</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{trip.title}</div>
                        <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {trip.start_date} — {trip.end_date}
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              )}
              {allTrips.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: 'var(--text-muted)' }}>
                  No trips yet.
                </p>
              )}
              <button
                onClick={() => {
                  setShowTripSheet(false)
                  navigate('/trips/new')
                }}
                className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed cursor-pointer mt-2"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                + Create New Trip
              </button>
            </div>
          )
        })()}
      </BottomSheet>

      {/* Add Item Sheet */}
      <AddItemSheet
        isOpen={showAddItem}
        onClose={() => setShowAddItem(false)}
        onAdd={handleAddItem}
      />

      {/* Photo Lightbox */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightboxPhoto(null)}
        >
          <img
            src={lightboxPhoto}
            alt=""
            className="max-w-full max-h-full object-contain p-4"
          />
          <button
            onClick={() => setLightboxPhoto(null)}
            className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full text-white text-xl cursor-pointer"
            style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Pasting photo indicator */}
      {pastingPhoto && (
        <div
          className="fixed left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg z-50"
          style={{ bottom: 88, backgroundColor: 'var(--text-primary)', color: 'var(--bg-card)' }}
        >
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-medium">Pasting photo…</span>
        </div>
      )}
    </div>
  )
}
