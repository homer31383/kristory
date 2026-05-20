/**
 * Registry page header — compact treatment for living inside Kristory's
 * Layout (Sidebar/BottomNav already provide outer chrome). Keeps Fraunces
 * typography and the terracotta accent rule above the title.
 */
export default function Header({ onPairExtension }: { onPairExtension: () => void }) {
  return (
    <header
      style={{
        padding: '32px 0 24px',
        textAlign: 'center',
        borderBottom: '1px solid var(--line)',
        position: 'relative',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 48,
          height: 1,
          background: 'var(--terracotta)',
        }}
      />
      {/* Rarely-used action (paired once per device) — kept as a quiet icon
          in the top-right so it doesn't compete with the title. */}
      <button
        onClick={onPairExtension}
        aria-label="Pair Chrome extension"
        title="Pair Chrome extension"
        style={{
          position: 'absolute',
          top: 8,
          right: 0,
          background: 'transparent',
          border: 'none',
          padding: 6,
          cursor: 'pointer',
          color: 'var(--ink-faint)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 0,
        }}
      >
        <PuzzleIcon />
      </button>
      <div
        style={{
          fontFamily: 'Manrope',
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'var(--terracotta)',
          marginBottom: 12,
        }}
      >
        A Registry For
      </div>
      <h1
        style={{
          fontFamily: 'Fraunces',
          fontWeight: 400,
          fontSize: 'clamp(28px, 4.5vw, 48px)',
          letterSpacing: '-0.02em',
          lineHeight: 1.05,
          color: 'var(--ink)',
          margin: 0,
        }}
      >
        Chris &amp; <em style={{ fontStyle: 'italic', color: 'var(--terracotta)' }}>Krista</em>
      </h1>
      <p
        style={{
          marginTop: 12,
          fontFamily: 'Fraunces',
          fontStyle: 'italic',
          fontSize: 16,
          color: 'var(--ink-soft)',
        }}
      >
        October 2026 — and the small one we're getting ready for.
      </p>
    </header>
  )
}

/** Puzzle-piece glyph — the universal Chrome-extension symbol. */
function PuzzleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877l-1.568-1.568A2.402 2.402 0 0 1 1.998 12c0-.617.236-1.234.706-1.704L4.23 8.77c.24-.24.581-.353.917-.303.515.077.877.528 1.073 1.01a2.5 2.5 0 1 0 3.259-3.259c-.482-.196-.933-.558-1.01-1.073-.05-.336.062-.676.303-.917l1.525-1.525A2.402 2.402 0 0 1 12 1.998c.617 0 1.234.236 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
    </svg>
  )
}
