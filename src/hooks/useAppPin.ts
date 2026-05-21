import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const SESSION_KEY = 'kristory-pin-unlocked'

export function useAppPin() {
  return useQuery({
    queryKey: ['app-pin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'app_pin')
        .maybeSingle()
      if (error) throw error
      return data?.value as string | null ?? null
    },
  })
}

export function useSetAppPin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (pin: string) => {
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          { key: 'app_pin', value: pin, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        )
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-pin'] })
    },
  })
}

export function useRemoveAppPin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('app_settings')
        .delete()
        .eq('key', 'app_pin')
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-pin'] })
    },
  })
}

export function isSessionUnlocked(): boolean {
  return sessionStorage.getItem(SESSION_KEY) === 'true'
}

export function markSessionUnlocked(): void {
  sessionStorage.setItem(SESSION_KEY, 'true')
}
