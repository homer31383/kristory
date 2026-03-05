import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BabyProfile, BabyMilestone } from '../types'

export const PREGNANCY_MILESTONES = [
  'First ultrasound',
  'Gender reveal / found out gender',
  'First kick felt',
  'Baby shower',
  'Nursery ready',
  'Hospital bag packed',
  'Due date',
]

export const FIRST_YEAR_MILESTONES = [
  'Born!',
  'First smile',
  'First laugh',
  'Slept through the night',
  'First solid food',
  'First word',
  'First crawl',
  'First steps',
  'First tooth',
  'First birthday',
]

export function useBabyProfile() {
  return useQuery({
    queryKey: ['baby-profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_profile')
        .select('*')
        .maybeSingle()

      if (error) throw error
      return data as BabyProfile | null
    },
  })
}

export function useUpdateBabyProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: {
      id: string
      name?: string | null
      due_date?: string | null
      birth_date?: string | null
      birth_weight?: string | null
      birth_length?: string | null
      notes?: string | null
    }) => {
      const { id, ...fields } = updates
      const { data, error } = await supabase
        .from('baby_profile')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as BabyProfile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baby-profile'] })
    },
  })
}

export function useBabyMilestones() {
  return useQuery({
    queryKey: ['baby-milestones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_milestones')
        .select('*, entry:journal_entries!entry_id(entry_date, sections:entry_sections!entry_id(content))')
        .order('milestone_date', { ascending: true })

      if (error) throw error
      return (data ?? []) as BabyMilestone[]
    },
  })
}

export function useCreateBabyMilestone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (milestone: {
      title: string
      milestone_type: string
      milestone_date: string
      notes?: string | null
      photo_path?: string | null
      entry_id?: string | null
    }) => {
      const { data, error } = await supabase
        .from('baby_milestones')
        .insert({
          title: milestone.title,
          milestone_type: milestone.milestone_type,
          milestone_date: milestone.milestone_date,
          notes: milestone.notes ?? null,
          photo_path: milestone.photo_path ?? null,
          entry_id: milestone.entry_id ?? null,
        })
        .select()
        .single()

      if (error) throw error
      return data as BabyMilestone
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baby-milestones'] })
    },
  })
}

export function useUpdateBabyMilestone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (update: {
      id: string
      title?: string
      milestone_date?: string
      notes?: string | null
      photo_path?: string | null
      entry_id?: string | null
    }) => {
      const { id, ...fields } = update
      const { data, error } = await supabase
        .from('baby_milestones')
        .update(fields)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as BabyMilestone
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baby-milestones'] })
    },
  })
}

export function useDeleteBabyMilestone() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('baby_milestones')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baby-milestones'] })
    },
  })
}

export function useBabyTaggedEntries() {
  return useQuery({
    queryKey: ['baby-tagged-entries'],
    queryFn: async () => {
      // First find the Baby category ID
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('name', 'Baby')
        .maybeSingle()

      if (!cat) return []

      const { data, error } = await supabase
        .from('tagged_items')
        .select('*, entry:journal_entries!entry_id(*, sections:entry_sections!entry_id(*), photos:entry_photos!entry_id(*))')
        .eq('category_id', cat.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return data ?? []
    },
  })
}
