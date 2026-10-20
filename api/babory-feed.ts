import { createHash, timingSafeEqual } from 'node:crypto'
import { serviceHeaders, supabaseServerConfig } from './_lib/household.js'

/**
 * Read-only Babory feed for extended family, opened through a private link
 * (/family?k=<token>). This is the one api/ route that doesn't need a
 * household session: the link token is the credential.
 *
 * The page POSTs { token }. Its SHA-256 is compared in constant time with
 * every non-revoked row of babory_family_links. On a match it returns only
 * what the Babory renders: the baby's name and dates, and the family posts
 * with their shared photos, shared media and milestone titles. Anything else
 * (unknown, revoked or malformed token, wrong method) is a bare 404.
 *
 * Reads go through PostgREST with the service key, sent as `apikey` only for
 * sb_secret_ keys (see _lib/household.ts).
 */

export const maxDuration = 15

const NO_STORE = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' }

function notFound(): Response {
  return new Response(null, { status: 404, headers: NO_STORE })
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...NO_STORE, 'content-type': 'application/json' },
  })
}

// 32 random bytes as base64url is 43 characters.
const TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/

const MEDIA_COLS = 'id,file_path,file_url,file_name,file_type,mime_type,file_size_bytes,duration_seconds,thumbnail_path,caption,share_to_family,sort_order,created_at'
const POST_SELECT =
  `id,entry_id,caption,published_at,` +
  `entry:journal_entries!entry_id(entry_date,media:journal_media!entry_id(${MEDIA_COLS})),` +
  `photos:family_post_photos!family_post_id(id,display_order,entry_photo:entry_photos!entry_photo_id(storage_path))`

interface RawMedia { share_to_family?: boolean; [k: string]: unknown }
interface RawPost {
  id: string
  entry_id: string | null
  caption: string | null
  published_at: string
  entry: { entry_date: string; media?: RawMedia[] | null } | null
  photos: { id: string; display_order: number | null; entry_photo: { storage_path: string } | null }[] | null
}

export async function POST(req: Request): Promise<Response> {
  const { supabaseUrl, serviceKey } = supabaseServerConfig()
  if (!supabaseUrl || !serviceKey) {
    console.log('babory-feed: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured')
    return new Response(null, { status: 500, headers: NO_STORE })
  }

  let token = ''
  try {
    const body = (await req.json()) as { token?: unknown }
    token = typeof body?.token === 'string' ? body.token.trim() : ''
  } catch {
    return notFound()
  }
  if (!TOKEN_RE.test(token)) return notFound()

  const headers = { ...serviceHeaders(serviceKey), Accept: 'application/json' }
  const rest = async <T,>(path: string): Promise<T> => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers })
    // Never echo the response body or the key.
    if (!res.ok) throw new Error(`${path.split('?')[0]}: HTTP ${res.status}`)
    return (await res.json()) as T
  }

  try {
    // 1. Token check: constant-time compare against every active link, no early exit.
    const want = createHash('sha256').update(token, 'utf8').digest()
    const links = await rest<{ token_hash: string }[]>('babory_family_links?select=token_hash&revoked_at=is.null')
    let ok = false
    for (const link of links) {
      const have = Buffer.from(String(link.token_hash || ''), 'hex')
      if (have.length === want.length && timingSafeEqual(have, want)) ok = true
    }
    if (!ok) return notFound()

    // 2. Only what the feed renders.
    const [profiles, posts] = await Promise.all([
      rest<{ name: string | null; due_date: string | null; birth_date: string | null }[]>(
        'baby_profile?select=name,due_date,birth_date&limit=1',
      ),
      rest<RawPost[]>(`family_posts?select=${encodeURIComponent(POST_SELECT)}&order=published_at.desc`),
    ])

    const entryIds = [...new Set(posts.map((p) => p.entry_id).filter((id): id is string => !!id))]
    const milestones = entryIds.length
      ? await rest<{ entry_id: string; title: string }[]>(
          `baby_milestones?select=entry_id,title&entry_id=in.(${entryIds.map(encodeURIComponent).join(',')})`,
        )
      : []
    const milestoneByEntry = new Map(milestones.map((m) => [m.entry_id, m.title]))

    const photoBase = `${supabaseUrl}/storage/v1/object/public/kristory-photos/`
    const out = posts.map((p) => ({
      id: p.id,
      entry_id: p.entry_id,
      caption: p.caption,
      published_at: p.published_at,
      milestone: (p.entry_id && milestoneByEntry.get(p.entry_id)) || null,
      entry: p.entry
        ? {
            entry_date: p.entry.entry_date,
            // Only clips marked "share to family".
            media: (p.entry.media ?? []).filter((m) => m.share_to_family === true),
          }
        : null,
      photos: (p.photos ?? [])
        .filter((ph) => ph.entry_photo?.storage_path)
        .map((ph) => ({
          id: ph.id,
          display_order: ph.display_order ?? 0,
          entry_photo: { storage_path: ph.entry_photo!.storage_path },
          url: photoBase + ph.entry_photo!.storage_path.split('/').map(encodeURIComponent).join('/'),
        })),
    }))

    const profile = profiles[0]
    return json({
      profile: profile ? { name: profile.name, due_date: profile.due_date, birth_date: profile.birth_date } : null,
      posts: out,
    })
  } catch (err) {
    console.log('babory-feed: error:', err instanceof Error ? err.message : String(err))
    return new Response(null, { status: 500, headers: NO_STORE })
  }
}

export function GET(): Response {
  return notFound()
}
