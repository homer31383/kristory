export const USERS = {
  chris: { id: '', name: 'Chris' },
  krista: { id: '', name: 'Krista' },
} as const

export const DEBOUNCE_SAVE_MS = 1500
export const DEBOUNCE_SEARCH_MS = 300
export const MAX_IMAGE_WIDTH = 800
export const IMAGE_QUALITY = 0.8
export const ENTRIES_PER_PAGE = 30

/**
 * Default categories surfaced as always-visible cards in the Library and
 * Lists tabs. Empty defaults still render as tappable cards (0 items);
 * tapping creates the row lazily.
 *
 * `aliases` lets us migrate names without orphaning existing data — e.g.
 * a legacy "Music" category still maps to the "Music/Concerts" slot.
 */
export interface DefaultCategory {
  name: string
  emoji: string
  aliases?: readonly string[]
}

export const DEFAULT_LIBRARY_CATEGORIES: readonly DefaultCategory[] = [
  { name: 'Books', emoji: '📖' },
  { name: 'Movies', emoji: '🎬' },
  { name: 'TV Shows', emoji: '📺' },
  { name: 'Restaurants', emoji: '🍽️' },
  { name: 'Music/Concerts', emoji: '🎵', aliases: ['Music', 'Concerts'] },
  { name: 'Activities', emoji: '🎯' },
] as const

export const DEFAULT_LIST_CATEGORIES: readonly DefaultCategory[] = [
  { name: 'Home Cooking', emoji: '🍳' },
  { name: 'Shopping', emoji: '🛒' },
] as const

// Library category names — canonical + aliases, lowercased — used for the
// Lists-tab "exclude Library" filter so a legacy "Music" still routes to
// Library, not Lists.
const LIBRARY_NAME_LOWER_SET = new Set<string>(
  DEFAULT_LIBRARY_CATEGORIES.flatMap((c) => [c.name, ...(c.aliases ?? [])]).map((n) =>
    n.toLowerCase(),
  ),
)

/** Canonical Library category names (no aliases) — preserved for callers
 *  that still import this name. */
export const LIBRARY_CATEGORY_NAMES = DEFAULT_LIBRARY_CATEGORIES.map((c) => c.name)

// Books-only routing — used by the rich Books section.
export const BOOKS_CATEGORY_NAME = 'Books'

// Hall of Fame is hard-capped — the curation is the point.
export const HALL_OF_FAME_CAP = 20

export function isLibraryCategory(name: string | null | undefined): boolean {
  if (!name) return false
  return LIBRARY_NAME_LOWER_SET.has(name.trim().toLowerCase())
}

/** Find the DB category that fills a given default slot (matching the slot's
 *  canonical name or any of its aliases, case-insensitive). */
export function matchDefaultSlot<T extends { name: string }>(
  slot: DefaultCategory,
  categories: readonly T[],
): T | null {
  const names = [slot.name, ...(slot.aliases ?? [])].map((n) => n.toLowerCase())
  return categories.find((c) => names.includes((c.name ?? '').toLowerCase())) ?? null
}
