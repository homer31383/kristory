import { useState } from 'react'
import { useAppPin, isSessionUnlocked, markSessionUnlocked } from '../hooks/useAppPin'

export default function AppPinLock({ children }: { children: React.ReactNode }) {
  const { data: pin, isLoading } = useAppPin()
  const [unlocked, setUnlocked] = useState(isSessionUnlocked)
  const [input, setInput] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  // No PIN set or already unlocked this session — pass through
  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-page)' }}
      >
        <div
          className="w-6 h-6 border-2 rounded-full animate-spin"
          style={{ borderColor: 'var(--border-card)', borderTopColor: 'var(--accent)' }}
        />
      </div>
    )
  }

  if (!pin || unlocked) {
    return <>{children}</>
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (input === pin) {
      markSessionUnlocked()
      setUnlocked(true)
    } else {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: 'var(--bg-page)' }}
    >
      <div className="text-center max-w-xs w-full">
        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
        >
          The Kristory
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          Enter PIN to continue
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ animation: shake ? 'pinShake 0.4s ease-in-out' : undefined }}>
            <input
              type="password"
              inputMode="numeric"
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(false) }}
              placeholder="PIN"
              autoFocus
              className="w-full text-center text-xl rounded-xl border-2 p-3.5"
              style={{
                backgroundColor: 'var(--bg-card)',
                borderColor: error ? '#E5534B' : 'var(--border-card)',
                color: 'var(--text-primary)',
                letterSpacing: 8,
                outline: 'none',
              }}
            />
          </div>
          {error && (
            <p className="text-xs mt-2" style={{ color: '#E5534B' }}>
              Incorrect PIN, try again
            </p>
          )}
          <button
            type="submit"
            className="w-full mt-4 py-3 rounded-xl text-sm font-semibold text-white cursor-pointer"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Unlock
          </button>
        </form>
      </div>

      <style>{`
        @keyframes pinShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}
