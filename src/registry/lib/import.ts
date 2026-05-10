/**
 * CSV import — turns parsed rows into Supabase inserts.
 *
 *   - Match Section + Item against catalog. If found, route by Tier.
 *   - Unknown Section + Item becomes a custom item; recreate it.
 *   - Tier=Alternative becomes a babylist_alternatives row + pick.
 *   - Imports are additive; only the importing person's picks are touched.
 *   - If the person already exists in this registry, the caller decides
 *     replace vs merge.
 *
 * Identity: CSVs use names ("Chris", "Krista") rather than UUIDs. We match
 * against babylist_people.name (case-insensitive) and only create a new
 * row when the name is unknown. Newly-created people from CSV imports have
 * kristory_user_id = null (they're imported guests, not Kristory users).
 */
import { supabase } from '../../lib/supabase'
import {
  addAlternative,
  addCustomItem,
  addPick,
  createPerson,
  loadAlternatives,
  loadCatalog,
  loadCustomItems,
  loadPeople,
  loadPicks,
  upsertItemState,
  type ItemWithTiers,
} from '../data/queries'
import type { Alternative, BabylistPerson, CustomItem, ItemStateValue } from '../types'
import type { ParsedCsvRow } from './csv'

export interface ImportSummary {
  person: string
  picks: number
  alternatives: number
  customItems: number
}

export interface ImportOptions {
  mode: 'replace' | 'merge'
  newPersonColor?: string
}

export async function importCsv(
  registryId: string,
  rows: ParsedCsvRow[],
  personName: string,
  opts: ImportOptions,
): Promise<ImportSummary> {
  const people = await loadPeople(registryId)
  let person: BabylistPerson | undefined = people.find(
    (p) => p.name.toLowerCase() === personName.toLowerCase(),
  )
  if (!person) {
    person = await createPerson(registryId, personName, opts.newPersonColor ?? '#c8633b', null)
  } else if (opts.mode === 'replace') {
    const { error } = await supabase
      .from('babylist_picks')
      .delete()
      .eq('person_id', person.id)
    if (error) throw error
  }

  const [catalog, customs, alts, picks] = await Promise.all([
    loadCatalog(),
    loadCustomItems(registryId),
    loadAlternatives(registryId),
    loadPicks(registryId),
  ])

  const itemKey = (sec: string, item: string) =>
    `${sec.trim().toLowerCase()}||${item.trim().toLowerCase()}`
  const catalogByKey = new Map<string, ItemWithTiers>()
  for (const c of catalog) catalogByKey.set(itemKey(c.section, c.item_name), c)

  const customsByKey = new Map<string, CustomItem>()
  for (const c of customs) customsByKey.set(itemKey(c.section, c.item_name), c)

  const existingTierPicks = new Set(
    picks
      .filter((p) => p.person_id === person!.id && p.catalog_tier_id)
      .map((p) => p.catalog_tier_id!),
  )
  const existingCustomPicks = new Set(
    picks
      .filter((p) => p.person_id === person!.id && p.custom_item_id)
      .map((p) => p.custom_item_id!),
  )
  const existingAltPicks = new Set(
    picks
      .filter((p) => p.person_id === person!.id && p.alternative_id)
      .map((p) => p.alternative_id!),
  )

  let pickCount = 0
  let altCount = 0
  let customCount = 0

  const sessionCustoms = new Map<string, CustomItem>()
  const sessionAlts = new Map<string, Alternative>()

  /**
   * Items already given an explicit state during this import — keyed by
   * "<kind>:<id>" to avoid writing the same upsert multiple times when a
   * single item generates many rows (one per picked tier).
   */
  const stateAppliedFor = new Set<string>()
  async function applyState(
    kind: 'catalog' | 'custom',
    id: string,
    state: ItemStateValue,
  ): Promise<void> {
    if (state === 'active') return
    const key = `${kind}:${id}`
    if (stateAppliedFor.has(key)) return
    stateAppliedFor.add(key)
    await upsertItemState({
      registryId,
      itemKind: kind,
      itemId: id,
      state,
      updatedBy: person!.id,
    })
  }

  for (const row of rows) {
    if (!row.section || !row.item) continue
    const key = itemKey(row.section, row.item)
    const isAlternativeRow = row.tier.toLowerCase() === 'alternative'

    let parentCatalogId: string | null = null
    let parentCustomId: string | null = null

    const catalogMatch = catalogByKey.get(key)
    let customMatch = customsByKey.get(key) ?? sessionCustoms.get(key) ?? null

    if (catalogMatch) {
      parentCatalogId = catalogMatch.id
      await applyState('catalog', catalogMatch.id, row.state)
    } else if (customMatch) {
      parentCustomId = customMatch.id
      await applyState('custom', customMatch.id, row.state)
    } else {
      const created = await addCustomItem({
        registry_id: registryId,
        added_by: person.id,
        section: row.section,
        item_name: row.item,
        priority: row.priority || null,
        where_to_buy: row.where || null,
        suggested_qty: 1,
        product: isAlternativeRow ? null : row.product || null,
        price_str: isAlternativeRow ? null : row.priceStr || null,
        unit_cost: isAlternativeRow ? null : safeUnitCost(row.totalCost, row.qty),
        note: isAlternativeRow ? null : row.note || null,
        url: isAlternativeRow ? null : row.link || null,
      })
      customMatch = created
      customsByKey.set(key, created)
      sessionCustoms.set(key, created)
      parentCustomId = created.id
      customCount++
      await applyState('custom', created.id, row.state)
    }

    if (isAlternativeRow) {
      const altKey = `${parentCatalogId ?? parentCustomId}||${(row.product || '').trim().toLowerCase()}`
      let alt =
        alts.find((a) => sameAlt(a, parentCatalogId, parentCustomId, row.product)) ??
        sessionAlts.get(altKey)
      if (!alt) {
        alt = await addAlternative({
          registry_id: registryId,
          added_by: person.id,
          catalog_item_id: parentCatalogId,
          custom_item_id: parentCustomId,
          product: row.product || row.item,
          price_str: row.priceStr || null,
          unit_cost: safeUnitCost(row.totalCost, row.qty),
          note: row.note || null,
          url: row.link || null,
        })
        alts.push(alt)
        sessionAlts.set(altKey, alt)
        altCount++
      }
      if (!existingAltPicks.has(alt.id)) {
        await addPick(
          registryId,
          person.id,
          { kind: 'alternative', alternative_id: alt.id },
          row.qty || 1,
        )
        existingAltPicks.add(alt.id)
        pickCount++
      }
    } else {
      if (parentCatalogId) {
        const ti = catalogMatch!.tiers.find(
          (t) => t.tier.toLowerCase() === row.tier.toLowerCase(),
        )
        if (ti && !existingTierPicks.has(ti.id)) {
          await addPick(
            registryId,
            person.id,
            { kind: 'tier', catalog_tier_id: ti.id },
            row.qty || 1,
          )
          existingTierPicks.add(ti.id)
          pickCount++
        }
      } else if (parentCustomId && !existingCustomPicks.has(parentCustomId)) {
        await addPick(
          registryId,
          person.id,
          { kind: 'custom', custom_item_id: parentCustomId },
          row.qty || 1,
        )
        existingCustomPicks.add(parentCustomId)
        pickCount++
      }
    }
  }

  return { person: personName, picks: pickCount, alternatives: altCount, customItems: customCount }
}

function safeUnitCost(totalCostStr: string, qty: number): number | null {
  const n = Number(totalCostStr.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  const q = qty > 0 ? qty : 1
  return Math.round((n / q) * 100) / 100
}

function sameAlt(
  a: Alternative,
  parentCatalogId: string | null,
  parentCustomId: string | null,
  product: string,
): boolean {
  if (!product) return false
  if (a.product.trim().toLowerCase() !== product.trim().toLowerCase()) return false
  if (parentCatalogId && a.catalog_item_id === parentCatalogId) return true
  if (parentCustomId && a.custom_item_id === parentCustomId) return true
  return false
}
