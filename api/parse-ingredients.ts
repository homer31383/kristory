import Anthropic from '@anthropic-ai/sdk'

/**
 * Vercel serverless function: parses freeform recipe ingredient text into
 * structured JSON via the Anthropic Messages API.
 *
 * The ANTHROPIC_API_KEY env var lives only on the server (set it in the Vercel
 * dashboard, and locally in `.env` if running `vercel dev`). It is never shipped
 * to the browser.
 */

// A Claude parse call plus the SDK's automatic retries can exceed Vercel's
// 10s default function timeout. Give it generous headroom.
export const maxDuration = 60

// Fallback list, used only if the client doesn't send the live category names.
const DEFAULT_CATEGORIES = [
  'Fruits', 'Vegetables', 'Fresh Herbs', 'Dairy & Eggs', 'Meat & Seafood',
  'Bakery', 'Pasta & Grains', 'Breakfast & Cereal', 'Frozen',
  'Pantry & Dry Goods', 'Snacks', 'Beverages', 'Condiments & Sauces',
  'Cleaning Supplies', 'Paper Products', 'Health & Personal', 'Baby & Kids',
  'Pet Supplies', 'Other',
]

interface ParsedIngredient {
  name: string
  quantity: number
  unit: string | null
  category: string
  notes: string | null
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function buildPrompt(ingredientText: string, categories: string[]): string {
  return `Parse these recipe ingredients into structured JSON. For each ingredient return:
- name: clean grocery item name (what you'd look for in a store)
- quantity: numeric amount (default 1 if unclear)
- unit: measurement unit (cups, tbsp, lbs, oz, cloves, bunch, can, etc.) or null if it's a whole item
- category: one of these grocery categories: ${categories.join(', ')}
- notes: any preparation notes (minced, diced, room temperature, etc.) or null

Skip section headers, blank lines, and anything that is not a real ingredient.
Respond with ONLY a JSON array, no other text:

Ingredients:
${ingredientText}`
}

function coerceQuantity(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return 1
}

function coerceNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.toLowerCase() === 'null') return null
  return trimmed
}

/** Extract a JSON array from Claude's response, tolerating markdown fences. */
function extractIngredients(text: string): ParsedIngredient[] {
  let body = text.trim()
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) body = fenced[1].trim()

  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start === -1 || end === -1 || end < start) return []

  let raw: unknown
  try {
    raw = JSON.parse(body.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []

  const result: ParsedIngredient[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const obj = entry as Record<string, unknown>
    const name = typeof obj.name === 'string' ? obj.name.trim() : ''
    if (!name) continue
    result.push({
      name,
      quantity: coerceQuantity(obj.quantity),
      unit: coerceNullableString(obj.unit),
      category: typeof obj.category === 'string' ? obj.category.trim() : '',
      notes: coerceNullableString(obj.notes),
    })
  }
  return result
}

// Exported as a named HTTP method (not `export default`) so Vercel uses the
// Web fetch-style signature — `export default` is the legacy (req, res) form,
// where a returned Response is ignored and the function hangs until timeout.
export async function POST(req: Request): Promise<Response> {
  console.log('Function called, API key exists:', !!process.env.ANTHROPIC_API_KEY)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return jsonResponse(
      { error: 'The ingredient parser is not configured on the server.' },
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
  const ingredientText =
    typeof body.ingredients === 'string' ? body.ingredients.trim() : ''
  if (!ingredientText) {
    return jsonResponse({ error: 'No ingredients to parse.' }, 400)
  }

  const categories =
    Array.isArray(body.categories) &&
    body.categories.length > 0 &&
    body.categories.every((c) => typeof c === 'string' && c.trim())
      ? (body.categories as string[])
      : DEFAULT_CATEGORIES

  const client = new Anthropic({ apiKey })

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [
        { role: 'user', content: buildPrompt(ingredientText, categories) },
      ],
    })

    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const ingredients = extractIngredients(text)
    if (ingredients.length === 0) {
      return jsonResponse(
        { error: 'Could not parse any ingredients from this recipe.' },
        502,
      )
    }

    return jsonResponse({ ingredients }, 200)
  } catch {
    return jsonResponse(
      { error: 'The AI parser is unavailable right now. Please try again.' },
      502,
    )
  }
}
