import { format, parse } from 'date-fns'
import { getStorageUrl } from '../lib/helpers'
import { LAYOUTS, type PageTone } from './catalog'
import { AUTHOR_COLORS, type AuthorKey } from './model'
import type { BookPage, ItemFlag } from './paginate'
import { COLOR, alpha } from './tokens'

export const BOOK_NAVY =
  `radial-gradient(ellipse 72% 64% at 50% 47%, ${COLOR.navy1} 0%, ${COLOR.navy2} 36%, ${COLOR.navy3} 68%, ${COLOR.navy4} 100%)`
export const BOOK_CREAM = COLOR.cream
export const BOOK_GOLD_DARK = COLOR.gold

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
        backgroundColor: hard ? alpha(COLOR.coral, 0.14) : alpha(COLOR.gold, 0.18),
        color: hard ? '#B23A35' : '#8A6216',
      }}
    >
      {flag.label}
    </span>
  )
}

const TONE_BG: Record<PageTone, string> = {
  white: COLOR.white,
  pale: `radial-gradient(ellipse 85% 75% at 50% 45%, ${COLOR.pale0} 0%, ${COLOR.pale1} 70%, ${COLOR.pale2} 100%)`,
  navy: BOOK_NAVY,
  mid: `radial-gradient(ellipse 80% 70% at 50% 42%, ${COLOR.mid1} 0%, ${COLOR.mid2} 34%, ${COLOR.mid3} 66%, ${COLOR.mid4} 100%)`,
  photo: COLOR.navyDeep,
  indigo: COLOR.plum,
}

/**
 * A small schematic of one page for the review filmstrip: real photo
 * thumbnails in the layout's slots and lines where text goes. The preview
 * (/book/:id/preview) renders the finished pages.
 */
export function PageThumb({
  page,
  size,
  onClick,
}: {
  page: BookPage
  size: number
  onClick?: () => void
}) {
  const layout = LAYOUTS[page.layout]
  const dark = layout.tone !== 'white' && layout.tone !== 'pale'
  const box = layout.textBox
  const hasText = page.blocks.length > 0 || !!page.quiet
  const lineCount = box && hasText ? Math.max(1, Math.min(8, Math.floor(box.h / 0.06))) : 0
  const pct = (v: number) => `${v * 100}%`

  return (
    <button
      type="button"
      onClick={onClick}
      className="relative overflow-hidden flex-shrink-0 cursor-pointer"
      style={{ width: size, height: size, background: TONE_BG[layout.tone], boxShadow: '0 1px 3px rgba(0,0,0,0.18)' }}
      title={`Page ${page.number}: ${layout.label}`}
    >
      {page.photos.map(({ photo, focalX, focalY }, j) => {
        const slot = layout.slots[j]
        if (!slot) return null
        return (
          <img
            key={photo.id + j}
            src={getStorageUrl(photo.storage_path)}
            alt=""
            loading="lazy"
            className="absolute object-cover"
            style={{
              left: pct(slot.x),
              top: pct(slot.y),
              width: pct(slot.w),
              height: pct(slot.h),
              objectPosition: `${focalX * 100}% ${focalY * 100}%`,
            }}
          />
        )
      })}

      {page.entryDate && page.layout !== 'two-quiet' && (
        <div
          className="absolute left-0 right-0 text-center truncate px-1"
          style={{ top: '3%', fontSize: Math.max(7, size * 0.07), color: dark ? BOOK_GOLD_DARK : COLOR.goldDeep }}
        >
          {format(parse(page.entryDate, 'yyyy-MM-dd', new Date()), 'MMM d')}
        </div>
      )}

      {box &&
        Array.from({ length: lineCount }).map((_, k) => (
          <div
            key={k}
            className="absolute rounded-full"
            style={{
              left: pct(box.x),
              top: pct(box.y + k * Math.min(0.06, box.h / lineCount)),
              width: pct(box.w * (k === lineCount - 1 ? 0.6 : 1)),
              height: Math.max(1, size * 0.012),
              backgroundColor: dark ? alpha(COLOR.cream, 0.35) : 'rgba(44,37,34,0.18)',
            }}
          />
        ))}

      {(page.kind === 'title' || page.kind === 'chapter') && (
        <div
          className="absolute inset-x-0 text-center px-1 truncate"
          style={{ top: page.kind === 'title' ? '40%' : '12%', fontSize: Math.max(8, size * 0.09), color: dark ? BOOK_CREAM : COLOR.ink, fontStyle: 'italic' }}
        >
          {page.kind === 'title' ? 'The Kristory' : page.trip?.title}
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
