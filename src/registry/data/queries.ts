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
  CatalogTierOverride,
  CustomItem,
  ItemState,
  ItemStateValue,
  Pick,
  SectionState,
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

export async function loadCatalogTierOverrides(
  registryId: string,
): Promise<CatalogTierOverride[]> {
  const { data, error } = await supabase
    .from('babylist_catalog_tier_overrides')
    .select('*')
    .eq('registry_id', registryId)
  if (error) throw error
  return data as CatalogTierOverride[]
}

export async function upsertCatalogTierOverride(input: {
  registryId: string
  catalogTierId: string
  product: string | null
  priceStr: string | null
  unitCost: number | null
  note: string | null
  url: string | null
  updatedBy: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('babylist_catalog_tier_overrides')
    .upsert(
      {
        registry_id: input.registryId,
        catalog_tier_id: input.catalogTierId,
        product: input.product,
        price_str: input.priceStr,
        unit_cost: input.unitCost,
        note: input.note,
        url: input.url,
        updated_at: new Date().toISOString(),
        updated_by: input.updatedBy,
      },
      { onConflict: 'registry_id,catalog_tier_id' },
    )
  if (error) throw error
}

export async function deleteCatalogTierOverride(input: {
  registryId: string
  catalogTierId: string
}): Promise<void> {
  const { error } = await supabase
    .from('babylist_catalog_tier_overrides')
    .delete()
    .eq('registry_id', input.registryId)
    .eq('catalog_tier_id', input.catalogTierId)
  if (error) throw error
}

/**
 * Merge per-registry tier overrides on top of the raw catalog. Any non-null
 * override field replaces the catalog default; null fields fall back. The
 * resulting tier carries `hasOverride: true` if a row existed for it.
 *
 * Pure function — used by useRegistryData and by importCsv (which needs to
 * detect divergence against the *raw* catalog so it doesn't compare against
 * already-overridden values).
 */
export function mergeOverridesIntoCatalog(
  catalog: ItemWithTiers[],
  overrides: CatalogTierOverride[],
): ItemWithTiers[] {
  if (overrides.length === 0) {
    return catalog.map((it) => ({
      ...it,
      tiers: it.tiers.map((t) => ({ ...t, hasOverride: false })),
    }))
  }
  const byTier = new Map<string, CatalogTierOverride>()
  for (const o of overrides) byTier.set(o.catalog_tier_id, o)
  return catalog.map((it) => ({
    ...it,
    tiers: it.tiers.map((t) => {
      const o = byTier.get(t.id)
      if (!o) return { ...t, hasOverride: false }
      return {
        ...t,
        product: o.product ?? t.product,
        price_str: o.price_str ?? t.price_str,
        unit_cost: o.unit_cost ?? t.unit_cost,
        note: o.note ?? t.note,
        url: o.url ?? t.url,
        hasOverride: true,
      }
    }),
  }))
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

// ─── Section collapse states ────────────────────────────────────────────────

export async function loadSectionStates(registryId: string): Promise<SectionState[]> {
  const { data, error } = await supabase
    .from('babylist_section_states')
    .select('*')
    .eq('registry_id', registryId)
  if (error) throw error
  return data as SectionState[]
}

export async function upsertSectionState(input: {
  registryId: string
  section: string
  collapsed: boolean
  updatedBy: string | null
}): Promise<void> {
  const { error } = await supabase
    .from('babylist_section_states')
    .upsert(
      {
        registry_id: input.registryId,
        section: input.section,
        collapsed: input.collapsed,
        updated_by: input.updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'registry_id,section' },
    )
  if (error) throw error
}

export async function clearSectionState(input: {
  registryId: string
  section: string
}): Promise<void> {
  const { error } = await supabase
    .from('babylist_section_states')
    .delete()
    .eq('registry_id', input.registryId)
    .eq('section', input.section)
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

/**
 * Edit an existing custom item. The realtime subscription on
 * babylist_custom_items already handles UPDATE, so both people see the change
 * live with no extra wiring.
 */
export async function updateCustomItem(
  id: string,
  patch: Partial<Omit<CustomItem, 'id' | 'registry_id' | 'created_at' | 'added_by'>>,
): Promise<void> {
  const { error } = await supabase
    .from('babylist_custom_items')
    .update(patch)
    .eq('id', id)
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

/**
 * Mark a pick as transferred to Babylist (`transferredBy = personId`) or
 * unmark it (`transferredBy = null`). The UPDATE flows through the existing
 * babylist_picks realtime subscription, so the other user sees the moss check
 * appear/disappear live with no extra wiring.
 */
export async function setPickTransferred(
  pickId: string,
  transferredBy: string | null,
): Promise<void> {
  const update = transferredBy
    ? { transferred_at: new Date().toISOString(), transferred_by: transferredBy }
    : { transferred_at: null, transferred_by: null }
  const { error } = await supabase.from('babylist_picks').update(update).eq('id', pickId)
  if (error) throw error
}

// ─── Chrome extension pairing ───────────────────────────────────────────────

/**
 * Mint a pairing token for the Baby Registry Chrome extension. The extension
 * consumes the token and stamps `used_at`; this app only ever inserts. Each
 * device pairs with its own token, so duplicates per person are expected and
 * fine — no upsert, no cleanup of old unused rows.
 */
export async function createExtensionToken(input: {
  token: string
  personId: string
  registryId: string
}): Promise<void> {
  const { error } = await supabase.from('babylist_extension_tokens').insert({
    token: input.token,
    person_id: input.personId,
    registry_id: input.registryId,
  })
  if (error) throw error
}
