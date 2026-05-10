/**
 * Supabase Realtime presence — which babylist_people are currently viewing the
 * registry in another tab/device. Active-now only; no last-seen heartbeat.
 */
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export function usePresence(registryId: string, personId: string | null): Set<string> {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!personId) return
    const ch = supabase.channel(`registry-presence:${registryId}`, {
      config: { presence: { key: personId } },
    })

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState() as Record<string, unknown[]>
      setActiveIds(new Set(Object.keys(state)))
    }).subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ at: Date.now() })
      }
    })

    return () => {
      supabase.removeChannel(ch)
    }
  }, [registryId, personId])

  return activeIds
}
