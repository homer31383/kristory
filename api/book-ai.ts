import Anthropic from '@anthropic-ai/sdk'

/**
 * Vercel serverless function: generates AI assistance for a book entry.
 * Two actions:
 *   - "summary": a short 2-3 sentence summary of the book
 *   - "themes":  a comma-separated list of themes
 *
 * Named POST export so Vercel honors the returned Response.
 * ANTHROPIC_API_KEY is server-side only.
 */

export const maxDuration = 30

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

type Action = 'summary' | 'themes' | 'classify'

function buildPrompt(
  action: Action,
  title: string,
  author: string | null,
  description: string | null,
  availableTags: string[] | null,
): string {
  const authorPart = author ? ` by ${author}` : ''
  const desc = description ? `\n\nKnown description (may be partial):\n${description}` : ''
  if (action === 'summary') {
    return `Write a concise 2-3 sentence summary of the book "${title}"${authorPart}. Focus on what it's about, not whether it's good. No spoilers beyond the premise. Return only the summary — no preamble, no bullet points, no markdown.${desc}`
  }
  if (action === 'themes') {
    return `List the main themes of the book "${title}"${authorPart} as a short comma-separated list (5-8 themes maximum). Examples: "identity, memory, grief, friendship". Return ONLY the comma-separated list — no preamble, no numbering, no markdown.${desc}`
  }
  // classify — pick from a fixed list of subcategory tags.
  const tagList = (availableTags ?? []).join(', ')
  return `Classify the book "${title}"${authorPart} into the most appropriate subcategory tags from the list below. Pick the 2-4 best fits. Return ONLY exact tag names from the list, separated by commas, with no preamble, numbering, or markdown. If unsure between many tags, prefer fewer (broader) tags over more.

Available tags: ${tagList}${desc}`
}

export async function POST(req: Request): Promise<Response> {
  console.log('book-ai: invoked, API key present:', !!process.env.ANTHROPIC_API_KEY)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return jsonResponse({ error: 'AI assistance is not configured on the server.' }, 500)
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const actionRaw = body.action
  const action: Action | null =
    actionRaw === 'summary' || actionRaw === 'themes' || actionRaw === 'classify'
      ? actionRaw
      : null
  if (!action) {
    return jsonResponse({ error: 'action must be "summary", "themes", or "classify".' }, 400)
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return jsonResponse({ error: 'A book title is required.' }, 400)
  }
  const author = typeof body.author === 'string' && body.author.trim() ? body.author.trim() : null
  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null

  let availableTags: string[] | null = null
  if (Array.isArray(body.available_tags)) {
    availableTags = body.available_tags
      .filter((s): s is string => typeof s === 'string')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (action === 'classify' && (!availableTags || availableTags.length === 0)) {
    return jsonResponse(
      { error: 'available_tags must be a non-empty array of strings for classify.' },
      400,
    )
  }

  const prompt = buildPrompt(action, title, author, description, availableTags)
  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim()
    if (!text) {
      return jsonResponse({ error: 'AI returned an empty response.' }, 502)
    }
    return jsonResponse({ text }, 200)
  } catch (err) {
    console.log('book-ai: error calling Anthropic:', err instanceof Error ? err.message : String(err))
    return jsonResponse(
      { error: 'AI assistance is unavailable right now. Please try again.' },
      502,
    )
  }
}
