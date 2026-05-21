import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Hooks for writing Kristory recipes into Axiom Tasks' meal system. Axiom Tasks
 * shares this Supabase project, so the `meals`, `meal_ingredients`, and
 * `grocery_categories` tables are reachable through the same client.
 */

export interface GroceryCategory {
  id: string
  name: string
}

export interface AxiomMealIngredientInput {
  name: string
  category_id: string | null
  quantity: number
  unit: string | null
  notes: string | null
}

export interface SaveAxiomMealInput {
  name: string
  description: string | null
  ingredients: AxiomMealIngredientInput[]
  mode: 'new' | 'replace'
  /** Required when mode is 'replace'. */
  existingMealId?: string
}

/** Axiom's global grocery category table — referenced by meal_ingredients.category_id. */
export function useGroceryCategories() {
  return useQuery({
    queryKey: ['axiom-grocery-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grocery_categories')
        .select('id, name')
        .order('name')
      if (error) throw error
      return (data ?? []) as GroceryCategory[]
    },
  })
}

/** Case-insensitive exact-name lookup for the duplicate check. */
export async function findMealByName(
  name: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('meals')
    .select('id, name')
    .ilike('name', name)
    .limit(1)
  if (error) throw error
  return data && data.length > 0 ? { id: data[0].id, name: data[0].name } : null
}

/** Finds an unused name by appending " (2)", " (3)", ... when the base is taken. */
export async function findAvailableMealName(baseName: string): Promise<string> {
  const { data, error } = await supabase
    .from('meals')
    .select('name')
    .ilike('name', `${baseName}%`)
  if (error) throw error

  const taken = new Set((data ?? []).map((row) => String(row.name).toLowerCase()))
  if (!taken.has(baseName.toLowerCase())) return baseName

  let n = 2
  while (taken.has(`${baseName} (${n})`.toLowerCase())) n++
  return `${baseName} (${n})`
}

export function useSaveAxiomMeal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: SaveAxiomMealInput) => {
      let mealId: string

      if (input.mode === 'replace') {
        if (!input.existingMealId) throw new Error('Missing meal to replace.')
        mealId = input.existingMealId

        const { error: updateError } = await supabase
          .from('meals')
          .update({
            name: input.name,
            description: input.description,
            updated_at: new Date().toISOString(),
          })
          .eq('id', mealId)
        if (updateError) throw updateError

        const { error: deleteError } = await supabase
          .from('meal_ingredients')
          .delete()
          .eq('meal_id', mealId)
        if (deleteError) throw deleteError
      } else {
        // Append the new meal after any existing ones.
        const { data: lastMeal } = await supabase
          .from('meals')
          .select('sort_order')
          .order('sort_order', { ascending: false })
          .limit(1)
          .maybeSingle()
        const nextSort = ((lastMeal?.sort_order as number | null) ?? -1) + 1

        const { data: created, error: insertError } = await supabase
          .from('meals')
          .insert({
            name: input.name,
            description: input.description,
            sort_order: nextSort,
          })
          .select('id')
          .single()
        if (insertError) throw insertError
        mealId = created.id as string
      }

      if (input.ingredients.length > 0) {
        // favorite_id is intentionally left null — these are custom ingredients,
        // not linked to Axiom favorites.
        const rows = input.ingredients.map((ing, index) => ({
          meal_id: mealId,
          name: ing.name,
          category_id: ing.category_id,
          quantity: ing.quantity,
          unit: ing.unit,
          notes: ing.notes,
          sort_order: index,
        }))
        const { error: ingredientsError } = await supabase
          .from('meal_ingredients')
          .insert(rows)
        if (ingredientsError) throw ingredientsError
      }

      return { mealId, name: input.name }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['axiom-meals'] })
    },
  })
}
