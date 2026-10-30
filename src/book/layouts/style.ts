import type { CSSProperties } from 'react'
import { format, parse } from 'date-fns'
import { getStorageUrl } from '../../lib/helpers'
import type { AuthorKey } from '../model'
import type { PagePhoto } from '../paginate'

/** Style values and helpers shared by the page layouts (see parts.tsx). */

/** Light pages (white, pale blue-gray) or dark pages (navy, mid blue, photo). */
export type Tone = 'light' | 'dark' | 'mid'

export const pretty = { textWrap: 'pretty' } as CSSProperties
export const balance = { textWrap: 'balance' } as CSSProperties

export const BG = {
  navy: (at = '50% 45%', size = '80% 70%') =>
    `radial-gradient(ellipse ${size} at ${at}, #22376E 0%, #172751 36%, #0E173B 68%, #070C26 100%)`,
  mid: 'radial-gradient(ellipse 80% 70% at 50% 42%, #3A5799 0%, #284382 34%, #1C3166 66%, #121F4C 100%)',
  pale: (at = '50% 45%') => `radial-gradient(ellipse 85% 75% at ${at}, #F1F4FA 0%, #E6EBF5 70%, #DDE4F1 100%)`,
}

/** The gutter gets 60 px and the outer edge 48 px, mirrored by page side. */
export function pad(side: 'left' | 'right', top: number, bottom: number) {
  return side === 'left' ? `${top}px 60px ${bottom}px 48px` : `${top}px 48px ${bottom}px 60px`
}

/** The colored rule beside each author's text. */
export function ruleColor(author: AuthorKey | null, tone: Tone): string {
  if (tone === 'light') return author === 'krista' ? '#D4708F' : '#6B5CA5'
  if (tone === 'mid') return author === 'krista' ? '#E88BA8' : '#8B7EC8'
  return author === 'krista' ? '#D4708F' : '#8B7EC8'
}

export function scriptDate(entryDate: string | undefined, pattern = 'MMMM d') {
  return entryDate ? format(parse(entryDate, 'yyyy-MM-dd', new Date()), pattern) : ''
}

/** The print copy when there is one, else the stored photo. */
export function photoUrl(p: PagePhoto['photo']): string {
  return getStorageUrl(p.print_path || p.storage_path)
}

