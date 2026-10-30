import type { Book, BookAuthors, BookItem, BookPhotoSlot, EntryPhoto } from '../types'
import { hiddenTextChanged, sectionPlainText, visibleText, wordCount } from './text'

// ── What the book reads from the journal ────────────────────────────────────

export interface BookTrip {
  id: string
  title: string
  start_date: string
  end_date: string
  cover_photo_path: string | null
}

export interface BookEntrySection {
  id: string
  user_id: string
  content: string | null
  updated_at: string
  user: { id: string; name: string } | null
}

export interface BookEntry {
  id: string
  entry_date: string
  sections: BookEntrySection[]
  photos: EntryPhoto[]
  tagged_items: { id: string; category: { id: string; name: string; emoji: string | null } | null }[]
  trip_entries: { trip: BookTrip | null }[]
}

/** A photo the book can place, with the date of the entry it belongs to. */
export type BookPhoto = EntryPhoto & { entry_date: string }

export interface BookMilestone {
  entry_id: string
  title: string
  milestone_type: string
}

export type AuthorKey = 'chris' | 'krista'

export const AUTHOR_COLORS: Record<AuthorKey, string> = { chris: '#6B5CA5', krista: '#D4708F' }

export function authorKey(name: string | null | undefined): AuthorKey | null {
  const n = (name ?? '').trim().toLowerCase()
  return n === 'chris' || n === 'krista' ? n : null
}

function authorAllowed(author: AuthorKey | null, include: BookAuthors): boolean {
  return include === 'both' || author === include
}

/** Pixel size the print will use: the print copy when there is one. */
export function photoPixels(p: EntryPhoto): { w: number; h: number } | null {
  if (p.print_path && p.print_width && p.print_height) return { w: p.print_width, h: p.print_height }
  if (p.width && p.height) return { w: p.width, h: p.height }
  return null
}

export function isPortrait(p: EntryPhoto): boolean {
  const px = photoPixels(p)
  return !!px && px.h > px.w
}

// sectionPlainText parses HTML, so cache it per section version.
const plainCache = new Map<string, string>()
function plainTextOf(s: BookEntrySection): string {
  const key = `${s.id}:${s.updated_at}`
  let text = plainCache.get(key)
  if (text === undefined) {
    text = sectionPlainText(s.content)
    plainCache.set(key, text)
  }
  return text
}

// ── Per-item view ────────────────────────────────────────────────────────────

export interface ItemSectionView {
  section: BookEntrySection
  author: AuthorKey | null
  name: string
  text: string
  visible: string
  words: number
  changed: boolean
}

export interface ItemView {
  item: BookItem
  entry: BookEntry
  sections: ItemSectionView[]
  authors: AuthorKey[]
  words: number
  photos: { slot: BookPhotoSlot; photo: BookPhoto }[]
  portraitCount: number
  trip: BookTrip | null
  milestone: BookMilestone | null
  categoryIds: string[]
  textChanged: boolean
}

function entrySections(entry: BookEntry, include: BookAuthors) {
  return entry.sections
    .map((s) => ({ s, author: authorKey(s.user?.name), text: plainTextOf(s) }))
    .filter((x) => x.text && authorAllowed(x.author, include))
    .sort((a, b) => (a.s.user?.name ?? '').localeCompare(b.s.user?.name ?? ''))
}

export function buildItemView(
  item: BookItem,
  entry: BookEntry,
  book: Book,
  photoById: Map<string, BookPhoto>,
  milestoneByEntry: Map<string, BookMilestone>,
): ItemView {
  const sections: ItemSectionView[] = entrySections(entry, book.include_authors).map(({ s, author, text }) => {
    const ranges = item.hidden_text.filter((r) => r.section_id === s.id)
    const visible = visibleText(text, ranges)
    return {
      section: s,
      author,
      name: s.user?.name ?? '',
      text,
      visible,
      words: wordCount(visible),
      changed: hiddenTextChanged(text, ranges),
    }
  })

  const photos = item.photo_ids
    .map((slot) => ({ slot, photo: photoById.get(slot.photo_id) }))
    .filter((x): x is { slot: BookPhotoSlot; photo: BookPhoto } => !!x.photo)

  return {
    item,
    entry,
    sections,
    authors: [...new Set(sections.filter((s) => s.words > 0).map((s) => s.author).filter((a): a is AuthorKey => !!a))],
    words: sections.reduce((n, s) => n + s.words, 0),
    photos,
    portraitCount: photos.filter((p) => isPortrait(p.photo)).length,
    trip: entry.trip_entries.find((te) => te.trip)?.trip ?? null,
    milestone: milestoneByEntry.get(entry.id) ?? null,
    categoryIds: [...new Set(entry.tagged_items.map((t) => t.category?.id).filter((id): id is string => !!id))],
    textChanged: sections.some((s) => s.changed),
  }
}

// ── Auto-draft ───────────────────────────────────────────────────────────────

/** Sort key from the entry date (yyyymmdd * 10), leaving room to reorder. */
export function dateSortKey(entryDate: string): number {
  return Number(entryDate.replace(/-/g, '')) * 10
}

export type DraftItem = Pick<
  BookItem,
  'book_id' | 'entry_id' | 'sort_key' | 'included' | 'hero_photo_id' | 'photo_ids'
> & { updated_by: string | null }

/**
 * The draft is a proposal: every entry gets a row, photos in journal order,
 * the first one as hero. Only entries with nothing to print for the chosen
 * authors (no text, no photos) start out skipped.
 */
export function draftItem(entry: BookEntry, book: Book, userId: string | null): DraftItem {
  const photos = [...entry.photos].sort((a, b) => a.display_order - b.display_order)
  const hasText = entrySections(entry, book.include_authors).some((x) => wordCount(x.text) > 0)
  return {
    book_id: book.id,
    entry_id: entry.id,
    sort_key: dateSortKey(entry.entry_date),
    included: hasText || photos.length > 0,
    hero_photo_id: photos[0]?.id ?? null,
    photo_ids: photos.map((p) => ({ photo_id: p.id })),
    updated_by: userId,
  }
}
