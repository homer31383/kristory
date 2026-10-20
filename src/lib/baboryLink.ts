/**
 * Private Babory family links: /family?k=<token>.
 *
 * The token is 32 random bytes as base64url. Only its SHA-256 (hex) is
 * stored in babory_family_links; api/babory-feed.ts checks it and returns the
 * read-only feed. The token is kept in sessionStorage so moving between
 * /family and /family/photos keeps working after it leaves the address bar.
 */

const PARAM = 'k'
const SESSION_KEY = 'kristory-babory-link'
const TOKEN_RE = /^[A-Za-z0-9_-]{43,128}$/

function base64url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function generateFamilyLinkToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return base64url(bytes)
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function familyLinkUrl(token: string): string {
  return `${window.location.origin}/family?${PARAM}=${encodeURIComponent(token)}`
}

/**
 * The link token for this visit: from ?k= on the current URL (remembered for
 * the session), else the remembered one. Null when there is none.
 */
export function getFamilyLinkToken(): string | null {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get(PARAM)
    if (fromUrl && TOKEN_RE.test(fromUrl)) {
      sessionStorage.setItem(SESSION_KEY, fromUrl)
      return fromUrl
    }
    const saved = sessionStorage.getItem(SESSION_KEY)
    return saved && TOKEN_RE.test(saved) ? saved : null
  } catch {
    return null
  }
}

export function forgetFamilyLinkToken(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Storage blocked; nothing to forget.
  }
}
