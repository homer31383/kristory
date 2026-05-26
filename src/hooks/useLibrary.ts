import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BookFormat, BookStatus, Category, MediaTag, TaggedItem } from '../types'
import { BOOKS_CATEGORY_NAME, HALL_OF_FAME_CAP, LIBRARY_CATEGORY_NAMES } from '../lib/constants'

/**
 * Hooks for The Library — books + the other experience-based categories
 * (movies, tv, restaurants, music, activities). Rich fields land on
 * tagged_items via migration 030; media_tags is a parallel table to
 * recipe_tags but scoped per category_type.
 *
 * Cache-key conventions:
 *  ['books']                       — Books list (any filter view)
 *  ['book', id]                    — single book by id
 *  ['hall-of-fame']                — across all Library categories
 *  ['currently-reading']           — Library items currently being consumed
 *  ['library-previews']            — recent items per Library category
 *  ['media-tags', category_type]   — tag taxonomy for a category
 *  ['books-category-id']           — resolved Books category row id
 */

const BOOK_SELECT =
  '*, category:categories!category_id(*), entry:journal_entries!entry_id(entry_date), user:users!user_id(id, name), media_tags:tagged_item_media_tags!tagged_item_id(tag:media_tags!media_tag_id(*)), participants:tagged_item_participants!tagged_item_id(user:users!user_id(id, name))'

// ─── Resolve Books category id ─────────────────────────────────────────
export function useBooksCategoryId() {
  return useQuery({
    queryKey: ['books-category-id'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', BOOKS_CATEGORY_NAME)
        .maybeSingle()
      if (error) throw error
      return (data?.id as string | undefined) ?? null
    },
  })
}

// ─── Media tags (Library tag taxonomy) ─────────────────────────────────
export function useMediaTags(categoryType = 'books') {
  return useQuery({
    queryKey: ['media-tags', categoryType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('media_tags')
        .select('*')
        .eq('category_type', categoryType)
        .order('name')
      if (error) throw error
      return (data ?? []) as MediaTag[]
    },
  })
}

export function useCreateMediaTag() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, categoryType = 'books' }: { name: string; categoryType?: string }) => {
      const { data, error } = await supabase
        .from('media_tags')
        .insert({ name, category_type: categoryType })
        .select()
        .single()
      if (error) throw error
      return data as MediaTag
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-tags'] })
    },
  })
}

// ─── Hall of Fame (across all Library categories) ──────────────────────
export function useHallOfFame() {
  return useQuery({
    queryKey: ['hall-of-fame'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tagged_items')
        .select(BOOK_SELECT)
        .eq('hall_of_fame', true)
        .order('rating', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(HALL_OF_FAME_CAP)
      if (error) throw error
      return (data ?? []) as TaggedItem[]
    },
  })
}

// ─── Currently Reading (status = 'reading') ────────────────────────────
export function useCurrentlyReading() {
  return useQuery({
    queryKey: ['currently-reading'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tagged_items')
        .select(BOOK_SELECT)
        .eq('status', 'reading')
        .order('start_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return (data ?? []) as TaggedItem[]
    },
  })
}

// ─── Recent items per Library category ────────────────────────────────
export function useLibraryCategoryPreviews() {
  return useQuery({
    queryKey: ['library-previews'],
    queryFn: async () => {
      // Find every category whose name is one of the Library set.
      const lowerNames = LIBRARY_CATEGORY_NAMES.map((n) => n.toLowerCase())
      const { data: cats, error: catErr } = await supabase
        .from('categories')
        .select('*')
      if (catErr) throw catErr
      const libraryCats = (cats ?? []).filter((c) =>
        lowerNames.includes((c.name ?? '').toLowerCase()),
      ) as Category[]

      // Pull recent items + exact count for each in parallel.
      const previews = await Promise.all(
        libraryCats.map(async (cat) => {
          const { data, count, error } = await supabase
            .from('tagged_items')
            .select(BOOK_SELECT, { count: 'exact' })
            .eq('category_id', cat.id)
            .order('created_at', { ascending: false })
            .limit(3)
          if (error) throw error
          return {
            category: cat,
            items: (data ?? []) as TaggedItem[],
            count: count ?? 0,
          }
        }),
      )
      return previews
    },
  })
}

// ─── Books list / single ───────────────────────────────────────────────
export interface BookFilters {
  status?: BookStatus | 'all' | 'favorites' | 'art' | null
  mediaTagIds?: string[]
  search?: string
  sort?: 'recent' | 'rating' | 'title' | 'author'
}

export function useBooks(categoryId: string | null | undefined, filters: BookFilters = {}) {
  return useQuery({
    queryKey: ['books', categoryId, filters],
    queryFn: async () => {
      if (!categoryId) return [] as TaggedItem[]
      let query = supabase
        .from('tagged_items')
        .select(BOOK_SELECT)
        .eq('category_id', categoryId)

      if (filters.status === 'favorites') {
        query = query.eq('favorite', true)
      } else if (filters.status && filters.status !== 'all' && filters.status !== 'art') {
        query = query.eq('status', filters.status)
      }

      if (filters.search?.trim()) {
        const q = filters.search.trim()
        // PostgREST `.or()` with ilike — search name, author, themes, what_stuck
        query = query.or(
          `name.ilike.%${q}%,author.ilike.%${q}%,themes.ilike.%${q}%,what_stuck.ilike.%${q}%`,
        )
      }

      const sort = filters.sort ?? 'recent'
      if (sort === 'recent') {
        query = query.order('created_at', { ascending: false })
      } else if (sort === 'rating') {
        query = query.order('rating', { ascending: false, nullsFirst: false })
      } else if (sort === 'title') {
        query = query.order('name')
      } else if (sort === 'author') {
        query = query.order('author', { nullsFirst: false }).order('name')
      }

      const { data, error } = await query.limit(500)
      if (error) throw error
      let items = (data ?? []) as TaggedItem[]

      // Art Books pill — filter client-side because it crosses to media_tags.
      if (filters.status === 'art') {
        items = items.filter((it) =>
          (it.media_tags ?? []).some((mt) => mt.tag.name.toLowerCase() === 'art'),
        )
      }
      // Tag pill filter — AND across selected tag ids.
      if (filters.mediaTagIds && filters.mediaTagIds.length > 0) {
        const wanted = new Set(filters.mediaTagIds)
        items = items.filter((it) => {
          const ids = new Set((it.media_tags ?? []).map((mt) => mt.tag.id))
          for (const id of wanted) if (!ids.has(id)) return false
          return true
        })
      }
      return items
    },
    enabled: !!categoryId,
  })
}

export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: ['book', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tagged_items')
        .select(BOOK_SELECT)
        .eq('id', id!)
        .single()
      if (error) throw error
      return data as TaggedItem
    },
    enabled: !!id,
  })
}

// ─── Book mutations ────────────────────────────────────────────────────
export interface BookInput {
  categoryId: string
  userId: string
  name: string
  author?: string | null
  subtitle?: string | null
  status?: BookStatus
  format?: BookFormat | null
  rating?: number | null
  cover_url?: string | null
  isbn?: string | null
  page_count?: number | null
  summary?: string | null
  themes?: string | null
  what_stuck?: string | null
  recommended_by?: string | null
  start_date?: string | null
  finish_date?: string | null
  subcategory?: string | null
  favorite?: boolean
  hall_of_fame?: boolean
  mediaTagIds?: string[]
}

export function useCreateBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: BookInput) => {
      const { mediaTagIds, categoryId, userId, ...fields } = input
      const { data, error } = await supabase
        .from('tagged_items')
        .insert({
          category_id: categoryId,
          user_id: userId,
          ...fields,
          status: fields.status ?? 'want',
          favorite: fields.favorite ?? false,
          hall_of_fame: fields.hall_of_fame ?? false,
        })
        .select(BOOK_SELECT)
        .single()
      if (error) throw error

      if (mediaTagIds && mediaTagIds.length > 0) {
        const rows = mediaTagIds.map((tagId) => ({
          tagged_item_id: data.id,
          media_tag_id: tagId,
        }))
        await supabase.from('tagged_item_media_tags').insert(rows)
      }
      return data as TaggedItem
    },
    onSuccess: () => {
      invalidateLibrary(queryClient)
    },
  })
}

export interface BookPatch {
  id: string
  name?: string
  author?: string | null
  subtitle?: string | null
  status?: BookStatus
  format?: BookFormat | null
  rating?: number | null
  cover_url?: string | null
  isbn?: string | null
  page_count?: number | null
  summary?: string | null
  themes?: string | null
  what_stuck?: string | null
  recommended_by?: string | null
  start_date?: string | null
  finish_date?: string | null
  subcategory?: string | null
  favorite?: boolean
  hall_of_fame?: boolean
  mediaTagIds?: string[]
}

export function useUpdateBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (patch: BookPatch) => {
      const { id, mediaTagIds, ...fields } = patch
      const updates: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v
      }
      if (Object.keys(updates).length > 0) {
        const { error } = await supabase.from('tagged_items').update(updates).eq('id', id)
        if (error) throw error
      }
      if (mediaTagIds !== undefined) {
        await supabase.from('tagged_item_media_tags').delete().eq('tagged_item_id', id)
        if (mediaTagIds.length > 0) {
          const rows = mediaTagIds.map((tagId) => ({
            tagged_item_id: id,
            media_tag_id: tagId,
          }))
          await supabase.from('tagged_item_media_tags').insert(rows)
        }
      }
    },
    onSuccess: () => {
      invalidateLibrary(queryClient)
    },
  })
}

export function useDeleteBook() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tagged_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateLibrary(queryClient)
    },
  })
}

// ─── Quick toggles ─────────────────────────────────────────────────────
export function useToggleFavorite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, favorite }: { id: string; favorite: boolean }) => {
      const { error } = await supabase
        .from('tagged_items')
        .update({ favorite })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateLibrary(queryClient)
    },
  })
}

/**
 * Hall of Fame is hard-capped — caller must check the count before flipping
 * it on. The capped check returns `false` if the cap is hit; UI surfaces
 * a message rather than silently failing.
 */
export function useToggleHallOfFame() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, hall_of_fame }: { id: string; hall_of_fame: boolean }) => {
      if (hall_of_fame) {
        const { count, error: cErr } = await supabase
          .from('tagged_items')
          .select('id', { count: 'exact', head: true })
          .eq('hall_of_fame', true)
        if (cErr) throw cErr
        if ((count ?? 0) >= HALL_OF_FAME_CAP) {
          throw new Error(`Hall of Fame is full (${HALL_OF_FAME_CAP}/${HALL_OF_FAME_CAP}). Remove one to add this.`)
        }
      }
      const { error } = await supabase
        .from('tagged_items')
        .update({ hall_of_fame })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      invalidateLibrary(queryClient)
    },
  })
}

function invalidateLibrary(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['books'] })
  queryClient.invalidateQueries({ queryKey: ['book'] })
  queryClient.invalidateQueries({ queryKey: ['hall-of-fame'] })
  queryClient.invalidateQueries({ queryKey: ['currently-reading'] })
  queryClient.invalidateQueries({ queryKey: ['library-previews'] })
  queryClient.invalidateQueries({ queryKey: ['category-counts'] })
}
