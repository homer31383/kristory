import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type LightboxItem =
  | { type: 'image'; src: string }
  | { type: 'video'; src: string; poster?: string | null }

interface LightboxProps {
  items: LightboxItem[]
  startIndex: number
  onClose: () => void
}

const SWIPE_THRESHOLD = 50
const SLIDE_MS = 250
const MAX_SCALE = 4
const DOUBLE_TAP_MS = 300
/** Past this many items the dots get too dense; show "3 / 20" instead. */
const MAX_DOTS = 12

interface Zoom {
  scale: number
  x: number
  y: number
}

const NO_ZOOM: Zoom = { scale: 1, x: 0, y: 0 }

function distance(a: React.Touch, b: React.Touch) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

/**
 * Full-screen viewer for an entry's photos (and video clips). Swipe or arrow
 * keys to move, pinch or double-tap to zoom, tap the backdrop or X to close.
 * Only the current slide and its neighbors are mounted, which preloads the
 * adjacent images and unmounts (stops) any video that's swiped away.
 */
export default function Lightbox({ items, startIndex, onClose }: LightboxProps) {
  const [index, setIndex] = useState(() => Math.min(Math.max(startIndex, 0), items.length - 1))
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM)
  // While a finger is down, zoom/pan follows it directly with no easing.
  const [touching, setTouching] = useState(false)

  const gestureRef = useRef<{
    mode: 'pending' | 'swipe' | 'scroll' | 'pan' | 'pinch'
    startX: number
    startY: number
    startZoom: Zoom
    startDist: number
    moved: boolean
  } | null>(null)
  const lastTapRef = useRef(0)
  const suppressClickRef = useRef(false)

  const count = items.length
  const zoomed = zoom.scale > 1.01

  const go = useCallback((delta: number) => {
    setIndex((i) => {
      const next = i + delta
      if (next < 0 || next >= count) return i
      return next
    })
    setZoom(NO_ZOOM)
  }, [count])

  // Keyboard: arrows to move, Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, onClose])

  // Lock page scroll underneath.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const clampPan = (z: Zoom): Zoom => {
    const maxX = ((z.scale - 1) * window.innerWidth) / 2
    const maxY = ((z.scale - 1) * window.innerHeight) / 2
    return { scale: z.scale, x: Math.min(maxX, Math.max(-maxX, z.x)), y: Math.min(maxY, Math.max(-maxY, z.y)) }
  }

  // ─── Touch: swipe between slides, pinch/pan when zoomed ───
  // Handlers stop propagation so the entry page's own swipe-to-next-entry
  // gesture never sees them.
  const onTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation()
    // Leave the bottom of a playing video alone so its seek bar can be dragged.
    const target = e.target as HTMLElement
    if (target.tagName === 'VIDEO' && e.touches.length === 1) {
      const rect = target.getBoundingClientRect()
      if (e.touches[0].clientY > rect.bottom - 70) {
        gestureRef.current = null
        return
      }
    }
    setTouching(true)
    if (e.touches.length === 2) {
      gestureRef.current = {
        mode: 'pinch',
        startX: 0,
        startY: 0,
        startZoom: zoom,
        startDist: distance(e.touches[0], e.touches[1]),
        moved: true,
      }
      setDragging(false)
      setDragX(0)
      return
    }
    if (e.touches.length !== 1) return
    const t = e.touches[0]
    gestureRef.current = {
      mode: zoomed ? 'pan' : 'pending',
      startX: t.clientX,
      startY: t.clientY,
      startZoom: zoom,
      startDist: 0,
      moved: false,
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation()
    const g = gestureRef.current
    if (!g) return

    if (g.mode === 'pinch') {
      if (e.touches.length < 2) return
      const ratio = distance(e.touches[0], e.touches[1]) / g.startDist
      const scale = Math.min(MAX_SCALE, Math.max(1, g.startZoom.scale * ratio))
      setZoom(clampPan({ ...g.startZoom, scale }))
      return
    }

    const t = e.touches[0]
    const dx = t.clientX - g.startX
    const dy = t.clientY - g.startY
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) g.moved = true

    if (g.mode === 'pan') {
      setZoom(clampPan({ scale: g.startZoom.scale, x: g.startZoom.x + dx, y: g.startZoom.y + dy }))
      return
    }

    if (g.mode === 'pending') {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      g.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'scroll'
      if (g.mode === 'swipe') setDragging(true)
    }

    if (g.mode === 'swipe') {
      // Rubber-band at either end.
      const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === count - 1)
      setDragX(atEdge ? dx / 3 : dx)
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation()
    if (e.touches.length === 0) setTouching(false)
    const g = gestureRef.current
    if (!g) return

    // A pinch ends one finger at a time; keep panning with the one left.
    if (g.mode === 'pinch') {
      if (e.touches.length === 1) {
        const t = e.touches[0]
        gestureRef.current = { mode: 'pan', startX: t.clientX, startY: t.clientY, startZoom: zoom, startDist: 0, moved: true }
      } else {
        gestureRef.current = null
        if (zoom.scale <= 1.01) setZoom(NO_ZOOM)
      }
      suppressClickRef.current = true
      return
    }

    gestureRef.current = null
    if (g.moved) suppressClickRef.current = true

    if (g.mode === 'swipe') {
      setDragging(false)
      const dx = e.changedTouches[0].clientX - g.startX
      if (dx <= -SWIPE_THRESHOLD) go(1)
      else if (dx >= SWIPE_THRESHOLD) go(-1)
      setDragX(0)
      return
    }

    // Double-tap toggles zoom on images.
    if (!g.moved && items[index]?.type === 'image') {
      const now = Date.now()
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        lastTapRef.current = 0
        setZoom(zoomed ? NO_ZOOM : { scale: 2.5, x: 0, y: 0 })
        suppressClickRef.current = true
      } else {
        lastTapRef.current = now
      }
    }
  }

  // Clicks on the empty area around a slide close the viewer, but not the
  // click a browser synthesizes after a swipe, pinch, or double-tap.
  const onBackdropClick = (e: React.MouseEvent) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (e.target === e.currentTarget) onClose()
  }

  if (count === 0) return null

  const trackStyle: React.CSSProperties = {
    transform: `translateX(calc(${-index * 100}% + ${dragX}px))`,
    transition: dragging ? 'none' : `transform ${SLIDE_MS}ms ease-out`,
  }

  const arrowClass =
    'hidden sm:flex absolute top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center rounded-full text-white cursor-pointer disabled:opacity-20 disabled:cursor-default z-10'

  return createPortal(
    <div
      className="fixed inset-0 z-50 backdrop overflow-hidden select-none"
      style={{ backgroundColor: 'rgba(0,0,0,0.88)', touchAction: 'none' }}
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="flex h-full w-full" style={trackStyle}>
        {items.map((item, i) => {
          const near = Math.abs(i - index) <= 1
          const current = i === index
          return (
            <div
              key={i}
              className="relative flex-shrink-0 w-full h-full flex items-center justify-center p-4"
              onClick={onBackdropClick}
            >
              {near && item.type === 'image' && (
                <img
                  src={item.src}
                  alt=""
                  draggable={false}
                  className="max-w-full max-h-full"
                  style={{
                    objectFit: 'contain',
                    transform: current ? `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})` : undefined,
                    transition: touching ? 'none' : 'transform 200ms ease-out',
                  }}
                />
              )}
              {near && item.type === 'video' && (
                current ? (
                  <video
                    src={item.src}
                    poster={item.poster ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="max-w-full max-h-full"
                    style={{ objectFit: 'contain', backgroundColor: '#000' }}
                  />
                ) : item.poster ? (
                  <img src={item.poster} alt="" draggable={false} className="max-w-full max-h-full" style={{ objectFit: 'contain' }} />
                ) : null
              )}
            </div>
          )
        })}
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => go(-1)}
            disabled={index === 0}
            aria-label="Previous"
            className={`${arrowClass} left-4`}
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={() => go(1)}
            disabled={index === count - 1}
            aria-label="Next"
            className={`${arrowClass} right-4`}
            style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <div className="absolute left-0 right-0 flex justify-center items-center gap-1.5 pointer-events-none" style={{ bottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            {count <= MAX_DOTS ? (
              items.map((item, i) => (
                <span
                  key={i}
                  className="rounded-full transition-all duration-200"
                  style={{
                    width: i === index ? 8 : 6,
                    height: i === index ? 8 : 6,
                    backgroundColor: i === index ? 'white' : 'rgba(255,255,255,0.4)',
                    outline: item.type === 'video' ? '1px solid rgba(255,255,255,0.6)' : undefined,
                    outlineOffset: 1,
                  }}
                />
              ))
            ) : (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: 'white', backgroundColor: 'rgba(0,0,0,0.4)' }}>
                {index + 1} / {count}
              </span>
            )}
          </div>
        </>
      )}

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute w-10 h-10 flex items-center justify-center rounded-full text-white text-xl cursor-pointer z-10"
        style={{ top: 'max(16px, env(safe-area-inset-top))', right: 16, backgroundColor: 'rgba(255,255,255,0.2)' }}
      >
        ✕
      </button>
    </div>,
    document.body,
  )
}
