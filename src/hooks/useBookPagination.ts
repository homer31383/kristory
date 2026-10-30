import { useMemo } from 'react'
import { useBook, useBookEntries, useBookItems, useBookMilestones } from './useBooks'
import { buildItemView, type BookMilestone, type BookPhoto, type ItemView } from '../book/model'
import { paginate } from '../book/paginate'
import { buildCoverData } from '../book/cover'
import { useTextFitter } from '../book/fit'

/**
 * Everything the review, preview and print screens need, computed one way:
 * the book, its item views, the pages from paginate() (text measured on the
 * real layouts once the fonts load), and the cover.
 */
export function useBookPagination(bookId: string | undefined) {
  const bookQ = useBook(bookId)
  const book = bookQ.data
  const entriesQ = useBookEntries(book)
  const itemsQ = useBookItems(bookId)
  const { data: milestones = [] } = useBookMilestones()
  const fit = useTextFitter()
  const entries = entriesQ.data
  const items = itemsQ.data

  const derived = useMemo(() => {
    const photoById = new Map<string, BookPhoto>()
    const entryById = new Map((entries ?? []).map((e) => [e.id, e]))
    for (const e of entries ?? []) for (const p of e.photos) photoById.set(p.id, { ...p, entry_date: e.entry_date })
    const milestoneByEntry = new Map<string, BookMilestone>(milestones.map((m) => [m.entry_id, m]))

    const views: ItemView[] = []
    if (book) {
      for (const item of items ?? []) {
        const entry = entryById.get(item.entry_id)
        if (entry) views.push(buildItemView(item, entry, book, photoById, milestoneByEntry))
      }
      views.sort((a, b) => a.item.sort_key - b.item.sort_key || a.entry.entry_date.localeCompare(b.entry.entry_date))
    }
    const bookTrip =
      book?.trip_id ? entries?.flatMap((e) => e.trip_entries).find((te) => te.trip?.id === book.trip_id)?.trip ?? null : null
    const ready = !!book && !!entries && !!items
    return {
      views,
      viewById: new Map(views.map((v) => [v.item.id, v])),
      photoById,
      bookTrip,
      pagination: ready ? paginate(book, views, bookTrip, fit) : null,
      coverData: ready ? buildCoverData(book, views, photoById) : null,
    }
  }, [book, entries, items, milestones, fit])

  return {
    book,
    entries,
    items,
    isLoading: bookQ.isLoading || (!!book && (entriesQ.isLoading || itemsQ.isLoading)),
    error: (bookQ.error ?? entriesQ.error ?? itemsQ.error) as Error | null,
    measured: !!fit,
    ...derived,
  }
}
