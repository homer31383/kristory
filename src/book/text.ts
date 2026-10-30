import type { BookHiddenRange } from '../types'

/**
 * A section's plain text, as the book sees it. Hidden-text offsets point into
 * exactly this string, so keep it deterministic: paragraphs are separated by
 * a blank line, <br> becomes a newline, tags are dropped, entities decoded.
 */
export function sectionPlainText(html: string | null | undefined): string {
  if (!html) return ''
  const marked = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*/gi, '\n\n')
  const doc = new DOMParser().parseFromString(marked, 'text/html')
  return (doc.body.textContent ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function wordCount(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** FNV-1a, 32 bit, as 8 hex characters. Only used to notice edits. */
export function hashText(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Where each hidden range sits in the current text. When the section changed
 * since the passage was hidden, the snippet is looked up again; a snippet
 * that is gone hides nothing (and the item is flagged elsewhere).
 */
export function resolveHiddenRanges(
  text: string,
  ranges: BookHiddenRange[],
): { start: number; end: number }[] {
  const hash = hashText(text)
  const out: { start: number; end: number }[] = []
  for (const r of ranges) {
    if (r.source_hash === hash && r.end <= text.length && r.start < r.end) {
      out.push({ start: r.start, end: r.end })
      continue
    }
    const at = r.snippet ? text.indexOf(r.snippet) : -1
    if (at >= 0) out.push({ start: at, end: at + r.snippet.length })
  }
  return out.sort((a, b) => a.start - b.start)
}

/** The text with hidden passages removed. */
export function visibleText(text: string, ranges: BookHiddenRange[]): string {
  if (ranges.length === 0) return text
  let out = ''
  let cursor = 0
  for (const r of resolveHiddenRanges(text, ranges)) {
    if (r.start > cursor) out += text.slice(cursor, r.start)
    cursor = Math.max(cursor, r.end)
  }
  out += text.slice(cursor)
  return out.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
}

/** True when any hidden range was made against text that has since changed. */
export function hiddenTextChanged(text: string, ranges: BookHiddenRange[]): boolean {
  if (ranges.length === 0) return false
  const hash = hashText(text)
  return ranges.some((r) => r.source_hash !== hash)
}
