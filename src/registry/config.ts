/**
 * Hardcoded registry ID + palette for the merged Kristory `/registry` route.
 *
 * The standalone Babylist used VITE_REGISTRY_ID; inside Kristory there's only
 * ever one registry (one household) so we hardcode the same UUID that the
 * babylist_registries row was seeded with.
 */
export const REGISTRY_ID = '00000000-0000-4000-8000-babbababab01'

/**
 * Babylist person palette. Used as a fallback when the Kristory user isn't
 * "Chris" or "Krista" — those get their existing Kristory accent colors
 * (`--chris-color` / `--krista-color`) so badges look consistent across apps.
 */
export const PERSON_FALLBACK_COLORS = [
  '#c8633b', // terracotta
  '#6a7a4f', // moss
  '#5a7395', // muted blue
  '#b85932', // clay
] as const

export const DEFAULT_REFINERS = [
  'nursery',
  'baby',
  'newborn',
  'small space',
  'minimalist',
  'modern',
  'organic',
  'Brooklyn',
  '2026',
]

export const PRIORITY_OPTIONS = [
  'Before birth',
  '0-3 mo',
  '3-6 mo',
  'Nice to have',
] as const

export const WHERE_OPTIONS = ['Babylist', 'Amazon S&S', 'Insurance', 'Self-buy'] as const
