/**
 * Lookup books from Open Library and Google Books — both are no-key public
 * APIs. Results are merged and deduplicated by normalized (title, author);
 * Open Library wins when both sources have the same book (its cover images
 * tend to be sharper).
 */

export interface BookLookupResult {
  title: string
  author: string | null
  coverUrl: string | null
  description: string | null
  isbn: string | null
  pageCount: number | null
  source: 'openlibrary' | 'googlebooks'
}

const REQUEST_TIMEOUT_MS = 8000

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function dedupKey(r: { title: string; author: string | null }): string {
  return norm(r.title) + '||' + norm(r.author)
}

async function searchOpenLibrary(query: string): Promise<BookLookupResult[]> {
  type OLDoc = {
    title?: string
    author_name?: string[]
    cover_i?: number
    isbn?: string[]
    number_of_pages_median?: number
    first_sentence?: string[]
    subtitle?: string
  }
  type OLResp = { docs?: OLDoc[] }

  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`
  try {
    const json = (await fetchJson(url)) as OLResp
    return (json.docs ?? []).map((d): BookLookupResult => ({
      title: d.title ?? '(untitled)',
      author: d.author_name?.[0] ?? null,
      coverUrl: d.cover_i
        ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg`
        : null,
      description: d.first_sentence?.[0] ?? null,
      isbn: d.isbn?.[0] ?? null,
      pageCount: d.number_of_pages_median ?? null,
      source: 'openlibrary',
    }))
  } catch {
    return []
  }
}

async function searchGoogleBooks(query: string): Promise<BookLookupResult[]> {
  type GBItem = {
    volumeInfo?: {
      title?: string
      authors?: string[]
      description?: string
      imageLinks?: { thumbnail?: string; smallThumbnail?: string }
      industryIdentifiers?: { type: string; identifier: string }[]
      pageCount?: number
    }
  }
  type GBResp = { items?: GBItem[] }

  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`
  try {
    const json = (await fetchJson(url)) as GBResp
    return (json.items ?? []).map((it): BookLookupResult => {
      const v = it.volumeInfo ?? {}
      // Google's thumbnails come over http often — upgrade.
      const thumb = (v.imageLinks?.thumbnail ?? v.imageLinks?.smallThumbnail ?? null)
      const coverUrl = thumb ? thumb.replace(/^http:/, 'https:') : null
      const isbn13 = v.industryIdentifiers?.find((i) => i.type === 'ISBN_13')?.identifier
      const isbn10 = v.industryIdentifiers?.find((i) => i.type === 'ISBN_10')?.identifier
      return {
        title: v.title ?? '(untitled)',
        author: v.authors?.[0] ?? null,
        coverUrl,
        description: v.description ?? null,
        isbn: isbn13 ?? isbn10 ?? null,
        pageCount: v.pageCount ?? null,
        source: 'googlebooks',
      }
    })
  } catch {
    return []
  }
}

/**
 * Pick the best free-text description for a book — Google Books wins because
 * its `description` is typically a full back-cover blurb. Open Library's
 * `first_sentence` is the fallback (one sentence, but real text). Used by the
 * batch "Generate All" flow to avoid spending Claude tokens when a perfectly
 * good description is already available for free.
 */
export async function lookupBookDescription(
  title: string,
  author: string | null,
): Promise<string | null> {
  const query = author ? `${title} ${author}` : title

  // Google Books first — its descriptions are substantive blurbs.
  type GBItem = { volumeInfo?: { description?: string } }
  type GBResp = { items?: GBItem[] }
  try {
    const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(
      query,
    )}&maxResults=3`
    const gb = (await fetchJson(gbUrl)) as GBResp
    for (const it of gb.items ?? []) {
      const desc = it.volumeInfo?.description
      if (desc && desc.trim().length > 50) return desc.trim()
    }
  } catch {
    // fall through to Open Library
  }

  type OLDoc = { first_sentence?: string[] }
  type OLResp = { docs?: OLDoc[] }
  try {
    const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=3`
    const ol = (await fetchJson(olUrl)) as OLResp
    for (const d of ol.docs ?? []) {
      const s = d.first_sentence?.[0]
      if (s && s.trim().length > 30) return s.trim()
    }
  } catch {
    // ignore
  }
  return null
}

/** Search both providers, merge, prefer Open Library when both have it. */
export async function searchBooks(query: string): Promise<BookLookupResult[]> {
  if (!query.trim()) return []
  const [ol, gb] = await Promise.all([searchOpenLibrary(query), searchGoogleBooks(query)])

  const map = new Map<string, BookLookupResult>()
  // Insert OL first so subsequent same-key writes from GB are blocked.
  for (const r of ol) map.set(dedupKey(r), r)
  for (const r of gb) {
    const k = dedupKey(r)
    if (!map.has(k)) map.set(k, r)
    else {
      // Merge: keep OL cover/title/author, take GB description if OL had none.
      const existing = map.get(k)!
      if (!existing.description && r.description) existing.description = r.description
      if (!existing.pageCount && r.pageCount) existing.pageCount = r.pageCount
      if (!existing.isbn && r.isbn) existing.isbn = r.isbn
    }
  }
  return [...map.values()].slice(0, 8)
}
