import { format, parse } from 'date-fns'
import type { PagePhoto } from '../paginate'

/** What the title page and the covers show. Built in src/book/cover.ts. */
export interface CoverData {
  /** Under the wordmark, e.g. "Summer 2025". */
  subtitle: string
  frontPhoto?: PagePhoto
  backPhoto?: PagePhoto
  /** The back cover line. */
  backQuote: string
}

/** "July 16 to 21, 2025", "July 28 to August 3, 2025", or across years. */
export function dateRangeLabel(from: string, to: string): string {
  const a = parse(from, 'yyyy-MM-dd', new Date())
  const b = parse(to, 'yyyy-MM-dd', new Date())
  if (from === to) return format(a, 'MMMM d, yyyy')
  if (a.getFullYear() !== b.getFullYear()) return `${format(a, 'MMMM d, yyyy')} to ${format(b, 'MMMM d, yyyy')}`
  if (a.getMonth() !== b.getMonth()) return `${format(a, 'MMMM d')} to ${format(b, 'MMMM d, yyyy')}`
  return `${format(a, 'MMMM d')} to ${format(b, 'd, yyyy')}`
}
