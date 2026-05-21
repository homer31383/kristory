import type { RecipePrefill } from '../components/AddRecipeSheet'

/**
 * Client helper for the `/api/scan-recipe` Vercel function, which extracts a
 * structured recipe from a photo via Claude's vision.
 */

export interface ScannedIngredient {
  name: string
  quantity: string
  unit: string
  notes: string
}

export interface ScannedRecipe {
  title: string
  description: string
  servings: string
  prep_time: string
  cook_time: string
  ingredients: ScannedIngredient[]
  instructions: string[]
  tags: string[]
  notes: string
}

// Kept just under the serverless function's 60s maxDuration.
const TIMEOUT_MS = 55000

export interface ScanImageInput {
  /** Base64-encoded image data, without the `data:...;base64,` prefix. */
  image: string
  media_type: string
}

/** Send one or more recipe-page images to the scanner as a single recipe. */
export async function scanRecipe(images: ScanImageInput[]): Promise<ScannedRecipe> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch('/api/scan-recipe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
      signal: controller.signal,
    })

    const data = (await res.json().catch(() => null)) as
      | { recipe?: ScannedRecipe; error?: string }
      | null

    if (!res.ok) {
      throw new Error(data?.error || `Request failed (${res.status}).`)
    }
    if (!data || !data.recipe || typeof data.recipe !== 'object') {
      throw new Error('The scanner returned an unexpected response.')
    }
    return data.recipe
  } finally {
    clearTimeout(timer)
  }
}

/** Strip the `data:...;base64,` prefix from a FileReader data URL. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error('Failed to read the image file.'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Convert a scanned recipe into prefill data for the existing recipe editor.
 * The recipe schema only has name/ingredients/instructions text fields, so the
 * description, servings, times, and notes are folded into the instructions.
 */
export function scannedRecipeToPrefill(recipe: ScannedRecipe): RecipePrefill {
  const ingredients = recipe.ingredients
    .map((ing) => {
      const head = [ing.quantity, ing.unit, ing.name]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' ')
      const note = ing.notes.trim()
      if (!head) return note
      return note ? `${head}, ${note}` : head
    })
    .filter(Boolean)
    .join('\n')

  const meta: string[] = []
  if (recipe.servings.trim()) meta.push(`Servings: ${recipe.servings.trim()}`)
  if (recipe.prep_time.trim()) meta.push(`Prep: ${recipe.prep_time.trim()}`)
  if (recipe.cook_time.trim()) meta.push(`Cook: ${recipe.cook_time.trim()}`)

  const steps = recipe.instructions
    .map((step) => step.trim())
    .filter(Boolean)
    .map((step, i) => `${i + 1}. ${step}`)

  const blocks: string[] = []
  if (recipe.description.trim()) blocks.push(recipe.description.trim())
  if (meta.length > 0) blocks.push(meta.join('  •  '))
  if (steps.length > 0) blocks.push(steps.join('\n'))
  if (recipe.notes.trim()) blocks.push(`Notes: ${recipe.notes.trim()}`)

  return {
    name: recipe.title.trim(),
    ingredients,
    instructions: blocks.join('\n\n'),
    tagNames: recipe.tags.map((tag) => tag.trim()).filter(Boolean),
  }
}
