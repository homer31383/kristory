export const USERS = {
  chris: { id: '', name: 'Chris' },
  krista: { id: '', name: 'Krista' },
} as const

export const DEBOUNCE_SAVE_MS = 1500
export const DEBOUNCE_SEARCH_MS = 300
export const MAX_IMAGE_WIDTH = 800
export const IMAGE_QUALITY = 0.8
export const ENTRIES_PER_PAGE = 30

// Library categories — the experience / cultural log surface.
// Match against category.name (case-insensitive) to route a category into
// the Library tab vs the Lists tab.
export const LIBRARY_CATEGORY_NAMES = [
  'Books',
  'Movies',
  'TV Shows',
  'Restaurants',
  'Music',
  'Activities',
] as const

// Books-only routing — used by the rich Books section.
export const BOOKS_CATEGORY_NAME = 'Books'

// Hall of Fame is hard-capped — the curation is the point.
export const HALL_OF_FAME_CAP = 20

export function isLibraryCategory(name: string | null | undefined): boolean {
  if (!name) return false
  const lower = name.trim().toLowerCase()
  return LIBRARY_CATEGORY_NAMES.some((n) => n.toLowerCase() === lower)
}
