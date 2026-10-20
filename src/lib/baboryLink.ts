/**
 * Private Babory family links: /family#k=<token>.
 *
 * The token is 32 random bytes as base64url. Only its SHA-256 (hex) is
 * stored in babory_family_links; api/babory-feed.ts checks it and returns the
 * read-only feed. It lives in the URL fragment, which browsers never send to
 * a server (so it stays out of Vercel request logs and Referer headers); the
 * page sends it only in the POST body to /api/babory-feed.
 *
 * After reading it, the fragment is stripped from the address bar and the
 * token is kept in sessionStorage, so reloads and moving between /family and
 * /family/photos keep working in that tab. A bookmark made after that point
 * has no token; people should keep the original link.
 */

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
  return `${window.location.origin}/family#k=${token}`
}

/**
 * The link token for this visit: from #k= on the current URL (remembered for
 * the session, then removed from the address bar), else the remembered one.
 * Null when there is none.
 */
export function getFamilyLinkToken(): string | null {
  try {
    const hash = window.location.hash.replace(/^#/, '')
    const fromUrl = hash ? new URLSearchParams(hash).get('k') : null
    if (fromUrl) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
    }
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
