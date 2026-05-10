/**
 * Registry page header — compact treatment for living inside Kristory's
 * Layout (Sidebar/BottomNav already provide outer chrome). Keeps Fraunces
 * typography and the terracotta accent rule above the title.
 */
export default function Header() {
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
