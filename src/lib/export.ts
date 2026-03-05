import { supabase } from './supabase'
import { format } from 'date-fns'
import jsPDF from 'jspdf'

const ENTRY_SELECT = '*, sections:entry_sections!entry_id(*, user:users!user_id(id, name)), photos:entry_photos!entry_id(*), tagged_items:tagged_items!entry_id(*, category:categories!category_id(*))'

interface ExportEntry {
  date: string
  sections: { author: string; content: string }[]
  photos: string[]
  tagged_items: { category: string; name: string; rating: number | null; location: string | null }[]
  trip?: { title: string; summary: string | null }
}

async function fetchAllEntries() {
  const { data, error } = await supabase
    .from('journal_entries')
    .select(ENTRY_SELECT)
    .order('entry_date', { ascending: true })

  if (error) throw error
  return data ?? []
}

async function fetchTrips() {
  const { data, error } = await supabase
    .from('trips')
    .select('*, trip_entries:trip_entries!trip_id(entry_id)')
    .order('start_date')

  if (error) throw error
  return data ?? []
}

async function fetchCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('name')
  if (error) throw error
  return data ?? []
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body.textContent ?? ''
}

export async function exportJSON() {
  const [entries, trips, categories] = await Promise.all([
    fetchAllEntries(),
    fetchTrips(),
    fetchCategories(),
  ])

  // Build trip lookup
  const tripByEntryId: Record<string, { title: string; summary: string | null }> = {}
  for (const trip of trips) {
    for (const te of (trip.trip_entries ?? [])) {
      tripByEntryId[te.entry_id] = { title: trip.title, summary: trip.summary }
    }
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const exportEntries: ExportEntry[] = entries.map((entry: Record<string, unknown>) => ({
    date: entry.entry_date as string,
    sections: ((entry.sections ?? []) as Record<string, unknown>[]).map((s) => ({
      author: (s.user as Record<string, string>)?.name ?? 'Unknown',
      content: s.content as string,
    })),
    photos: ((entry.photos ?? []) as Record<string, unknown>[]).map(
      (p) => `${supabaseUrl}/storage/v1/object/public/kristory-photos/${p.storage_path}`
    ),
    tagged_items: ((entry.tagged_items ?? []) as Record<string, unknown>[]).map((t) => ({
      category: (t.category as Record<string, string>)?.name ?? '',
      name: t.name as string,
      rating: t.rating as number | null,
      location: t.location_name as string | null,
    })),
    trip: tripByEntryId[entry.id as string],
  }))

  const exportData = {
    exported_at: new Date().toISOString(),
    date_range: {
      start: entries[0]?.entry_date ?? null,
      end: entries[entries.length - 1]?.entry_date ?? null,
    },
    entries: exportEntries,
    categories: categories.map((c: Record<string, unknown>) => ({
      name: c.name,
      emoji: c.emoji,
    })),
    trips: trips.map((t: Record<string, unknown>) => ({
      title: t.title,
      summary: t.summary,
      start_date: t.start_date,
      end_date: t.end_date,
    })),
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kristory-export-${format(new Date(), 'yyyy-MM-dd')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportPDF() {
  const entries = await fetchAllEntries()

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const margin = 20
  const maxWidth = pageWidth - margin * 2
  let y = 0

  // Title page
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(36)
  y = 100
  pdf.text('The Kristory', pageWidth / 2, y, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(14)
  y += 15
  pdf.text('Chris & Krista', pageWidth / 2, y, { align: 'center' })

  if (entries.length > 0) {
    pdf.setFontSize(11)
    y += 10
    const first = entries[0].entry_date
    const last = entries[entries.length - 1].entry_date
    pdf.text(`${first} — ${last}`, pageWidth / 2, y, { align: 'center' })
  }

  // Entries
  for (const entry of entries) {
    pdf.addPage()
    y = margin

    // Date heading
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(16)
    const dateStr = format(new Date(entry.entry_date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')
    pdf.text(dateStr, margin, y)
    y += 10

    // Sections
    const sections = (entry.sections ?? []) as Record<string, unknown>[]
    for (const section of sections) {
      const authorName = (section.user as Record<string, string>)?.name ?? 'Unknown'
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.setTextColor(150)
      pdf.text(`${authorName}:`, margin, y)
      pdf.setTextColor(0)
      y += 5

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(11)
      const text = stripHtml(section.content as string ?? '')
      const lines = pdf.splitTextToSize(text, maxWidth)
      for (const line of lines) {
        if (y > 270) {
          pdf.addPage()
          y = margin
        }
        pdf.text(line, margin, y)
        y += 5
      }
      y += 5
    }

    // Tagged items
    const items = (entry.tagged_items ?? []) as Record<string, unknown>[]
    if (items.length > 0) {
      if (y > 250) {
        pdf.addPage()
        y = margin
      }

      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.setTextColor(150)
      pdf.text('Tagged Items:', margin, y)
      pdf.setTextColor(0)
      y += 5

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      for (const item of items) {
        if (y > 270) {
          pdf.addPage()
          y = margin
        }
        const catName = (item.category as Record<string, string>)?.name ?? ''
        const rating = item.rating ? ` ${'★'.repeat(item.rating as number)}${'☆'.repeat(5 - (item.rating as number))}` : ''
        pdf.text(`• ${catName}: ${item.name}${rating}`, margin + 5, y)
        y += 5
      }
    }
  }

  pdf.save(`the-kristory-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
}
