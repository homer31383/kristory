import type { RecipePrefill } from '../components/AddRecipeSheet'

/**
 * Client helper for the `/api/scan-recipe` Vercel function, which extracts a
 * structured recipe from a photo via Claude's vision.
 *
 * Diagnostics: every request and failure is logged to the browser console
 * under the `[scan-recipe]` prefix, including the server's `debug` payload
 * (model stop reason, usage, response preview, Anthropic request id, etc.).
 * Open DevTools → Console and filter on `scan-recipe` to see it.
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

/** Error codes the server can return, plus ones only the client can produce. */
export type ScanErrorCode =
  | 'not_configured'
  | 'bad_request'
  | 'refusal'
  | 'no_json'
  | 'empty_recipe'
  | 'timeout'
  | 'rate_limited'
  | 'api_error'
  | 'connection_error'
  | 'unknown'
  | 'client_timeout'
  | 'network_error'
  | 'payload_too_large'
  | 'bad_response'

export class ScanRecipeError extends Error {
  code: ScanErrorCode
  status: number | null
  debug: Record<string, unknown>

  constructor(message: string, code: ScanErrorCode, status: number | null = null, debug: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ScanRecipeError'
    this.code = code
    this.status = status
    this.debug = debug
  }
}

// Kept just under the serverless function's 60s maxDuration.
const TIMEOUT_MS = 55000

// Vercel serverless request bodies cap at ~4.5 MB.
const BODY_BYTES_WARN = 4 * 1024 * 1024

export interface ScanImageInput {
  /** Base64-encoded image data, without the `data:...;base64,` prefix. */
  image: string
  media_type: string
}

const TAG = '[scan-recipe]'

function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
}

/** Send one or more recipe-page images to the scanner as a single recipe. */
export async function scanRecipe(images: ScanImageInput[]): Promise<ScannedRecipe> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const startedAt = Date.now()

  const body = JSON.stringify({ images })
  const imageStats = images.map((img, i) => ({
    index: i,
    media_type: img.media_type,
    approx_kb: Math.round(base64Bytes(img.image) / 1024),
    base64_chars: img.image.length,
    looks_like_data_url: img.image.startsWith('data:'),
  }))
  const bodyKb = Math.round(body.length / 1024)
  console.log(`${TAG} sending`, { image_count: images.length, body_kb: bodyKb, images: imageStats })
  if (body.length > BODY_BYTES_WARN) {
    console.warn(`${TAG} request body is ${bodyKb} KB, near Vercel's ~4.5 MB limit; expect a 413 if it's over`)
  }

  try {
    let res: Response
    try {
      res = await fetch('/api/scan-recipe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      })
    } catch (err) {
      const elapsed = Date.now() - startedAt
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.error(`${TAG} client-side timeout after ${elapsed} ms (limit ${TIMEOUT_MS} ms); no response from /api/scan-recipe`, { image_count: images.length, body_kb: bodyKb })
        throw new ScanRecipeError('The scan timed out before the server answered. Try fewer or smaller photos.', 'client_timeout', null, { elapsed_ms: elapsed })
      }
      console.error(`${TAG} network error calling /api/scan-recipe after ${elapsed} ms`, err)
      throw new ScanRecipeError('Could not reach the recipe scanner. Check your connection and try again.', 'network_error', null, {
        elapsed_ms: elapsed,
        message: err instanceof Error ? err.message : String(err),
      })
    }

    const elapsed = Date.now() - startedAt
    const contentType = res.headers.get('content-type') ?? ''
    const rawText = await res.text().catch(() => '')

    let data: { recipe?: ScannedRecipe; error?: string; code?: ScanErrorCode; debug?: Record<string, unknown> } | null = null
    try {
      data = rawText ? JSON.parse(rawText) : null
    } catch {
      data = null
    }

    if (!res.ok) {
      // A non-JSON body here almost always means the request never reached our
      // function: Vercel's own 413 (payload too large), 504 (gateway timeout),
      // or an HTML error page.
      const bodyPreview = rawText.slice(0, 600)
      console.error(`${TAG} server responded ${res.status} after ${elapsed} ms`, {
        status: res.status,
        content_type: contentType,
        code: data?.code ?? '(no code – body was not our JSON)',
        error: data?.error ?? null,
        debug: data?.debug ?? null,
        body_preview: data ? undefined : bodyPreview,
        image_count: images.length,
        body_kb: bodyKb,
      })

      if (res.status === 413) {
        throw new ScanRecipeError('Those photos are too large to upload together. Try fewer photos.', 'payload_too_large', 413, { body_kb: bodyKb })
      }
      if (data?.error) {
        throw new ScanRecipeError(data.error, data.code ?? 'unknown', res.status, data.debug ?? {})
      }
      const code: ScanErrorCode = res.status === 504 ? 'timeout' : 'unknown'
      throw new ScanRecipeError(`The recipe scanner failed (HTTP ${res.status}).`, code, res.status, { body_preview: bodyPreview })
    }

    if (!data || !data.recipe || typeof data.recipe !== 'object') {
      console.error(`${TAG} 200 response but no recipe in body after ${elapsed} ms`, {
        content_type: contentType,
        body_preview: rawText.slice(0, 600),
      })
      throw new ScanRecipeError('The scanner returned an unexpected response.', 'bad_response', res.status, {
        body_preview: rawText.slice(0, 600),
      })
    }

    console.log(`${TAG} success after ${elapsed} ms`, {
      title: data.recipe.title || '(untitled)',
      ingredients: data.recipe.ingredients?.length ?? 0,
      instructions: data.recipe.instructions?.length ?? 0,
    })
    return data.recipe
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Turn any scan failure into a message for the modal. Server-provided
 * messages are already user-friendly; anything else gets a generic fallback.
 */
export function scanErrorMessage(err: unknown): string {
  if (err instanceof ScanRecipeError) {
    switch (err.code) {
      case 'no_json':
      case 'empty_recipe':
        return "Couldn't read the recipe. Try clearer photos or add manually."
      default:
        return err.message
    }
  }
  return "Couldn't read the recipe. Try clearer photos or add manually."
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
