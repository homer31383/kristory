import { format, parse } from 'date-fns'
import { getStorageUrl } from '../lib/helpers'
import { LAYOUTS } from './layouts'
import { AUTHOR_COLORS, type AuthorKey, type BookPhoto, type ItemView } from './model'
import type { BookPage, ItemFlag } from './paginate'

export const BOOK_NAVY =
  'radial-gradient(ellipse 72% 64% at 50% 47%, #22376E 0%, #172751 36%, #0E173B 68%, #070C26 100%)'
export const BOOK_CREAM = '#F2E8D5'
export const BOOK_GOLD_DARK = '#D4A24C'

export function AuthorBadge({ author, size = 20 }: { author: AuthorKey; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-semibold text-white flex-shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.5, backgroundColor: AUTHOR_COLORS[author] }}
      title={author === 'chris' ? 'Chris' : 'Krista'}
    >
      {author === 'chris' ? 'C' : 'K'}
    </span>
  )
}

export function FlagChip({ flag }: { flag: ItemFlag }) {
  const hard = flag.severity === 'hard'
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{
        backgroundColor: hard ? 'rgba(224, 80, 74, 0.14)' : 'rgba(212, 162, 76, 0.18)',
        color: hard ? '#B23A35' : '#8A6216',
      }}
    >
      {flag.label}
    </span>
  )
}

/**
 * A small schematic of one page: real photo thumbnails in the layout's slots
 * and grey lines where text goes. Not the finished design (phase 3).
 */
export function PageThumb({
  page,
  size,
  photoById,
  viewById,
  onClick,
}: {
  page: BookPage
  size: number
  photoById: Map<string, BookPhoto>
  viewById: Map<string, ItemView>
  onClick?: () => void
}) {
  const layout = LAYOUTS[page.layout]
  const dark = layout.dark
  const first = page.itemIds[0] ? viewById.get(page.itemIds[0]) : undefined
  const focal = (photoId: string) => {
    const slot = first?.photos.find((p) => p.photo.id === photoId)?.slot
    return `${Math.round((slot?.focal_x ?? 0.5) * 100)}% ${Math.round((slot?.focal_y ?? 0.5) * 100)}%`
  }

  // Where the text lines go, by layout.
  const slots = layout.slots
  const bottom = slots.reduce((m, s) => Math.max(m, s.y + s.h), 0.18)
  const textBox =
    page.layout === 'split'
      ? { x: 0.56, y: 0.2, w: 0.37, h: 0.7 }
      : page.layout === 'full-bleed' || page.layout === 'chapter-opener'
        ? null
        : { x: 0.09, y: bottom + 0.05, w: 0.82, h: Math.max(0, 0.9 - bottom - 0.05) }
  const lineCount = textBox && layout.textWords > 0 ? Math.max(1, Math.floor(textBox.h / 0.06)) : 0

  const pct = (v: number) => `${v * 100}%`

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative overflow-hidden flex-shrink-0 cursor-pointer"
      style={{
        width: size,
        height: size,
        background: dark ? BOOK_NAVY : BOOK_CREAM,
        boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
      }}
      title={`Page ${page.number}: ${layout.label}`}
    >
      {page.kind === 'chapter' && page.trip?.cover_photo_path && (
        <img
          src={getStorageUrl(page.trip.cover_photo_path)}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.75 }}
        />
      )}

      {page.photoIds.map((id, j) => {
        const slot = slots[j]
        const photo = photoById.get(id)
        if (!slot || !photo) return null
        return (
          <img
            key={id + j}
            src={getStorageUrl(photo.storage_path)}
            alt=""
            loading="lazy"
            className="absolute object-cover"
            style={{
              left: pct(slot.x),
              top: pct(slot.y),
              width: pct(slot.w),
              height: pct(slot.h),
              objectPosition: focal(id),
            }}
          />
        )
      })}

      {page.kind !== 'blank' && page.kind !== 'title' && page.kind !== 'chapter' && first && (
        <div
          className="absolute left-0 right-0 text-center truncate px-1"
          style={{ top: '4%', fontSize: Math.max(7, size * 0.07), color: dark ? BOOK_GOLD_DARK : '#9A6F1E' }}
        >
          {format(parse(first.entry.entry_date, 'yyyy-MM-dd', new Date()), 'MMM d')}
        </div>
      )}

      {textBox &&
        Array.from({ length: lineCount }).map((_, k) => (
          <div
            key={k}
            className="absolute rounded-full"
            style={{
              left: pct(textBox.x),
              top: pct(textBox.y + k * 0.06),
              width: pct(textBox.w * (k === lineCount - 1 ? 0.6 : 1)),
              height: Math.max(1, size * 0.012),
              backgroundColor: dark ? 'rgba(242,232,213,0.35)' : 'rgba(44,37,34,0.18)',
            }}
          />
        ))}

      {(page.kind === 'title' || page.kind === 'chapter') && (
        <div
          className="absolute inset-x-0 text-center px-1 truncate"
          style={{ top: '44%', fontSize: Math.max(8, size * 0.09), color: BOOK_CREAM, fontStyle: 'italic' }}
        >
          {page.kind === 'title' ? 'Title' : page.trip?.title}
        </div>
      )}

      {page.kind === 'blank' && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: 9, color: '#B5ADA5' }}>
          {page.auto ? 'blank' : ''}
        </div>
      )}
    </button>
  )
}
