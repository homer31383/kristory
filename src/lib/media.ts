import { supabase } from './supabase'
import type { JournalMedia, MediaFileType } from '../types'

export const MEDIA_BUCKET = 'kristory-media'
/** Hard cap, matches the bucket's file_size_limit (covers ~2 min of phone video). */
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024
/** Videos above this get a heads-up that the upload may take a while. */
export const LARGE_VIDEO_BYTES = 20 * 1024 * 1024

const ACCEPTED: Record<MediaFileType, string[]> = {
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm', 'audio/wav'],
}

// Browsers and OSes disagree on MIME names for the same formats, and some
// report an empty type, so fall back to the extension.
const MIME_ALIASES: Record<string, string> = {
  'audio/x-m4a': 'audio/mp4',
  'audio/m4a': 'audio/mp4',
  'audio/aac': 'audio/mp4',
  'audio/mp3': 'audio/mpeg',
  'audio/x-wav': 'audio/wav',
  'audio/wave': 'audio/wav',
  'audio/vnd.wave': 'audio/wav',
  'video/x-m4v': 'video/mp4',
}

const MIME_BY_EXT: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  wav: 'audio/wav',
}

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/wav': 'wav',
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export interface MediaFileInfo {
  kind: MediaFileType
  mimeType: string
  ext: string
}

/**
 * Works out whether a picked file is a supported video or audio file.
 * `expected` resolves the one ambiguous case: a .webm picked from the audio
 * button is audio, from the video button it's video.
 */
export function classifyMediaFile(file: File, expected: MediaFileType): MediaFileInfo | { error: string } {
  const ext = extensionOf(file.name)
  let mime = (file.type || '').toLowerCase().split(';')[0]
  mime = MIME_ALIASES[mime] ?? mime
  if (!mime) mime = MIME_BY_EXT[ext] ?? ''
  if (mime === 'video/webm' && expected === 'audio') mime = 'audio/webm'
  if (mime === 'audio/webm' && expected === 'video') mime = 'video/webm'

  const kind: MediaFileType | null = ACCEPTED.video.includes(mime) ? 'video' : ACCEPTED.audio.includes(mime) ? 'audio' : null
  if (!kind) {
    return { error: `${file.name} isn't a supported ${expected} format.` }
  }
  if (file.size > MAX_MEDIA_BYTES) {
    return { error: `${file.name} is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_MEDIA_BYTES)} (about 2 minutes of phone video).` }
  }
  return { kind, mimeType: mime, ext: EXT_BY_MIME[mime] ?? (ext || 'bin') }
}

export function getMediaUrl(path: string): string {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  return `${supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`
}

/**
 * A clip's name for display: the original filename minus its media
 * extension, or a name typed in the editor (left as-is, dots and all).
 */
export function mediaDisplayName(fileName: string | null | undefined): string | null {
  if (!fileName) return null
  const ext = extensionOf(fileName)
  if (!(ext in MIME_BY_EXT)) return fileName
  return fileName.slice(0, -(ext.length + 1)).trim() || fileName
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))])
}

/** Reads a media file's duration in seconds, or null if the browser can't decode it. */
export function probeDuration(file: File, kind: MediaFileType): Promise<number | null> {
  const url = URL.createObjectURL(file)
  const el = document.createElement(kind)
  el.preload = 'metadata'
  const done = new Promise<number | null>((resolve) => {
    el.onloadedmetadata = () => {
      // Some recorders write no duration header; the browser reports Infinity.
      resolve(isFinite(el.duration) ? el.duration : null)
    }
    el.onerror = () => resolve(null)
  })
  el.src = url
  return withTimeout(done, 8000).finally(() => {
    el.removeAttribute('src')
    el.load()
    URL.revokeObjectURL(url)
  })
}

/**
 * Grabs a frame near the start of a video as a JPEG (max 800px edge).
 * Returns null when the browser can't decode the video (e.g. HEVC .mov on
 * desktop Chrome); the player then just shows without a poster.
 */
export function generateVideoThumbnail(file: File): Promise<Blob | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'

  const done = new Promise<Blob | null>((resolve) => {
    video.onerror = () => resolve(null)
    video.onloadeddata = () => {
      // The very first frame is often black on phone recordings.
      const target = isFinite(video.duration) ? Math.min(0.5, video.duration / 2) : 0
      if (target > 0) video.currentTime = target
      else capture()
    }
    video.onseeked = () => capture()

    function capture() {
      const w = video.videoWidth
      const h = video.videoHeight
      if (!w || !h) { resolve(null); return }
      const scale = Math.min(1, 800 / Math.max(w, h))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(null); return }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.8)
    }
  })

  video.src = url
  video.load()
  return withTimeout(done, 10000).finally(() => {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  })
}

/**
 * Uploads to the media bucket with progress reporting. supabase-js storage
 * uploads don't expose progress, so this talks to the Storage REST endpoint
 * directly with XHR.
 */
export function uploadMediaObject(
  path: string,
  body: Blob,
  contentType: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${supabaseUrl}/storage/v1/object/${MEDIA_BUCKET}/${path}`)
    xhr.setRequestHeader('Authorization', `Bearer ${anonKey}`)
    xhr.setRequestHeader('apikey', anonKey)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.setRequestHeader('cache-control', 'max-age=31536000')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve()
        return
      }
      let message = `Upload failed (HTTP ${xhr.status})`
      try {
        const parsed = JSON.parse(xhr.responseText)
        if (parsed?.message) message = `Upload failed: ${parsed.message}`
      } catch {
        // Non-JSON error body; keep the status message.
      }
      reject(new Error(message))
    }
    xhr.onerror = () => reject(new Error('Upload failed: network error'))
    xhr.send(body)
  })
}

/** Removes the stored files (and thumbnails) for the given media rows. */
export async function removeMediaFiles(media: Pick<JournalMedia, 'file_path' | 'thumbnail_path'>[]) {
  const paths = media.flatMap((m) => (m.thumbnail_path ? [m.file_path, m.thumbnail_path] : [m.file_path]))
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove(paths)
  if (error) console.error('[media] Failed to remove files from storage:', error.message)
}

/**
 * Storage cleanup for deleting a journal entry. The journal_media rows go
 * with the entry via ON DELETE CASCADE, but the bucket files don't, so call
 * this BEFORE deleting the entry (afterwards the paths are gone).
 */
export async function deleteEntryMediaFiles(entryId: string) {
  const { data, error } = await supabase
    .from('journal_media')
    .select('file_path, thumbnail_path')
    .eq('entry_id', entryId)
  if (error) throw error
  await removeMediaFiles(data ?? [])
}

export function sortMedia<T extends Pick<JournalMedia, 'sort_order' | 'created_at'>>(media: T[] | undefined): T[] {
  return [...(media ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.created_at.localeCompare(b.created_at),
  )
}
