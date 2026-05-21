import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BabyNameSuggestion } from '../types'

export function useBabyNameSuggestions() {
  return useQuery({
    queryKey: ['baby-name-suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_name_suggestions')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as BabyNameSuggestion[]
    },
  })
}

export function useAddBabyName() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { name: string; suggested_by: string | null }) => {
      const { data, error } = await supabase
        .from('baby_name_suggestions')
        .insert({ name: params.name, suggested_by: params.suggested_by })
        .select()
        .single()
      if (error) throw error
      return data as BabyNameSuggestion
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baby-name-suggestions'] })
    },
  })
}

export function useDeleteBabyName() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('baby_name_suggestions')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baby-name-suggestions'] })
    },
  })
}
