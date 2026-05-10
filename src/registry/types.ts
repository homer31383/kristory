/**
 * Hand-written row shapes for babylist_* tables. Mirrors the SQL schema in
 * the standalone Babylist's supabase/migrations/0001_init.sql plus the new
 * `kristory_user_id` column from supabase/migrations/018_*.sql in Kristory.
 */

export interface CatalogItem {
  id: string
  section: string
  item_name: string
  priority: string | null
  where_to_buy: string | null
  suggested_qty: number | null
  display_order: number | null
}

export interface CatalogTier {
  id: string
  catalog_item_id: string
  tier: 'Budget' | 'Mid' | 'Premium'
  product: string | null
  price_str: string | null
  unit_cost: number | null
  note: string | null
  url: string | null
  display_order: number | null
  /**
   * True when this tier has a per-registry override applied on top of the
   * catalog default — used by the UI to show the "edited" dot. Populated by
   * useRegistryData's merge step. Always false on raw fetches from
   * babylist_catalog_tiers directly.
   */
  hasOverride?: boolean
}

export interface CatalogTierOverride {
  id: string
  registry_id: string
  catalog_tier_id: string
  product: string | null
  price_str: string | null
  unit_cost: number | null
  note: string | null
  url: string | null
  updated_at: string
  updated_by: string | null
}

export interface BabylistPerson {
  id: string
  registry_id: string
  name: string
  color: string | null
  kristory_user_id: string | null
  created_at: string
}

export interface CustomItem {
  id: string
  registry_id: string
  added_by: string | null
  section: string
  item_name: string
  priority: string | null
  where_to_buy: string | null
  suggested_qty: number | null
  product: string | null
  price_str: string | null
  unit_cost: number | null
  note: string | null
  url: string | null
  created_at: string
}

export interface Alternative {
  id: string
  registry_id: string
  added_by: string | null
  catalog_item_id: string | null
  custom_item_id: string | null
  product: string
  price_str: string | null
  unit_cost: number | null
  note: string | null
  url: string | null
  created_at: string
}

export interface Pick {
  id: string
  registry_id: string
  person_id: string
  catalog_tier_id: string | null
  custom_item_id: string | null
  alternative_id: string | null
  qty: number
  picked_at: string
}

export type ItemStateValue = 'active' | 'muted' | 'saved'

export interface ItemState {
  id: string
  registry_id: string
  catalog_item_id: string | null
  custom_item_id: string | null
  state: ItemStateValue
  updated_at: string
  updated_by: string | null
}
