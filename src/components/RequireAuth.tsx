import { useState } from 'react'
import { useUser } from '../hooks/useUser'

/**
 * Gate for every private route: shows the sign-in screen until a household
 * member is signed in and matched to their Kristory user, then renders the
 * children. `title` lets the Babory and shower manager keep their own name.
 */
export default function RequireAuth({ children, title = 'The Kristory' }: { children: React.ReactNode; title?: string }) {
  const { status } = useUser()

  if (status === 'loading' || status === 'resolving') return <FullScreenSpinner />
  if (status === 'signed-out') return <SignInScreen title={title} />
  if (status !== 'ready') return <AccountProblem title={title} />
  return <>{children}</>
}

function FullScreenSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div
        className="w-6 h-6 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--border-card)', borderTopColor: 'var(--accent)' }}
      />
    </div>
  )
}

function Shell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ backgroundColor: 'var(--bg-page)' }}>
      <div className="text-center max-w-xs w-full">
        <h1
          className="text-3xl mb-2"
          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--text-secondary)' }}>
          {subtitle}
        </p>
        {children}
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--bg-card)',
  borderColor: 'var(--border-card)',
  color: 'var(--text-primary)',
  outline: 'none',
}

function SignInScreen({ title }: { title: string }) {
  const { signIn } = useUser()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return
    setBusy(true)
    setError(null)
    const message = await signIn(email, password)
    setBusy(false)
    if (message) setError(message === 'Invalid login credentials' ? 'Wrong email or password.' : message)
  }

  return (
    <Shell title={title} subtitle="Sign in to continue">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-left">
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null) }}
          placeholder="Email"
          autoFocus
          className="w-full text-base rounded-xl border-2 p-3.5"
          style={inputStyle}
        />
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null) }}
          placeholder="Password"
          className="w-full text-base rounded-xl border-2 p-3.5"
          style={{ ...inputStyle, borderColor: error ? '#E5534B' : 'var(--border-card)' }}
        />
        {error && (
          <p className="text-xs text-center" style={{ color: '#E5534B' }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || !email.trim() || !password}
          className="w-full mt-1 py-3 rounded-xl text-sm font-semibold text-white cursor-pointer disabled:opacity-60"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </Shell>
  )
}

function AccountProblem({ title }: { title: string }) {
  const { status, error, signOut } = useUser()
  const message =
    status === 'not-household'
      ? 'This account does not have access.'
      : `Signed in, but this account could not be matched to Chris or Krista.${error ? ` (${error})` : ''}`
  return (
    <Shell title={title} subtitle={message}>
      <button
        onClick={() => { void signOut() }}
        className="w-full py-3 rounded-xl text-sm font-semibold text-white cursor-pointer"
        style={{ backgroundColor: 'var(--accent)' }}
      >
        Sign out
      </button>
    </Shell>
  )
}
