import Anthropic from '@anthropic-ai/sdk'

/**
 * Vercel serverless function: extracts a structured recipe from a photo using
 * Claude's vision. Accepts a POST with a base64-encoded image.
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

const EXTRACT_PROMPT = `Extract this recipe into structured JSON. Return ONLY a JSON object with:
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

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(asString).filter(Boolean)
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
  const base64Image = typeof body.image === 'string' ? body.image.trim() : ''
  if (!base64Image) {
    return jsonResponse({ error: 'No image provided.' }, 400)
  }

  const requestedType = body.media_type
  const mediaType: MediaType =
    typeof requestedType === 'string' &&
    (ALLOWED_MEDIA_TYPES as readonly string[]).includes(requestedType)
      ? (requestedType as MediaType)
      : 'image/jpeg'

  console.log('scan-recipe: image base64 length', base64Image.length, '| media type', mediaType)

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Image },
            },
            { type: 'text', text: EXTRACT_PROMPT },
          ],
        },
      ],
    })

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const raw = extractRecipeObject(text)
    if (!raw) {
      console.log('scan-recipe: no JSON object found in model response')
      return jsonResponse({ error: 'Could not read a recipe from this photo.' }, 502)
    }

    const recipe = normalizeRecipe(raw)
    if (!recipe.title && recipe.ingredients.length === 0 && recipe.instructions.length === 0) {
      console.log('scan-recipe: model returned an empty recipe')
      return jsonResponse({ error: 'Could not read a recipe from this photo.' }, 502)
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
