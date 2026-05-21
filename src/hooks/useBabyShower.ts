import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BabyShowerEvent, BabyShowerGuest, GuestAddress, BabyShowerTask, BabyShowerScheduleItem, BabyShowerPhoto, BabyShowerHelper, BabyShowerMenuItem } from '../types'

export function useShowerEvent() {
  return useQuery({
    queryKey: ['shower-event'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_shower_event')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data as BabyShowerEvent | null
    },
  })
}

export function useUpdateShowerEvent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      id: string
      event_date?: string | null
      event_time?: string | null
      location_name?: string | null
      location_address?: string | null
      description?: string | null
      registry_links?: { name: string; url: string }[]
      hero_image_path?: string | null
      hero_focal_point?: string | null
      background_image_path?: string | null
      background_opacity?: number
      background_zoom?: number
      bg_fill_color?: string
      bg_tile_path?: string | null
      bg_tile_count?: number
      bg_feather_edges?: boolean
    }) => {
      const { id, ...fields } = params
      const { data, error } = await supabase
        .from('baby_shower_event')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as BabyShowerEvent
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-event'] })
    },
    onError: (err) => {
      // Surface DB errors (e.g., missing column from an un-run migration) so
      // they aren't silent. A 42703 ("column ... does not exist") here means
      // the relevant migration hasn't been applied in Supabase.
      console.error('useUpdateShowerEvent failed:', err)
    },
  })
}

export function useShowerGuests() {
  return useQuery({
    queryKey: ['shower-guests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_shower_guests')
        .select('*')
        .order('name')
      if (error) throw error
      return (data ?? []) as BabyShowerGuest[]
    },
  })
}

export function usePublicShowerGuests(enabled: boolean) {
  return useQuery({
    queryKey: ['shower-guests-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_shower_guests')
        .select('name, rsvp_status, plus_one, plus_one_name')
        .neq('rsvp_status', 'no')
        .or('invitation_sent.eq.true,added_by.eq.guest')
        .order('name')
      if (error) throw error
      return (data ?? []) as Pick<BabyShowerGuest, 'name' | 'rsvp_status' | 'plus_one' | 'plus_one_name'>[]
    },
    enabled,
  })
}

export function useRsvpGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      name: string
      rsvp_status: 'yes' | 'no' | 'maybe'
      dietary_needs?: string | null
    }) => {
      const today = new Date().toISOString().slice(0, 10)
      const trimmedName = params.name.trim()

      // Try to silently match existing guest by name (case-insensitive, trimmed)
      const { data: existing } = await supabase
        .from('baby_shower_guests')
        .select('id')
        .ilike('name', trimmedName)
        .maybeSingle()

      if (existing) {
        // Update RSVP fields only — do NOT overwrite host-managed fields
        // (email, phone, address, plus_one) with nulls.
        const { data, error } = await supabase
          .from('baby_shower_guests')
          .update({
            rsvp_status: params.rsvp_status,
            rsvp_date: today,
            dietary_needs: params.dietary_needs || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single()
        if (error) throw error
        return data as BabyShowerGuest
      } else {
        const { data, error } = await supabase
          .from('baby_shower_guests')
          .insert({
            name: trimmedName,
            rsvp_status: params.rsvp_status,
            rsvp_date: today,
            dietary_needs: params.dietary_needs || null,
            added_by: 'guest',
          })
          .select()
          .single()
        if (error) throw error
        return data as BabyShowerGuest
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-guests'] })
      queryClient.invalidateQueries({ queryKey: ['shower-guests-public'] })
    },
  })
}

// Copy RSVP data from a guest-submitted row onto an existing host-managed row,
// then delete the duplicate. Used when the host manually merges an unmatched RSVP.
export function useMergeGuestRsvp() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { sourceId: string; targetId: string }) => {
      const { data: source, error: srcErr } = await supabase
        .from('baby_shower_guests')
        .select('rsvp_status, rsvp_date, dietary_needs')
        .eq('id', params.sourceId)
        .single()
      if (srcErr) throw srcErr

      const { error: updErr } = await supabase
        .from('baby_shower_guests')
        .update({
          rsvp_status: source.rsvp_status,
          rsvp_date: source.rsvp_date,
          dietary_needs: source.dietary_needs,
          updated_at: new Date().toISOString(),
        })
        .eq('id', params.targetId)
      if (updErr) throw updErr

      const { error: delErr } = await supabase
        .from('baby_shower_guests')
        .delete()
        .eq('id', params.sourceId)
      if (delErr) throw delErr
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-guests'] })
      queryClient.invalidateQueries({ queryKey: ['shower-guests-public'] })
    },
  })
}

export function useCreateGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      name: string
      email?: string | null
      phone?: string | null
      address?: GuestAddress | null
      plus_one?: boolean
      plus_one_name?: string | null
      notes?: string | null
    }) => {
      const { data, error } = await supabase
        .from('baby_shower_guests')
        .insert({
          name: params.name.trim(),
          email: params.email || null,
          phone: params.phone || null,
          address: params.address || null,
          plus_one: params.plus_one ?? false,
          plus_one_name: params.plus_one_name || null,
          notes: params.notes || null,
          added_by: 'host',
        })
        .select()
        .single()
      if (error) throw error
      return data as BabyShowerGuest
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-guests'] })
      queryClient.invalidateQueries({ queryKey: ['shower-guests-public'] })
    },
  })
}

export function useUpdateGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string } & Partial<Omit<BabyShowerGuest, 'id' | 'created_at' | 'updated_at'>>) => {
      const { id, ...fields } = params
      const { data, error } = await supabase
        .from('baby_shower_guests')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as BabyShowerGuest
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-guests'] })
      queryClient.invalidateQueries({ queryKey: ['shower-guests-public'] })
    },
  })
}

export function useDeleteGuest() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('baby_shower_guests')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-guests'] })
      queryClient.invalidateQueries({ queryKey: ['shower-guests-public'] })
    },
  })
}

// ---- Tasks ----

export function useShowerTasks() {
  return useQuery({
    queryKey: ['shower-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_shower_tasks')
        .select('*')
        .order('display_order')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as BabyShowerTask[]
    },
  })
}

export function useCreateShowerTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (title: string) => {
      const { data: existing } = await supabase
        .from('baby_shower_tasks')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1)
      const nextOrder = ((existing?.[0]?.display_order ?? -1) + 1)
      const { data, error } = await supabase
        .from('baby_shower_tasks')
        .insert({ title, display_order: nextOrder })
        .select()
        .single()
      if (error) throw error
      return data as BabyShowerTask
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-tasks'] })
    },
  })
}

export function useUpdateShowerTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; completed?: boolean; title?: string; helper_id?: string | null; due_date?: string | null }) => {
      const { id, ...fields } = params
      const { error } = await supabase
        .from('baby_shower_tasks')
        .update(fields)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-tasks'] })
    },
  })
}

export function useDeleteShowerTask() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('baby_shower_tasks')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-tasks'] })
    },
  })
}

export function useSwapTaskOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { idA: string; orderA: number; idB: string; orderB: number }) => {
      const { error: e1 } = await supabase
        .from('baby_shower_tasks')
        .update({ display_order: params.orderB })
        .eq('id', params.idA)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('baby_shower_tasks')
        .update({ display_order: params.orderA })
        .eq('id', params.idB)
      if (e2) throw e2
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-tasks'] })
    },
  })
}

// ---- Schedule ----

export function useShowerSchedule() {
  return useQuery({
    queryKey: ['shower-schedule'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_shower_schedule')
        .select('*')
        .order('display_order')
        .order('time_slot')
      if (error) throw error
      return (data ?? []) as BabyShowerScheduleItem[]
    },
  })
}

export function useCreateScheduleItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { time_slot: string; description: string }) => {
      const { data: existing } = await supabase
        .from('baby_shower_schedule')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1)
      const nextOrder = ((existing?.[0]?.display_order ?? -1) + 1)
      const { data, error } = await supabase
        .from('baby_shower_schedule')
        .insert({ ...params, display_order: nextOrder })
        .select()
        .single()
      if (error) throw error
      return data as BabyShowerScheduleItem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-schedule'] })
    },
  })
}

export function useUpdateScheduleItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; time_slot?: string; description?: string }) => {
      const { id, ...fields } = params
      const { error } = await supabase
        .from('baby_shower_schedule')
        .update(fields)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-schedule'] })
    },
  })
}

export function useSwapScheduleOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { idA: string; orderA: number; idB: string; orderB: number }) => {
      const { error: e1 } = await supabase
        .from('baby_shower_schedule')
        .update({ display_order: params.orderB })
        .eq('id', params.idA)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('baby_shower_schedule')
        .update({ display_order: params.orderA })
        .eq('id', params.idB)
      if (e2) throw e2
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-schedule'] })
    },
  })
}

export function useDeleteScheduleItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('baby_shower_schedule')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-schedule'] })
    },
  })
}

// ---- Photos ----

export function useShowerPhotos() {
  return useQuery({
    queryKey: ['shower-photos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_shower_photos')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as BabyShowerPhoto[]
    },
  })
}

export function useDeleteShowerPhoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; storage_path: string }) => {
      await supabase.storage.from('kristory-photos').remove([params.storage_path])
      const { error } = await supabase
        .from('baby_shower_photos')
        .delete()
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-photos'] })
    },
  })
}

// ---- Helpers ----

export function useShowerHelpers() {
  return useQuery({
    queryKey: ['shower-helpers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_shower_helpers')
        .select('*')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as BabyShowerHelper[]
    },
  })
}

export function useCreateShowerHelper() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { name: string; role: string; color?: string }) => {
      const { data, error } = await supabase
        .from('baby_shower_helpers')
        .insert(params)
        .select()
        .single()
      if (error) throw error
      return data as BabyShowerHelper
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-helpers'] })
    },
  })
}

export function useUpdateShowerHelper() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; name?: string; role?: string; color?: string }) => {
      const { id, ...fields } = params
      const { error } = await supabase
        .from('baby_shower_helpers')
        .update(fields)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-helpers'] })
    },
  })
}

export function useDeleteShowerHelper() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('baby_shower_helpers')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-helpers'] })
    },
  })
}

// ---- Menu ----

export function useShowerMenu() {
  return useQuery({
    queryKey: ['shower-menu'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_shower_menu')
        .select('*')
        .order('display_order')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as BabyShowerMenuItem[]
    },
  })
}

export function useCreateMenuItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { item_name: string; quantity?: number; unit_label?: string; notes?: string | null }) => {
      const { data: existing } = await supabase
        .from('baby_shower_menu')
        .select('display_order')
        .order('display_order', { ascending: false })
        .limit(1)
      const nextOrder = ((existing?.[0]?.display_order ?? -1) + 1)
      const { data, error } = await supabase
        .from('baby_shower_menu')
        .insert({ ...params, display_order: nextOrder })
        .select()
        .single()
      if (error) throw error
      return data as BabyShowerMenuItem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-menu'] })
    },
  })
}

export function useUpdateMenuItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { id: string; item_name?: string; quantity?: number; unit_label?: string; notes?: string | null; prepared?: boolean }) => {
      const { id, ...fields } = params
      const { error } = await supabase
        .from('baby_shower_menu')
        .update(fields)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-menu'] })
    },
  })
}

export function useDeleteMenuItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('baby_shower_menu')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-menu'] })
    },
  })
}

export function useSwapMenuOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { idA: string; orderA: number; idB: string; orderB: number }) => {
      const { error: e1 } = await supabase
        .from('baby_shower_menu')
        .update({ display_order: params.orderB })
        .eq('id', params.idA)
      if (e1) throw e1
      const { error: e2 } = await supabase
        .from('baby_shower_menu')
        .update({ display_order: params.orderA })
        .eq('id', params.idB)
      if (e2) throw e2
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-menu'] })
    },
  })
}

export function useImportMenuCsv() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { rows: { name: string; quantity: number; unit?: string; notes?: string | null }[]; existing: BabyShowerMenuItem[] }) => {
      const existingByName = new Map(params.existing.map(it => [it.item_name.toLowerCase(), it]))
      const updates: { id: string; quantity: number }[] = []
      const inserts: { item_name: string; quantity: number; unit_label: string; notes: string | null; display_order: number }[] = []
      let nextOrder = params.existing.reduce((m, it) => Math.max(m, it.display_order), -1) + 1
      for (const r of params.rows) {
        const exist = existingByName.get(r.name.toLowerCase())
        if (exist) updates.push({ id: exist.id, quantity: r.quantity })
        else inserts.push({
          item_name: r.name,
          quantity: r.quantity,
          unit_label: r.unit?.trim() || 'servings',
          notes: r.notes ?? null,
          display_order: nextOrder++,
        })
      }
      for (const u of updates) {
        const { error } = await supabase.from('baby_shower_menu').update({ quantity: u.quantity }).eq('id', u.id)
        if (error) throw error
      }
      if (inserts.length > 0) {
        const { error } = await supabase.from('baby_shower_menu').insert(inserts)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-menu'] })
    },
  })
}

export function useShowerGuestCount() {
  return useQuery({
    queryKey: ['shower-guest-count'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'shower_guest_count')
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const n = parseInt(data.value, 10)
      return isNaN(n) ? null : n
    },
  })
}

export function useSetShowerGuestCount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (count: number) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'shower_guest_count', value: String(count), updated_at: new Date().toISOString() }, { onConflict: 'key' })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-guest-count'] })
    },
  })
}

export function useDeleteMenuItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return
      const { error } = await supabase.from('baby_shower_menu').delete().in('id', ids)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shower-menu'] })
    },
  })
}
