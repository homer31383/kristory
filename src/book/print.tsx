import { useEffect, type ReactNode } from 'react'
import { PAGE_PX } from './layouts/parts'

/**
 * Pieces of the print route, kept apart from the view so a local proof
 * harness can render the same sheets.
 *
 * Each sheet is 7 x 7 in. The 672 px layouts (96 px to the inch) fill it
 * exactly, so there is no scaling in print.
 */

export const PRINT_CSS = `
@page { size: 7in 7in; margin: 0; }
@media print {
  html, body { margin: 0 !important; padding: 0 !important; background: #FFFFFF !important; }
  .no-print { display: none !important; }
  .book-sheets { gap: 0 !important; padding: 0 !important; }
  .book-sheet { box-shadow: none !important; }
}
.book-sheet {
  width: 7in;
  height: 7in;
  overflow: hidden;
  position: relative;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  break-inside: avoid;
  page-break-inside: avoid;
}
.book-sheet:not(:last-child) { break-after: page; page-break-after: always; }
`

/** Adds the @page rules only while a print screen is mounted. */
export function PrintStyles() {
  useEffect(() => {
    const el = document.createElement('style')
    el.setAttribute('data-book-print', '')
    el.textContent = PRINT_CSS
    document.head.appendChild(el)
    return () => el.remove()
  }, [])
  return null
}

export function PrintSheets({ sheets }: { sheets: { key: string; node: ReactNode }[] }) {
  return (
    <div className="book-sheets" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, padding: '24px 0' }}>
      {sheets.map((s) => (
        <div key={s.key} className="book-sheet" style={{ width: PAGE_PX, height: PAGE_PX, boxShadow: '0 1px 6px rgba(0,0,0,0.18)' }}>
          {s.node}
        </div>
      ))}
    </div>
  )
}
