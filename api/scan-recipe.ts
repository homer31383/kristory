import Anthropic from '@anthropic-ai/sdk'

/**
 * Vercel serverless function: extracts a structured recipe from one or more
 * photos using Claude's vision. Accepts a POST with an array of base64 images
 * (recipe pages, in order).
 *
 * Exported as a named HTTP method (not `export default`) so Vercel uses the
 * Web fetch-style signature and honors the returned Response.
 *
 * ANTHROPIC_API_KEY is server-side only — set it in the Vercel dashboard.
 */

export const maxDuration = 60

// Image media types accepted by the Anthropic vision API.
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number]

const MAX_IMAGES = 5

interface IncomingImage {
  image: string
  media_type: MediaType
}

interface ScannedRecipe {
  title: string
  description: string
  servings: string
  prep_time: string
  cook_time: string
  ingredients: { name: string; quantity: string; unit: string; notes: string }[]
  instructions: string[]
  tags: string[]
  notes: string
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function buildPrompt(imageCount: number): string {
  const lead =
    imageCount > 1
      ? `These ${imageCount} photos are pages of the same recipe, in order. Extract the complete recipe into structured JSON.`
      : 'Extract this recipe into structured JSON.'

  return `${lead} Return ONLY a JSON object with:
- title: recipe name
- description: short description (1-2 sentences)
- servings: number or text (e.g. "4" or "4-6")
- prep_time: text (e.g. "15 minutes")
- cook_time: text (e.g. "30 minutes")
- ingredients: array of objects with { name, quantity, unit, notes }
- instructions: array of strings, one per step
- tags: array of suggested tags (e.g. ["Italian", "Pasta", "Quick"])
- notes: any tips or variations mentioned

If you can't read part of the recipe clearly, make your best guess and add "(unclear)" to the notes.`
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(asString).filter(Boolean)
}

/** Validate and normalize the incoming images array. */
function parseImages(value: unknown): IncomingImage[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const result: IncomingImage[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null
    const obj = entry as Record<string, unknown>
    const image = typeof obj.image === 'string' ? obj.image.trim() : ''
    if (!image) return null
    const rawType = obj.media_type
    const media_type: MediaType =
      typeof rawType === 'string' &&
      (ALLOWED_MEDIA_TYPES as readonly string[]).includes(rawType)
        ? (rawType as MediaType)
        : 'image/jpeg'
    result.push({ image, media_type })
  }
  return result
}

/** Extract a JSON object from Claude's response, tolerating markdown fences. */
function extractRecipeObject(text: string): Record<string, unknown> | null {
  let body = text.trim()
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) body = fenced[1].trim()

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null

  try {
    const parsed: unknown = JSON.parse(body.slice(start, end + 1))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function normalizeRecipe(raw: Record<string, unknown>): ScannedRecipe {
  const rawIngredients = Array.isArray(raw.ingredients) ? raw.ingredients : []
  const ingredients = rawIngredients
    .map((entry) => {
      const obj = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>
      return {
        name: asString(obj.name),
        quantity: asString(obj.quantity),
        unit: asString(obj.unit),
        notes: asString(obj.notes),
      }
    })
    .filter((ing) => ing.name)

  return {
    title: asString(raw.title),
    description: asString(raw.description),
    servings: asString(raw.servings),
    prep_time: asString(raw.prep_time),
    cook_time: asString(raw.cook_time),
    ingredients,
    instructions: asStringArray(raw.instructions),
    tags: asStringArray(raw.tags),
    notes: asString(raw.notes),
  }
}

export async function POST(req: Request): Promise<Response> {
  console.log('scan-recipe: invoked, API key present:', !!process.env.ANTHROPIC_API_KEY)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return jsonResponse(
      { error: 'The recipe scanner is not configured on the server.' },
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
  const images = parseImages(body.images)
  if (!images) {
    return jsonResponse({ error: 'No images provided.' }, 400)
  }
  if (images.length > MAX_IMAGES) {
    return jsonResponse({ error: `Please use at most ${MAX_IMAGES} photos.` }, 400)
  }

  console.log('scan-recipe: received', images.length, 'image(s)')

  // All pages go into one message as separate image blocks, so Claude sees the
  // whole recipe at once and combines them.
  const content: Anthropic.ContentBlockParam[] = images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.media_type, data: img.image },
  }))
  content.push({ type: 'text', text: buildPrompt(images.length) })

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content }],
    })

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const raw = extractRecipeObject(text)
    if (!raw) {
      console.log('scan-recipe: no JSON object found in model response')
      return jsonResponse({ error: 'Could not read a recipe from these photos.' }, 502)
    }

    const recipe = normalizeRecipe(raw)
    if (!recipe.title && recipe.ingredients.length === 0 && recipe.instructions.length === 0) {
      console.log('scan-recipe: model returned an empty recipe')
      return jsonResponse({ error: 'Could not read a recipe from these photos.' }, 502)
    }

    console.log('scan-recipe: extracted recipe:', recipe.title || '(untitled)')
    return jsonResponse({ recipe }, 200)
  } catch (err) {
    console.log(
      'scan-recipe: error calling Anthropic:',
      err instanceof Error ? err.message : String(err),
    )
    return jsonResponse(
      { error: 'The recipe scanner is unavailable right now. Please try again.' },
      502,
    )
  }
}
