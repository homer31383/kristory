/**
 * Client wrapper for /api/book-ai. Generates short summaries / themes for
 * a book on demand. The function is name-keyed in vercel.json with a 30s
 * timeout, so we keep the client AbortController under that.
 */

const REQUEST_TIMEOUT_MS = 28000

export interface BookAIInput {
  action: 'summary' | 'themes' | 'classify'
  title: string
  author?: string | null
  description?: string | null
  /** Required for action = 'classify'. List of allowed tag names. */
  availableTags?: string[]
}

export async function generateBookAI(input: BookAIInput): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/book-ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: input.action,
        title: input.title,
        author: input.author,
        description: input.description,
        available_tags: input.availableTags,
      }),
      signal: controller.signal,
    })
    const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string }
    if (!res.ok) {
      throw new Error(data.error || `AI request failed (${res.status})`)
    }
    if (!data.text) throw new Error('AI returned no text.')
    return data.text
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Parse Claude's classify response into media-tag IDs by matching returned
 * names against the actual media_tags rows (case-insensitive). Anything
 * the model invented that isn't in the list is silently dropped.
 */
export function matchTagsToIds(
  csvText: string,
  mediaTags: { id: string; name: string }[],
): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  for (const raw of csvText.split(',')) {
    const name = raw.trim()
    if (!name) continue
    const lower = name.toLowerCase()
    const found = mediaTags.find((t) => t.name.toLowerCase() === lower)
    if (found && !seen.has(found.id)) {
      ids.push(found.id)
      seen.add(found.id)
    }
  }
  return ids
}
