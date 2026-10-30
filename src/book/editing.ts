import type { Book, BookHiddenRange, BookItem, BookPhotoSlot } from '../types'
import { LAYOUTS, slotInches, trimInches } from './catalog'
import { DEFAULT_FOCAL, DEFAULT_ZOOM, clampZoom, cropOf, type CropValue, type Size } from './crop'
import { cropFlag, dpiFlag, photoReadings, type BookPage, type ItemFlag, type Pagination } from './paginate'
import { hashText, resolveHiddenRanges } from './text'

/**
 * Helpers shared by the entry editor and the crops screen. Both keep their
 * changes in a local draft, preview them on the real pages, and save the
 * book_items fields; the journal is never touched.
 */

// ── Crops ────────────────────────────────────────────────────────────────────

/** A slot with a crop applied; default values are left out of the row. */
export function withCrop(slot: BookPhotoSlot, crop: CropValue): BookPhotoSlot {
  const out: BookPhotoSlot = { photo_id: slot.photo_id }
  if (crop.focalX !== DEFAULT_FOCAL || crop.focalY !== DEFAULT_FOCAL) {
    out.focal_x = crop.focalX
    out.focal_y = crop.focalY
  }
  if (clampZoom(crop.zoom) !== DEFAULT_ZOOM) out.zoom = clampZoom(crop.zoom)
  return out
}

/** The item without crops, so moving a crop does not repaginate the book. */
export function withoutCrops<T extends Pick<BookItem, 'photo_ids'>>(item: T): T {
  return { ...item, photo_ids: item.photo_ids.map((s) => ({ photo_id: s.photo_id })) }
}

/** A page with the given crops (by photo id) in place of the ones it was paginated with. */
export function applyCrops(page: BookPage, crops: Map<string, CropValue>): BookPage {
  if (!page.photos.some((p) => crops.has(p.photo.id))) return page
  return {
    ...page,
    photos: page.photos.map((p) => {
      const c = crops.get(p.photo.id)
      return c ? { ...p, focalX: c.focalX, focalY: c.focalY, zoom: clampZoom(c.zoom) } : p
    }),
  }
}

export function cropsOf(slots: BookPhotoSlot[]): Map<string, CropValue> {
  return new Map(slots.map((s) => [s.photo_id, cropOf(s)]))
}

/** The printed size in inches (with bleed) of slot `index` on a page. */
export function pageSlotInches(book: Book, page: BookPage, index: number): Size | null {
  const slot = LAYOUTS[page.layout].slots[index]
  if (!slot) return null
  return slotInches(slot, trimInches(book.trim_size), Number(book.bleed_in) || 0)
}

/** An item's pages, in order. */
export function itemPages(pagination: Pagination | null, itemId: string): BookPage[] {
  if (!pagination) return []
  return (pagination.pagesByItem.get(itemId) ?? []).map((n) => pagination.pages[n - 1]).filter((p): p is BookPage => !!p)
}

/**
 * An item's flags with DPI and crop loss read from the given pages (which
 * carry the draft's crops), the rest from the pagination.
 */
export function itemFlags(book: Book, pagination: Pagination | null, itemId: string, pages: BookPage[]): ItemFlag[] {
  const base = (pagination?.flagsByItem.get(itemId) ?? []).filter((f) => f.kind !== 'low-dpi' && f.kind !== 'crop-loss')
  let dpi = Infinity
  let crop: ItemFlag | null = null
  let lost = -1
  for (const page of pages) {
    for (const r of photoReadings(book, page)) {
      if (r.dpi !== null) dpi = Math.min(dpi, r.dpi)
      if (r.crop && r.crop.lost > lost) {
        lost = r.crop.lost
        crop = cropFlag(r.crop)
      }
    }
  }
  const out = [...base]
  const d = dpi < Infinity ? dpiFlag(dpi) : null
  if (d) out.push(d)
  if (crop) out.push(crop)
  return out
}

// ── Hidden text ──────────────────────────────────────────────────────────────

type Span = { start: number; end: number }

function merge(spans: Span[]): Span[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start)
  const out: Span[] = []
  for (const s of sorted) {
    const last = out[out.length - 1]
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end)
    else out.push({ ...s })
  }
  return out
}

function toRanges(sectionId: string, text: string, spans: Span[]): BookHiddenRange[] {
  const hash = hashText(text)
  return spans.map((s) => ({ section_id: sectionId, start: s.start, end: s.end, snippet: text.slice(s.start, s.end), source_hash: hash }))
}

/** Grows a selection to whole words, so a passage never hides half a word. */
export function snapToWords(text: string, start: number, end: number): Span {
  let a = Math.max(0, Math.min(start, end))
  let b = Math.min(text.length, Math.max(start, end))
  while (a > 0 && !/\s/.test(text[a - 1])) a--
  while (b < text.length && !/\s/.test(text[b])) b++
  // Take the space after the passage too, so the words around it join up.
  while (b < text.length && /[ \t]/.test(text[b])) b++
  return { start: a, end: b }
}

/** Where a section's hidden passages sit in the current text. */
export function sectionHidden(text: string, sectionId: string, all: BookHiddenRange[]): Span[] {
  return merge(resolveHiddenRanges(text, all.filter((r) => r.section_id === sectionId)))
}

/**
 * The item's hidden_text with one section rewritten: the section's passages
 * are re-anchored to the current text (which also clears "text changed"),
 * then `change` adds or removes a passage.
 */
export function rewriteHidden(
  all: BookHiddenRange[],
  sectionId: string,
  text: string,
  change?: { hide: Span } | { restore: Span },
): BookHiddenRange[] {
  let spans = sectionHidden(text, sectionId, all)
  if (change && 'hide' in change) spans = merge([...spans, change.hide])
  if (change && 'restore' in change) {
    const r = change.restore
    spans = spans.filter((s) => s.end <= r.start || s.start >= r.end)
  }
  return [...all.filter((r) => r.section_id !== sectionId), ...toRanges(sectionId, text, spans)]
}
