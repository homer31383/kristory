import { sanitizeHtml } from '../lib/helpers'
import type { BookHiddenRange } from '../types'

/**
 * Entry text as the book sees it. A section's Tiptap HTML (bold and italic
 * only) becomes one plain string plus a mark per character. Hidden-text
 * offsets point into exactly this string, so keep it deterministic:
 * paragraphs are separated by a blank line, <br> is a newline, empty
 * paragraphs add nothing, and the ends are trimmed.
 */

export const MARK_BOLD = 1
export const MARK_ITALIC = 2

export interface RichText {
  text: string
  marks: number[]
}

export function sectionRich(html: string | null | undefined): RichText {
  if (!html) return { text: '', marks: [] }
  const doc = new DOMParser().parseFromString(sanitizeHtml(html), 'text/html')
  let text = ''
  const marks: number[] = []
  let pending = ''

  const append = (s: string, m: number) => {
    for (const ch of s) {
      text += ch
      marks.push(m)
    }
  }
  const walk = (node: Node, m: number) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node as Text).data.replace(/\r\n?/g, '\n')
      if (!/\S/.test(t)) {
        if (!pending && text) append(t, m)
        return
      }
      if (pending && text) append(pending, 0)
      pending = ''
      append(t, m)
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const tag = (node as Element).tagName.toLowerCase()
    if (tag === 'br') {
      if (text && !pending) append('\n', m)
      return
    }
    const next = tag === 'strong' || tag === 'b' ? m | MARK_BOLD : tag === 'em' || tag === 'i' ? m | MARK_ITALIC : m
    if (tag === 'p' && text) pending = '\n\n'
    node.childNodes.forEach((c) => walk(c, next))
    if (tag === 'p' && text) pending = '\n\n'
  }
  doc.body.childNodes.forEach((c) => walk(c, 0))

  // Trim both ends, keeping marks aligned.
  let start = 0
  let end = text.length
  while (start < end && /\s/.test(text[start])) start++
  while (end > start && /\s/.test(text[end - 1])) end--
  return { text: text.slice(start, end), marks: marks.slice(start, end) }
}

export function sectionPlainText(html: string | null | undefined): string {
  return sectionRich(html).text
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

/** True when any hidden range was made against text that has since changed. */
export function hiddenTextChanged(text: string, ranges: BookHiddenRange[]): boolean {
  if (ranges.length === 0) return false
  const hash = hashText(text)
  return ranges.some((r) => r.source_hash !== hash)
}

// ── Words, for flowing text across pages ─────────────────────────────────────

export interface Seg {
  t: string
  m: number
}

/** One word: its characters (with marks) and the space after it. */
export interface Token {
  segs: Seg[]
  ws: string
}

/** The visible words of a section, with hidden ranges removed. */
export function visibleTokens(rich: RichText, ranges: BookHiddenRange[]): Token[] {
  const { text, marks } = rich
  const hidden = new Uint8Array(text.length)
  for (const r of resolveHiddenRanges(text, ranges)) hidden.fill(1, r.start, Math.min(r.end, text.length))

  const tokens: Token[] = []
  let cur: Token | null = null
  for (let i = 0; i < text.length; i++) {
    if (hidden[i]) continue
    const ch = text[i]
    if (/\s/.test(ch)) {
      if (cur) cur.ws += ch
      continue
    }
    if (!cur || cur.ws) {
      cur = { segs: [], ws: '' }
      tokens.push(cur)
    }
    const last = cur.segs[cur.segs.length - 1]
    if (last && last.m === marks[i]) last.t += ch
    else cur.segs.push({ t: ch, m: marks[i] })
  }
  tokens.forEach((t, i) => {
    t.ws = i === tokens.length - 1 ? '' : t.ws.includes('\n\n') ? '\n\n' : t.ws.includes('\n') ? '\n' : ' '
  })
  return tokens
}

/** Runs of same-marked text, ready to render. */
export function tokenRuns(tokens: Token[]): Seg[] {
  const runs: Seg[] = []
  tokens.forEach((tok, i) => {
    for (const s of tok.segs) {
      const last = runs[runs.length - 1]
      if (last && last.m === s.m) last.t += s.t
      else runs.push({ t: s.t, m: s.m })
    }
    const ws = i === tokens.length - 1 ? '' : tok.ws
    if (ws) runs[runs.length - 1].t += ws
  })
  return runs
}

export function tokensText(tokens: Token[]): string {
  return tokens.map((t, i) => t.segs.map((s) => s.t).join('') + (i === tokens.length - 1 ? '' : t.ws)).join('')
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Same output as the React renderer, as an HTML string (for measuring). */
export function runsToHtml(runs: Seg[]): string {
  return runs
    .map((r) => {
      let h = escapeHtml(r.t)
      if (r.m & MARK_ITALIC) h = `<em>${h}</em>`
      if (r.m & MARK_BOLD) h = `<strong>${h}</strong>`
      return h
    })
    .join('')
}
