import type { Book } from '../types'
import {
  DPI_HARD,
  DPI_SOFT,
  LAYOUTS,
  chooseLayout,
  effectiveDpi,
  isLayoutId,
  slotInches,
  trimInches,
  type LayoutId,
} from './layouts'
import { isPortrait, photoPixels, type AuthorKey, type BookPhoto, type BookTrip, type ItemView } from './model'

/**
 * Pages are never stored. This turns the book's items into pages, the same
 * way for the review, preview, print and export screens. Page 1 is a right
 * hand page, so odd pages are right and even pages are left.
 */

export type PageKind = 'title' | 'chapter' | 'entry' | 'continued' | 'blank'

export interface BookPage {
  number: number
  side: 'left' | 'right'
  kind: PageKind
  layout: LayoutId
  itemIds: string[]
  /** Photos in slot order. */
  photoIds: string[]
  /** Set on a page that carries one author of a split entry. */
  author?: AuthorKey | null
  trip?: BookTrip
  /** True for blanks the paginator added for side rules or an even count. */
  auto?: boolean
}

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
}

const TEXT_PAGE_WORDS = LAYOUTS.text.textWords
const QUIET_WORDS = LAYOUTS['two-quiet'].textWords
const LONG_TEXT_WORDS = 180
/** Room the second author's header takes on a merged page. */
const SECOND_AUTHOR_WORDS = 15

function isQuiet(v: ItemView): boolean {
  return (
    v.photos.length === 0 &&
    !v.milestone &&
    !v.item.layout_override &&
    !v.item.split_authors &&
    v.words <= QUIET_WORDS
  )
}

export function paginate(book: Book, views: ItemView[], bookTrip?: BookTrip | null): Pagination {
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
  }
  const nextSide = () => ((pages.length + 1) % 2 === 1 ? 'right' : 'left')
  const ensureSide = (side: 'left' | 'right') => {
    if (nextSide() !== side) push({ kind: 'blank', layout: 'blank', itemIds: [], photoIds: [], auto: true })
  }

  const placePhotos = (layout: LayoutId, photos: BookPhoto[]) => {
    const n = LAYOUTS[layout].slots.length
    return { placed: photos.slice(0, n), rest: photos.slice(n) }
  }

  const placeEntry = (v: ItemView) => {
    const withText = v.sections.filter((s) => s.words > 0)
    const parts =
      v.item.split_authors && withText.length > 1
        ? withText.map((s, k) => ({ sections: [s], photos: k === 0 ? v.photos.map((p) => p.photo) : [] }))
        : [{ sections: v.sections, photos: v.photos.map((p) => p.photo) }]

    parts.forEach((part, k) => {
      const words = part.sections.reduce((n, s) => n + s.words, 0)
      const override = k === 0 && isLayoutId(v.item.layout_override) ? v.item.layout_override : null
      const layout =
        override ??
        chooseLayout({
          photoCount: part.photos.length,
          portraitCount: part.photos.filter(isPortrait).length,
          words,
          milestone: k === 0 && !!v.milestone,
        })
      const { placed, rest } = placePhotos(layout, part.photos)
      const author = parts.length > 1 ? part.sections[0]?.author ?? null : undefined
      push({ kind: 'entry', layout, itemIds: [v.item.id], photoIds: placed.map((p) => p.id), author })

      // Text that does not fit continues on text pages.
      const capacity = LAYOUTS[layout].textWords - (part.sections.length > 1 ? SECOND_AUTHOR_WORDS : 0)
      for (let extra = words - Math.max(capacity, 0); extra > 0; extra -= TEXT_PAGE_WORDS) {
        push({ kind: 'continued', layout: 'text', itemIds: [v.item.id], photoIds: [], author })
      }

      // Photos that do not fit continue on photo pages.
      let remaining = rest
      while (remaining.length > 0) {
        const chunk = remaining.slice(0, 4)
        const next = chooseLayout({
          photoCount: chunk.length,
          portraitCount: chunk.filter(isPortrait).length,
          words: 0,
          milestone: false,
        })
        const placedMore = placePhotos(next, remaining)
        push({ kind: 'continued', layout: next, itemIds: [v.item.id], photoIds: placedMore.placed.map((p) => p.id), author })
        remaining = placedMore.rest
      }
    })
  }

  const included = views.filter((v) => v.item.included)

  push({ kind: 'title', layout: 'title', itemIds: [], photoIds: [] })

  let currentTrip: string | null = null
  if (book.trip_id && bookTrip) {
    ensureSide('right')
    push({ kind: 'chapter', layout: 'chapter-opener', itemIds: [], photoIds: [], trip: bookTrip })
    currentTrip = bookTrip.id
  }

  for (let i = 0; i < included.length; i++) {
    const v = included[i]
    const tripId = v.trip?.id ?? null
    if (!book.trip_id && tripId !== currentTrip) {
      if (v.trip) {
        ensureSide('right')
        push({ kind: 'chapter', layout: 'chapter-opener', itemIds: [], photoIds: [], trip: v.trip })
      }
      currentTrip = tripId
    }

    if (v.item.pin_side) ensureSide(v.item.pin_side)

    const next = included[i + 1]
    if (
      isQuiet(v) &&
      next &&
      isQuiet(next) &&
      !next.item.pin_side &&
      (book.trip_id || (next.trip?.id ?? null) === tripId)
    ) {
      push({ kind: 'entry', layout: 'two-quiet', itemIds: [v.item.id, next.item.id], photoIds: [] })
      i++
      continue
    }

    placeEntry(v)
  }

  if (pages.length % 2 === 1) push({ kind: 'blank', layout: 'blank', itemIds: [], photoIds: [], auto: true })

  return { pages, pagesByItem, flagsByItem: flagItems(book, views, pages), includedCount: included.length }
}

function flagItems(book: Book, views: ItemView[], pages: BookPage[]): Map<string, ItemFlag[]> {
  const trim = trimInches(book.trim_size)
  const bleed = Number(book.bleed_in) || 0
  const photoById = new Map<string, BookPhoto>()
  for (const v of views) for (const p of v.photos) photoById.set(p.photo.id, p.photo)

  // Lowest DPI each item's photos get in the slots they landed in.
  const minDpi = new Map<string, number>()
  for (const page of pages) {
    const slots = LAYOUTS[page.layout].slots
    page.photoIds.forEach((photoId, j) => {
      const photo = photoById.get(photoId)
      const px = photo && photoPixels(photo)
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
