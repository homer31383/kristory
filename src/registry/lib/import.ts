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
 * against babylist_people.name (case-insensitive). The registry is locked
 * to two existing profiles, so an unknown name is a hard failure — we do
 * NOT create a new babylist_people row from an import.
 */
import { supabase } from '../../lib/supabase'
import {
  addAlternative,
  addCustomItem,
  addPick,
  loadAlternatives,
  loadCatalog,
  loadCustomItems,
  loadPeople,
  loadPicks,
  upsertCatalogTierOverride,
  upsertItemState,
  type ItemWithTiers,
} from '../data/queries'
import type {
  Alternative,
  BabylistPerson,
  CatalogTier,
  CustomItem,
  ItemStateValue,
} from '../types'
import type { ParsedCsvRow } from './csv'

export interface ImportSummary {
  person: string
  picks: number
  alternatives: number
  customItems: number
}

export interface ImportOptions {
  mode: 'replace' | 'merge'
}

export async function importCsv(
  registryId: string,
  rows: ParsedCsvRow[],
  personName: string,
  opts: ImportOptions,
): Promise<ImportSummary> {
  const people = await loadPeople(registryId)
  const person: BabylistPerson | undefined = people.find(
    (p) => p.name.toLowerCase() === personName.toLowerCase(),
  )
  if (!person) {
    throw new Error(
      `No matching profile for "${personName}". This registry is locked to Chris and Krista.`,
    )
  }
  if (opts.mode === 'replace') {
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

  /**
   * Catalog tiers we've already upserted an override for during this import.
   * Same dedupe trick — many CSV rows can reference the same tier (Chris and
   * Krista both picking Budget on the same item).
   */
  const overrideAppliedFor = new Set<string>()
  async function maybeApplyCatalogOverride(
    tier: CatalogTier,
    row: ParsedCsvRow,
  ): Promise<void> {
    if (overrideAppliedFor.has(tier.id)) return
    const rowUnitCost = safeUnitCost(row.totalCost, row.qty)
    const diverges =
      neq(tier.product, row.product) ||
      neq(tier.price_str, row.priceStr) ||
      neq(tier.note, row.note) ||
      neq(tier.url, row.link) ||
      (rowUnitCost != null && tier.unit_cost != null && rowUnitCost !== tier.unit_cost) ||
      (rowUnitCost != null && tier.unit_cost == null) ||
      (rowUnitCost == null && tier.unit_cost != null)
    if (!diverges) return
    overrideAppliedFor.add(tier.id)
    await upsertCatalogTierOverride({
      registryId,
      catalogTierId: tier.id,
      product: emptyToNull(row.product),
      priceStr: emptyToNull(row.priceStr),
      unitCost: rowUnitCost,
      note: emptyToNull(row.note),
      url: emptyToNull(row.link),
      updatedBy: person!.id,
    })
  }
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
        image_url: null,
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
          image_url: null,
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
        if (ti) {
          // Catalog-side import: if the CSV row's product/price/notes/link
          // differ from the seed catalog, store the deltas as a per-registry
          // override so the imported view matches.
          await maybeApplyCatalogOverride(ti, row)
          if (!existingTierPicks.has(ti.id)) {
            await addPick(
              registryId,
              person.id,
              { kind: 'tier', catalog_tier_id: ti.id },
              row.qty || 1,
            )
            existingTierPicks.add(ti.id)
            pickCount++
          }
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

function neq(a: string | null | undefined, b: string | null | undefined): boolean {
  const an = (a ?? '').trim()
  const bn = (b ?? '').trim()
  return an !== bn
}

function emptyToNull(s: string | null | undefined): string | null {
  const t = (s ?? '').trim()
  return t === '' ? null : t
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
