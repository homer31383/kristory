import { useState } from 'react'
import { format } from 'date-fns'
import { useActiveFamilyLink, useCreateFamilyLink, useRevokeFamilyLinks } from '../hooks/useFamilyLinks'
import { familyLinkUrl } from '../lib/baboryLink'

/**
 * Household controls for the private Babory link. One link is active at a
 * time. The full link is only visible right after it is created; after that
 * only "active since" is known, so a lost link has to be replaced.
 */
export default function FamilyLinkControls() {
  const { data: active, isLoading, error: loadError } = useActiveFamilyLink()
  const createLink = useCreateFamilyLink()
  const revokeLinks = useRevokeFamilyLinks()
  const [freshLink, setFreshLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const busy = createLink.isPending || revokeLinks.isPending
  const shareMessage = freshLink ? `Follow along with our baby updates on The Babory: ${freshLink}` : ''

  const handleCreate = async () => {
    if (active && !confirm('Replace the family link? The current link will stop working.')) return
    setError(null)
    setCopied(false)
    try {
      const token = await createLink.mutateAsync()
      setFreshLink(familyLinkUrl(token))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the link.')
    }
  }

  const handleRevoke = async () => {
    if (!confirm('Turn off the family link? Anyone using it will lose access.')) return
    setError(null)
    try {
      await revokeLinks.mutateAsync()
      setFreshLink(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not turn off the link.')
    }
  }

  const handleCopy = async () => {
    if (!freshLink) return
    await navigator.clipboard.writeText(freshLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const optionStyle = { backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)', textDecoration: 'none' }

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border p-3"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
          Private family link
        </div>
        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
          {isLoading
            ? 'Checking...'
            : loadError
              ? 'Family links are not set up yet.'
              : active
                ? `Active since ${format(new Date(active.created_at), 'MMM d, yyyy')}`
                : 'No active link'}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Anyone with the link can read the Babory updates and photos without signing in.
        </div>
      </div>

      {freshLink && (
        <div
          className="rounded-lg border p-3 space-y-2"
          style={{ backgroundColor: '#F0FAF0', borderColor: '#B9DDBF' }}
        >
          <div className="text-xs font-medium" style={{ color: '#4A9D5A' }}>
            Copy it now. The full link won't be shown again.
          </div>
          <div className="flex items-center gap-2">
            <code className="text-xs flex-1 break-all" style={{ color: 'var(--text-primary)' }}>
              {freshLink}
            </code>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer shrink-0"
              style={{ backgroundColor: copied ? '#F0FAF0' : 'var(--accent)', color: copied ? '#4A9D5A' : 'white' }}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="flex gap-2">
            {typeof navigator !== 'undefined' && !!navigator.share && (
              <button
                onClick={async () => {
                  try { await navigator.share({ title: 'The Babory', text: shareMessage }) } catch { /* cancelled */ }
                }}
                className="flex-1 rounded-lg border py-2 text-xs font-medium cursor-pointer"
                style={{ ...optionStyle, color: 'var(--text-primary)' }}
              >
                Share...
              </button>
            )}
            <a
              href={`sms:?body=${encodeURIComponent(shareMessage)}`}
              className="flex-1 rounded-lg border py-2 text-xs font-medium text-center"
              style={{ ...optionStyle, color: 'var(--text-primary)' }}
            >
              Text
            </a>
            <a
              href={`mailto:?subject=${encodeURIComponent('Baby Updates from The Babory')}&body=${encodeURIComponent(shareMessage)}`}
              className="flex-1 rounded-lg border py-2 text-xs font-medium text-center"
              style={{ ...optionStyle, color: 'var(--text-primary)' }}
            >
              Email
            </a>
          </div>
        </div>
      )}

      {error && <p className="text-xs" style={{ color: '#E5534B' }}>{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={handleCreate}
          disabled={busy || isLoading || !!loadError}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-dashed cursor-pointer disabled:opacity-50"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          {createLink.isPending ? 'Creating...' : active ? 'Replace link' : 'Create link'}
        </button>
        {active && (
          <button
            onClick={handleRevoke}
            disabled={busy}
            className="px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
            style={{ color: '#E5534B' }}
          >
            {revokeLinks.isPending ? 'Turning off...' : 'Turn off'}
          </button>
        )}
      </div>
    </div>
  )
}
