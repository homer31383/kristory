import { useQuery } from '@tanstack/react-query'
import type { BabyProfile, FamilyPost } from '../types'

/** What api/babory-feed.ts returns for a valid private family link. */
export interface LinkFeedPost extends FamilyPost {
  milestone: string | null
}

export interface LinkFeed {
  profile: Pick<BabyProfile, 'name' | 'due_date' | 'birth_date'> | null
  posts: LinkFeedPost[]
}

export class LinkNotFoundError extends Error {}

/** Read-only Babory data for someone holding a private family link. */
export function useBaboryLinkFeed(token: string | null) {
  return useQuery({
    queryKey: ['babory-link-feed', token],
    enabled: !!token,
    retry: (count, err) => !(err instanceof LinkNotFoundError) && count < 1,
    queryFn: async (): Promise<LinkFeed> => {
      const res = await fetch('/api/babory-feed', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
        cache: 'no-store',
      })
      if (res.status === 404) throw new LinkNotFoundError('This link is no longer active.')
      if (!res.ok) throw new Error(`The Babory could not load (HTTP ${res.status}).`)
      return (await res.json()) as LinkFeed
    },
  })
}
