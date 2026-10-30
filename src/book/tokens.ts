/**
 * Book design tokens: every color and font the page layouts use, copied from
 * the design files in docs/book-layouts/. Change a value here, not in a
 * layout. Names describe the role a color plays in the designs.
 */

export const COLOR = {
  // Navy pages: radial gradient stops, center to edge, and the flat fill
  // behind full-bleed photos.
  navy1: '#22376E',
  navy2: '#172751',
  navy3: '#0E173B',
  navy4: '#070C26',
  navyDeep: '#0B1235',
  // Mid blue pages: gradient stops, center to edge.
  mid1: '#3A5799',
  mid2: '#284382',
  mid3: '#1C3166',
  mid4: '#121F4C',
  // Pale blue-gray pages and bands.
  pale0: '#F1F4FA',
  pale1: '#E6EBF5',
  pale2: '#DDE4F1',
  band: '#CBD5E8',
  ruleSoft: '#C9D1E4',
  ruleMid: '#B9C4DC',
  white: '#FFFFFF',

  // Text.
  ink: '#14204A', // text on light pages
  slate: '#4A5578', // secondary text on light pages
  cream: '#F2E8D5', // text on navy pages
  creamSoft: '#E7DCC6', // weekday and small caps on dark pages
  folioDark: '#D5CDBA', // folio on navy pages
  ivory: '#F7F2E6', // text on mid blue pages
  folioMid: '#E9E2D2', // folio and dates on mid blue pages

  // Accents.
  gold: '#D4A24C', // dark pages
  goldDeep: '#9A6F1E', // the Title page
  dateOnLight: '#284382', // entry date headings on light pages
  labelOnLight: '#3A5799', // small labels (Ate, Drank) on light pages
  goldPale: '#F0CF8E', // small caps on mid blue pages
  goldLeaf: '#E8C27A',
  coral: '#E0504A',
  coralPale: '#F0A89E',
  teal: '#4FA3A5',
  sprigBlue: '#4A7FB5', // BandText corner sprig

  // Authors: rules and badges.
  chris: '#6B5CA5',
  chrisMid: '#8B7EC8',
  chrisLight: '#B9AEF0',
  krista: '#D4708F',
  kristaLight: '#E88BA8',
  kristaDeep: '#B8456B',

  // Cover option A.
  plum: '#3A3162',
  paper: '#F7F3EF',
  lavender: '#D6CEF3',
} as const

export type BookColor = keyof typeof COLOR

/** A token at an alpha, as rgba(). */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** Shades with no matching token: photo shadows and the empty photo slot. */
export const SHADE = {
  shadowSoft: 'rgba(5,10,40,0.45)',
  shadowDeep: 'rgba(3,6,24,0.55)',
  emptySlot: 'rgba(127,140,170,0.18)',
} as const

/**
 * The mat behind a photo zoomed out below fill: the page color, with a thin
 * edge and a soft shadow on the photo, as on the Milestone frame. Light
 * pages (white, pale) get a white mat, dark pages a navy one.
 */
export const MAT = {
  light: { color: COLOR.white, edge: COLOR.ruleSoft, edgeWidth: 1, shadow: `0 6px 16px ${alpha(COLOR.ink, 0.16)}` },
  dark: { color: COLOR.navyDeep, edge: COLOR.white, edgeWidth: 3, shadow: `0 10px 28px ${SHADE.shadowSoft}` },
} as const

export type MatTone = keyof typeof MAT

export const FONT = {
  script: "'Great Vibes', cursive",
  body: 'Lora, Georgia, serif',
  display: "'Playfair Display', Georgia, serif",
} as const

export const TYPE = {
  /** Body text, as designed. */
  bodySize: 15,
  bodyLine: 1.6,
  /** Smallest body size a page may shrink to so a short overflow fits. */
  bodyMinSize: 13.5,
} as const
