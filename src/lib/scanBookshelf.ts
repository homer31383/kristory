/**
 * Client wrapper for /api/scan-bookshelf. Sends one base64 photo of a
 * bookshelf and gets back a list of detected books (title + optional
 * author). The Vercel function caps at 60s; we set the client a little
 * under that so we don't surface a flat "timeout" right at the deadline.
 */

const REQUEST_TIMEOUT_MS = 55000

export interface DetectedBook {
  title: string
  author: string | null
}

export interface ScanBookshelfInput {
  image: string // base64, no data: prefix
  media_type?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

export async function scanBookshelf(input: ScanBookshelfInput): Promise<DetectedBook[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/scan-bookshelf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        image: input.image,
        media_type: input.media_type ?? 'image/jpeg',
      }),
      signal: controller.signal,
    })
    const data = (await res.json().catch(() => ({}))) as {
      books?: DetectedBook[]
      error?: string
    }
    if (!res.ok) {
      throw new Error(data.error || `Scan failed (${res.status})`)
    }
    return data.books ?? []
  } finally {
    clearTimeout(timer)
  }
}
