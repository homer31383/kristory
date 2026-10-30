import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getStorageUrl } from '../lib/helpers'
import { useUser } from './useUser'
import type { Book, BookItem, User } from '../types'
import { draftItem, type BookEntry, type BookMilestone } from '../book/model'

const BOOK_ENTRY_SELECT =
  'id, entry_date, ' +
  'sections:entry_sections!entry_id(id, user_id, content, updated_at, user:users!user_id(id, name)), ' +
  'photos:entry_photos!entry_id(*), ' +
  'tagged_items:tagged_items!entry_id(id, name, category:categories!category_id(id, name, emoji)), ' +
  'trip_entries:trip_entries!entry_id(trip:trips!trip_id(id, title, start_date, end_date, cover_photo_path))'

type QueryResult = PromiseLike<{ data: unknown; error: { message: string } | null }>

/** Reads every row past PostgREST's row cap, one range at a time. */
async function fetchPaged<T>(query: (from: number, to: number) => QueryResult, pageSize = 500): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < pageSize) return out
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** The journal entries a book draws from: its trip's entries, or its date range. */
export async function fetchBookEntries(book: Book): Promise<BookEntry[]> {
  if (book.trip_id) {
    const { data: links, error } = await supabase.from('trip_entries').select('entry_id').eq('trip_id', book.trip_id)
    if (error) throw error
    const ids = (links ?? []).map((l: { entry_id: string }) => l.entry_id)
    const entries: BookEntry[] = []
    for (const part of chunk(ids, 150)) {
      const { data, error: e } = await supabase.from('journal_entries').select(BOOK_ENTRY_SELECT).in('id', part)
      if (e) throw e
      entries.push(...((data ?? []) as unknown as BookEntry[]))
    }
    return entries.sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  }

  return fetchPaged<BookEntry>((from, to) => {
    let q = supabase.from('journal_entries').select(BOOK_ENTRY_SELECT)
    if (book.date_from) q = q.gte('entry_date', book.date_from)
    if (book.date_to) q = q.lte('entry_date', book.date_to)
    return q.order('entry_date').range(from, to)
  })
}

// ── Books ────────────────────────────────────────────────────────────────────

export function useBooks() {
  return useQuery({
    queryKey: ['books'],
    queryFn: async () => {
      const { data, error } = await supabase.from('book_books').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Book[]
    },
  })
}

export function useBook(bookId: string | undefined) {
  return useQuery({
    queryKey: ['book', bookId],
    enabled: !!bookId,
    queryFn: async () => {
      const { data, error } = await supabase.from('book_books').select('*').eq('id', bookId!).maybeSingle()
      if (error) throw error
      return (data ?? null) as Book | null
    },
  })
}

export type NewBook = Pick<Book, 'title' | 'date_from' | 'date_to' | 'trip_id' | 'include_authors' | 'trim_size' | 'page_limit'>

/** Creates the book, then drafts one item per entry. */
export function useCreateBook() {
  const queryClient = useQueryClient()
  const { user } = useUser()
  return useMutation({
    mutationFn: async (input: NewBook) => {
      const { data, error } = await supabase
        .from('book_books')
        .insert({ ...input, created_by: user?.id ?? null })
        .select()
        .single()
      if (error) throw error
      const book = data as Book
      const entries = await fetchBookEntries(book)
      await insertDrafts(entries.map((e) => draftItem(e, book, user?.id ?? null)))
      return book
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
  })
}

async function insertDrafts(rows: ReturnType<typeof draftItem>[]) {
  for (const part of chunk(rows, 200)) {
    // ignoreDuplicates: an entry already in the book keeps its decisions.
    const { error } = await supabase
      .from('book_items')
      .upsert(part, { onConflict: 'book_id,entry_id', ignoreDuplicates: true })
    if (error) throw error
  }
}

export function useUpdateBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<NewBook & Pick<Book, 'cover_choice'>> }) => {
      const { data, error } = await supabase
        .from('book_books')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Book
    },
    onSuccess: (book) => {
      queryClient.setQueryData(['book', book.id], book)
      queryClient.invalidateQueries({ queryKey: ['books'] })
      queryClient.invalidateQueries({ queryKey: ['book-entries', book.id] })
    },
  })
}

export function useDeleteBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('book_books').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
  })
}

// ── What a book reads ────────────────────────────────────────────────────────

export function useBookEntries(book: Book | null | undefined) {
  return useQuery({
    queryKey: ['book-entries', book?.id, book?.date_from, book?.date_to, book?.trip_id],
    enabled: !!book,
    queryFn: () => fetchBookEntries(book!),
  })
}

export function useBookItems(bookId: string | undefined) {
  return useQuery({
    queryKey: ['book-items', bookId],
    enabled: !!bookId,
    // Always refetch when the app regains focus: that is how changes other
    // than include/done (which arrive by realtime) reach the other person.
    staleTime: 0,
    queryFn: () =>
      fetchPaged<BookItem>(
        (from, to) =>
          supabase.from('book_items').select('*').eq('book_id', bookId!).order('sort_key').range(from, to),
        1000,
      ),
  })
}

export function useBookMilestones() {
  return useQuery({
    queryKey: ['book-milestones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_milestones')
        .select('entry_id, title, milestone_type')
        .not('entry_id', 'is', null)
      if (error) throw error
      return (data ?? []) as BookMilestone[]
    },
  })
}

export function useKristoryUsers() {
  return useQuery({
    queryKey: ['kristory-users'],
    staleTime: 1000 * 60 * 30,
    queryFn: async () => {
      const { data, error } = await supabase.from('users').select('id, name')
      if (error) throw error
      return (data ?? []) as User[]
    },
  })
}

/**
 * Entries written after the book was made (or brought in by a wider range)
 * get a draft item. Existing items are never touched or removed.
 */
export function useSyncBookItems(book: Book | null | undefined, entries: BookEntry[] | undefined, items: BookItem[] | undefined) {
  const queryClient = useQueryClient()
  const { user } = useUser()
  const running = useRef(false)
  useEffect(() => {
    if (!book || !entries || !items || running.current) return
    const have = new Set(items.map((i) => i.entry_id))
    const missing = entries.filter((e) => !have.has(e.id))
    if (missing.length === 0) return
    running.current = true
    insertDrafts(missing.map((e) => draftItem(e, book, user?.id ?? null)))
      .then(() => queryClient.invalidateQueries({ queryKey: ['book-items', book.id] }))
      .catch((err) => console.error('[book] Could not add new entries:', err))
      .finally(() => {
        running.current = false
      })
  }, [book, entries, items, user, queryClient])
}

// ── Item updates ─────────────────────────────────────────────────────────────

export type BookItemPatch = Partial<
  Pick<
    BookItem,
    | 'included'
    | 'done'
    | 'split_authors'
    | 'hero_photo_id'
    | 'photo_ids'
    | 'hidden_text'
    | 'layout_override'
    | 'caption_override'
    | 'pin_side'
    | 'sort_key'
  >
>

/** Same patch to one or many items. Optimistic; last save wins. */
export function useUpdateBookItems(bookId: string) {
  const queryClient = useQueryClient()
  const { user } = useUser()
  const key = ['book-items', bookId]
  return useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: BookItemPatch }) => {
      const stamped = { ...patch, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }
      for (const part of chunk(ids, 200)) {
        const { error } = await supabase.from('book_items').update(stamped).in('id', part)
        if (error) throw error
      }
    },
    onMutate: async ({ ids, patch }) => {
      await queryClient.cancelQueries({ queryKey: key })
      const previous = queryClient.getQueryData<BookItem[]>(key)
      const idSet = new Set(ids)
      const now = new Date().toISOString()
      queryClient.setQueryData<BookItem[]>(key, (old) =>
        old?.map((i) => (idSet.has(i.id) ? { ...i, ...patch, updated_by: user?.id ?? null, updated_at: now } : i)),
      )
      return { previous }
    },
    onError: (err, _vars, ctx) => {
      console.error('[book] Item update failed:', err)
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous)
      queryClient.invalidateQueries({ queryKey: key })
    },
  })
}

/**
 * Live include, done and "changed by" from the other person. Only those
 * fields are merged, so an editor open on this device is never overwritten
 * mid-edit; everything else arrives with the next refetch.
 */
export function useBookItemsRealtime(bookId: string | undefined) {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!bookId) return
    const key = ['book-items', bookId]
    const channel = supabase
      .channel(`book-items-${bookId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'book_items', filter: `book_id=eq.${bookId}` },
        (payload) => {
          const row = payload.new as BookItem
          queryClient.setQueryData<BookItem[]>(key, (old) =>
            old?.map((i) =>
              i.id === row.id
                ? { ...i, included: row.included, done: row.done, updated_by: row.updated_by, updated_at: row.updated_at }
                : i,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'book_items', filter: `book_id=eq.${bookId}` },
        () => queryClient.invalidateQueries({ queryKey: key }),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'book_items', filter: `book_id=eq.${bookId}` },
        () => queryClient.invalidateQueries({ queryKey: key }),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [bookId, queryClient])
}

// ── Photo sizes ──────────────────────────────────────────────────────────────

function loadImageSize(url: string): Promise<{ w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/**
 * Photos uploaded before migration 034 have no width/height. Measure them in
 * the background, save the size on entry_photos (once per photo, ever), and
 * patch the cached entries so orientation and DPI fill in as it goes.
 */
export function usePhotoSizeBackfill(book: Book | null | undefined, entries: BookEntry[] | undefined) {
  const queryClient = useQueryClient()
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  // Read through refs so the cache patches below do not restart the run.
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const bookRef = useRef(book)
  bookRef.current = book
  const loaded = !!entries
  const runKey = book ? `${book.id}|${book.date_from}|${book.date_to}|${book.trip_id}` : null

  useEffect(() => {
    const b = bookRef.current
    const list = entriesRef.current
    if (!runKey || !b || !list) return
    const missing = list.flatMap((e) => e.photos.filter((p) => !p.width || !p.height))
    if (missing.length === 0) return
    let cancelled = false
    const key = ['book-entries', b.id, b.date_from, b.date_to, b.trip_id]

    ;(async () => {
      let done = 0
      setProgress({ done, total: missing.length })
      const sizes = new Map<string, { w: number; h: number }>()
      const flush = () => {
        if (sizes.size === 0) return
        const batch = new Map(sizes)
        sizes.clear()
        queryClient.setQueryData<BookEntry[]>(key, (old) =>
          old?.map((e) => ({
            ...e,
            photos: e.photos.map((p) => {
              const s = batch.get(p.id)
              return s ? { ...p, width: s.w, height: s.h } : p
            }),
          })),
        )
      }
      const queue = [...missing]
      const worker = async () => {
        while (!cancelled && queue.length > 0) {
          const photo = queue.shift()!
          const size = await loadImageSize(getStorageUrl(photo.storage_path))
          if (size) {
            sizes.set(photo.id, size)
            const { error } = await supabase
              .from('entry_photos')
              .update({ width: size.w, height: size.h })
              .eq('id', photo.id)
            if (error) console.error('[book] Could not save photo size:', error.message)
          }
          done++
          if (done % 12 === 0) {
            flush()
            setProgress({ done, total: missing.length })
          }
        }
      }
      await Promise.all([worker(), worker(), worker(), worker()])
      if (cancelled) return
      flush()
      setProgress(null)
    })()

    return () => {
      cancelled = true
      setProgress(null)
    }
  }, [runKey, loaded, queryClient])

  return progress
}
