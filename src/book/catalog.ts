/**
 * The book's page layouts, one per design in docs/book-layouts/ (plus a
 * blank page and the derived two-quiet page). Slot rectangles are measured
 * from the design files in px on the 672 px page; they drive the DPI check
 * and the review thumbnails. The pages themselves are React components in
 * src/book/layouts/.
 *
 * text:
 *  - body:    the entry text flows here; what does not fit continues on
 *             text-day pages without a photo
 *  - caption: only caption_override shows; the entry text continues
 *  - quote:   a script pull quote (caption_override or the first sentence);
 *             the entry text continues
 *  - none:    no entry text
 * textWords is the fallback capacity used until the page fonts load and the
 * real pages can be measured (src/book/fit.ts).
 */

export type LayoutId =
  | 'cover-a'
  | 'back-a'
  | 'cover-b'
  | 'back-b'
  | 'title'
  | 'opener'
  | 'blank'
  | 'two-quiet'
  | 'text-day'
  | 'photo-day'
  | 'two-authors'
  | 'milestone'
  | 'full-bleed'
  | 'band-text'
  | 'grid-day'
  | 'split-day'
  | 'navy-top'
  | 'navy-frame'
  | 'navy-trio'
  | 'mid-arch'
  | 'white-mosaic'
  | 'navy-panel'

export interface SlotRect {
  x: number
  y: number
  w: number
  h: number
}

export type PageTone = 'white' | 'pale' | 'navy' | 'mid' | 'photo' | 'indigo'

export interface LayoutDef {
  id: LayoutId
  label: string
  /** The design file this layout is built from. */
  file: string | null
  slots: SlotRect[]
  /** Where text sits, for the review thumbnails only. */
  textBox: SlotRect | null
  text: 'body' | 'caption' | 'quote' | 'none'
  /** Shows the "Ate" rows from tagged items. */
  facts: boolean
  textWords: number
  tone: PageTone
}

const px = (x: number, y: number, w: number, h: number): SlotRect => ({ x: x / 672, y: y / 672, w: w / 672, h: h / 672 })

export const LAYOUTS: Record<LayoutId, LayoutDef> = {
  'cover-a': { id: 'cover-a', label: 'Front cover A', file: 'Main.dc.html', slots: [], textBox: null, text: 'none', facts: false, textWords: 0, tone: 'indigo' },
  'back-a': { id: 'back-a', label: 'Back cover A', file: 'BackCover.dc.html', slots: [], textBox: null, text: 'none', facts: false, textWords: 0, tone: 'indigo' },
  'cover-b': { id: 'cover-b', label: 'Front cover B', file: 'CoverScript.dc.html', slots: [px(0, 0, 672, 672)], textBox: null, text: 'none', facts: false, textWords: 0, tone: 'navy' },
  'back-b': { id: 'back-b', label: 'Back cover B', file: 'BackScript.dc.html', slots: [px(0, 0, 672, 672)], textBox: null, text: 'none', facts: false, textWords: 0, tone: 'navy' },
  title: { id: 'title', label: 'Title page', file: 'Title.dc.html', slots: [], textBox: null, text: 'none', facts: false, textWords: 0, tone: 'white' },
  opener: { id: 'opener', label: 'Trip opener', file: 'Opener.dc.html', slots: [px(52, 254, 568, 340)], textBox: null, text: 'none', facts: false, textWords: 0, tone: 'navy' },
  blank: { id: 'blank', label: 'Blank page', file: null, slots: [], textBox: null, text: 'none', facts: false, textWords: 0, tone: 'white' },
  'two-quiet': { id: 'two-quiet', label: 'Two quiet days', file: null, slots: [], textBox: px(60, 40, 564, 592), text: 'body', facts: false, textWords: 90, tone: 'navy' },
  'text-day': { id: 'text-day', label: 'Text day', file: 'TextDay.dc.html', slots: [px(60, 380, 564, 190)], textBox: px(60, 118, 564, 250), text: 'body', facts: true, textWords: 120, tone: 'navy' },
  'photo-day': {
    id: 'photo-day', label: 'Photo day', file: 'PhotoDay.dc.html',
    slots: [px(48, 114, 564, 175), px(48, 299, 277, 118), px(335, 299, 277, 118)],
    textBox: px(48, 435, 564, 150), text: 'body', facts: true, textWords: 60, tone: 'white',
  },
  'two-authors': {
    id: 'two-authors', label: 'Two authors', file: 'TwoAuthors.dc.html',
    slots: [px(48, 400, 277, 150), px(335, 400, 277, 150)],
    textBox: px(48, 116, 564, 270), text: 'body', facts: true, textWords: 110, tone: 'pale',
  },
  milestone: { id: 'milestone', label: 'Milestone', file: 'Milestone.dc.html', slots: [px(72, 189, 540, 290)], textBox: px(60, 515, 564, 80), text: 'body', facts: false, textWords: 40, tone: 'mid' },
  'full-bleed': { id: 'full-bleed', label: 'Full photo', file: 'FullBleed.dc.html', slots: [px(0, 0, 672, 672)], textBox: null, text: 'caption', facts: false, textWords: 0, tone: 'photo' },
  'band-text': {
    id: 'band-text', label: 'Banded text', file: 'BandText.dc.html',
    slots: [px(440, 48, 232, 268), px(440, 328, 232, 296)],
    textBox: px(108, 116, 302, 480), text: 'body', facts: false, textWords: 130, tone: 'white',
  },
  'grid-day': {
    id: 'grid-day', label: 'Photo grid', file: 'GridDay.dc.html',
    slots: [px(48, 116, 330, 300), px(388, 116, 236, 145), px(388, 271, 236, 145)],
    textBox: px(48, 436, 576, 180), text: 'body', facts: false, textWords: 80, tone: 'white',
  },
  'split-day': { id: 'split-day', label: 'Split photo', file: 'SplitDay.dc.html', slots: [px(0, 0, 300, 672)], textBox: px(352, 116, 272, 500), text: 'body', facts: false, textWords: 130, tone: 'pale' },
  'navy-top': { id: 'navy-top', label: 'Navy photo top', file: 'NavyTop.dc.html', slots: [px(0, 0, 672, 360)], textBox: px(48, 452, 564, 170), text: 'body', facts: false, textWords: 80, tone: 'navy' },
  'navy-frame': { id: 'navy-frame', label: 'Navy framed portrait', file: 'NavyFrame.dc.html', slots: [px(68, 124, 284, 420)], textBox: px(390, 160, 234, 400), text: 'body', facts: false, textWords: 80, tone: 'navy' },
  'navy-trio': {
    id: 'navy-trio', label: 'Navy three photos', file: 'NavyTrio.dc.html',
    slots: [px(48, 116, 184, 340), px(244, 144, 184, 340), px(440, 116, 184, 340)],
    textBox: px(48, 524, 576, 100), text: 'body', facts: false, textWords: 45, tone: 'navy',
  },
  'mid-arch': { id: 'mid-arch', label: 'Arch photo and quote', file: 'MidArch.dc.html', slots: [px(211, 52, 250, 330)], textBox: null, text: 'quote', facts: false, textWords: 0, tone: 'mid' },
  'white-mosaic': {
    id: 'white-mosaic', label: 'Four-photo mosaic', file: 'WhiteMosaic.dc.html',
    slots: [px(48, 116, 283, 215), px(341, 116, 283, 215), px(48, 341, 283, 215), px(341, 341, 283, 215)],
    textBox: px(48, 574, 576, 40), text: 'body', facts: false, textWords: 15, tone: 'white',
  },
  'navy-panel': { id: 'navy-panel', label: 'Photo with navy panel', file: 'NavyPanel.dc.html', slots: [px(0, 0, 672, 672)], textBox: px(60, 430, 564, 170), text: 'body', facts: false, textWords: 45, tone: 'photo' },
}

/** Layouts an entry page can use (for the phase 2 picker and overrides). */
export const ENTRY_LAYOUTS: LayoutId[] = [
  'text-day', 'photo-day', 'two-authors', 'milestone', 'full-bleed', 'band-text', 'grid-day',
  'split-day', 'navy-top', 'navy-frame', 'navy-trio', 'mid-arch', 'white-mosaic', 'navy-panel',
]

export function isLayoutId(v: string | null | undefined): v is LayoutId {
  return !!v && v in LAYOUTS
}

export function isEntryLayout(v: string | null | undefined): v is LayoutId {
  return isLayoutId(v) && ENTRY_LAYOUTS.includes(v)
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

/**
 * Layouts only a person picks (the phase 2 layout picker), never the
 * automatic draft. MidArch shows a quote and no body text, so as an
 * automatic pick it pushes the whole entry onto a second page.
 */
export const MANUAL_ONLY_LAYOUTS: LayoutId[] = ['mid-arch']

/** One-photo layouts, best first, by orientation. */
const ONE_PORTRAIT: LayoutId[] = ['full-bleed', 'navy-panel', 'navy-frame', 'split-day', 'text-day', 'navy-top']
const ONE_LANDSCAPE: LayoutId[] = ['full-bleed', 'navy-panel', 'navy-top', 'text-day', 'split-day', 'navy-frame']

/**
 * Orders layouts by fit for the words: those with room for all of them keep
 * their order, then the rest by how much room they have (their text
 * continues on the next page).
 */
function byRoom(order: LayoutId[], words: number): LayoutId[] {
  if (words === 0) return order
  const room = (l: LayoutId) => LAYOUTS[l].textWords
  const fit = order.filter((l) => room(l) >= words)
  const short = order.filter((l) => room(l) < words).sort((a, b) => room(b) - room(a))
  return [...fit, ...short]
}

export interface LayoutNeeds {
  photoCount: number
  portraitCount: number
  words: number
  milestone: boolean
}

/**
 * Every layout that suits an entry page, best first, by photo count,
 * orientation (portrait-heavy is more than half portrait) and word count.
 * Only layouts with no more photo slots than photos are listed, so no slot
 * is left empty. Never includes MANUAL_ONLY_LAYOUTS.
 */
export function rankLayouts({ photoCount: n, portraitCount: p, words, milestone }: LayoutNeeds): LayoutId[] {
  if (milestone) return ['milestone', ...rankLayouts({ photoCount: n, portraitCount: p, words, milestone: false })]
  if (n === 0) return ['text-day']
  const portraitHeavy = p * 2 > n
  if (n === 1) return byRoom(portraitHeavy ? ONE_PORTRAIT : ONE_LANDSCAPE, words)
  if (n === 2) return portraitHeavy ? ['band-text', 'two-authors'] : ['two-authors', 'band-text']
  if (n === 3) {
    if (portraitHeavy) return ['navy-trio', 'grid-day', 'photo-day']
    return p === 0 ? ['photo-day', 'grid-day', 'navy-trio'] : ['grid-day', 'photo-day', 'navy-trio']
  }
  return portraitHeavy ? ['navy-trio', 'white-mosaic', 'grid-day'] : ['white-mosaic', 'photo-day', 'grid-day', 'navy-trio']
}

/**
 * The draft's pick for an entry page: the best ranked layout that differs
 * from the page before (`avoid`). When nothing else suits (a day with no
 * photos has only text-day), the best one is used anyway.
 */
export function chooseLayout(needs: LayoutNeeds, avoid?: LayoutId | null): LayoutId {
  const ranked = rankLayouts(needs)
  return ranked.find((l) => l !== avoid) ?? ranked[0]
}
