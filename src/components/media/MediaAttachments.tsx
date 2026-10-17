import { useRef, useState } from 'react'
import { useCreateMedia, useDeleteMedia, useReorderMedia, useUpdateMedia } from '../../hooks/useMedia'
import {
  LARGE_VIDEO_BYTES,
  classifyMediaFile,
  formatBytes,
  formatDuration,
  generateVideoThumbnail,
  getMediaUrl,
  mediaDisplayName,
  probeDuration,
  removeMediaFiles,
  sortMedia,
  uploadMediaObject,
} from '../../lib/media'
import type { JournalMedia, MediaFileType } from '../../types'
import MediaList from './MediaList'

interface PendingUpload {
  id: string
  entryDate: string
  kind: MediaFileType
  name: string
  size: number
  previewUrl: string | null
  duration: number | null
  progress: number
  status: 'preparing' | 'uploading' | 'saving' | 'error'
  error?: string
}

interface MediaAttachmentsProps {
  entryDate: string
  media: JournalMedia[]
  userId: string | undefined
  /** Creates the journal entry on demand (lazy entry creation). */
  ensureEntry: () => Promise<string>
}

const STATUS_LABEL: Record<PendingUpload['status'], string> = {
  preparing: 'Preparing...',
  uploading: 'Uploading',
  saving: 'Saving...',
  error: 'Failed',
}

function VideoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M16 10l6-3v10l-6-3z" />
    </svg>
  )
}

function MicIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <line x1="12" y1="17" x2="12" y2="22" />
    </svg>
  )
}

/** Placeholder "waveform": evenly spaced bars, no real audio analysis. */
function WaveBar({ progress }: { progress?: number }) {
  return (
    <div className="relative h-8 rounded-md overflow-hidden" style={{ backgroundColor: 'var(--media-player-bg)' }}>
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: 'repeating-linear-gradient(90deg, var(--media-player-track) 0 2px, transparent 2px 5px)',
          maskImage: 'linear-gradient(180deg, transparent 20%, black 20% 80%, transparent 80%)',
          WebkitMaskImage: 'linear-gradient(180deg, transparent 20%, black 20% 80%, transparent 80%)',
        }}
      />
      {progress !== undefined && (
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${progress * 100}%`, backgroundColor: 'var(--media-player-ink)', opacity: 0.18 }}
        />
      )}
    </div>
  )
}

export default function MediaAttachments({ entryDate, media, userId, ensureEntry }: MediaAttachmentsProps) {
  const createMedia = useCreateMedia()
  const updateMedia = useUpdateMedia()
  const reorderMedia = useReorderMedia()
  const deleteMedia = useDeleteMedia()

  const [pending, setPending] = useState<PendingUpload[]>([])
  // Both are tied to the date they were set on, so they clear themselves
  // when the same EntryDetail instance moves to another entry.
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [noticeState, setNoticeState] = useState<{ date: string; tone: 'warn' | 'error'; text: string } | null>(null)
  const [dragOrder, setDragOrder] = useState<string[] | null>(null)
  const dragIndexRef = useRef<number | null>(null)
  const sortCursorRef = useRef(0)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)

  const sorted = sortMedia(media)
  const myPending = pending.filter((p) => p.entryDate === entryDate)

  const editing = editingDate === entryDate && media.length > 0
  const setEditing = (on: boolean) => setEditingDate(on ? entryDate : null)
  const notice = noticeState?.date === entryDate ? noticeState : null
  const setNotice = (n: { tone: 'warn' | 'error'; text: string } | null) =>
    setNoticeState(n ? { ...n, date: entryDate } : null)

  const patchPending = (id: string, patch: Partial<PendingUpload>) =>
    setPending((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))

  const dropPending = (id: string) =>
    setPending((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.id !== id)
    })

  const nextSortOrder = () => {
    const maxExisting = media.reduce((max, m) => Math.max(max, m.sort_order ?? 0), -1)
    sortCursorRef.current = Math.max(sortCursorRef.current, maxExisting + 1)
    return sortCursorRef.current++
  }

  const uploadOne = async (file: File, expected: MediaFileType, uploadId: string) => {
    const info = classifyMediaFile(file, expected)
    if ('error' in info) {
      patchPending(uploadId, { status: 'error', error: info.error })
      return
    }
    if (!userId) {
      patchPending(uploadId, { status: 'error', error: 'Not signed in. Please reload and try again.' })
      return
    }

    let uploadedPaths: { file_path: string; thumbnail_path: string | null } | null = null
    try {
      const entryId = await ensureEntry()
      const [duration, thumbBlob] = await Promise.all([
        probeDuration(file, info.kind),
        info.kind === 'video' ? generateVideoThumbnail(file) : Promise.resolve(null),
      ])
      patchPending(uploadId, {
        duration,
        previewUrl: thumbBlob ? URL.createObjectURL(thumbBlob) : null,
        status: 'uploading',
      })

      const base = `${entryId}/${uploadId}`
      const filePath = `${base}.${info.ext}`
      let thumbnailPath: string | null = null
      if (thumbBlob) {
        try {
          await uploadMediaObject(`${base}-thumb.jpg`, thumbBlob, 'image/jpeg')
          thumbnailPath = `${base}-thumb.jpg`
        } catch (err) {
          // A missing poster isn't worth failing the upload over.
          console.error('[MediaUpload] Thumbnail upload failed:', err)
        }
      }

      await uploadMediaObject(filePath, file, info.mimeType, (fraction) => patchPending(uploadId, { progress: fraction }))
      uploadedPaths = { file_path: filePath, thumbnail_path: thumbnailPath }

      patchPending(uploadId, { status: 'saving' })
      await createMedia.mutateAsync({
        entryId,
        entryDate,
        userId,
        filePath,
        fileName: file.name,
        fileType: info.kind,
        mimeType: info.mimeType,
        fileSizeBytes: file.size,
        durationSeconds: duration,
        thumbnailPath,
        sortOrder: nextSortOrder(),
      })
      dropPending(uploadId)
    } catch (err) {
      console.error('[MediaUpload] FAILED:', err)
      // Don't leave orphaned files behind if the row never got written.
      if (uploadedPaths) void removeMediaFiles([uploadedPaths])
      patchPending(uploadId, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' })
    }
  }

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>, expected: MediaFileType) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    setNotice(null)

    const large = files.filter((f) => f.size > LARGE_VIDEO_BYTES && expected === 'video')
    if (large.length > 0) {
      setNotice({
        tone: 'warn',
        text: `Large video (${formatBytes(large[0].size)}). It'll upload as-is, which may take a minute on cellular. Keep this page open until it finishes.`,
      })
    }

    const queued = files.map((file) => ({ file, id: crypto.randomUUID() }))
    setPending((prev) => [
      ...prev,
      ...queued.map(({ file, id }) => ({
        id,
        entryDate,
        kind: expected,
        name: file.name,
        size: file.size,
        previewUrl: null,
        duration: null,
        progress: 0,
        status: 'preparing' as const,
      })),
    ])
    // One at a time, like photo uploads, so a phone on cellular isn't
    // pushing several 40MB files in parallel.
    for (const { file, id } of queued) {
      await uploadOne(file, expected, id)
    }
  }

  const handleDelete = async (m: JournalMedia) => {
    const what = m.file_type === 'video' ? 'video' : 'audio clip'
    if (!confirm(`Delete this ${what}? This can't be undone.`)) return
    try {
      await deleteMedia.mutateAsync({ media: m, entryDate })
    } catch (err) {
      console.error('Failed to delete media:', err)
      setNotice({ tone: 'error', text: 'Could not delete. Please try again.' })
    }
  }

  const saveCaption = (m: JournalMedia, value: string) => {
    const caption = value.trim() || null
    if (caption === (m.caption ?? null)) return
    updateMedia.mutate({ mediaId: m.id, entryDate, changes: { caption } })
  }

  // Compared against the displayed name so focusing and leaving the field
  // doesn't rewrite "Kicks.m4a" as "Kicks".
  const saveName = (m: JournalMedia, value: string) => {
    const name = value.trim() || null
    if (name === mediaDisplayName(m.file_name)) return
    updateMedia.mutate({ mediaId: m.id, entryDate, changes: { file_name: name } })
  }

  // ─── Reordering (drag on desktop, arrow buttons on touch) ───
  const orderedIds = dragOrder ?? sorted.map((m) => m.id)
  const byId = new Map(sorted.map((m) => [m.id, m]))
  const ordered = orderedIds.map((id) => byId.get(id)).filter((m): m is JournalMedia => !!m)

  const persistOrder = (ids: string[]) => {
    const current = sorted.map((m) => m.id)
    if (ids.join() === current.join()) { setDragOrder(null); return }
    reorderMedia.mutate(
      { orderedIds: ids, entryDate },
      { onSettled: () => setDragOrder(null) },
    )
  }

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index
    setDragOrder(sorted.map((m) => m.id))
  }

  const handleDragOver = (index: number, e: React.DragEvent) => {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === index) return
    setDragOrder((prev) => {
      if (!prev) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      if (!moved) return prev
      next.splice(index, 0, moved)
      return next
    })
    dragIndexRef.current = index
  }

  const handleDragEnd = () => {
    dragIndexRef.current = null
    if (dragOrder) persistOrder(dragOrder)
  }

  const move = (index: number, delta: number) => {
    const ids = sorted.map((m) => m.id)
    const target = index + delta
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    setDragOrder(ids)
    persistOrder(ids)
  }

  const iconBtnStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-card)',
    color: 'var(--accent)',
    border: '1px solid var(--border-card)',
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Audio &amp; Video
        </span>
        <div className="flex items-center gap-2">
          {media.length > 0 && (
            <button
              onClick={() => setEditing(!editing)}
              aria-label={editing ? 'Done editing media' : 'Edit media'}
              className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer"
              style={{
                backgroundColor: editing ? 'var(--accent)' : 'var(--bg-card)',
                color: editing ? 'white' : 'var(--text-muted)',
                border: editing ? 'none' : '1px solid var(--border-card)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
              </svg>
            </button>
          )}
          {/* No capture attribute: on iOS it hides the library and forces the
              camera. Without it, phones offer both "Take Video" and the library. */}
          <button
            onClick={() => videoInputRef.current?.click()}
            aria-label="Add video"
            title="Add video"
            className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg cursor-pointer text-xs font-medium"
            style={iconBtnStyle}
          >
            <VideoIcon size={15} />
            Video
          </button>
          <button
            onClick={() => audioInputRef.current?.click()}
            aria-label="Add audio"
            title="Add audio"
            className="h-7 px-2.5 flex items-center gap-1.5 rounded-lg cursor-pointer text-xs font-medium"
            style={iconBtnStyle}
          >
            <MicIcon size={15} />
            Audio
          </button>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e, 'video')}
          />
          <input
            ref={audioInputRef}
            type="file"
            accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/ogg,audio/webm,audio/wav,audio/*"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e, 'audio')}
          />
        </div>
      </div>

      {notice && (
        <div
          className="mb-2 px-3 py-2 rounded-lg text-xs font-medium flex items-start gap-2"
          style={notice.tone === 'error'
            ? { backgroundColor: '#FEE2E2', color: '#991B1B' }
            : { backgroundColor: '#FEF3C7', color: '#92400E' }}
        >
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} className="cursor-pointer" aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* Uploads in flight */}
      {myPending.length > 0 && (
        <div className="flex gap-2 overflow-x-auto photo-scroll pb-2 mb-2">
          {myPending.map((p) => (
            <div
              key={p.id}
              className="relative flex-shrink-0 w-40 rounded-lg border p-2"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: p.status === 'error' ? '#E5534B' : 'var(--border-card)' }}
            >
              {p.kind === 'video' ? (
                <div className="relative w-full h-20 rounded-md overflow-hidden flex items-center justify-center" style={{ backgroundColor: '#1a1a1a', color: 'rgba(255,255,255,0.7)' }}>
                  {p.previewUrl ? <img src={p.previewUrl} alt="" className="w-full h-full object-cover" /> : <VideoIcon size={22} />}
                </div>
              ) : (
                <WaveBar progress={p.progress} />
              )}
              <div className="mt-1.5 text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{p.name}</div>
              <div className="text-[11px] flex justify-between" style={{ color: p.status === 'error' ? '#991B1B' : 'var(--text-muted)' }}>
                <span>{STATUS_LABEL[p.status]}{p.status === 'uploading' ? ` ${Math.round(p.progress * 100)}%` : ''}</span>
                <span>{p.duration ? formatDuration(p.duration) : formatBytes(p.size)}</span>
              </div>
              {p.status !== 'error' && (
                <div className="mt-1 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-card)' }}>
                  <div
                    className="h-full transition-[width] duration-200"
                    style={{
                      width: `${p.status === 'saving' ? 100 : Math.round(p.progress * 100)}%`,
                      backgroundColor: 'var(--accent)',
                    }}
                  />
                </div>
              )}
              {p.status === 'error' && (
                <>
                  <div className="mt-1 text-[11px] leading-snug" style={{ color: '#991B1B' }}>{p.error}</div>
                  <button
                    onClick={() => dropPending(p.id)}
                    aria-label="Dismiss failed upload"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white cursor-pointer"
                    style={{ backgroundColor: '#E5534B' }}
                  >
                    ✕
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <>
          <div className="flex gap-2 overflow-x-auto photo-scroll pb-2">
            {ordered.map((m, index) => (
              <div
                key={m.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(index, e)}
                onDrop={(e) => e.preventDefault()}
                onDragEnd={handleDragEnd}
                className="relative flex-shrink-0 w-40 rounded-lg border p-2 cursor-move"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
              >
                {m.file_type === 'video' ? (
                  <div className="relative w-full h-20 rounded-md overflow-hidden flex items-center justify-center" style={{ backgroundColor: '#1a1a1a' }}>
                    {m.thumbnail_path && (
                      <img src={getMediaUrl(m.thumbnail_path)} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" loading="lazy" />
                    )}
                    <span className="relative w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.55)', color: 'white' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}>
                        <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
                      </svg>
                    </span>
                  </div>
                ) : (
                  <WaveBar />
                )}
                {m.file_type === 'audio' && (
                  <input
                    type="text"
                    defaultValue={mediaDisplayName(m.file_name) ?? ''}
                    placeholder="Name this clip"
                    aria-label="Clip name"
                    onBlur={(e) => saveName(m, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                    className="mt-1.5 w-full rounded-md border px-1.5 py-1 text-xs font-medium"
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                  />
                )}
                <div className="mt-1.5 text-[11px] flex justify-between" style={{ color: 'var(--text-muted)' }}>
                  <span>{m.file_type === 'video' ? 'Video' : 'Audio'}{m.duration_seconds ? ` · ${formatDuration(m.duration_seconds)}` : ''}</span>
                  <span>{m.file_size_bytes ? formatBytes(m.file_size_bytes) : ''}</span>
                </div>
                <input
                  type="text"
                  defaultValue={m.caption ?? ''}
                  placeholder="Add a caption"
                  onBlur={(e) => saveCaption(m, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  className="mt-1 w-full rounded-md border px-1.5 py-1 text-xs"
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                />
                {ordered.length > 1 && (
                  <div className="mt-1 flex justify-between">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0 || reorderMedia.isPending}
                      aria-label="Move earlier"
                      className="px-2 text-sm cursor-pointer disabled:opacity-30"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      ‹
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === ordered.length - 1 || reorderMedia.isPending}
                      aria-label="Move later"
                      className="px-2 text-sm cursor-pointer disabled:opacity-30"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      ›
                    </button>
                  </div>
                )}
                <button
                  onClick={() => handleDelete(m)}
                  disabled={deleteMedia.isPending}
                  aria-label="Delete"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white cursor-pointer"
                  style={{ backgroundColor: '#E5534B' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {ordered.length > 1 && (
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Drag or use the arrows to reorder.
            </p>
          )}
        </>
      ) : sorted.length > 0 ? (
        <MediaList media={sorted} preload="metadata" />
      ) : myPending.length === 0 ? (
        <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
          No audio or video yet
        </p>
      ) : null}
    </div>
  )
}
