/**
 * Client helper for the `/api/parse-ingredients` Vercel function, which turns
 * freeform recipe ingredient text into structured grocery items via Claude.
 */

export interface ParsedIngredient {
  name: string
  quantity: number
  unit: string | null
  category: string
  notes: string | null
}

const TIMEOUT_MS = 15000

export async function parseRecipeIngredients(
  ingredients: string,
  categories: string[],
): Promise<ParsedIngredient[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch('/api/parse-ingredients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ingredients, categories }),
      signal: controller.signal,
    })

    const data = (await res.json().catch(() => null)) as
      | { ingredients?: ParsedIngredient[]; error?: string }
      | null

    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status}).`)
    }
    if (!data || !Array.isArray(data.ingredients)) {
      throw new Error('The parser returned an unexpected response.')
    }
    return data.ingredients
  } finally {
    clearTimeout(timer)
  }
}
