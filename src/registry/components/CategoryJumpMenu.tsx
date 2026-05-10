import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'

export interface SectionEntry {
  name: string
  total: number
  visible: number
  picked: number
  collapsed: boolean
}

interface Props {
  sections: SectionEntry[]
  onJump: (sectionName: string) => void
  onCollapseAll: () => void
  onExpandAll: () => void
}

/**
 * Bottom-left FAB + popover for jumping between catalog sections.
 *
 * Mobile and desktop share a single anchored-popover design (mobile gets a
 * full-width-minus-padding version via CSS max-width). Tap a category in the
 * list → scrolls to its section and (if collapsed) auto-expands it. Collapse-
 * all / Expand-all are quick actions at the top of the list.
 */
export default function CategoryJumpMenu({
  sections,
  onJump,
  onCollapseAll,
  onExpandAll,
}: Props) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (fabRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <>
      <button
        ref={fabRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close category menu' : 'Open category menu'}
        title="Jump to category"
        style={{
          position: 'fixed',
          bottom: 'var(--registry-fab-offset, 80px)',
          left: 24,
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--moss)',
          color: 'var(--cream)',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 8px 24px -8px rgba(106, 122, 79, 0.5)',
          zIndex: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
      >
        <MenuIcon />
      </button>

      {open && (
        <div ref={panelRef} className="jump-menu-panel" role="menu">
          <div
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--line-faint)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              position: 'sticky',
              top: 0,
              background: 'var(--cream)',
              zIndex: 1,
            }}
          >
            <span
              style={{
                fontFamily: 'Manrope',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--ink-soft)',
              }}
            >
              Jump to category
            </span>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--ink-faint)',
                fontSize: 20,
                lineHeight: 1,
                cursor: 'pointer',
                padding: 4,
              }}
            >
              ×
            </button>
          </div>

          <div
            style={{
              padding: '10px 12px',
              display: 'flex',
              gap: 8,
              borderBottom: '1px dashed var(--line-faint)',
            }}
          >
            <button
              onClick={() => {
                setOpen(false)
                onCollapseAll()
              }}
              style={quickActionStyle}
            >
              Collapse all
            </button>
            <button
              onClick={() => {
                setOpen(false)
                onExpandAll()
              }}
              style={quickActionStyle}
            >
              Expand all
            </button>
          </div>

          <ul style={{ listStyle: 'none', margin: 0, padding: 6 }}>
            {sections.map((s) => (
              <li key={s.name}>
                <button
                  onClick={() => {
                    setOpen(false)
                    onJump(s.name)
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    padding: '10px 12px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontFamily: 'Manrope',
                    color: 'var(--ink)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--cream-deep)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontFamily: 'Fraunces',
                      fontSize: 16,
                      lineHeight: 1.2,
                      color: s.collapsed ? 'var(--ink-soft)' : 'var(--ink)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.name}
                    {s.collapsed && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          fontFamily: 'Manrope',
                          color: 'var(--ink-faint)',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                        }}
                      >
                        ⟨
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      fontFamily: 'Manrope',
                      fontSize: 11,
                      color: 'var(--ink-faint)',
                      letterSpacing: '0.04em',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}
                  >
                    {s.visible === s.total
                      ? `${s.total}`
                      : `${s.visible}/${s.total}`}
                    {s.picked > 0 && (
                      <span style={{ marginLeft: 8, color: 'var(--terracotta)' }}>
                        ·&nbsp;{s.picked}&nbsp;picked
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function MenuIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="14" y2="17" />
    </svg>
  )
}

const quickActionStyle: CSSProperties = {
  flex: 1,
  background: 'transparent',
  border: '1px solid var(--line)',
  color: 'var(--ink-soft)',
  padding: '6px 10px',
  borderRadius: 100,
  fontFamily: 'Manrope',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
}
