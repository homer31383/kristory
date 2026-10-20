import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { generateFamilyLinkToken, sha256Hex } from '../lib/baboryLink'

/** The active Babory family link, if any (only its creation time is readable). */
export function useActiveFamilyLink() {
  return useQuery({
    queryKey: ['babory-family-link'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('babory_family_links')
        .select('created_at')
        .is('revoked_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0] as { created_at: string } | undefined) ?? null
    },
  })
}

async function revokeAllExcept(keepHash: string | null) {
  let q = supabase.from('babory_family_links').update({ revoked_at: new Date().toISOString() }).is('revoked_at', null)
  if (keepHash) q = q.neq('token_hash', keepHash)
  const { error } = await q
  if (error) throw error
}

/**
 * Creates a new link and revokes every other one, so only one is ever active.
 * Resolves to the new token; it is shown once and never stored in clear.
 */
export function useCreateFamilyLink() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<string> => {
      const token = generateFamilyLinkToken()
      const tokenHash = await sha256Hex(token)
      const { error } = await supabase.from('babory_family_links').insert({ token_hash: tokenHash })
      if (error) throw error
      await revokeAllExcept(tokenHash)
      return token
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['babory-family-link'] }),
  })
}

export function useRevokeFamilyLinks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => revokeAllExcept(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['babory-family-link'] }),
  })
}
