/**
 * Page layouts the book builder can place. Slot rectangles are fractions of
 * the trim (0..1, origin top left) and drive the DPI check and the review
 * thumbnails. PROVISIONAL: geometry and names are placeholders until the
 * design files in docs/book-layouts/ are built (phase 3), which replaces them.
 *
 * textWords is a rough capacity at Lora 15px/1.6 on a 672 px page, used to
 * estimate continuation pages before real text measuring exists.
 */

export type LayoutId =
  | 'title'
  | 'chapter-opener'
  | 'blank'
  | 'text'
  | 'two-quiet'
  | 'text-photo'
  | 'full-bleed'
  | 'split'
  | 'grid-2'
  | 'banded-2'
  | 'tall-2'
  | 'grid-3'
  | 'banded-3'
  | 'tall-3'
  | 'mosaic-4'
  | 'milestone'

export interface SlotRect {
  x: number
  y: number
  w: number
  h: number
}

export interface LayoutDef {
  id: LayoutId
  label: string
  slots: SlotRect[]
  textWords: number
  /** Dark navy page (openers, full-bleed captions) or light cream page. */
  dark: boolean
}

const M = 0.071 // 48 px margin on a 672 px page
const TOP = 0.18 // below the date header

export const LAYOUTS: Record<LayoutId, LayoutDef> = {
  title: { id: 'title', label: 'Title page', slots: [], textWords: 0, dark: true },
  'chapter-opener': {
    id: 'chapter-opener',
    label: 'Chapter opener',
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    textWords: 0,
    dark: true,
  },
  blank: { id: 'blank', label: 'Blank page', slots: [], textWords: 0, dark: false },
  text: { id: 'text', label: 'Text page', slots: [], textWords: 230, dark: false },
  'two-quiet': { id: 'two-quiet', label: 'Two quiet days', slots: [], textWords: 90, dark: false },
  'text-photo': {
    id: 'text-photo',
    label: 'Text with one photo',
    slots: [{ x: M, y: TOP, w: 1 - 2 * M, h: 0.42 }],
    textWords: 120,
    dark: false,
  },
  'full-bleed': {
    id: 'full-bleed',
    label: 'Full-bleed photo',
    slots: [{ x: 0, y: 0, w: 1, h: 1 }],
    textWords: 40,
    dark: true,
  },
  split: {
    id: 'split',
    label: 'Split page',
    slots: [{ x: 0, y: 0, w: 0.5, h: 1 }],
    textWords: 110,
    dark: false,
  },
  'grid-2': {
    id: 'grid-2',
    label: 'Two-photo grid',
    slots: [
      { x: M, y: TOP, w: 0.419, h: 0.36 },
      { x: 0.51, y: TOP, w: 0.419, h: 0.36 },
    ],
    textWords: 110,
    dark: false,
  },
  'banded-2': {
    id: 'banded-2',
    label: 'Two bands',
    slots: [
      { x: 0, y: 0.16, w: 1, h: 0.3 },
      { x: 0, y: 0.48, w: 1, h: 0.3 },
    ],
    textWords: 60,
    dark: false,
  },
  'tall-2': {
    id: 'tall-2',
    label: 'Two tall photos',
    slots: [
      { x: M, y: TOP, w: 0.419, h: 0.56 },
      { x: 0.51, y: TOP, w: 0.419, h: 0.56 },
    ],
    textWords: 60,
    dark: false,
  },
  'grid-3': {
    id: 'grid-3',
    label: 'One large, two small',
    slots: [
      { x: M, y: TOP, w: 0.56, h: 0.46 },
      { x: 0.651, y: TOP, w: 0.278, h: 0.22 },
      { x: 0.651, y: 0.42, w: 0.278, h: 0.22 },
    ],
    textWords: 80,
    dark: false,
  },
  'banded-3': {
    id: 'banded-3',
    label: 'Three bands',
    slots: [
      { x: 0, y: 0.16, w: 1, h: 0.2 },
      { x: 0, y: 0.38, w: 1, h: 0.2 },
      { x: 0, y: 0.6, w: 1, h: 0.2 },
    ],
    textWords: 40,
    dark: false,
  },
  'tall-3': {
    id: 'tall-3',
    label: 'Three tall photos',
    slots: [
      { x: M, y: TOP, w: 0.272, h: 0.5 },
      { x: 0.364, y: TOP, w: 0.272, h: 0.5 },
      { x: 0.657, y: TOP, w: 0.272, h: 0.5 },
    ],
    textWords: 70,
    dark: false,
  },
  'mosaic-4': {
    id: 'mosaic-4',
    label: 'Four-photo mosaic',
    slots: [
      { x: M, y: TOP, w: 0.419, h: 0.3 },
      { x: 0.51, y: TOP, w: 0.419, h: 0.3 },
      { x: M, y: 0.49, w: 0.419, h: 0.3 },
      { x: 0.51, y: 0.49, w: 0.419, h: 0.3 },
    ],
    textWords: 40,
    dark: false,
  },
  milestone: {
    id: 'milestone',
    label: 'Milestone',
    slots: [{ x: 0.15, y: 0.22, w: 0.7, h: 0.45 }],
    textWords: 90,
    dark: false,
  },
}

/** Layouts an entry page can use (not title, opener or blank). */
export const ENTRY_LAYOUTS: LayoutId[] = [
  'text', 'text-photo', 'full-bleed', 'split', 'grid-2', 'banded-2', 'tall-2',
  'grid-3', 'banded-3', 'tall-3', 'mosaic-4', 'milestone',
]

export function isLayoutId(v: string | null | undefined): v is LayoutId {
  return !!v && v in LAYOUTS
}

/** Trim size in inches from a book's trim_size ("7x7"). */
export function trimInches(trimSize: string): { w: number; h: number } {
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(trimSize.trim())
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 7, h: 7 }
}

/** A slot's printed size in inches, plus bleed on every edge it touches. */
export function slotInches(slot: SlotRect, trim: { w: number; h: number }, bleed: number) {
  const edge = 0.001
  let w = slot.w * trim.w
  let h = slot.h * trim.h
  if (slot.x <= edge) w += bleed
  if (slot.x + slot.w >= 1 - edge) w += bleed
  if (slot.y <= edge) h += bleed
  if (slot.y + slot.h >= 1 - edge) h += bleed
  return { w, h }
}

/**
 * Effective DPI of a photo in a slot with object-fit: cover. The image is
 * scaled until it covers both sides, so the tighter side sets the DPI.
 */
export function effectiveDpi(px: { w: number; h: number }, slotIn: { w: number; h: number }): number {
  return Math.min(px.w / slotIn.w, px.h / slotIn.h)
}

/** Warn hard under 150 DPI, softly under 200 (camera exports sit near 237). */
export const DPI_HARD = 150
export const DPI_SOFT = 200

/** The draft's pick for an entry page, by photo count and orientation. */
export function chooseLayout(opts: {
  photoCount: number
  portraitCount: number
  words: number
  milestone: boolean
}): LayoutId {
  const { photoCount: n, portraitCount: p, words, milestone } = opts
  if (milestone) return 'milestone'
  if (n === 0) return 'text'
  const portraitHeavy = p * 2 > n
  if (n === 1) {
    if (words <= LAYOUTS['full-bleed'].textWords) return 'full-bleed'
    return portraitHeavy ? 'split' : 'text-photo'
  }
  if (n === 2) {
    if (portraitHeavy) return 'tall-2'
    return p === 0 ? 'banded-2' : 'grid-2'
  }
  if (n === 3) {
    if (portraitHeavy) return 'tall-3'
    return p === 0 ? 'banded-3' : 'grid-3'
  }
  return portraitHeavy ? 'tall-3' : 'mosaic-4'
}
