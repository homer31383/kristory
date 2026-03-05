import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parse } from 'date-fns'
import { supabase } from '../lib/supabase'
import type { Trip, JournalEntry } from '../types'

const TRIP_ENTRY_SELECT = '*, sections:entry_sections!entry_id(*), photos:entry_photos!entry_id(*), tagged_items:tagged_items!entry_id(*, category:categories!category_id(*))'

// Select string that includes trip_entries so we can filter out already-tripped entries
const SUGGEST_SELECT = '*, sections:entry_sections!entry_id(content), photos:entry_photos!entry_id(storage_path), tagged_items:tagged_items!entry_id(location_name, name, category:categories!category_id(name)), trip_entries:trip_entries!entry_id(trip_id)'

export interface SuggestedTripEntry {
  date: string
  preview: string
}

export interface SuggestedTrip {
  id: string
  title: string
  startDate: string
  endDate: string
  entryIds: string[]
  entryCount: number
  signals: string[]
  locations: string[]
  entryPreviews: SuggestedTripEntry[]
}

const TRIP_KEYWORDS = /\b(hotel|airbnb|drove|driving|flight|flew|fly|vacation|weekend away|trip|beach|cabin|upstate|resort|camping|road trip|hiking|national park|checked in|check-in|checked out|travel|traveling|travelling|airport|luggage|suitcase|rental car|bed and breakfast|hostel|motel|layover|itinerary)\b/i

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ')
}

function analyzeForTrips(entries: JournalEntry[]): SuggestedTrip[] {
  // For each entry, check for trip signals
  const analyzed = entries.map(entry => {
    const signals: string[] = []
    const locations: string[] = []

    // Check tagged items for location names
    for (const item of entry.tagged_items ?? []) {
      if (item.location_name) {
        locations.push(item.location_name)
        signals.push(`location: ${item.location_name}`)
      }
    }

    // Check section content for keywords
    const content = (entry.sections ?? []).map(s => s.content ?? '').join(' ')
    const stripped = stripHtml(content)
    const found = new Set<string>()
    let match: RegExpExecArray | null
    const re = new RegExp(TRIP_KEYWORDS.source, 'gi')
    while ((match = re.exec(stripped)) !== null) {
      const kw = match[0].toLowerCase()
      if (!found.has(kw)) {
        found.add(kw)
        signals.push(`keyword: ${kw}`)
      }
    }

    // Detect batch-imported entries: entries for past dates that were created
    // within a tight window of each other (created_at is close to another entry's)
    // We'll check this at the group level instead.

    return { entry, signals, locations, hasSignal: signals.length > 0 }
  })

  // Group consecutive flagged entries, allowing up to a 1-day gap
  const groups: { items: typeof analyzed }[] = []
  let current: typeof analyzed = []

  for (const item of analyzed) {
    if (!item.hasSignal) {
      // Flush if we have 2+ entries
      if (current.length >= 2) {
        groups.push({ items: [...current] })
      }
      current = []
      continue
    }

    if (current.length > 0) {
      const lastDate = new Date(current[current.length - 1].entry.entry_date)
      const thisDate = new Date(item.entry.entry_date)
      const diffDays = Math.round(
        (thisDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
      )

      if (diffDays > 2) {
        // Too big a gap — flush
        if (current.length >= 2) {
          groups.push({ items: [...current] })
        }
        current = []
      }
    }

    current.push(item)
  }

  if (current.length >= 2) {
    groups.push({ items: [...current] })
  }

  // Also detect batch-imported runs: consecutive date entries created within
  // 5 minutes of each other, even if they have no keywords
  const batchGroups = detectBatchImports(analyzed)
  for (const bg of batchGroups) {
    // Only add if not already covered by a keyword-based group
    const bgDates = new Set(bg.map(e => e.entry_date))
    const alreadyCovered = groups.some(g =>
      g.items.some(i => bgDates.has(i.entry.entry_date))
    )
    if (!alreadyCovered && bg.length >= 2) {
      groups.push({
        items: bg.map(e => ({
          entry: e,
          signals: ['batch import'],
          locations: (e.tagged_items ?? [])
            .map(t => t.location_name)
            .filter((l): l is string => !!l),
          hasSignal: true,
        })),
      })
    }
  }

  // Build suggestion objects
  return groups.map(group => {
    const entryItems = group.items.map(i => i.entry)
    const startDate = entryItems[0].entry_date
    const endDate = entryItems[entryItems.length - 1].entry_date

    // Collect all locations and signals
    const allLocations = group.items.flatMap(i => i.locations)
    const allSignals = [...new Set(group.items.flatMap(i => i.signals))]

    // Generate title
    let title: string
    // Count location frequencies
    const locFreq: Record<string, number> = {}
    for (const loc of allLocations) {
      locFreq[loc] = (locFreq[loc] || 0) + 1
    }
    const sortedLocs = Object.entries(locFreq)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)

    if (sortedLocs.length > 0) {
      title = sortedLocs.length === 1
        ? sortedLocs[0]
        : sortedLocs.slice(0, 2).join(' & ')
    } else {
      // Keyword-based title
      const allContent = entryItems
        .flatMap(e => (e.sections ?? []).map(s => s.content ?? ''))
        .join(' ')
      const stripped = stripHtml(allContent).toLowerCase()

      if (/beach/.test(stripped)) title = 'Beach Trip'
      else if (/cabin/.test(stripped)) title = 'Cabin Getaway'
      else if (/upstate/.test(stripped)) title = 'Upstate Trip'
      else if (/camping/.test(stripped)) title = 'Camping Trip'
      else if (/national park/.test(stripped)) title = 'National Park Trip'
      else if (/road trip/.test(stripped)) title = 'Road Trip'
      else if (/resort/.test(stripped)) title = 'Resort Getaway'
      else {
        const start = parse(startDate, 'yyyy-MM-dd', new Date())
        title = `Trip — ${format(start, 'MMM yyyy')}`
      }
    }

    // Build entry previews: date + first ~80 chars of content
    const entryPreviews: SuggestedTripEntry[] = entryItems.map(e => {
      const raw = (e.sections ?? []).map(s => s.content ?? '').join(' ')
      const text = stripHtml(raw).replace(/\s+/g, ' ').trim()
      return {
        date: e.entry_date,
        preview: text.length > 80 ? text.slice(0, 80).trim() + '...' : text,
      }
    })

    // Deduplicated location list sorted by frequency
    const uniqueLocations = sortedLocs

    return {
      id: `suggest-${startDate}-${endDate}`,
      title,
      startDate,
      endDate,
      entryIds: entryItems.map(e => e.id),
      entryCount: entryItems.length,
      signals: allSignals,
      locations: uniqueLocations,
      entryPreviews,
    }
  })
}

/**
 * Detect entries that were likely batch-imported: consecutive dates whose
 * created_at timestamps fall within 5 minutes of each other.
 */
function detectBatchImports(
  analyzed: { entry: JournalEntry; hasSignal: boolean }[]
): JournalEntry[][] {
  // Only look at entries not already flagged by keywords
  const unflagged = analyzed.filter(a => !a.hasSignal).map(a => a.entry)
  if (unflagged.length < 2) return []

  const groups: JournalEntry[][] = []
  let current: JournalEntry[] = [unflagged[0]]

  for (let i = 1; i < unflagged.length; i++) {
    const prev = unflagged[i - 1]
    const curr = unflagged[i]

    const prevDate = new Date(prev.entry_date)
    const currDate = new Date(curr.entry_date)
    const dayDiff = Math.round(
      (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
    )

    const prevCreated = new Date(prev.created_at).getTime()
    const currCreated = new Date(curr.created_at).getTime()
    const createDiffMin = Math.abs(currCreated - prevCreated) / (1000 * 60)

    // Consecutive dates AND created within 5 minutes of each other
    if (dayDiff >= 1 && dayDiff <= 2 && createDiffMin <= 5) {
      current.push(curr)
    } else {
      if (current.length >= 3) {
        groups.push([...current])
      }
      current = [curr]
    }
  }

  if (current.length >= 3) {
    groups.push([...current])
  }

  return groups
}

export function useTrips() {
  return useQuery({
    queryKey: ['trips'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*, trip_entries(count)')
        .order('start_date', { ascending: false })

      if (error) throw error
      return (data ?? []) as (Trip & { trip_entries: [{ count: number }] })[]
    },
  })
}

export function useSuggestTrips() {
  return useQuery({
    queryKey: ['suggested-trips'],
    queryFn: async () => {
      // Fetch all entries with content, locations, and trip links
      const { data, error } = await supabase
        .from('journal_entries')
        .select(SUGGEST_SELECT)
        .order('entry_date')

      if (error) throw error
      const entries = (data ?? []) as JournalEntry[]

      // Filter out entries already in a trip
      const untripped = entries.filter(e => !e.trip_entries?.length)

      return analyzeForTrips(untripped)
    },
    staleTime: 1000 * 60 * 10, // 10 min — no need to re-scan constantly
  })
}

export function useTrip(tripId: string) {
  return useQuery({
    queryKey: ['trip', tripId],
    queryFn: async () => {
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single()

      if (tripError) throw tripError

      // Get associated entries
      const { data: tripEntries, error: teError } = await supabase
        .from('trip_entries')
        .select('entry_id')
        .eq('trip_id', tripId)

      if (teError) throw teError

      const entryIds = (tripEntries ?? []).map(te => te.entry_id)

      let entries: JournalEntry[] = []
      if (entryIds.length > 0) {
        const { data: entriesData, error: entriesError } = await supabase
          .from('journal_entries')
          .select(TRIP_ENTRY_SELECT)
          .in('id', entryIds)
          .order('entry_date')

        if (entriesError) throw entriesError
        entries = (entriesData ?? []) as JournalEntry[]
      }

      return { ...trip, entries } as Trip & { entries: JournalEntry[] }
    },
    enabled: !!tripId,
  })
}

export function useEntriesInRange(startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['entries-in-range', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select(TRIP_ENTRY_SELECT)
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .order('entry_date')

      if (error) throw error
      return (data ?? []) as JournalEntry[]
    },
    enabled: !!startDate && !!endDate,
  })
}

export function useCreateTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      title,
      summary,
      startDate,
      endDate,
      coverPhotoPath,
      entryIds,
    }: {
      title: string
      summary?: string
      startDate: string
      endDate: string
      coverPhotoPath?: string
      entryIds?: string[]
    }) => {
      // Create trip
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .insert({
          title,
          summary: summary ?? null,
          start_date: startDate,
          end_date: endDate,
          cover_photo_path: coverPhotoPath ?? null,
        })
        .select()
        .single()

      if (tripError) throw tripError

      if (entryIds && entryIds.length > 0) {
        // Link specific entries
        const links = entryIds.map(id => ({ trip_id: trip.id, entry_id: id }))
        await supabase.from('trip_entries').insert(links)
      } else {
        // Auto-find entries in date range (backward-compat for Settings)
        const { data: entries } = await supabase
          .from('journal_entries')
          .select('id')
          .gte('entry_date', startDate)
          .lte('entry_date', endDate)

        if (entries && entries.length > 0) {
          const links = entries.map(e => ({ trip_id: trip.id, entry_id: e.id }))
          await supabase.from('trip_entries').insert(links)
        }
      }

      return trip as Trip
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['suggested-trips'] })
    },
  })
}

export function useUpdateTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      title,
      summary,
      coverPhotoPath,
      startDate,
      endDate,
      entryIds,
    }: {
      id: string
      title?: string
      summary?: string
      coverPhotoPath?: string | null
      startDate?: string
      endDate?: string
      entryIds?: string[]
    }) => {
      const updates: Record<string, unknown> = {}
      if (title !== undefined) updates.title = title
      if (summary !== undefined) updates.summary = summary
      if (coverPhotoPath !== undefined) updates.cover_photo_path = coverPhotoPath
      if (startDate !== undefined) updates.start_date = startDate
      if (endDate !== undefined) updates.end_date = endDate

      const { data, error } = await supabase
        .from('trips')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error

      // When entryIds provided: replace all trip_entries
      if (entryIds !== undefined) {
        await supabase.from('trip_entries').delete().eq('trip_id', id)
        if (entryIds.length > 0) {
          const links = entryIds.map(eid => ({ trip_id: id, entry_id: eid }))
          await supabase.from('trip_entries').insert(links)
        }
      }

      return data as Trip
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['trip', variables.id] })
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['suggested-trips'] })
    },
  })
}

export function useDeleteTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('trips').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['suggested-trips'] })
    },
  })
}

export function useAddEntryToTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tripId, entryId }: { tripId: string; entryId: string; entryDate?: string }) => {
      const { error } = await supabase
        .from('trip_entries')
        .insert({ trip_id: tripId, entry_id: entryId })

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['trip', variables.tripId] })
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['suggested-trips'] })
      if (variables.entryDate) {
        queryClient.invalidateQueries({ queryKey: ['entry', variables.entryDate] })
      }
    },
  })
}

export function useRemoveEntryFromTrip() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ tripId, entryId }: { tripId: string; entryId: string; entryDate?: string }) => {
      const { error } = await supabase
        .from('trip_entries')
        .delete()
        .eq('trip_id', tripId)
        .eq('entry_id', entryId)

      if (error) throw error
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['trip', variables.tripId] })
      queryClient.invalidateQueries({ queryKey: ['trips'] })
      queryClient.invalidateQueries({ queryKey: ['entries'] })
      queryClient.invalidateQueries({ queryKey: ['suggested-trips'] })
      if (variables.entryDate) {
        queryClient.invalidateQueries({ queryKey: ['entry', variables.entryDate] })
      }
    },
  })
}
