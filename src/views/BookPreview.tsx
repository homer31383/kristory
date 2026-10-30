import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useBookPagination } from '../hooks/useBookPagination'
import { useUpdateBook } from '../hooks/useBooks'
import { BookCoverView, BookDefs, BookPageView, type CoverStyle } from '../book/layouts'
import { PAGE_PX } from '../book/layouts/parts'
import { PhotoSourceContext } from '../book/layouts/measure'

type Slot = { key: string; label: string; node: ReactNode } | null

function useIsWide() {
  const query = '(min-width: 768px)'
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}

/** Width and height of an element, kept current. */
function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/**
 * /book/:bookId/preview: the book as spreads (single pages on a phone),
 * each page rendered at 672 px and scaled to fit with a CSS transform.
 */
export default function BookPreview() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const wide = useIsWide()
  const { book, isLoading, error, pagination, coverData, measured } = useBookPagination(bookId)
  const updateBook = useUpdateBook()
  const [index, setIndex] = useState(0)
  const [stageRef, stage] = useBoxSize<HTMLDivElement>()
  const touchX = useRef<number | null>(null)

  const spreads = useMemo<Slot[][]>(() => {
    if (!pagination || !coverData) return []
    const { cover, style } = coverData
    const front: Slot = { key: 'front', label: 'Front cover', node: <BookCoverView which="front" style={style} cover={cover} /> }
    const back: Slot = { key: 'back', label: 'Back cover', node: <BookCoverView which="back" style={style} cover={cover} /> }
    const pages: Slot[] = pagination.pages.map((p) => ({ key: `p${p.number}`, label: String(p.number), node: <BookPageView page={p} cover={cover} /> }))
    if (!wide) return [front, ...pages, back].map((s) => [s])
    // Page 1 is a right page, so it opens alone; the last page closes alone.
    const out: Slot[][] = [[null, front], [null, pages[0] ?? null]]
    for (let i = 1; i < pages.length; i += 2) out.push([pages[i], pages[i + 1] ?? null])
    out.push([back, null])
    return out
  }, [pagination, coverData, wide])

  const last = Math.max(0, spreads.length - 1)
  const at = Math.min(index, last)
  const go = (d: number) => setIndex(Math.max(0, Math.min(last, at + d)))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(last, i + 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [last])

  if (isLoading) return <Message>Loading the book...</Message>
  if (!book) return <Message>This book does not exist.</Message>
  if (error) return <Message>Could not load the book: {error.message}</Message>

  const spread = spreads[at] ?? []
  const cols = spread.length || 1
  const gap = cols > 1 ? 2 : 0
  const scale = stage.w && stage.h ? Math.min((stage.w - gap) / (cols * PAGE_PX), stage.h / PAGE_PX) : 0
  const style: CoverStyle = coverData?.style ?? 'b'

  const setStyle = (next: CoverStyle) => {
    if (next === style) return
    updateBook.mutate({ id: book.id, patch: { cover_choice: { ...(book.cover_choice ?? {}), style: next } } })
  }

  const labels = spread.map((s) => s?.label).filter(Boolean).join(' and ')

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', background: '#2A2F3D', color: '#F2E8D5', fontFamily: 'Inter, sans-serif' }}>
      <BookDefs />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
        <button onClick={() => navigate(`/book/${book.id}`)} style={chip(false)}>Back</button>
        <strong style={{ fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{book.title}</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          {pagination?.pages.length ?? 0} pages{measured ? '' : ', estimating'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, opacity: 0.7 }}>Cover</span>
          <button onClick={() => setStyle('a')} style={chip(style === 'a')}>A</button>
          <button onClick={() => setStyle('b')} style={chip(style === 'b')}>B</button>
          <button onClick={() => navigate(`/book/${book.id}/print`)} className="hidden md:inline-block" style={chip(false)}>
            Print
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        style={{ flex: 1, minHeight: 0, margin: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1)
        }}
      >
        {scale > 0 && (
          // The screen only needs the display copies, not the print copies.
          <PhotoSourceContext.Provider value="screen">
          <div style={{ display: 'flex', gap }}>
            {spread.map((s, i) => (
              <div key={s?.key ?? `empty-${i}`} style={{ width: PAGE_PX * scale, height: PAGE_PX * scale, overflow: 'hidden', boxShadow: s ? '0 2px 12px rgba(0,0,0,0.45)' : 'none' }}>
                {s && <div style={{ width: PAGE_PX, height: PAGE_PX, transform: `scale(${scale})`, transformOrigin: '0 0' }}>{s.node}</div>}
              </div>
            ))}
          </div>
          </PhotoSourceContext.Provider>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '10px 16px 16px' }}>
        <button onClick={() => go(-1)} disabled={at === 0} style={{ ...chip(false), opacity: at === 0 ? 0.4 : 1 }} aria-label="Previous">
          Previous
        </button>
        <span style={{ fontSize: 12, minWidth: 120, textAlign: 'center', opacity: 0.8 }}>{labels}</span>
        <button onClick={() => go(1)} disabled={at === last} style={{ ...chip(false), opacity: at === last ? 0.4 : 1 }} aria-label="Next">
          Next
        </button>
      </div>
    </div>
  )
}

function Message({ children }: { children: ReactNode }) {
  return <p style={{ padding: 24, fontFamily: 'Inter, sans-serif', color: '#4A5578' }}>{children}</p>
}

function chip(active: boolean) {
  return {
    padding: '5px 12px',
    borderRadius: 999,
    border: `1px solid ${active ? '#D4A24C' : 'rgba(242,232,213,0.3)'}`,
    background: active ? '#D4A24C' : 'transparent',
    color: active ? '#14204A' : '#F2E8D5',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  } as const
}
