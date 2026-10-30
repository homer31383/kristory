import type { Book } from '../types'
import type { CoverStyle, CoverData } from './layouts'
import type { BookPhoto, ItemView } from './model'
import type { PagePhoto } from './paginate'

function asSlot(photo: BookPhoto | undefined): PagePhoto | undefined {
  return photo ? { photo, focalX: 0.5, focalY: 0.5 } : undefined
}

function heroOf(v: ItemView | undefined): BookPhoto | undefined {
  if (!v) return undefined
  return v.photos.find((p) => p.photo.id === v.item.hero_photo_id)?.photo ?? v.photos[0]?.photo
}

function lastSentence(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const parts = flat.match(/[^.!?]+[.!?]+/g)
  const s = (parts ? parts[parts.length - 1] : flat).trim()
  return s.length > 160 ? s.slice(0, 157).trimEnd() + '...' : s
}

/**
 * What the title page and covers show. cover_choice wins; otherwise the
 * front photo is the first included day's hero, the back photo the last
 * one's, and the back line is the last sentence of the last day.
 */
export function buildCoverData(book: Book, views: ItemView[], photoById: Map<string, BookPhoto>): { cover: CoverData; style: CoverStyle } {
  const choice = book.cover_choice ?? {}
  const included = views.filter((v) => v.item.included)
  const withPhotos = included.filter((v) => v.photos.length > 0)
  const front = (choice.photo_id ? photoById.get(choice.photo_id) : undefined) ?? heroOf(withPhotos[0])
  const back =
    (choice.back_photo_id ? photoById.get(choice.back_photo_id) : undefined) ??
    heroOf([...withPhotos].reverse().find((v) => heroOf(v)?.id !== front?.id)) ??
    front
  const lastText = [...included].reverse().find((v) => v.words > 0)
  return {
    style: choice.style === 'a' ? 'a' : 'b',
    cover: {
      subtitle: choice.subtitle || book.title,
      frontPhoto: asSlot(front),
      backPhoto: asSlot(back),
      backQuote: choice.back_quote || (lastText ? lastSentence(lastText.sections.map((s) => s.visible).join(' ')) : ''),
    },
  }
}
