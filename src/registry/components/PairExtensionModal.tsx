/**
 * Pair Chrome extension modal.
 *
 * Mints a short token for the Baby Registry Chrome extension and shows it for
 * the user to copy. Each device pairs with its own token, so opening this
 * modal always generates one fresh row in babylist_extension_tokens — old
 * unused tokens are left untouched (and invisible) in the DB. Only the new
 * token is ever displayed.
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createExtensionToken } from '../data/queries'

interface Props {
  personId: string
  registryId: string
  onClose: () => void
}

/** Token alphabet — omits ambiguous glyphs (0/O, 1/I/L) for clean copy/paste. */
const TOKEN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateToken(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('')
}

export default function PairExtensionModal({ personId, registryId, onClose }: Props) {
  const [status, setStatus] = useState<'generating' | 'ready' | 'error'>('generating')
  const [token, setToken] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [copied, setCopied] = useState(false)
  const startedRef = useRef(false)

  // Generate + persist exactly one token per modal open. The ref guards
  // against React StrictMode's double-invoke in dev (which would otherwise
  // mint two rows and display the second).
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    const t = generateToken()
    ;(async () => {
      try {
        await createExtensionToken({ token: t, personId, registryId })
        setToken(t)
        setStatus('ready')
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    })()
  }, [personId, registryId])

  // Esc closes, matching the registry's other dismissible surfaces.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API can be unavailable (insecure context); the token field
      // selects on click as a fallback.
      setCopied(false)
    }
  }

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={panel}>
        <h3 style={titleStyle}>Pair Chrome extension</h3>

        {status === 'generating' && (
          <p style={bodyStyle}>Generating a pairing code…</p>
        )}

        {status === 'error' && (
          <p style={{ ...bodyStyle, color: 'var(--priority-before)' }}>
            Couldn't create a pairing code: {errorMsg}
          </p>
        )}

        {status === 'ready' && (
          <>
            <p style={bodyStyle}>
              Paste this code into the Baby Registry Chrome extension to connect
              it to your account.
            </p>
            <div style={tokenField}>{token}</div>
            <button onClick={handleCopy} style={copyBtn}>
              {copied ? 'Copied!' : 'Copy to clipboard'}
            </button>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
          <button onClick={onClose} style={doneBtn}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

const overlay: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(29, 36, 51, 0.5)',
  backdropFilter: 'blur(4px)',
  zIndex: 120,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
}

const panel: CSSProperties = {
  background: 'var(--cream)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: 24,
  width: '100%',
  maxWidth: 420,
}

const titleStyle: CSSProperties = {
  fontFamily: 'Fraunces',
  fontWeight: 400,
  fontSize: 22,
  marginBottom: 12,
  color: 'var(--ink)',
}

const bodyStyle: CSSProperties = {
  color: 'var(--ink-soft)',
  fontFamily: 'Fraunces',
  fontStyle: 'italic',
  marginBottom: 16,
}

const tokenField: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 32,
  fontWeight: 700,
  letterSpacing: '0.18em',
  textAlign: 'center',
  color: 'var(--ink)',
  background: 'var(--tier-bg)',
  border: '1px solid var(--line)',
  borderRadius: 8,
  padding: '18px 12px',
  // Single click selects the whole token — copy fallback if the Clipboard
  // API is blocked.
  userSelect: 'all',
  marginBottom: 12,
}

const copyBtn: CSSProperties = {
  width: '100%',
  background: 'var(--terracotta)',
  color: 'var(--cream)',
  border: 'none',
  padding: '10px 16px',
  borderRadius: 100,
  cursor: 'pointer',
  fontFamily: 'Manrope',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}

const doneBtn: CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--line)',
  color: 'var(--ink-soft)',
  padding: '8px 16px',
  borderRadius: 100,
  cursor: 'pointer',
  fontFamily: 'Manrope',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
}
