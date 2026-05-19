/**
 * Hardcoded registry ID for the merged Kristory `/registry` route.
 *
 * The standalone Babylist used VITE_REGISTRY_ID; inside Kristory there's only
 * ever one registry (one household) so we hardcode the same UUID that the
 * babylist_registries row was seeded with.
 *
 * The registry is locked to two existing babylist_people rows (purple Chris,
 * mauve Krista) — no code path creates new ones, so there's no person palette.
 */
export const REGISTRY_ID = '00000000-0000-4000-8000-babbababab01'

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
