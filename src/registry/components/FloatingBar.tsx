import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { fmtUSD } from '../lib/money'

interface Props {
  pickCount: number
  totalCost: number
  onExport: () => void
  onImport: (file: File) => Promise<void>
  onAddCustom: () => void
}

export default function FloatingBar({
  pickCount,
  totalCost,
  onExport,
  onImport,
  onAddCustom,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  return (
    <>
      <button
        onClick={onAddCustom}
        aria-label="Add custom item"
        title="Add custom item"
        style={{
          position: 'fixed',
          bottom: 'var(--registry-fab-offset, 80px)',
          right: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--moss)',
          color: 'var(--cream)',
          border: 'none',
          fontSize: 28,
          fontWeight: 300,
          cursor: 'pointer',
          boxShadow: '0 8px 24px -8px rgba(106, 122, 79, 0.5)',
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
          fontFamily: 'Fraunces',
        }}
      >
        +
      </button>

      <div
        style={{
          position: 'fixed',
          bottom: 'calc(var(--registry-floatingbar-offset, 0px))',
          left: 0,
          right: 0,
          background: 'var(--cream)',
          borderTop: '1px solid var(--line)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
          zIndex: 55,
          boxShadow: '0 -2px 16px -8px rgba(29, 36, 51, 0.15)',
        }}
      >
        <div style={{ fontFamily: 'Fraunces', fontSize: 14, color: 'var(--ink-soft)' }}>
          <strong style={{ fontFamily: 'Manrope', color: 'var(--ink)', fontWeight: 700 }}>
            {pickCount}
          </strong>
          {pickCount === 1 ? ' pick' : ' picks'} ·{' '}
          <strong style={{ fontFamily: 'Manrope', color: 'var(--terracotta)', fontWeight: 700 }}>
            {fmtUSD(totalCost)}
          </strong>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => fileRef.current?.click()} disabled={importing} style={btnGhost}>
            {importing ? 'Importing…' : 'Import picks'}
          </button>
          <button onClick={onExport} style={btnGhost}>
            Export CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            style={{ display: 'none' }}
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              setImporting(true)
              try {
                await onImport(f)
              } finally {
                setImporting(false)
                e.target.value = ''
              }
            }}
          />
        </div>
      </div>
    </>
  )
}

const btnGhost: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--line)',
  color: 'var(--ink-soft)',
  padding: '8px 14px',
  borderRadius: 100,
  fontFamily: 'Manrope',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
