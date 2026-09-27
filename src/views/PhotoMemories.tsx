import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parse } from 'date-fns'
import { supabase } from '../lib/supabase'
import { getStorageUrl } from '../lib/helpers'

interface PhotoMemory {
  id: string
  storage_path: string
  entry_date: string
}

const PAGE_SIZE = 24

function usePhotoMemories() {
  return useQuery({
    queryKey: ['photo-memories'],
    // Always refetch on mount so opening the page feels fresh.
    staleTime: 0,
    queryFn: async (): Promise<PhotoMemory[]> => {
      const { data, error } = await supabase
        .from('entry_photos')
        .select('id, storage_path, entry:journal_entries!entry_id(entry_date)')

      if (error) throw error

      return (data ?? [])
        .map((row: any) => ({
          id: row.id as string,
          storage_path: row.storage_path as string,
          entry_date: row.entry?.entry_date as string | undefined,
        }))
        .filter((p): p is PhotoMemory => Boolean(p.entry_date && p.storage_path))
    },
  })
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

export default function PhotoMemories() {
  const navigate = useNavigate()
  const { data, isLoading } = usePhotoMemories()

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
        onClick={() => navigate('/journal')}
        aria-label="Back to journal"
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
          <div className="text-4xl mb-3">📷</div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No photos yet — add some to your journal entries.
          </p>
        </div>
      ) : (
        <div className="columns-2 md:columns-3 gap-1 p-1">
          {visible.map((photo) => (
            <button
              key={photo.id}
              onClick={() => navigate(`/journal/${photo.entry_date}`)}
              className="relative block w-full mb-1 break-inside-avoid overflow-hidden cursor-pointer"
            >
              <img
                src={getStorageUrl(photo.storage_path)}
                alt=""
                loading="lazy"
                className="w-full h-auto block"
              />
              <span
                className="absolute bottom-1 right-1 text-[10px] px-1.5 py-0.5 rounded text-white pointer-events-none"
                style={{
                  backgroundColor: 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(4px)',
                  WebkitBackdropFilter: 'blur(4px)',
                }}
              >
                {format(parse(photo.entry_date, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
              </span>
            </button>
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
