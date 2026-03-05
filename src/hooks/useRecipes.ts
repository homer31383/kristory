import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { RecipeTag, TaggedItem } from '../types'

const RECIPE_SELECT = '*, category:categories!category_id(*), entry:journal_entries!entry_id(entry_date), user:users!user_id(id, name), recipe_tags:tagged_item_recipe_tags!tagged_item_id(tag:recipe_tags!recipe_tag_id(*))'

export function useRecipeTags() {
  return useQuery({
    queryKey: ['recipe-tags'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('recipe_tags')
        .select('*')
        .order('name')

      if (error) throw error
      return (data ?? []) as RecipeTag[]
    },
  })
}

export function useCreateRecipeTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ name, emoji }: { name: string; emoji?: string }) => {
      const { data, error } = await supabase
        .from('recipe_tags')
        .insert({ name, emoji: emoji ?? null })
        .select()
        .single()

      if (error) throw error
      return data as RecipeTag
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipe-tags'] })
    },
  })
}

export function useHomeCookingRecipes(sort: 'recent' | 'rating' | 'alpha' = 'recent') {
  return useQuery({
    queryKey: ['home-cooking-recipes', sort],
    queryFn: async () => {
      // First find the Home Cooking category
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .ilike('name', 'home cooking')
        .maybeSingle()

      if (!cat) return []

      let query = supabase
        .from('tagged_items')
        .select(RECIPE_SELECT)
        .eq('category_id', cat.id)

      if (sort === 'recent') {
        query = query.order('created_at', { ascending: false })
      } else if (sort === 'rating') {
        query = query.order('rating', { ascending: false, nullsFirst: false })
      } else {
        query = query.order('name')
      }

      const { data, error } = await query.limit(500)
      if (error) throw error
      return (data ?? []) as TaggedItem[]
    },
  })
}

export function useCreateRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      categoryId,
      userId,
      name,
      rating,
      ingredients,
      instructions,
      entryId,
      recipeTagIds,
    }: {
      categoryId: string
      userId: string
      name: string
      rating?: number | null
      ingredients?: string | null
      instructions?: string | null
      entryId?: string | null
      recipeTagIds?: string[]
    }) => {
      const { data, error } = await supabase
        .from('tagged_items')
        .insert({
          entry_id: entryId ?? null,
          category_id: categoryId,
          user_id: userId,
          name,
          rating: rating ?? null,
          ingredients: ingredients ?? null,
          instructions: instructions ?? null,
        })
        .select(RECIPE_SELECT)
        .single()

      if (error) throw error

      // Add recipe tags
      if (recipeTagIds && recipeTagIds.length > 0) {
        const junctionRows = recipeTagIds.map((tagId) => ({
          tagged_item_id: data.id,
          recipe_tag_id: tagId,
        }))
        await supabase.from('tagged_item_recipe_tags').insert(junctionRows)
      }

      return data as TaggedItem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-cooking-recipes'] })
      queryClient.invalidateQueries({ queryKey: ['category-items'] })
      queryClient.invalidateQueries({ queryKey: ['category-counts'] })
      queryClient.invalidateQueries({ queryKey: ['tagged-items'] })
    },
  })
}

export function useUpdateRecipe() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      name,
      rating,
      ingredients,
      instructions,
      recipeTagIds,
    }: {
      id: string
      name?: string
      rating?: number | null
      ingredients?: string | null
      instructions?: string | null
      recipeTagIds?: string[]
    }) => {
      const updates: Record<string, unknown> = {}
      if (name !== undefined) updates.name = name
      if (rating !== undefined) updates.rating = rating
      if (ingredients !== undefined) updates.ingredients = ingredients
      if (instructions !== undefined) updates.instructions = instructions

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('tagged_items')
          .update(updates)
          .eq('id', id)

        if (error) throw error
      }

      // Replace recipe tags if provided
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
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['home-cooking-recipes'] })
      queryClient.invalidateQueries({ queryKey: ['category-items'] })
      queryClient.invalidateQueries({ queryKey: ['recipe'] })
    },
  })
}

export function useRecipe(id: string) {
  return useQuery({
    queryKey: ['recipe', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tagged_items')
        .select(RECIPE_SELECT)
        .eq('id', id)
        .single()

      if (error) throw error
      return data as TaggedItem
    },
    enabled: !!id,
  })
}
