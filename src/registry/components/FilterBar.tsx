import { PRIORITY_OPTIONS, WHERE_OPTIONS } from '../config'

export interface Filters {
  priority: Set<string>
  where: Set<string>
  myPicksOnly: boolean
  hideMuted: boolean
  showOnlySaved: boolean
  onlyNotTransferred: boolean
}

interface Props {
  filters: Filters
  setFilters: (f: Filters) => void
}

export default function FilterBar({ filters, setFilters }: Props) {
  function togglePriority(v: string) {
    const next = new Set(filters.priority)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setFilters({ ...filters, priority: next })
  }
  function toggleWhere(v: string) {
    const next = new Set(filters.where)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    setFilters({ ...filters, where: next })
  }
  function toggleMyPicks() {
    setFilters({ ...filters, myPicksOnly: !filters.myPicksOnly })
  }
  function toggleHideMuted() {
    setFilters({ ...filters, hideMuted: !filters.hideMuted })
  }
  function toggleShowOnlySaved() {
    setFilters({ ...filters, showOnlySaved: !filters.showOnlySaved })
  }
  function toggleOnlyNotTransferred() {
    setFilters({ ...filters, onlyNotTransferred: !filters.onlyNotTransferred })
  }

  return (
    <div
      style={{
        padding: '20px 0',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderBottom: '1px solid var(--line)',
        background: 'var(--cream-deep)',
        marginLeft: -32,
        marginRight: -32,
        paddingLeft: 32,
        paddingRight: 32,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'var(--ink-soft)',
          }}
        >
          Priority
        </span>
        {PRIORITY_OPTIONS.map((p) => (
          <Pill
            key={p}
            active={filters.priority.has(p)}
            onClick={() => togglePriority(p)}
            color={
              p === 'Before birth'
                ? 'var(--priority-before)'
                : p === '0-3 mo'
                  ? 'var(--priority-0to3)'
                  : p === '3-6 mo'
                    ? 'var(--priority-3to6)'
                    : 'var(--priority-nice)'
            }
          >
            {p}
          </Pill>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color: 'var(--ink-soft)',
          }}
        >
          Where
        </span>
        {WHERE_OPTIONS.map((w) => (
          <Pill key={w} active={filters.where.has(w)} onClick={() => toggleWhere(w)}>
            {w}
          </Pill>
        ))}
      </div>

      <button
        onClick={toggleMyPicks}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: filters.myPicksOnly ? 'var(--ink)' : 'var(--terracotta)',
          color: 'var(--cream)',
          padding: '8px 18px',
          borderRadius: 100,
          border: 'none',
          fontFamily: 'Manrope',
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {filters.myPicksOnly ? 'Show all items' : 'Show only my picks'}
      </button>

      <button
        onClick={toggleHideMuted}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: filters.hideMuted ? 'var(--ink-soft)' : 'transparent',
          color: filters.hideMuted ? 'var(--cream)' : 'var(--ink-soft)',
          padding: '8px 14px',
          borderRadius: 100,
          border: `1px solid ${filters.hideMuted ? 'var(--ink-soft)' : 'var(--line)'}`,
          fontFamily: 'Manrope',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {filters.hideMuted ? '✓ Hiding muted' : 'Hide muted'}
      </button>

      <button
        onClick={toggleShowOnlySaved}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: filters.showOnlySaved ? 'var(--moss)' : 'transparent',
          color: filters.showOnlySaved ? 'var(--cream)' : 'var(--moss)',
          padding: '8px 14px',
          borderRadius: 100,
          border: `1px solid ${filters.showOnlySaved ? 'var(--moss)' : 'var(--sage)'}`,
          fontFamily: 'Manrope',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        <BookmarkIcon />
        {filters.showOnlySaved ? '✓ Only saved' : 'Only saved'}
      </button>

      <button
        onClick={toggleOnlyNotTransferred}
        title="Show only items whose picks haven't been moved to Babylist yet"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          background: filters.onlyNotTransferred ? 'var(--ink-soft)' : 'transparent',
          color: filters.onlyNotTransferred ? 'var(--cream)' : 'var(--ink-soft)',
          padding: '8px 14px',
          borderRadius: 100,
          border: `1px solid ${filters.onlyNotTransferred ? 'var(--ink-soft)' : 'var(--line)'}`,
          fontFamily: 'Manrope',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        {filters.onlyNotTransferred ? '✓ Not yet on Babylist' : 'Not yet on Babylist'}
      </button>
    </div>
  )
}

function BookmarkIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function Pill({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean
  onClick: () => void
  color?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? color ?? 'var(--ink)' : 'transparent',
        border: `1px solid ${active ? color ?? 'var(--ink)' : 'var(--line)'}`,
        color: active ? 'var(--cream)' : 'var(--ink-soft)',
        padding: '6px 14px',
        borderRadius: 100,
        fontSize: 12,
        fontFamily: 'Manrope',
        fontWeight: 500,
        letterSpacing: '0.02em',
        cursor: 'pointer',
        transition: 'all 0.18s ease',
      }}
    >
      {children}
    </button>
  )
}
