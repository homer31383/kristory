/**
 * Client-side Google Doc import parser.
 * Parses a plain text file with date headers and narrative text into structured entries.
 *
 * Supports two formats:
 *
 * FORMAT A — Date on its own line, content on following lines:
 *   July 21:
 *   This is the entry text...
 *
 * FORMAT B — Date and content on the same line, entries separated by blank lines:
 *   January 18, 2021: mlk day met at covenhoven had 2 beers...
 *
 *   January 24, 2021: my house packers game first time she came over...
 */

export interface ParsedEntry {
  date: string       // YYYY-MM-DD
  content: string    // raw text (not yet HTML)
  lineNumber: number // line where the date header was found
}

export interface ParseWarning {
  line: number
  text: string
  reason: string
}

export interface ParseResult {
  entries: ParsedEntry[]
  warnings: ParseWarning[]
  needsYear: boolean
  inferredStartYear: number | null
}

const monthMap: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

interface RawDateMatch {
  month: number
  day: number
  year: number | null
}

// Regex patterns that match a date prefix at the START of a string, followed by ":"
// Each returns [fullMatch, ...groups] where the match includes everything up to and including ":"
const datePatterns = [
  // "January 18, 2021:" or "July 21:" or "Jul 21:" or "**July 21, 2025:**"
  /^\*{0,2}(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?\s*:\*{0,2}/i,
  // "1/18/2021:" or "7/21:" or "7/21/24:"
  /^\*{0,2}(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*:\*{0,2}/,
  // "2021-01-18:"
  /^\*{0,2}(\d{4})-(\d{2})-(\d{2})\s*:\*{0,2}/,
]

/**
 * Try to parse a date from the beginning of a string.
 * Returns the match info and the remaining text after the date+colon, or null.
 */
function tryExtractDate(text: string): { match: RawDateMatch; rest: string } | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // Pattern 1: Month name
  const m1 = trimmed.match(datePatterns[0])
  if (m1) {
    const month = monthMap[m1[1].toLowerCase()]
    const day = parseInt(m1[2])
    const year = m1[3] ? parseInt(m1[3]) : null
    if (month && day >= 1 && day <= 31) {
      const rest = trimmed.slice(m1[0].length).trim()
      return { match: { month, day, year }, rest }
    }
  }

  // Pattern 2: Numeric M/D
  const m2 = trimmed.match(datePatterns[1])
  if (m2) {
    const month = parseInt(m2[1])
    const day = parseInt(m2[2])
    let year: number | null = null
    if (m2[3]) {
      year = parseInt(m2[3])
      if (year < 100) year += 2000
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const rest = trimmed.slice(m2[0].length).trim()
      return { match: { month, day, year }, rest }
    }
  }

  // Pattern 3: ISO date
  const m3 = trimmed.match(datePatterns[2])
  if (m3) {
    const rest = trimmed.slice(m3[0].length).trim()
    return { match: { month: parseInt(m3[2]), day: parseInt(m3[3]), year: parseInt(m3[1]) }, rest }
  }

  return null
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

function contentToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/**
 * Parse a text file into entries.
 *
 * Handles two layouts:
 *   1. "Paragraph mode" — entries separated by blank lines, date + content on same line
 *   2. "Line mode" — date on its own line, content on following lines until next date
 *
 * Auto-detects which mode to use by checking if the first date match has content
 * on the same line as the date.
 */
export function parseImportFile(text: string, fallbackYear?: number): ParseResult {
  // Strip everything after "# UNDATED ENTRIES" (or similar section headers)
  const undatedIdx = text.search(/^#\s*UNDATED\s+ENTRIES/im)
  const cleanedText = undatedIdx >= 0 ? text.slice(0, undatedIdx) : text

  const lines = cleanedText.split('\n')
  const warnings: ParseWarning[] = []

  interface RawEntry {
    match: RawDateMatch
    lineNumber: number
    content: string
  }

  // First, try paragraph mode: split by blank lines, check each paragraph
  const paragraphs = splitParagraphs(cleanedText)
  const paragraphEntries = parseParagraphMode(paragraphs)

  // Also try line mode
  const lineEntries = parseLineMode(lines)

  // Use whichever found more entries
  const rawEntries: RawEntry[] = paragraphEntries.length >= lineEntries.length
    ? paragraphEntries
    : lineEntries

  if (rawEntries.length === 0) {
    return {
      entries: [],
      warnings: [{ line: 1, text: '', reason: 'No date headers found in file' }],
      needsYear: false,
      inferredStartYear: null,
    }
  }

  // Check if we need a year
  const noneHaveYears = rawEntries.every((e) => e.match.year === null)
  let needsYear = false
  let inferredStartYear: number | null = null

  if (noneHaveYears && !fallbackYear) {
    needsYear = true
    inferredStartYear = new Date().getFullYear()
  }

  // Assign years and build final entries
  const resolvedYear = fallbackYear ?? new Date().getFullYear()
  let currentYear = resolvedYear
  let prevMonth = 0

  const entries: ParsedEntry[] = []

  for (const raw of rawEntries) {
    let year = raw.match.year

    if (year === null) {
      // Infer from sequential month order
      if (raw.match.month < prevMonth && prevMonth >= 10 && raw.match.month <= 3) {
        currentYear++
      }
      year = currentYear
      prevMonth = raw.match.month
    } else {
      currentYear = year
      prevMonth = raw.match.month
    }

    if (!raw.content) {
      warnings.push({
        line: raw.lineNumber,
        text: '',
        reason: 'Date header found but no content follows',
      })
      continue
    }

    const dateStr = `${year}-${pad2(raw.match.month)}-${pad2(raw.match.day)}`

    const testDate = new Date(dateStr + 'T12:00:00')
    if (isNaN(testDate.getTime())) {
      warnings.push({
        line: raw.lineNumber,
        text: '',
        reason: `Invalid date: ${dateStr}`,
      })
      continue
    }

    entries.push({
      date: dateStr,
      content: raw.content,
      lineNumber: raw.lineNumber,
    })
  }

  return { entries, warnings, needsYear: needsYear && !fallbackYear, inferredStartYear }
}

/** Split text into paragraphs (groups of non-blank lines separated by blank lines) */
function splitParagraphs(text: string): { text: string; lineNumber: number }[] {
  const lines = text.split('\n')
  const paragraphs: { text: string; lineNumber: number }[] = []
  let currentLines: string[] = []
  let startLine = 0

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '') {
      if (currentLines.length > 0) {
        paragraphs.push({ text: currentLines.join('\n'), lineNumber: startLine + 1 })
        currentLines = []
      }
    } else {
      if (currentLines.length === 0) startLine = i
      currentLines.push(lines[i])
    }
  }
  if (currentLines.length > 0) {
    paragraphs.push({ text: currentLines.join('\n'), lineNumber: startLine + 1 })
  }

  return paragraphs
}

/** Paragraph mode: each paragraph starts with a date, rest is content */
function parseParagraphMode(paragraphs: { text: string; lineNumber: number }[]) {
  interface RawEntry {
    match: RawDateMatch
    lineNumber: number
    content: string
  }

  const entries: RawEntry[] = []

  for (const para of paragraphs) {
    const result = tryExtractDate(para.text)
    if (result) {
      // "rest" is content on the same line after the date. There may also be more lines.
      const firstLineRest = result.rest
      const otherLines = para.text.split('\n').slice(1).join('\n').trim()
      const content = [firstLineRest, otherLines].filter(Boolean).join('\n').trim()

      entries.push({
        match: result.match,
        lineNumber: para.lineNumber,
        content,
      })
    }
  }

  return entries
}

/** Line mode: dates on their own lines, content on following lines until next date */
function parseLineMode(lines: string[]) {
  interface RawEntry {
    match: RawDateMatch
    lineNumber: number
    content: string
  }

  const entries: RawEntry[] = []
  let current: { match: RawDateMatch; lineNumber: number; contentLines: string[] } | null = null

  for (let i = 0; i < lines.length; i++) {
    const result = tryExtractDate(lines[i])
    if (result && !result.rest) {
      // Date on its own line (no content after the colon)
      if (current) {
        entries.push({
          match: current.match,
          lineNumber: current.lineNumber,
          content: current.contentLines.join('\n').trim(),
        })
      }
      current = { match: result.match, lineNumber: i + 1, contentLines: [] }
    } else if (result && result.rest) {
      // Date with inline content — treat as single entry on this line
      if (current) {
        entries.push({
          match: current.match,
          lineNumber: current.lineNumber,
          content: current.contentLines.join('\n').trim(),
        })
      }
      current = { match: result.match, lineNumber: i + 1, contentLines: [result.rest] }
    } else if (current) {
      current.contentLines.push(lines[i])
    }
  }

  if (current) {
    entries.push({
      match: current.match,
      lineNumber: current.lineNumber,
      content: current.contentLines.join('\n').trim(),
    })
  }

  return entries
}

export { contentToHtml }
