import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Category, TaggedItem } from '../types'

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('is_default', { ascending: false })
        .order('name')

      if (error) throw error
      return (data ?? []) as Category[]
    },
  })
}

export function useCategoryWithItems(categoryId: string, sort: 'recent' | 'rating' | 'alpha' = 'recent') {
  return useQuery({
    queryKey: ['category-items', categoryId, sort],
    queryFn: async () => {
      let query = supabase
        .from('tagged_items')
        .select('*, category:categories!category_id(*), entry:journal_entries!entry_id(entry_date), user:users!user_id(id, name), participants:tagged_item_participants!tagged_item_id(user:users!user_id(id, name))')
        .eq('category_id', categoryId)

      if (sort === 'recent') {
        query = query.order('item_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false })
      } else if (sort === 'rating') {
        query = query.order('rating', { ascending: false, nullsFirst: false })
      } else {
        query = query.order('name')
      }

      const { data, error } = await query.limit(500)
      if (error) throw error
      return (data ?? []) as TaggedItem[]
    },
    enabled: !!categoryId,
  })
}

export function useCategoryCounts() {
  return useQuery({
    queryKey: ['category-counts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name, emoji, is_default, tagged_items!category_id(count)')

      if (error) throw error

      return (data ?? []).map((cat) => ({
        ...cat,
        count: (cat.tagged_items as unknown as { count: number }[])?.[0]?.count ?? 0,
      }))
    },
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, emoji, userId }: { name: string; emoji: string; userId: string }) => {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name, emoji, is_default: false, user_id: userId })
        .select()
        .single()

      if (error) throw error
      return data as Category
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['category-counts'] })
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name, emoji }: { id: string; name: string; emoji: string }) => {
      const { data, error } = await supabase
        .from('categories')
        .update({ name, emoji })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Category
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['category-counts'] })
    },
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories'] })
      queryClient.invalidateQueries({ queryKey: ['category-counts'] })
    },
  })
}
