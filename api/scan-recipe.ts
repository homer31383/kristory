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
 *
 * Diagnostics: every failure path logs a single `scan-recipe:` line to the
 * Vercel function logs AND returns a `code` + `debug` object to the client,
 * which mirrors it to the browser console. That way a failed scan can be
 * diagnosed from the browser alone.
 */

export const maxDuration = 60

// Image media types accepted by the Anthropic vision API.
const ALLOWED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
type MediaType = (typeof ALLOWED_MEDIA_TYPES)[number]

const MAX_IMAGES = 5
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 4000

// Anthropic rejects a single image over 5 MB; Vercel serverless bodies cap at
// ~4.5 MB. Log loudly when a request is near either limit.
const IMAGE_BYTES_WARN = 5 * 1024 * 1024
const BODY_BYTES_WARN = 4 * 1024 * 1024

// How much of the raw model response to keep in logs / debug payloads.
const LOG_TEXT_LIMIT = 4000
const DEBUG_TEXT_LIMIT = 1500

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

function errorResponse(
  message: string,
  status: number,
  code: ScanErrorCode,
  debug: Record<string, unknown> = {},
): Response {
  return jsonResponse({ error: message, code, debug }, status)
}

/** One-line structured log so Vercel's log viewer shows the whole picture. */
function log(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown> = {}) {
  const line = `scan-recipe: ${event} ${JSON.stringify(data)}`
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}… [truncated, ${text.length} chars total]` : text
}

/** Approximate decoded byte size of a base64 string. */
function base64Bytes(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - padding
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
function extractRecipeObject(text: string): { object: Record<string, unknown> | null; parseError?: string } {
  let body = text.trim()
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) body = fenced[1].trim()

  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) {
    return { object: null, parseError: 'no `{...}` object found in response text' }
  }

  try {
    const parsed: unknown = JSON.parse(body.slice(start, end + 1))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { object: parsed as Record<string, unknown> }
    }
    return { object: null, parseError: `parsed JSON was ${Array.isArray(parsed) ? 'an array' : typeof parsed}, not an object` }
  } catch (err) {
    return { object: null, parseError: `JSON.parse failed: ${err instanceof Error ? err.message : String(err)}` }
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

/** Map an Anthropic SDK error to a code, HTTP status, message, and debug payload. */
function classifyApiError(err: unknown): {
  code: ScanErrorCode
  status: number
  message: string
  debug: Record<string, unknown>
} {
  // Most specific first: timeout → connection → rate limit → any API status error.
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return {
      code: 'timeout',
      status: 504,
      message: 'The recipe scanner timed out. Try fewer or smaller photos.',
      debug: { sdk_error: err.name, message: err.message },
    }
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return {
      code: 'connection_error',
      status: 502,
      message: 'The recipe scanner could not reach the vision service. Please try again.',
      debug: { sdk_error: err.name, message: err.message, cause: String(err.cause ?? '') },
    }
  }
  if (err instanceof Anthropic.RateLimitError) {
    return {
      code: 'rate_limited',
      status: 429,
      message: 'The recipe scanner is busy right now. Wait a moment and try again.',
      debug: {
        sdk_error: err.name,
        status: err.status,
        request_id: err.requestID ?? null,
        retry_after: err.headers?.get('retry-after') ?? null,
        api_error: err.error ?? null,
      },
    }
  }
  if (err instanceof Anthropic.APIError) {
    return {
      code: 'api_error',
      status: 502,
      message: `The vision service returned an error (${err.status ?? 'unknown status'}). Please try again.`,
      debug: {
        sdk_error: err.name,
        status: err.status ?? null,
        request_id: err.requestID ?? null,
        api_error: err.error ?? null,
        message: err.message,
      },
    }
  }
  return {
    code: 'unknown',
    status: 502,
    message: 'The recipe scanner is unavailable right now. Please try again.',
    debug: {
      error_type: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? truncate(err.stack ?? '', 1500) : undefined,
    },
  }
}

export async function POST(req: Request): Promise<Response> {
  const startedAt = Date.now()
  const apiKey = process.env.ANTHROPIC_API_KEY
  log('info', 'invoked', {
    api_key_present: !!apiKey,
    content_length: req.headers.get('content-length'),
    content_type: req.headers.get('content-type'),
  })

  if (!apiKey) {
    log('error', 'missing ANTHROPIC_API_KEY')
    return errorResponse('The recipe scanner is not configured on the server.', 500, 'not_configured')
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch (err) {
    log('error', 'request body is not valid JSON', {
      message: err instanceof Error ? err.message : String(err),
    })
    return errorResponse('Invalid request body.', 400, 'bad_request')
  }

  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>
  const images = parseImages(body.images)
  if (!images) {
    log('error', 'no usable images in payload', {
      images_type: Array.isArray(body.images) ? `array(${body.images.length})` : typeof body.images,
    })
    return errorResponse('No images provided.', 400, 'bad_request')
  }
  if (images.length > MAX_IMAGES) {
    log('error', 'too many images', { count: images.length })
    return errorResponse(`Please use at most ${MAX_IMAGES} photos.`, 400, 'bad_request')
  }

  // ── Image diagnostics ────────────────────────────────────────────────────
  const imageStats = images.map((img, i) => {
    const bytes = base64Bytes(img.image)
    return {
      index: i,
      media_type: img.media_type,
      base64_chars: img.image.length,
      approx_kb: Math.round(bytes / 1024),
      // A base64 body that isn't valid base64 (e.g. still has a data: prefix)
      // is a common way to get an opaque 400 from the API.
      looks_like_data_url: img.image.startsWith('data:'),
      has_whitespace: /\s/.test(img.image),
    }
  })
  const totalBytes = imageStats.reduce((sum, s) => sum + s.approx_kb * 1024, 0)
  log('info', 'images received', {
    count: images.length,
    total_kb: Math.round(totalBytes / 1024),
    images: imageStats,
  })
  for (const s of imageStats) {
    if (s.approx_kb * 1024 > IMAGE_BYTES_WARN) {
      log('warn', 'image exceeds Anthropic 5MB per-image limit', { index: s.index, approx_kb: s.approx_kb })
    }
    if (s.looks_like_data_url || s.has_whitespace) {
      log('warn', 'image base64 looks malformed', { index: s.index, looks_like_data_url: s.looks_like_data_url, has_whitespace: s.has_whitespace })
    }
  }
  if (totalBytes > BODY_BYTES_WARN) {
    log('warn', 'total payload near Vercel body limit', { total_kb: Math.round(totalBytes / 1024) })
  }

  // All pages go into one message as separate image blocks, so Claude sees the
  // whole recipe at once and combines them.
  const content: Anthropic.ContentBlockParam[] = images.map((img) => ({
    type: 'image',
    source: { type: 'base64', media_type: img.media_type, data: img.image },
  }))
  content.push({ type: 'text', text: buildPrompt(images.length) })

  const client = new Anthropic({ apiKey })

  // ── Model call ───────────────────────────────────────────────────────────
  let message: Anthropic.Message
  const callStartedAt = Date.now()
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content }],
    })
  } catch (err) {
    const classified = classifyApiError(err)
    log('error', 'Anthropic API call failed', {
      code: classified.code,
      elapsed_ms: Date.now() - callStartedAt,
      image_count: images.length,
      total_kb: Math.round(totalBytes / 1024),
      ...classified.debug,
    })
    return errorResponse(classified.message, classified.status, classified.code, {
      ...classified.debug,
      elapsed_ms: Date.now() - callStartedAt,
    })
  }

  const apiElapsed = Date.now() - callStartedAt
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')

  const responseSummary = {
    message_id: message.id,
    model: message.model,
    stop_reason: message.stop_reason,
    stop_details: message.stop_reason === 'refusal' ? (message.stop_details ?? null) : undefined,
    content_block_types: message.content.map((b) => b.type),
    text_length: text.length,
    usage: message.usage,
    elapsed_ms: apiElapsed,
  }
  log('info', 'Anthropic API responded', responseSummary)

  if (message.stop_reason === 'max_tokens') {
    log('warn', 'response was cut off at max_tokens; JSON is likely truncated', {
      max_tokens: MAX_TOKENS,
      output_tokens: message.usage.output_tokens,
    })
  }

  if (message.stop_reason === 'refusal') {
    log('error', 'model refused the request', { ...responseSummary, text: truncate(text, LOG_TEXT_LIMIT) })
    return errorResponse('The vision service declined to read these photos.', 502, 'refusal', {
      ...responseSummary,
      text_preview: truncate(text, DEBUG_TEXT_LIMIT),
    })
  }

  // ── Parse ────────────────────────────────────────────────────────────────
  const { object: raw, parseError } = extractRecipeObject(text)
  if (!raw) {
    log('error', 'could not parse a JSON object from model response', {
      ...responseSummary,
      parse_error: parseError,
      text: truncate(text, LOG_TEXT_LIMIT),
    })
    return errorResponse('Could not read a recipe from these photos.', 502, 'no_json', {
      ...responseSummary,
      parse_error: parseError,
      text_preview: truncate(text, DEBUG_TEXT_LIMIT),
    })
  }

  const recipe = normalizeRecipe(raw)
  if (!recipe.title && recipe.ingredients.length === 0 && recipe.instructions.length === 0) {
    log('error', 'model returned an empty recipe', {
      ...responseSummary,
      raw_keys: Object.keys(raw),
      raw: truncate(JSON.stringify(raw), LOG_TEXT_LIMIT),
    })
    return errorResponse('Could not read a recipe from these photos.', 502, 'empty_recipe', {
      ...responseSummary,
      raw_keys: Object.keys(raw),
      raw_preview: truncate(JSON.stringify(raw), DEBUG_TEXT_LIMIT),
    })
  }

  log('info', 'extracted recipe', {
    title: recipe.title || '(untitled)',
    ingredients: recipe.ingredients.length,
    instructions: recipe.instructions.length,
    notes_flag_unclear: /unclear/i.test(recipe.notes),
    total_elapsed_ms: Date.now() - startedAt,
  })
  return jsonResponse({ recipe }, 200)
}
