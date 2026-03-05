import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { TaggedItem, User } from '../types'

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .order('name')

      if (error) throw error
      return (data ?? []) as User[]
    },
  })
}

const ITEM_SELECT = '*, category:categories!category_id(*), entry:journal_entries!entry_id(entry_date), user:users!user_id(id, name), recipe_tags:tagged_item_recipe_tags!tagged_item_id(tag:recipe_tags!recipe_tag_id(*)), participants:tagged_item_participants!tagged_item_id(user:users!user_id(id, name))'

export function useItem(id: string) {
  return useQuery({
    queryKey: ['item', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tagged_items')
        .select(ITEM_SELECT)
        .eq('id', id)
        .single()

      if (error) throw error
      return data as TaggedItem
    },
    enabled: !!id,
  })
}

export function useCreateStandaloneItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      categoryId,
      userId,
      name,
      rating,
      locationName,
      itemDate,
      entryId,
      ingredients,
      instructions,
      recipeTagIds,
      participantIds,
    }: {
      categoryId: string
      userId: string
      name: string
      rating?: number | null
      locationName?: string | null
      itemDate?: string | null
      entryId?: string | null
      ingredients?: string | null
      instructions?: string | null
      recipeTagIds?: string[]
      participantIds?: string[]
    }) => {
      const { data, error } = await supabase
        .from('tagged_items')
        .insert({
          entry_id: entryId ?? null,
          category_id: categoryId,
          user_id: userId,
          name,
          rating: rating ?? null,
          location_name: locationName ?? null,
          item_date: itemDate ?? null,
          ingredients: ingredients ?? null,
          instructions: instructions ?? null,
        })
        .select(ITEM_SELECT)
        .single()

      if (error) throw error

      if (recipeTagIds && recipeTagIds.length > 0) {
        const junctionRows = recipeTagIds.map((tagId) => ({
          tagged_item_id: data.id,
          recipe_tag_id: tagId,
        }))
        await supabase.from('tagged_item_recipe_tags').insert(junctionRows)
      }

      if (participantIds && participantIds.length > 0) {
        const participantRows = participantIds.map((uid) => ({
          tagged_item_id: data.id,
          user_id: uid,
        }))
        await supabase.from('tagged_item_participants').insert(participantRows)
      }

      return data as TaggedItem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category-items'] })
      queryClient.invalidateQueries({ queryKey: ['category-counts'] })
      queryClient.invalidateQueries({ queryKey: ['home-cooking-recipes'] })
      queryClient.invalidateQueries({ queryKey: ['tagged-items'] })
    },
  })
}

export function useUpdateItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      name,
      rating,
      locationName,
      itemDate,
      ingredients,
      instructions,
      recipeTagIds,
      participantIds,
    }: {
      id: string
      name?: string
      rating?: number | null
      locationName?: string | null
      itemDate?: string | null
      ingredients?: string | null
      instructions?: string | null
      recipeTagIds?: string[]
      participantIds?: string[]
    }) => {
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      if (rating !== undefined) updates.rating = rating
      if (locationName !== undefined) updates.location_name = locationName
      if (itemDate !== undefined) updates.item_date = itemDate
      if (ingredients !== undefined) updates.ingredients = ingredients
      if (instructions !== undefined) updates.instructions = instructions

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('tagged_items')
          .update(updates)
          .eq('id', id)

        if (error) throw error
      }

      if (recipeTagIds !== undefined) {
        await supabase.from('tagged_item_recipe_tags').delete().eq('tagged_item_id', id)

        if (recipeTagIds.length > 0) {
          const junctionRows = recipeTagIds.map((tagId) => ({
            tagged_item_id: id,
            recipe_tag_id: tagId,
          }))
          await supabase.from('tagged_item_recipe_tags').insert(junctionRows)
        }
      }

      if (participantIds !== undefined) {
        await supabase.from('tagged_item_participants').delete().eq('tagged_item_id', id)

        if (participantIds.length > 0) {
          const participantRows = participantIds.map((uid) => ({
            tagged_item_id: id,
            user_id: uid,
          }))
          await supabase.from('tagged_item_participants').insert(participantRows)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['item'] })
      queryClient.invalidateQueries({ queryKey: ['recipe'] })
      queryClient.invalidateQueries({ queryKey: ['category-items'] })
      queryClient.invalidateQueries({ queryKey: ['home-cooking-recipes'] })
    },
  })
}

export function useDeleteItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tagged_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['category-items'] })
      queryClient.invalidateQueries({ queryKey: ['category-counts'] })
      queryClient.invalidateQueries({ queryKey: ['home-cooking-recipes'] })
      queryClient.invalidateQueries({ queryKey: ['tagged-items'] })
    },
  })
}
