import { useState } from 'react'
import { format } from 'date-fns'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiHeaders } from '../lib/supabase'
import { useBabyProfile } from '../hooks/useBaby'

/**
 * Household controls for the Babory family PIN (Settings > Family Feed).
 * The PIN is hashed on the server (/api/babory-pin); this only ever learns
 * whether one is set and when it last changed.
 */

interface PinStatus {
  set: boolean
  updated_at: string | null
  /** Lockouts in the last 7 days. */
  lockouts?: { device: number; global: number }
}

/**
 * Mirror of isWeakPin in api/_lib/babory.ts, only for a friendly message;
 * the server decides. Same digit x4, runs by 1 (plus 7890 / 0987), or the
 * baby's birthday (due date if no birth date) as MMDD or DDMM.
 */
function looksWeak(pin: string, birthDate: string | null | undefined, dueDate: string | null | undefined): boolean {
  if (/^(\d)\1{3}$/.test(pin)) return true
  const runs = '0123456789'
  const sequences = new Set<string>(['7890', '0987'])
  for (let i = 0; i + 4 <= runs.length; i++) {
    const up = runs.slice(i, i + 4)
    sequences.add(up)
    sequences.add([...up].reverse().join(''))
  }
  if (sequences.has(pin)) return true
  const date = birthDate || dueDate
  const m = date ? /^\d{4}-(\d{2})-(\d{2})/.exec(date) : null
  return !!m && (pin === m[1] + m[2] || pin === m[2] + m[1])
}

async function readError(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  return data.error || fallback
}

function usePinStatus() {
  return useQuery({
    queryKey: ['babory-pin-status'],
    queryFn: async (): Promise<PinStatus> => {
      const res = await fetch('/api/babory-pin', { headers: await apiHeaders(), cache: 'no-store' })
      if (!res.ok) throw new Error(await readError(res, `HTTP ${res.status}`))
      return (await res.json()) as PinStatus
    },
  })
}

function useSavePin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pin: string) => {
      const res = await fetch('/api/babory-pin', {
        method: 'POST',
        headers: await apiHeaders(),
        body: JSON.stringify({ pin }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Could not save the family PIN.'))
      return (await res.json()) as { updated_at: string }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['babory-pin-status'] }),
  })
}

const inputStyle = {
  backgroundColor: 'var(--input-bg)',
  borderColor: 'var(--border-card)',
  color: 'var(--text-primary)',
  letterSpacing: 4,
}

export default function FamilyPinControls() {
  const { data: status, isLoading, error: loadError } = usePinStatus()
  const { data: babyProfile } = useBabyProfile()
  const savePin = useSavePin()
  const [editing, setEditing] = useState(false)
  const [pin, setPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const reset = () => {
    setEditing(false)
    setPin('')
    setConfirmPin('')
    setError(null)
  }

  const handleSave = async () => {
    if (!/^\d{4}$/.test(pin)) {
      setError('The PIN must be exactly 4 digits.')
      return
    }
    if (pin !== confirmPin) {
      setError('The PINs do not match.')
      return
    }
    if (looksWeak(pin, babyProfile?.birth_date, babyProfile?.due_date)) {
      setError('That PIN is too easy to guess. Please choose another.')
      return
    }
    try {
      await savePin.mutateAsync(pin)
      reset()
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the family PIN.')
    }
  }

  return (
    <div className="space-y-3">
      <div
        className="rounded-lg border p-3"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
          Family PIN
        </div>
        <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
          {isLoading
            ? 'Checking...'
            : loadError
              ? 'Family PIN is not set up yet.'
              : status?.set && status.updated_at
                ? `Set · last changed ${format(new Date(status.updated_at), 'MMM d, yyyy')}`
                : 'No PIN set. Family can’t open the Babory yet.'}
          {saved && <span style={{ color: '#4A9D5A' }}> · Saved</span>}
        </div>
        {status?.lockouts && (
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Last 7 days: {status.lockouts.device} device lockout{status.lockouts.device === 1 ? '' : 's'},{' '}
            {status.lockouts.global} page lockout{status.lockouts.global === 1 ? '' : 's'}
          </div>
        )}
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
          Family open {window.location.origin}/family and enter this 4-digit PIN. Changing it signs every family device out.
        </div>
      </div>

      {editing ? (
        <div className="space-y-2">
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            value={pin}
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(null) }}
            placeholder="New 4-digit PIN"
            autoFocus
            className="w-full rounded-lg border p-2.5 text-sm"
            style={inputStyle}
          />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            maxLength={4}
            value={confirmPin}
            onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(null) }}
            placeholder="Confirm PIN"
            className="w-full rounded-lg border p-2.5 text-sm"
            style={inputStyle}
          />
          {error && <p className="text-xs" style={{ color: '#E5534B' }}>{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              onClick={reset}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={savePin.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {savePin.isPending ? 'Saving...' : 'Save PIN'}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          disabled={isLoading || !!loadError}
          className="w-full py-2.5 rounded-lg text-sm font-medium border border-dashed cursor-pointer disabled:opacity-50"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          {status?.set ? 'Change PIN' : 'Set PIN'}
        </button>
      )}
    </div>
  )
}
