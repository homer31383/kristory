import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parse } from 'date-fns'
import { supabase } from '../lib/supabase'
import { BOOKS_CATEGORY_NAME } from '../lib/constants'

const PAGE_SIZE = 36

// Preset pastels for items without a cover image.
const PASTELS = [
  '#FDE2E4', '#FAD2E1', '#E2ECE9', '#BEE1E6', '#DFE7FD',
  '#FFF1E6', '#D8E2DC', '#ECE4DB', '#E8F0E3', '#F0E6F6',
  '#FCE8D5', '#E3E8F0',
]

interface RiverCategory {
  id: string
  name: string
}

interface RiverItem {
  id: string
  name: string
  subtitle: string | null
  rating: number | null
  cover_url: string | null
  item_date: string | null
  category: RiverCategory | null
}

function useRiverItems(categoryId?: string) {
  return useQuery({
    queryKey: ['library-river', categoryId ?? 'all'],
    // Always refetch on mount so opening the page feels fresh.
    staleTime: 0,
    queryFn: async (): Promise<RiverItem[]> => {
      // Note: the `categories` table has no `color` column — selecting it
      // returns a 400 and the whole query comes back empty.
      let query = supabase
        .from('tagged_items')
        .select('id, name, subtitle, rating, cover_url, item_date, category:categories!category_id(id, name)')
        .order('item_date', { ascending: false, nullsFirst: false })
        .limit(2000)

      if (categoryId) query = query.eq('category_id', categoryId)

      const { data, error } = await query
      if (error) throw error

      return (data ?? []).map((row: any) => ({
        id: row.id as string,
        name: row.name as string,
        subtitle: (row.subtitle ?? null) as string | null,
        rating: (row.rating ?? null) as number | null,
        cover_url: (row.cover_url ?? null) as string | null,
        item_date: (row.item_date ?? null) as string | null,
        category: (row.category ?? null) as RiverCategory | null,
      }))
    },
  })
}

// Mirror Explore's navigateToItem: books have their own detail surface,
// everything else uses the generic item detail route.
function itemPath(item: RiverItem): string {
  const isBook = item.category?.name?.toLowerCase() === BOOKS_CATEGORY_NAME.toLowerCase()
  return isBook ? `/library/books/${item.id}` : `/items/${item.id}`
}

// Fisher-Yates shuffle into a new array.
function shuffle<T>(input: T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Stable hash of a string so each item keeps the same pastel / height.
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function formatDate(d: string | null): string | null {
  if (!d) return null
  try {
    return format(parse(d, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')
  } catch {
    return null
  }
}

function Stars({ rating, color }: { rating: number; color: string }) {
  return (
    <div className="flex gap-px">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{ fontSize: 9, color: i < rating ? color : 'rgba(0,0,0,0.18)' }}
        >
          ★
        </span>
      ))}
    </div>
  )
}

function RiverCard({ item, onClick }: { item: RiverItem; onClick: () => void }) {
  const dateLabel = formatDate(item.item_date)
  const rated = item.rating != null && item.rating > 0

  if (item.cover_url) {
    return (
      <button
        onClick={onClick}
        className="relative block w-full mb-1 break-inside-avoid overflow-hidden cursor-pointer rounded-sm"
      >
        <img src={item.cover_url} alt="" loading="lazy" className="w-full h-auto block" />
        {/* Name + date overlay */}
        <div
          className="absolute inset-x-0 bottom-0 px-1.5 pt-4 pb-1 text-left pointer-events-none"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.62), rgba(0,0,0,0))',
          }}
        >
          <div className="text-white text-[9px] font-semibold leading-tight line-clamp-2">
            {item.name}
          </div>
          {dateLabel && (
            <div className="text-white/75 text-[8px] mt-0.5">{dateLabel}</div>
          )}
        </div>
      </button>
    )
  }

  // No cover — styled text card with a per-item pastel from the preset palette.
  const hash = hashStr(item.id)
  const bg = PASTELS[hash % PASTELS.length]
  const starColor = '#7a6a5a'
  const minHeight = [80, 102, 124][hash % 3]

  return (
    <button
      onClick={onClick}
      className="relative block w-full mb-1 break-inside-avoid overflow-hidden cursor-pointer rounded-sm text-left"
      style={{ backgroundColor: bg, minHeight }}
    >
      <div className="flex flex-col h-full p-2" style={{ minHeight }}>
        <div className="flex-1">
          <h3
            className="leading-snug line-clamp-3"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 700,
              fontSize: 12,
              color: '#2C2522',
            }}
          >
            {item.name}
          </h3>
          {item.subtitle && (
            <p className="mt-0.5 text-[9px] leading-snug line-clamp-2" style={{ color: '#6b5f57' }}>
              {item.subtitle}
            </p>
          )}
        </div>
        <div className="mt-1.5 flex items-center justify-between">
          {rated ? <Stars rating={item.rating!} color={starColor} /> : <span />}
          {dateLabel && (
            <span className="text-[8px]" style={{ color: '#8a7d72' }}>
              {dateLabel}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

export default function LibraryRiver() {
  const navigate = useNavigate()
  const { categoryId } = useParams<{ categoryId: string }>()
  const { data, isLoading } = useRiverItems(categoryId)

  // A nonce generated once per mount — combined with the data identity it
  // guarantees a fresh shuffle every time the page is opened.
  const mountNonce = useRef(Math.random())
  const shuffled = useMemo(
    () => (data ? shuffle(data) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, mountNonce.current]
  )

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Reset the visible window whenever a new shuffle happens.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [shuffled])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((c) => Math.min(c + PAGE_SIZE, shuffled.length))
        }
      },
      { rootMargin: '600px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [shuffled.length])

  const visible = shuffled.slice(0, visibleCount)

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--bg-page)' }}>
      {/* Subtle back affordance — the only chrome on the page */}
      <button
        onClick={() => navigate(categoryId ? `/lists/${categoryId}` : '/explore')}
        aria-label="Back"
        className="fixed top-3 left-3 z-50 w-9 h-9 flex items-center justify-center rounded-full"
        style={{
          backgroundColor: 'rgba(0,0,0,0.35)',
          color: 'white',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>

      {isLoading ? (
        <div className="flex justify-center items-center h-screen">
          <div
            className="w-7 h-7 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border-card)', borderTopColor: 'var(--accent)' }}
          />
        </div>
      ) : shuffled.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-screen px-8 text-center">
          <div className="text-4xl mb-3">📚</div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Nothing here yet.
          </p>
        </div>
      ) : (
        <div className="columns-3 md:columns-4 lg:columns-5 gap-1 p-1">
          {visible.map((item) => (
            <RiverCard
              key={item.id}
              item={item}
              onClick={() => navigate(itemPath(item))}
            />
          ))}
        </div>
      )}

      {/* Infinite scroll trigger */}
      {!isLoading && visibleCount < shuffled.length && (
        <div ref={sentinelRef} className="h-1 w-full" />
      )}
    </div>
  )
}
