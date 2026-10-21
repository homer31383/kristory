import { useState } from 'react'
import { useUnlockFamilyFeed } from '../hooks/useBaboryFamilyFeed'

/**
 * PIN screen for extended family on /family and /family/photos. The PIN is
 * checked on the server (/api/babory-unlock); every failure shows the same
 * "Wrong PIN". The Babory is always light, so colours are fixed here.
 */
const C = {
  bg: '#EDE6DE',
  card: '#F7F3EF',
  border: '#DDD5CB',
  text: '#2C2522',
  secondary: '#8C8078',
  muted: '#B5ADA5',
  accent: '#6B5CA5',
  error: '#E5534B',
} as const

export default function FamilyPinScreen() {
  const unlock = useUnlockFamilyFeed()
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pin || unlock.isPending) return
    setWrong(false)
    let ok = false
    try {
      ok = await unlock.mutateAsync(pin)
    } catch {
      ok = false
    }
    if (!ok) {
      setWrong(true)
      setPin('')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: C.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700,
          fontSize: 32,
          color: C.text,
          margin: '0 0 6px 0',
        }}>
          The Babory
        </h1>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 32 }}>
          Family Updates
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setWrong(false) }}
            placeholder="Enter PIN"
            aria-label="Family PIN"
            autoFocus
            style={{
              width: '100%',
              padding: '14px 16px',
              fontSize: 18,
              textAlign: 'center',
              letterSpacing: 8,
              border: `2px solid ${wrong ? C.error : C.border}`,
              borderRadius: 12,
              backgroundColor: C.card,
              color: C.text,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {wrong && (
            <p role="alert" style={{ color: C.error, fontSize: 13, marginTop: 8 }}>
              Wrong PIN
            </p>
          )}
          <button
            type="submit"
            disabled={!pin || unlock.isPending}
            style={{
              width: '100%',
              marginTop: 16,
              padding: '14px 24px',
              fontSize: 15,
              fontWeight: 600,
              color: 'white',
              backgroundColor: C.accent,
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
              opacity: !pin || unlock.isPending ? 0.6 : 1,
            }}
          >
            {unlock.isPending ? 'Checking...' : 'Enter'}
          </button>
        </form>
        <a href="/" style={{ display: 'inline-block', marginTop: 24, color: C.muted, fontSize: 12, textDecoration: 'none' }}>
          Chris or Krista? Sign in
        </a>
      </div>
    </div>
  )
}
