export function fmtUSD(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return '$' + Math.round(n).toLocaleString('en-US')
}

export function parsePriceStr(s: string | null | undefined): number | null {
  if (!s) return null
  const m = s.replace(/[^0-9.\-]/g, '')
  if (!m) return null
  const n = Number(m)
  return Number.isFinite(n) ? n : null
}
