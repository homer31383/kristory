/**
 * CSV import + export utilities.
 *
 * Newer exports include a Person column; older ones (e.g. Krista's iPad
 * export from the standalone HTML version) don't. The importer handles both
 * — falling back to a name prompt when Person is absent or empty.
 */
import Papa from 'papaparse'
import type {
  Alternative,
  BabylistPerson,
  CatalogItem,
  CatalogTier,
  CustomItem,
  Pick,
} from '../types'

export interface ParsedCsvRow {
  person: string
  section: string
  item: string
  priority: string
  where: string
  qty: number
  tier: string
  product: string
  priceStr: string
  totalCost: string
  note: string
  link: string
}

export function parseCsv(text: string): ParsedCsvRow[] {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true })
  return (result.data as Record<string, string>[]).map((r) => normalizeRow(r))
}

function normalizeRow(r: Record<string, string>): ParsedCsvRow {
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      if (k in r) return (r[k] ?? '').trim()
      const lk = k.toLowerCase()
      const found = Object.keys(r).find((rk) => rk.toLowerCase() === lk)
      if (found) return (r[found] ?? '').trim()
    }
    return ''
  }
  return {
    person: get('Person'),
    section: get('Section'),
    item: get('Item'),
    priority: get('Priority'),
    where: get('Where'),
    qty: parseInt(get('Qty') || '1', 10) || 1,
    tier: get('Tier'),
    product: get('Product'),
    priceStr: get('Price'),
    totalCost: get('Total Cost'),
    note: get('Notes'),
    link: get('Link'),
  }
}

// ─── Export ────────────────────────────────────────────────────────────────

export interface ExportContext {
  catalogItems: CatalogItem[]
  catalogTiers: CatalogTier[]
  customItems: CustomItem[]
  alternatives: Alternative[]
  people: BabylistPerson[]
  picks: Pick[]
}

export function buildCsv(ctx: ExportContext): string {
  const headers = [
    'Person',
    'Section',
    'Item',
    'Priority',
    'Where',
    'Qty',
    'Tier',
    'Product',
    'Price',
    'Total Cost',
    'Notes',
    'Link',
  ]
  const tierMap = new Map(ctx.catalogTiers.map((t) => [t.id, t]))
  const itemMap = new Map(ctx.catalogItems.map((i) => [i.id, i]))
  const customMap = new Map(ctx.customItems.map((c) => [c.id, c]))
  const altMap = new Map(ctx.alternatives.map((a) => [a.id, a]))
  const personMap = new Map(ctx.people.map((p) => [p.id, p]))

  const rows: (string | number | null)[][] = []

  for (const pick of ctx.picks) {
    const person = personMap.get(pick.person_id)
    if (!person) continue
    let section = ''
    let item = ''
    let priority = ''
    let where = ''
    let tier = ''
    let product = ''
    let priceStr = ''
    let note = ''
    let url = ''
    let unitCost: number | null = null

    if (pick.catalog_tier_id) {
      const t = tierMap.get(pick.catalog_tier_id)
      if (!t) continue
      const it = itemMap.get(t.catalog_item_id)
      if (!it) continue
      section = it.section
      item = it.item_name
      priority = it.priority ?? ''
      where = it.where_to_buy ?? ''
      tier = t.tier
      product = t.product ?? ''
      priceStr = t.price_str ?? ''
      note = t.note ?? ''
      url = t.url ?? ''
      unitCost = t.unit_cost
    } else if (pick.custom_item_id) {
      const c = customMap.get(pick.custom_item_id)
      if (!c) continue
      section = c.section
      item = c.item_name
      priority = c.priority ?? ''
      where = c.where_to_buy ?? ''
      tier = 'Mid'
      product = c.product ?? ''
      priceStr = c.price_str ?? ''
      note = c.note ?? ''
      url = c.url ?? ''
      unitCost = c.unit_cost
    } else if (pick.alternative_id) {
      const a = altMap.get(pick.alternative_id)
      if (!a) continue
      tier = 'Alternative'
      product = a.product
      priceStr = a.price_str ?? ''
      note = a.note ?? ''
      url = a.url ?? ''
      unitCost = a.unit_cost
      if (a.catalog_item_id) {
        const it = itemMap.get(a.catalog_item_id)
        if (it) {
          section = it.section
          item = it.item_name
          priority = it.priority ?? ''
          where = it.where_to_buy ?? ''
        }
      } else if (a.custom_item_id) {
        const c = customMap.get(a.custom_item_id)
        if (c) {
          section = c.section
          item = c.item_name
          priority = c.priority ?? ''
          where = c.where_to_buy ?? ''
        }
      }
    }

    const totalCost = unitCost != null ? Math.round(unitCost * pick.qty) : ''
    rows.push([
      person.name,
      section,
      item,
      priority,
      where,
      pick.qty,
      tier,
      product,
      priceStr,
      totalCost,
      note,
      url,
    ])
  }

  return Papa.unparse({ fields: headers, data: rows })
}

export function downloadCsv(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function todayStamp(): string {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export function summarizeImport(stats: {
  picks: number
  alternatives: number
  customItems: number
  person: string
}): string {
  return `Imported ${stats.picks} picks from ${stats.person}. Created ${stats.alternatives} alternatives and ${stats.customItems} custom items.`
}
