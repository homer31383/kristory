import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { BabyProfile, FamilyPost } from '../types'

/**
 * The Babory for extended family, unlocked with the family PIN. The session
 * is an httpOnly cookie set by /api/babory-unlock; the browser sends it to
 * /api/babory-feed automatically (same origin). Nothing is stored in JS.
 */

export interface FamilyFeedPost extends FamilyPost {
  milestone: string | null
}

export interface FamilyFeedData {
  profile: Pick<BabyProfile, 'name' | 'due_date' | 'birth_date'> | null
  posts: FamilyFeedPost[]
}

/** The feed route said 401: no valid family session (show the PIN screen). */
export class FamilyPinRequiredError extends Error {}

const FEED_KEY = ['babory-family-feed']

export function useBaboryFamilyFeed(enabled = true) {
  return useQuery({
    queryKey: FEED_KEY,
    enabled,
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof FamilyPinRequiredError) && count < 1,
    queryFn: async (): Promise<FamilyFeedData> => {
      const res = await fetch('/api/babory-feed', { credentials: 'same-origin', cache: 'no-store' })
      if (res.status === 401) throw new FamilyPinRequiredError('PIN required')
      if (!res.ok) throw new Error(`The Babory could not load (HTTP ${res.status}).`)
      return (await res.json()) as FamilyFeedData
    },
  })
}

/** Sends the PIN. Resolves true on success; false for every failure ("Wrong PIN"). */
export function useUnlockFamilyFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (pin: string): Promise<boolean> => {
      const res = await fetch('/api/babory-unlock', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pin }),
      })
      return res.ok
    },
    onSuccess: (ok) => {
      if (ok) queryClient.invalidateQueries({ queryKey: FEED_KEY })
    },
  })
}

/** Clears this device's family session cookie. */
export function useFamilySignOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await fetch('/api/babory-signout', { method: 'POST', credentials: 'same-origin' })
    },
    onSettled: () => {
      queryClient.removeQueries({ queryKey: FEED_KEY })
    },
  })
}
