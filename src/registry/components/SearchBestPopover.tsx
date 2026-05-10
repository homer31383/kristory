import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { DEFAULT_REFINERS } from '../config'

const REFINER_KEY = 'babylist:recent-refiners'

interface Props {
  itemName: string
  anchor: { x: number; y: number }
  onClose: () => void
}

export default function SearchBestPopover({ itemName, anchor, onClose }: Props) {
  const [active, setActive] = useState<Set<string>>(new Set())
  const [custom, setCustom] = useState('')
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(REFINER_KEY)
      return raw ? (JSON.parse(raw) as string[]) : []
    } catch {
      return []
    }
  })
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])

  const cleanedItem = itemName.replace(/\s*\([^)]*\)\s*/g, '')
  const refinersList = ['Best', cleanedItem, ...Array.from(active)].filter(Boolean).join(' ')

  function toggle(r: string) {
    const n = new Set(active)
    if (n.has(r)) n.delete(r)
    else n.add(r)
    setActive(n)
  }

  function addCustom() {
    const v = custom.trim()
    if (!v) return
    const n = new Set(active)
    n.add(v)
    setActive(n)
    const next = [v, ...recents.filter((x) => x !== v && !DEFAULT_REFINERS.includes(x))].slice(0, 8)
    setRecents(next)
    localStorage.setItem(REFINER_KEY, JSON.stringify(next))
    setCustom('')
  }

  function go() {
    const url = `https://www.google.com/search?q=${encodeURIComponent(refinersList)}`
    window.open(url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  const popoverStyle: CSSProperties = {
    position: 'fixed',
    top: anchor.y,
    left: anchor.x,
    zIndex: 50,
    background: 'var(--cream)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    padding: 16,
    width: 360,
    maxWidth: 'calc(100vw - 40px)',
    boxShadow: '0 12px 32px -12px rgba(29, 36, 51, 0.25)',
  }

  return (
    <div ref={ref} style={popoverStyle}>
      <div
        style={{
          fontFamily: 'Fraunces',
          fontStyle: 'italic',
          fontSize: 14,
          color: 'var(--ink-soft)',
          padding: '8px 10px',
          background: '#fbf7ed',
          borderRadius: 4,
          marginBottom: 12,
          lineHeight: 1.4,
          wordBreak: 'break-word',
        }}
      >
        {refinersList}
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          marginBottom: 8,
        }}
      >
        Refiners
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {[...DEFAULT_REFINERS, ...recents].map((r) => (
          <button
            key={r}
            onClick={() => toggle(r)}
            style={{
              background: active.has(r) ? 'var(--moss)' : 'transparent',
              border: `1px solid ${active.has(r) ? 'var(--moss)' : 'var(--line)'}`,
              color: active.has(r) ? 'var(--cream)' : 'var(--ink-soft)',
              padding: '5px 12px',
              borderRadius: 100,
              fontSize: 12,
              fontFamily: 'Manrope',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {r}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addCustom()
            }
          }}
          placeholder="Custom refiner…"
          style={{
            flex: 1,
            background: '#fbf7ed',
            border: '1px solid var(--line)',
            padding: '6px 10px',
            fontFamily: 'Manrope',
            fontSize: 12,
            color: 'var(--ink)',
            borderRadius: 4,
          }}
        />
        <button
          onClick={addCustom}
          style={{
            background: 'var(--ink)',
            color: 'var(--cream)',
            border: 'none',
            padding: '6px 14px',
            borderRadius: 4,
            fontFamily: 'Manrope',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Add
        </button>
      </div>
      <button
        onClick={go}
        style={{
          display: 'block',
          width: '100%',
          background: 'var(--moss)',
          color: 'var(--cream)',
          border: 'none',
          padding: 10,
          borderRadius: 4,
          fontFamily: 'Manrope',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        Search Google →
      </button>
    </div>
  )
}
