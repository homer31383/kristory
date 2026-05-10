/**
 * All Supabase queries for the registry view.
 *
 * IMPORTANT: every nested join uses explicit FK hint syntax (`table!fk_name`)
 * because PostgREST refuses to guess when a table has multiple FK paths to
 * the same target. The babylist_picks table has three nullable FKs to
 * different parent tables; only specifying the constraint name keeps things
 * predictable.
 */
import { supabase } from '../../lib/supabase'
import type {
  Alternative,
  BabylistPerson,
  CatalogItem,
  CatalogTier,
  CustomItem,
  ItemState,
  ItemStateValue,
  Pick,
} from '../types'

export type ItemWithTiers = CatalogItem & {
  tiers: CatalogTier[]
}

export async function loadCatalog(): Promise<ItemWithTiers[]> {
  const { data, error } = await supabase
    .from('babylist_catalog_items')
    .select(
      `
      id, section, item_name, priority, where_to_buy, suggested_qty, display_order,
      tiers:babylist_catalog_tiers!fk_tiers_catalog_item (
        id, catalog_item_id, tier, product, price_str, unit_cost, note, url, display_order
      )
      `,
    )
    .order('display_order', { ascending: true })

  if (error) throw error
  return (data as unknown as ItemWithTiers[]).map((it) => ({
    ...it,
    tiers: [...(it.tiers ?? [])].sort(
      (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
    ),
  }))
}

export async function loadPeople(registryId: string): Promise<BabylistPerson[]> {
  const { data, error } = await supabase
    .from('babylist_people')
    .select('*')
    .eq('registry_id', registryId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as BabylistPerson[]
}

export async function findPersonByKristoryUser(
  registryId: string,
  kristoryUserId: string,
): Promise<BabylistPerson | null> {
  const { data, error } = await supabase
    .from('babylist_people')
    .select('*')
    .eq('registry_id', registryId)
    .eq('kristory_user_id', kristoryUserId)
    .maybeSingle()
  if (error) throw error
  return (data as BabylistPerson | null) ?? null
}

export async function createPerson(
  registryId: string,
  name: string,
  color: string,
  kristoryUserId: string | null,
): Promise<BabylistPerson> {
  const { data, error } = await supabase
    .from('babylist_people')
    .insert({
      registry_id: registryId,
      name,
      color,
      kristory_user_id: kristoryUserId,
    })
    .select('*')
    .single()
  if (error) throw error
  return data as BabylistPerson
}

export async function loadCustomItems(registryId: string): Promise<CustomItem[]> {
  const { data, error } = await supabase
    .from('babylist_custom_items')
    .select('*')
    .eq('registry_id', registryId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as CustomItem[]
}

export async function loadAlternatives(registryId: string): Promise<Alternative[]> {
  const { data, error } = await supabase
    .from('babylist_alternatives')
    .select('*')
    .eq('registry_id', registryId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data as Alternative[]
}

export async function loadPicks(registryId: string): Promise<Pick[]> {
  const { data, error } = await supabase
    .from('babylist_picks')
    .select('*')
    .eq('registry_id', registryId)
  if (error) throw error
  return data as Pick[]
}

export async function loadItemStates(registryId: string): Promise<ItemState[]> {
  const { data, error } = await supabase
    .from('babylist_item_states')
    .select('*')
    .eq('registry_id', registryId)
  if (error) throw error
  return data as ItemState[]
}

/**
 * Upsert the state for an item.
 *
 * We have two unique constraints — (registry_id, catalog_item_id) and
 * (registry_id, custom_item_id) — so the `onConflict` clause depends on
 * which side the item lives on. Callers pass the item kind explicitly.
 */
export async function upsertItemState(input: {
  registryId: string
  itemKind: 'catalog' | 'custom'
  itemId: string
  state: Exclude<ItemStateValue, 'active'>
  updatedBy: string | null
}): Promise<void> {
  const row =
    input.itemKind === 'catalog'
      ? {
          registry_id: input.registryId,
          catalog_item_id: input.itemId,
          custom_item_id: null,
          state: input.state,
          updated_by: input.updatedBy,
          updated_at: new Date().toISOString(),
        }
      : {
          registry_id: input.registryId,
          catalog_item_id: null,
          custom_item_id: input.itemId,
          state: input.state,
          updated_by: input.updatedBy,
          updated_at: new Date().toISOString(),
        }
  const onConflict =
    input.itemKind === 'catalog'
      ? 'registry_id,catalog_item_id'
      : 'registry_id,custom_item_id'
  const { error } = await supabase
    .from('babylist_item_states')
    .upsert(row, { onConflict })
  if (error) throw error
}

/**
 * "Back to active" path. Spec: simpler to just delete the row than store
 * 'active' explicitly.
 */
export async function clearItemState(input: {
  registryId: string
  itemKind: 'catalog' | 'custom'
  itemId: string
}): Promise<void> {
  const column = input.itemKind === 'catalog' ? 'catalog_item_id' : 'custom_item_id'
  const { error } = await supabase
    .from('babylist_item_states')
    .delete()
    .eq('registry_id', input.registryId)
    .eq(column, input.itemId)
  if (error) throw error
}

// ─── Mutations ─────────────────────────────────────────────────────────────

export async function addCustomItem(
  row: Omit<CustomItem, 'id' | 'created_at'>,
): Promise<CustomItem> {
  const { data, error } = await supabase
    .from('babylist_custom_items')
    .insert(row)
    .select('*')
    .single()
  if (error) throw error
  return data as CustomItem
}

export async function deleteCustomItem(id: string): Promise<void> {
  const { error } = await supabase.from('babylist_custom_items').delete().eq('id', id)
  if (error) throw error
}

export async function addAlternative(
  row: Omit<Alternative, 'id' | 'created_at'>,
): Promise<Alternative> {
  const { data, error } = await supabase
    .from('babylist_alternatives')
    .insert(row)
    .select('*')
    .single()
  if (error) throw error
  return data as Alternative
}

export async function updateAlternative(
  id: string,
  patch: Partial<Alternative>,
): Promise<void> {
  const { error } = await supabase.from('babylist_alternatives').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteAlternative(id: string): Promise<void> {
  const { error } = await supabase.from('babylist_alternatives').delete().eq('id', id)
  if (error) throw error
}

export type PickTarget =
  | { kind: 'tier'; catalog_tier_id: string }
  | { kind: 'custom'; custom_item_id: string }
  | { kind: 'alternative'; alternative_id: string }

export async function addPick(
  registryId: string,
  personId: string,
  target: PickTarget,
  qty: number,
): Promise<Pick> {
  const row: {
    registry_id: string
    person_id: string
    qty: number
    catalog_tier_id: string | null
    custom_item_id: string | null
    alternative_id: string | null
  } = {
    registry_id: registryId,
    person_id: personId,
    qty,
    catalog_tier_id: null,
    custom_item_id: null,
    alternative_id: null,
  }
  if (target.kind === 'tier') row.catalog_tier_id = target.catalog_tier_id
  if (target.kind === 'custom') row.custom_item_id = target.custom_item_id
  if (target.kind === 'alternative') row.alternative_id = target.alternative_id

  const { data, error } = await supabase
    .from('babylist_picks')
    .insert(row)
    .select('*')
    .single()
  if (error) throw error
  return data as Pick
}

export async function updatePickQty(pickId: string, qty: number): Promise<void> {
  const { error } = await supabase.from('babylist_picks').update({ qty }).eq('id', pickId)
  if (error) throw error
}

export async function deletePick(pickId: string): Promise<void> {
  const { error } = await supabase.from('babylist_picks').delete().eq('id', pickId)
  if (error) throw error
}
