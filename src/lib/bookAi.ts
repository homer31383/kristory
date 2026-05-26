/**
 * Client wrapper for /api/book-ai. Generates short summaries / themes for
 * a book on demand. The function is name-keyed in vercel.json with a 30s
 * timeout, so we keep the client AbortController under that.
 */

const REQUEST_TIMEOUT_MS = 28000

export interface BookAIInput {
  action: 'summary' | 'themes'
  title: string
  author?: string | null
  description?: string | null
}

export async function generateBookAI(input: BookAIInput): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch('/api/book-ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
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
