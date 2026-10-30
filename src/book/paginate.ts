import { format, parse } from 'date-fns'
import type { Book } from '../types'
import {
  DPI_HARD,
  DPI_SOFT,
  LAYOUTS,
  chooseLayout,
  effectiveDpi,
  isEntryLayout,
  slotInches,
  trimInches,
  type LayoutId,
} from './catalog'
import { tokensText, type Token } from './text'
import {
  isPortrait,
  photoPixels,
  type AuthorKey,
  type BookPhoto,
  type BookTrip,
  type ItemView,
} from './model'

/**
 * Pages are never stored. This turns the book's items into pages, the same
 * way for the review, preview, print and export screens. Page 1 is a right
 * hand page, so odd pages are right and even pages are left. Covers are not
 * numbered pages; see src/book/layouts/.
 */

export type PageKind = 'title' | 'chapter' | 'entry' | 'continued' | 'blank'

export interface PageBlock {
  sectionId: string
  author: AuthorKey | null
  tokens: Token[]
}

export interface PagePhoto {
  photo: BookPhoto
  focalX: number
  focalY: number
}

/** One day on a two-quiet page. */
export interface QuietHalf {
  itemId: string
  entryDate: string
  badges: AuthorKey[]
  blocks: PageBlock[]
}

export interface BookPage {
  number: number
  side: 'left' | 'right'
  kind: PageKind
  layout: LayoutId
  itemIds: string[]
  /** Photos in slot order. */
  photoIds: string[]
  photos: PagePhoto[]
  blocks: PageBlock[]
  entryDate?: string
  badges: AuthorKey[]
  facts: { label: string; value: string }[]
  caption?: string | null
  quote?: string | null
  dropCap?: boolean
  /** Folio label: the trip, or the month. */
  chapter: string
  milestone?: { title: string } | null
  trip?: BookTrip
  quiet?: QuietHalf[]
  /** True for blanks the paginator added for side rules or an even count. */
  auto?: boolean
}

/**
 * How many words of a page's blocks (in order) fit on it. The DOM version in
 * fit.ts measures the real page; without one, estimates are used.
 */
export type FitFn = (page: BookPage) => number

export type FlagKind = 'no-photo' | 'long-text' | 'low-dpi' | 'duplicate-photo' | 'text-changed'

export interface ItemFlag {
  kind: FlagKind
  severity: 'hard' | 'soft'
  label: string
}

export interface Pagination {
  pages: BookPage[]
  pagesByItem: Map<string, number[]>
  flagsByItem: Map<string, ItemFlag[]>
  includedCount: number
  /** True when text was flowed with real measurements, not estimates. */
  measured: boolean
}

const LONG_TEXT_WORDS = 180
/** Room the second author's rule and spacing take, for estimates. */
const SECOND_AUTHOR_WORDS = 15
const QUIET_MAX_WORDS = LAYOUTS['two-quiet'].textWords

function blockWords(blocks: PageBlock[]) {
  return blocks.reduce((n, b) => n + b.tokens.length, 0)
}

export function pageFitBlocks(page: BookPage): PageBlock[] {
  return page.quiet ? page.quiet.flatMap((q) => q.blocks) : page.blocks
}

function estimateFit(page: BookPage): number {
  const total = blockWords(pageFitBlocks(page))
  if (page.quiet) return page.quiet.every((q) => blockWords(q.blocks) <= QUIET_MAX_WORDS) ? total : 0
  const cap = LAYOUTS[page.layout].textWords - (page.blocks.length > 1 ? SECOND_AUTHOR_WORDS : 0)
  return Math.max(0, Math.min(total, cap))
}

function chapterLabel(v: ItemView): string {
  return v.trip?.title ?? format(parse(v.entry.entry_date, 'yyyy-MM-dd', new Date()), 'MMMM yyyy')
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const m = /^(.+?[.!?])(\s|$)/.exec(flat)
  const s = m ? m[1] : flat
  return s.length > 140 ? s.slice(0, 137).trimEnd() + '...' : s
}

function slotFor(v: ItemView, photo: BookPhoto): PagePhoto {
  const slot = v.photos.find((p) => p.photo.id === photo.id)?.slot
  return { photo, focalX: slot?.focal_x ?? 0.5, focalY: slot?.focal_y ?? 0.5 }
}

interface Cursor {
  blocks: PageBlock[]
  bi: number
  wi: number
}

function remainingBlocks(c: Cursor): PageBlock[] {
  return c.blocks
    .slice(c.bi)
    .map((b, k) => ({ sectionId: b.sectionId, author: b.author, tokens: k === 0 ? b.tokens.slice(c.wi) : b.tokens }))
    .filter((b) => b.tokens.length > 0)
}

function remainingCount(c: Cursor): number {
  return c.blocks.slice(c.bi).reduce((n, b, k) => n + b.tokens.length - (k === 0 ? c.wi : 0), 0)
}

/** Takes n words from the cursor as page blocks and advances it. */
function take(c: Cursor, n: number): PageBlock[] {
  const out: PageBlock[] = []
  let left = n
  while (left > 0 && c.bi < c.blocks.length) {
    const b = c.blocks[c.bi]
    const t = Math.min(b.tokens.length - c.wi, left)
    if (t > 0) out.push({ sectionId: b.sectionId, author: b.author, tokens: b.tokens.slice(c.wi, c.wi + t) })
    c.wi += t
    left -= t
    if (c.wi >= b.tokens.length) {
      c.bi++
      c.wi = 0
    }
  }
  return out
}

function badgesOf(blocks: PageBlock[], fallback: AuthorKey[]): AuthorKey[] {
  const set = [...new Set(blocks.map((b) => b.author).filter((a): a is AuthorKey => !!a))]
  return set.length ? set : fallback
}

export function paginate(book: Book, views: ItemView[], bookTrip?: BookTrip | null, fit?: FitFn | null): Pagination {
  const fitWords: FitFn = fit ?? estimateFit
  const pages: BookPage[] = []
  const pagesByItem = new Map<string, number[]>()

  const push = (p: Omit<BookPage, 'number' | 'side'>) => {
    const number = pages.length + 1
    const page: BookPage = { ...p, number, side: number % 2 === 1 ? 'right' : 'left' }
    pages.push(page)
    for (const id of p.itemIds) {
      const list = pagesByItem.get(id) ?? []
      list.push(number)
      pagesByItem.set(id, list)
    }
    return page
  }
  const nextSide = () => ((pages.length + 1) % 2 === 1 ? 'right' : 'left')
  const blank = (): Omit<BookPage, 'number' | 'side'> => ({
    kind: 'blank', layout: 'blank', itemIds: [], photoIds: [], photos: [], blocks: [], badges: [], facts: [], chapter: '', auto: true,
  })
  const ensureSide = (side: 'left' | 'right') => {
    if (nextSide() !== side) push(blank())
  }
  // A page about to be pushed, with the number and side it will get.
  const draft = (p: Omit<BookPage, 'number' | 'side'>): BookPage => ({
    ...p,
    number: pages.length + 1,
    side: nextSide(),
  })

  const placeEntry = (v: ItemView) => {
    const withText = v.sections.filter((s) => s.words > 0)
    const allPhotos = v.photos.map((p) => p.photo)
    const parts =
      v.item.split_authors && withText.length > 1
        ? withText.map((s, k) => ({ sections: [s], photos: k === 0 ? allPhotos : [] }))
        : [{ sections: withText, photos: allPhotos }]
    const chapter = chapterLabel(v)
    const entryBadges = v.authors

    parts.forEach((part, k) => {
      const cursor: Cursor = {
        blocks: part.sections.map((s) => ({ sectionId: s.section.id, author: s.author, tokens: s.tokens })),
        bi: 0,
        wi: 0,
      }
      const words = remainingCount(cursor)
      const override = k === 0 && isEntryLayout(v.item.layout_override) ? v.item.layout_override : null
      const layout =
        override ??
        chooseLayout({
          photoCount: part.photos.length,
          portraitCount: part.photos.filter(isPortrait).length,
          words,
          milestone: k === 0 && !!v.milestone,
        })
      const def = LAYOUTS[layout]
      const placed = part.photos.slice(0, def.slots.length)
      let rest = part.photos.slice(def.slots.length)
      const partBadges = badgesOf(remainingBlocks(cursor), entryBadges)

      const base = {
        itemIds: [v.item.id],
        entryDate: v.entry.entry_date,
        chapter,
      }

      // First page of this part.
      const first = draft({
        ...base,
        kind: 'entry',
        layout,
        photoIds: placed.map((p) => p.id),
        photos: placed.map((p) => slotFor(v, p)),
        blocks: def.text === 'body' ? remainingBlocks(cursor) : [],
        badges: partBadges,
        facts: k === 0 && def.facts ? v.facts : [],
        caption: def.text === 'caption' || layout === 'navy-frame' ? v.item.caption_override : null,
        quote: def.text === 'quote' ? v.item.caption_override || firstSentence(tokensText(remainingBlocks(cursor)[0]?.tokens ?? [])) : null,
        dropCap: layout === 'text-day' && k === 0,
        milestone: k === 0 && v.milestone ? { title: v.milestone.title } : null,
      })
      if (def.text === 'body' && first.blocks.length) {
        const n = Math.min(fitWords(first), remainingCount(cursor))
        first.blocks = take(cursor, n)
      }
      push(first)

      // Text that does not fit continues on text pages.
      let guard = 0
      while (remainingCount(cursor) > 0 && guard++ < 200) {
        const page = draft({
          ...base,
          kind: 'continued',
          layout: 'text-day',
          photoIds: [],
          photos: [],
          blocks: remainingBlocks(cursor),
          badges: partBadges,
          facts: [],
          dropCap: false,
        })
        const n = Math.max(1, Math.min(fitWords(page), remainingCount(cursor)))
        page.blocks = take(cursor, n)
        push(page)
      }

      // Photos that do not fit continue on photo pages.
      while (rest.length > 0) {
        const chunk = rest.slice(0, 4)
        const next = chooseLayout({
          photoCount: chunk.length,
          portraitCount: chunk.filter(isPortrait).length,
          words: 0,
          milestone: false,
        })
        const n = LAYOUTS[next].slots.length
        const more = rest.slice(0, n)
        push({
          ...base,
          kind: 'continued',
          layout: next,
          photoIds: more.map((p) => p.id),
          photos: more.map((p) => slotFor(v, p)),
          blocks: [],
          badges: partBadges,
          facts: [],
        })
        rest = rest.slice(n)
      }
    })
  }

  const included = views.filter((v) => v.item.included)

  push({ kind: 'title', layout: 'title', itemIds: [], photoIds: [], photos: [], blocks: [], badges: [], facts: [], chapter: '' })

  // The opener shows the trip's cover photo, else the trip's first photo.
  const photoByPath = new Map<string, BookPhoto>()
  for (const v of views) for (const p of v.photos) photoByPath.set(p.photo.storage_path, p.photo)
  const opener = (trip: BookTrip) => {
    const cover =
      (trip.cover_photo_path ? photoByPath.get(trip.cover_photo_path) : undefined) ??
      included.find((v) => v.trip?.id === trip.id && v.photos.length > 0)?.photos[0].photo
    push({
      kind: 'chapter',
      layout: 'opener',
      itemIds: [],
      photoIds: [],
      photos: cover ? [{ photo: cover, focalX: 0.5, focalY: 0.5 }] : [],
      blocks: [],
      badges: [],
      facts: [],
      chapter: trip.title,
      trip,
    })
  }

  let currentTrip: string | null = null
  if (book.trip_id && bookTrip) {
    ensureSide('right')
    opener(bookTrip)
    currentTrip = bookTrip.id
  }

  // A short, photo-free day that could share a page.
  const quietCandidate = (v: ItemView) =>
    v.photos.length === 0 && !v.milestone && !v.item.layout_override && !v.item.split_authors && !v.item.pin_side && v.words > 0

  for (let i = 0; i < included.length; i++) {
    const v = included[i]
    const tripId = v.trip?.id ?? null
    if (!book.trip_id && tripId !== currentTrip) {
      if (v.trip) {
        ensureSide('right')
        opener(v.trip)
      }
      currentTrip = tripId
    }

    if (v.item.pin_side) ensureSide(v.item.pin_side)

    const next = included[i + 1]
    if (quietCandidate(v) && next && quietCandidate(next) && (book.trip_id || (next.trip?.id ?? null) === tripId)) {
      const half = (x: ItemView): QuietHalf => {
        const blocks = x.sections
          .filter((s) => s.words > 0)
          .map((s) => ({ sectionId: s.section.id, author: s.author, tokens: s.tokens }))
        return { itemId: x.item.id, entryDate: x.entry.entry_date, badges: badgesOf(blocks, x.authors), blocks }
      }
      const page = draft({
        kind: 'entry',
        layout: 'two-quiet',
        itemIds: [v.item.id, next.item.id],
        photoIds: [],
        photos: [],
        blocks: [],
        badges: [],
        facts: [],
        chapter: chapterLabel(v),
        quiet: [half(v), half(next)],
      })
      const total = blockWords(pageFitBlocks(page))
      if (fitWords(page) >= total) {
        push(page)
        i++
        continue
      }
    }

    placeEntry(v)
  }

  if (pages.length % 2 === 1) push(blank())

  return {
    pages,
    pagesByItem,
    flagsByItem: flagItems(book, views, pages),
    includedCount: included.length,
    measured: !!fit,
  }
}

function flagItems(book: Book, views: ItemView[], pages: BookPage[]): Map<string, ItemFlag[]> {
  const trim = trimInches(book.trim_size)
  const bleed = Number(book.bleed_in) || 0

  // Lowest DPI each item's photos get in the slots they landed in.
  const minDpi = new Map<string, number>()
  for (const page of pages) {
    const slots = LAYOUTS[page.layout].slots
    page.photos.forEach(({ photo }, j) => {
      const px = photoPixels(photo)
      const slot = slots[j]
      if (!px || !slot) return
      const dpi = effectiveDpi(px, slotInches(slot, trim, bleed))
      for (const itemId of page.itemIds) {
        minDpi.set(itemId, Math.min(minDpi.get(itemId) ?? Infinity, dpi))
      }
    })
  }

  // Photos used by more than one included item.
  const uses = new Map<string, number>()
  for (const v of views) {
    if (!v.item.included) continue
    for (const id of new Set(v.photos.map((p) => p.photo.id))) uses.set(id, (uses.get(id) ?? 0) + 1)
  }

  const out = new Map<string, ItemFlag[]>()
  for (const v of views) {
    const flags: ItemFlag[] = []
    if (v.photos.length === 0) flags.push({ kind: 'no-photo', severity: 'soft', label: 'No photo' })
    if (v.words > LONG_TEXT_WORDS) flags.push({ kind: 'long-text', severity: 'soft', label: `${v.words} words` })
    const dpi = minDpi.get(v.item.id)
    if (dpi !== undefined && dpi < DPI_SOFT) {
      flags.push({
        kind: 'low-dpi',
        severity: dpi < DPI_HARD ? 'hard' : 'soft',
        label: `${Math.round(dpi)} DPI`,
      })
    }
    if (v.item.included && v.photos.some((p) => (uses.get(p.photo.id) ?? 0) > 1)) {
      flags.push({ kind: 'duplicate-photo', severity: 'soft', label: 'Duplicate photo' })
    }
    if (v.textChanged) flags.push({ kind: 'text-changed', severity: 'hard', label: 'Text changed since hiding' })
    out.set(v.item.id, flags)
  }
  return out
}
