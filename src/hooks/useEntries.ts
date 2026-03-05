import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { sanitizeHtml, getTodayString } from '../lib/helpers'
import type { JournalEntry, EntrySection, EntryPhoto, TaggedItem } from '../types'

const ENTRY_SELECT = '*, sections:entry_sections!entry_id(*, user:users!user_id(id, name)), photos:entry_photos!entry_id(*), tagged_items:tagged_items!entry_id(*, category:categories!category_id(*)), trip_entries:trip_entries!entry_id(*, trip:trips!trip_id(*))'

export function useEntry(date: string) {
  return useQuery({
    queryKey: ['entry', date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select(ENTRY_SELECT)
        .eq('entry_date', date)
        .maybeSingle()

      if (error) throw error
      return data as JournalEntry | null
    },
    enabled: !!date,
  })
}

export function useEntriesByMonth(startDate: string) {
  return useInfiniteQuery({
    queryKey: ['entries', 'timeline'],
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select(ENTRY_SELECT)
        .lte('entry_date', pageParam)
        .order('entry_date', { ascending: false })
        .limit(30)

      if (error) throw error
      return (data ?? []) as JournalEntry[]
    },
    initialPageParam: startDate,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < 30) return undefined
      const lastEntry = lastPage[lastPage.length - 1]
      if (!lastEntry) return undefined
      // Get the day before the last entry
      const d = new Date(lastEntry.entry_date)
      d.setDate(d.getDate() - 1)
      return d.toISOString().split('T')[0]
    },
  })
}

export function useCreateEntry() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (date: string) => {
      const { data, error } = await supabase
        .from('journal_entries')
        .insert({ entry_date: date })
        .select()
        .single()

      if (error) throw error
      return data as JournalEntry
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['entry', data.entry_date], { ...data, sections: [], photos: [], tagged_items: [], trip_entries: [] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
    },
  })
}

export function useUpsertSection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      entryId,
      userId,
      content,
    }: {
      entryId: string
      userId: string
      content: string
      entryDate: string
    }) => {
      const sanitized = sanitizeHtml(content)
      const { data, error } = await supabase
        .from('entry_sections')
        .upsert(
          { entry_id: entryId, user_id: userId, content: sanitized, updated_at: new Date().toISOString() },
          { onConflict: 'entry_id,user_id' }
        )
        .select()
        .single()

      if (error) throw error
      return data as EntrySection
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['entry', variables.entryDate] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
    },
  })
}

export function useUploadPhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      entryId,
      entryDate,
      userId,
      blob,
    }: {
      entryId: string
      entryDate: string
      userId: string
      blob: Blob
    }) => {
      const fileName = `${entryDate}/${crypto.randomUUID()}.jpg`
      console.error(`[useUploadPhoto] Uploading to Storage: kristory-photos/${fileName} (${blob.size} bytes)`)

      const { error: uploadError } = await supabase.storage
        .from('kristory-photos')
        .upload(fileName, blob, { contentType: 'image/jpeg' })

      if (uploadError) {
        console.error('[useUploadPhoto] Storage upload FAILED:', uploadError.message)
        throw uploadError
      }
      console.error('[useUploadPhoto] Storage upload succeeded, inserting into entry_photos...')

      const { data, error } = await supabase
        .from('entry_photos')
        .insert({ entry_id: entryId, user_id: userId, storage_path: fileName })
        .select()
        .single()

      if (error) {
        console.error('[useUploadPhoto] DB insert FAILED:', error.message, error.details)
        throw error
      }
      console.error(`[useUploadPhoto] entry_photos row created: ${data.id}`)
      return data as EntryPhoto
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['entry', variables.entryDate] })
    },
  })
}

export function useDeletePhoto() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ photoId, storagePath }: { photoId: string; storagePath: string; entryDate: string }) => {
      await supabase.storage.from('kristory-photos').remove([storagePath])
      const { error } = await supabase.from('entry_photos').delete().eq('id', photoId)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['entry', variables.entryDate] })
    },
  })
}

export function useAddTaggedItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      entryId,
      categoryId,
      userId,
      name,
      rating,
      locationName,
      locationLat,
      locationLng,
      locationPlaceId,
      ingredients,
      instructions,
      recipeTagIds,
    }: {
      entryId: string
      entryDate: string
      categoryId: string
      userId: string
      name: string
      rating?: number | null
      locationName?: string | null
      locationLat?: number | null
      locationLng?: number | null
      locationPlaceId?: string | null
      ingredients?: string | null
      instructions?: string | null
      recipeTagIds?: string[]
    }) => {
      const { data, error } = await supabase
        .from('tagged_items')
        .insert({
          entry_id: entryId,
          category_id: categoryId,
          user_id: userId,
          name,
          rating: rating ?? null,
          location_name: locationName ?? null,
          location_lat: locationLat ?? null,
          location_lng: locationLng ?? null,
          location_place_id: locationPlaceId ?? null,
          ingredients: ingredients ?? null,
          instructions: instructions ?? null,
        })
        .select('*, category:categories!category_id(*)')
        .single()

      if (error) throw error

      // Add recipe tags if provided
      if (recipeTagIds && recipeTagIds.length > 0) {
        const junctionRows = recipeTagIds.map((tagId) => ({
          tagged_item_id: data.id,
          recipe_tag_id: tagId,
        }))
        await supabase.from('tagged_item_recipe_tags').insert(junctionRows)
      }

      return data as TaggedItem
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['entry', variables.entryDate] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['tagged-items'] })
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['home-cooking-recipes'] })
    },
  })
}

export function useDeleteTaggedItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string; entryDate: string }) => {
      const { error } = await supabase.from('tagged_items').delete().eq('id', itemId)
      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['entry', variables.entryDate] })
      queryClient.invalidateQueries({ queryKey: ['tagged-items'] })
    },
  })
}

export function useSearchEntries(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: async () => {
      if (!query.trim()) return []

      // Search entry sections via FTS
      const { data: sectionResults, error: sectionError } = await supabase
        .from('entry_sections')
        .select('entry_id, content')
        .textSearch('fts', query.trim().split(/\s+/).join(' & '))
        .limit(50)

      if (sectionError) throw sectionError

      // Search tagged items
      const { data: itemResults, error: itemError } = await supabase
        .from('tagged_items')
        .select('entry_id, name, category:categories!category_id(*)')
        .ilike('name', `%${query.trim()}%`)
        .limit(50)

      if (itemError) throw itemError

      // Collect unique entry IDs
      const entryIds = [...new Set([
        ...(sectionResults?.map(s => s.entry_id) ?? []),
        ...(itemResults?.map(i => i.entry_id) ?? []),
      ])]

      if (entryIds.length === 0) return []

      const { data, error } = await supabase
        .from('journal_entries')
        .select(ENTRY_SELECT)
        .in('id', entryIds)
        .order('entry_date', { ascending: false })

      if (error) throw error
      return (data ?? []) as JournalEntry[]
    },
    enabled: query.trim().length > 0,
  })
}

export function useOnThisDay() {
  const today = getTodayString()
  const monthDay = today.slice(5) // MM-DD

  return useQuery({
    queryKey: ['on-this-day', monthDay],
    queryFn: async () => {
      // Get entries where month and day match but not current year
      const { data, error } = await supabase
        .from('journal_entries')
        .select(ENTRY_SELECT)
        .like('entry_date', `%-${monthDay}`)
        .neq('entry_date', today)
        .order('entry_date', { ascending: false })

      if (error) throw error
      return (data ?? []) as JournalEntry[]
    },
  })
}
