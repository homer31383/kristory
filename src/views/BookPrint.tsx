import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useBookPagination } from '../hooks/useBookPagination'
import { BookCoverView, BookDefs, BookPageView } from '../book/layouts'
import { PrintSheets, PrintStyles } from '../book/print'
import { usePrintReady } from '../book/usePrintReady'
import { EffectsTest } from '../book/EffectsTest'

/**
 * /book/:bookId/print: every page in order, one 7 x 7 in sheet each, for
 * Save as PDF in desktop Chrome. No app chrome. ?test=effects adds a sheet
 * that isolates each visual effect, to check what survives the PDF.
 */
export default function BookPrint() {
  const { bookId } = useParams<{ bookId: string }>()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const withTest = params.get('test') === 'effects'
  const [covers, setCovers] = useState(true)
  const { book, isLoading, error, pagination, coverData, measured } = useBookPagination(bookId)

  const sheets = useMemo(() => {
    if (!pagination || !coverData) return []
    const { cover, style } = coverData
    const list = pagination.pages.map((p) => ({ key: `p${p.number}`, node: <BookPageView page={p} cover={cover} /> }))
    if (covers) {
      list.unshift({ key: 'front', node: <BookCoverView which="front" style={style} cover={cover} /> })
      list.push({ key: 'back', node: <BookCoverView which="back" style={style} cover={cover} /> })
    }
    if (withTest) list.push({ key: 'effects', node: <EffectsTest /> })
    return list
  }, [pagination, coverData, covers, withTest])

  const { ready, failed } = usePrintReady(sheets.length > 0 && measured, sheets)

  if (isLoading) return <p style={{ padding: 24, fontFamily: 'Inter, sans-serif', color: '#4A5578' }}>Loading the book...</p>
  if (!book) return <p style={{ padding: 24, fontFamily: 'Inter, sans-serif', color: '#4A5578' }}>This book does not exist.</p>
  if (error) return <p style={{ padding: 24, fontFamily: 'Inter, sans-serif', color: '#E0504A' }}>Could not load the book: {error.message}</p>

  const pageCount = pagination?.pages.length ?? 0
  return (
    <div data-book-ready={ready ? 'true' : 'false'} style={{ minHeight: '100vh', background: '#E6E8EE' }}>
      <PrintStyles />
      <BookDefs />
      <div className="no-print" style={{ position: 'sticky', top: 0, zIndex: 10, background: '#FFFFFF', borderBottom: '1px solid #DDE4F1', fontFamily: 'Inter, sans-serif', color: '#14204A' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
          <button onClick={() => navigate(`/book/${book.id}`)} style={btn(false)}>Back</button>
          <strong style={{ fontSize: 14 }}>{book.title}</strong>
          <span style={{ fontSize: 12, color: '#4A5578' }}>
            {pageCount} pages{covers ? ' plus covers' : ''}
          </span>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={covers} onChange={(e) => setCovers(e.target.checked)} />
            Include covers
          </label>
          <button onClick={() => window.print()} disabled={!ready} style={{ ...btn(true), marginLeft: 'auto', opacity: ready ? 1 : 0.5 }}>
            {ready ? 'Print' : 'Getting pages ready...'}
          </button>
          <p style={{ flexBasis: '100%', margin: 0, fontSize: 12, color: '#4A5578' }}>
            Use desktop Chrome. In the print dialog set Margins to None, turn on Background graphics, then Save as PDF.
            {failed > 0 && <span style={{ color: '#E0504A' }}> {failed} photo{failed === 1 ? '' : 's'} did not load.</span>}
          </p>
        </div>
      </div>
      <PrintSheets sheets={sheets} />
    </div>
  )
}

function btn(primary: boolean) {
  return {
    padding: '6px 14px',
    borderRadius: 8,
    border: primary ? 'none' : '1px solid #DDE4F1',
    background: primary ? '#6B5CA5' : '#FFFFFF',
    color: primary ? '#FFFFFF' : '#14204A',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
  } as const
}
