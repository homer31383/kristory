import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, parse } from 'date-fns'
import { supabase } from '../lib/supabase'
import { getStorageUrl } from '../lib/helpers'

const FAMILY_PIN_KEY = 'kristory-family-pin-ok'
const PAGE_SIZE = 24

interface FamilyPhoto {
  id: string
  storage_path: string
  post_id: string
  published_at: string
}

function useFamilyPhotos() {
  return useQuery({
    queryKey: ['family-photos'],
    // Always refetch on mount so opening the page feels fresh.
    staleTime: 0,
    queryFn: async (): Promise<FamilyPhoto[]> => {
      const { data, error } = await supabase
        .from('family_post_photos')
        .select(`
          id,
          entry_photo:entry_photos!entry_photo_id(storage_path),
          post:family_posts!family_post_id(id, published_at)
        `)

      if (error) throw error

      return (data ?? [])
        .map((row: any) => ({
          id: row.id as string,
          storage_path: row.entry_photo?.storage_path as string | undefined,
          post_id: row.post?.id as string | undefined,
          published_at: row.post?.published_at as string | undefined,
        }))
        .filter(
          (p): p is FamilyPhoto =>
            Boolean(p.storage_path && p.post_id && p.published_at)
        )
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

export default function FamilyPhotos() {
  const navigate = useNavigate()
  const authed = localStorage.getItem(FAMILY_PIN_KEY) === 'true'

  // Gate on the same Babory PIN — bounce to the feed (which shows the PIN form).
  useEffect(() => {
    if (!authed) navigate('/family', { replace: true })
  }, [authed, navigate])

  const { data, isLoading } = useFamilyPhotos()

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

  if (!authed) return null

  const visible = shuffled.slice(0, visibleCount)

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FFF8E7' }}>
      {/* Subtle back affordance — the only chrome on the page */}
      <button
        onClick={() => navigate('/family')}
        aria-label="Back to The Babory"
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
            style={{ borderColor: '#F0C987', borderTopColor: 'transparent' }}
          />
        </div>
      ) : shuffled.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-screen px-8 text-center">
          <div className="text-4xl mb-3">📷</div>
          <p className="text-sm" style={{ color: '#8a7a5a' }}>
            No photos shared yet — check back soon!
          </p>
        </div>
      ) : (
        <div className="columns-2 md:columns-3 gap-1 p-1">
          {visible.map((photo) => (
            <button
              key={photo.id}
              onClick={() => navigate(`/family?post=${photo.post_id}`)}
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
                {format(parse(photo.published_at.slice(0, 10), 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}
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
