/**
 * Import Google Doc export into Kristory
 *
 * Usage:
 *   npx tsx scripts/import-google-doc.ts ./kristory-export.txt --dry-run
 *   npx tsx scripts/import-google-doc.ts ./kristory-export.txt
 *   npx tsx scripts/import-google-doc.ts ./kristory-export.txt --year=2021
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { config } from 'dotenv'

config()

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// Parse arguments
const args = process.argv.slice(2)
const filePath = args.find((a) => !a.startsWith('--'))
const dryRun = args.includes('--dry-run')
const yearArg = args.find((a) => a.startsWith('--year='))
const fallbackYear = yearArg ? parseInt(yearArg.split('=')[1]) : undefined

if (!filePath) {
  console.error('Usage: npx tsx scripts/import-google-doc.ts <file-path> [--dry-run] [--year=2021]')
  process.exit(1)
}

// ─── Date parsing (mirrors src/lib/import-parser.ts) ───────────────────────

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
const datePatterns = [
  // "January 18, 2021:" or "July 21:" or "Jul 21:" or "**July 21, 2025:**"
  /^\*{0,2}(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})(?:\s*,\s*(\d{4}))?\s*:\*{0,2}/i,
  // "1/18/2021:" or "7/21:" or "7/21/24:"
  /^\*{0,2}(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\s*:\*{0,2}/,
  // "2021-01-18:"
  /^\*{0,2}(\d{4})-(\d{2})-(\d{2})\s*:\*{0,2}/,
]

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

interface RawEntry {
  match: RawDateMatch
  lineNumber: number
  content: string
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
function parseParagraphMode(paragraphs: { text: string; lineNumber: number }[]): RawEntry[] {
  const entries: RawEntry[] = []

  for (const para of paragraphs) {
    const result = tryExtractDate(para.text)
    if (result) {
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
function parseLineMode(lines: string[]): RawEntry[] {
  const entries: RawEntry[] = []
  let current: { match: RawDateMatch; lineNumber: number; contentLines: string[] } | null = null

  for (let i = 0; i < lines.length; i++) {
    const result = tryExtractDate(lines[i])
    if (result && !result.rest) {
      if (current) {
        entries.push({
          match: current.match,
          lineNumber: current.lineNumber,
          content: current.contentLines.join('\n').trim(),
        })
      }
      current = { match: result.match, lineNumber: i + 1, contentLines: [] }
    } else if (result && result.rest) {
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

interface ParsedEntry {
  date: string
  content: string
}

function parseFile(content: string, yearOverride?: number): ParsedEntry[] {
  // Strip everything after "# UNDATED ENTRIES"
  const undatedIdx = content.search(/^#\s*UNDATED\s+ENTRIES/im)
  const cleanedText = undatedIdx >= 0 ? content.slice(0, undatedIdx) : content

  const lines = cleanedText.split('\n')

  // Try both modes, use whichever finds more entries
  const paragraphs = splitParagraphs(cleanedText)
  const paragraphEntries = parseParagraphMode(paragraphs)
  const lineEntries = parseLineMode(lines)

  const rawEntries = paragraphEntries.length >= lineEntries.length
    ? paragraphEntries
    : lineEntries

  if (rawEntries.length === 0) return []

  // Assign years and build final entries
  const resolvedYear = yearOverride ?? new Date().getFullYear()
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

    if (!raw.content) continue

    const dateStr = `${year}-${pad2(raw.match.month)}-${pad2(raw.match.day)}`

    const testDate = new Date(dateStr + 'T12:00:00')
    if (isNaN(testDate.getTime())) {
      console.warn(`  Skipping invalid date: ${dateStr} (line ${raw.lineNumber})`)
      continue
    }

    entries.push({ date: dateStr, content: raw.content })
  }

  return entries
}

function contentToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`)
    .join('')
}

async function getChrisUser(): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .ilike('name', 'chris')
    .single()

  if (error || !data) {
    // Fallback: get first user
    const { data: users } = await supabase.from('users').select('id').limit(1)
    if (!users || users.length === 0) {
      console.error('No users found in the database')
      process.exit(1)
    }
    return users[0].id
  }
  return data.id
}

async function main() {
  const absolutePath = resolve(filePath!)
  console.log(`Reading file: ${absolutePath}`)

  let fileContent: string
  try {
    fileContent = readFileSync(absolutePath, 'utf-8')
  } catch (err) {
    console.error(`Failed to read file: ${(err as Error).message}`)
    process.exit(1)
  }

  const entries = parseFile(fileContent, fallbackYear)
  console.log(`Parsed ${entries.length} entries`)

  if (entries.length === 0) {
    console.log('No entries found. Check the file format.')
    return
  }

  // Show preview
  console.log('\nPreview of first 5 entries:')
  for (const entry of entries.slice(0, 5)) {
    const preview = entry.content.slice(0, 80).replace(/\n/g, ' ')
    console.log(`  ${entry.date}: ${preview}...`)
  }

  if (dryRun) {
    console.log('\n--- DRY RUN --- No data written to database')
    console.log(`\nSummary:`)
    console.log(`  Total entries: ${entries.length}`)
    console.log(`  Date range: ${entries[0].date} to ${entries[entries.length - 1].date}`)
    return
  }

  const userId = await getChrisUser()
  console.log(`\nImporting as user: ${userId}`)

  let imported = 0
  let skipped = 0
  let failed = 0

  for (const entry of entries) {
    try {
      // Create or get journal entry
      const { data: journalEntry, error: jeError } = await supabase
        .from('journal_entries')
        .upsert({ entry_date: entry.date }, { onConflict: 'entry_date' })
        .select()
        .single()

      if (jeError) {
        console.error(`  Failed to create entry for ${entry.date}: ${jeError.message}`)
        failed++
        continue
      }

      // Create section
      const html = contentToHtml(entry.content)
      const { error: sectionError } = await supabase
        .from('entry_sections')
        .upsert(
          { entry_id: journalEntry.id, user_id: userId, content: html },
          { onConflict: 'entry_id,user_id' }
        )

      if (sectionError) {
        console.error(`  Failed to create section for ${entry.date}: ${sectionError.message}`)
        failed++
        continue
      }

      imported++
    } catch (err) {
      console.error(`  Error on ${entry.date}: ${(err as Error).message}`)
      failed++
    }
  }

  console.log(`\nImport complete!`)
  console.log(`  Imported: ${imported}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Failed: ${failed}`)
}

main().catch(console.error)
