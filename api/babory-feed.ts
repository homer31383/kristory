import { NO_STORE, jsonResponse, readSession, serviceClient, sessionSecret } from './_lib/babory.js'
import { supabaseServerConfig } from './_lib/household.js'

/**
 * Read-only Babory feed for extended family who unlocked /family with the
 * family PIN (api/babory-unlock.ts). GET only; the credential is the signed
 * `babory_session` cookie. It must be authentic, unexpired, and carry the
 * current babory_family_pin.version (a PIN change signs everyone out).
 * Otherwise: 401 with no body data.
 *
 * Returns only what the Babory renders: the baby's name and dates, and the
 * family posts with their shared photos (public URLs), share_to_family clips
 * and milestone titles. Always Cache-Control: no-store.
 */

export const maxDuration = 15

function unauthorized(): Response {
  return new Response(null, { status: 401, headers: NO_STORE })
}

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

export async function GET(req: Request): Promise<Response> {
  const secret = sessionSecret()
  if (!secret) return new Response(null, { status: 500, headers: NO_STORE })
  const db = serviceClient()
  if (!db) return new Response(null, { status: 500, headers: NO_STORE })
  const { supabaseUrl } = supabaseServerConfig()

  const version = readSession(req, secret)
  if (version === null) return unauthorized()

  const rest = db.rest
  try {
    // 1. The cookie's PIN version must still be current.
    const pins = await rest<{ version: number }[]>('babory_family_pin?select=version&id=eq.true&limit=1')
    if (!pins[0] || pins[0].version !== version) return unauthorized()

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
    return jsonResponse({
      profile: profile ? { name: profile.name, due_date: profile.due_date, birth_date: profile.birth_date } : null,
      posts: out,
    }, 200)
  } catch (err) {
    console.log('babory-feed: error:', err instanceof Error ? err.message : String(err))
    return new Response(null, { status: 500, headers: NO_STORE })
  }
}
