import Anthropic from '@anthropic-ai/sdk'

/**
 * Vercel serverless function: reads a photo of a bookshelf and returns
 * the list of books it can see. Each result has a best-guess title and
 * (optionally) author — the client then enriches each one via Open Library
 * lookup before saving.
 *
 * Named POST export so Vercel uses the Web fetch-style signature and
 * honors the returned Response. ANTHROPIC_API_KEY is server-side only.
 */

export const maxDuration = 60

const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number]

interface DetectedBook {
  title: string
  author: string | null
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function extractBooksArray(text: string): unknown[] | null {
  let body = text.trim()
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) body = fenced[1].trim()

  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return null
  try {
    const parsed: unknown = JSON.parse(body.slice(start, end + 1))
    return Array.isArray(parsed) ? (parsed as unknown[]) : null
  } catch {
    return null
  }
}

function normalize(raw: unknown[]): DetectedBook[] {
  const out: DetectedBook[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const title = asString(obj.title)
    if (!title) continue
    const author = asString(obj.author)
    out.push({ title, author: author || null })
  }
  // Dedupe by title+author (case-insensitive) so a packed shelf doesn't
  // explode the picker list.
  const seen = new Set<string>()
  return out.filter((b) => {
    const k = (b.title + '|' + (b.author ?? '')).toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export async function POST(req: Request): Promise<Response> {
  console.log('scan-bookshelf: invoked, API key present:', !!process.env.ANTHROPIC_API_KEY)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return jsonResponse(
      { error: 'The bookshelf scanner is not configured on the server.' },
      500,
    )
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const image = typeof body.image === 'string' ? body.image.trim() : ''
  if (!image) {
    return jsonResponse({ error: 'No image provided.' }, 400)
  }
  const rawType = body.media_type
  const media_type: MediaType =
    typeof rawType === 'string' &&
    (ALLOWED_MEDIA_TYPES as readonly string[]).includes(rawType)
      ? (rawType as MediaType)
      : 'image/jpeg'

  const prompt = `This is a photo of a bookshelf. Identify every book whose spine or cover you can read clearly. Return ONLY a JSON array (no prose, no markdown) of objects with this shape:
[
  { "title": "Book Title", "author": "Author Name" }
]
Rules:
- Read text directly from spines or covers — do not guess from images.
- If the author isn't visible or readable, use null for "author".
- Skip books you can't read clearly. It's better to return fewer accurate entries than many guesses.
- Use the book's actual published title. Don't truncate or paraphrase.
- Return an empty array [] if no readable books are present.`

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const arr = extractBooksArray(text)
    if (!arr) {
      console.log('scan-bookshelf: no JSON array found in model response')
      return jsonResponse({ books: [] }, 200)
    }
    const books = normalize(arr)
    console.log('scan-bookshelf: detected', books.length, 'book(s)')
    return jsonResponse({ books }, 200)
  } catch (err) {
    console.log(
      'scan-bookshelf: error calling Anthropic:',
      err instanceof Error ? err.message : String(err),
    )
    return jsonResponse(
      { error: 'The bookshelf scanner is unavailable right now. Please try again.' },
      502,
    )
  }
}
