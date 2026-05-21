import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getBackupSettings, setBackupReminder } from '../lib/backup'

export function useBackupSettings() {
  return useQuery({
    queryKey: ['backup-settings'],
    queryFn: getBackupSettings,
  })
}

export function useUpdateBackupReminder() {
  const queryClient = useQueryClient()

  return async (enabled: boolean, frequency: 'weekly' | 'monthly') => {
    await setBackupReminder(enabled, frequency)
    queryClient.invalidateQueries({ queryKey: ['backup-settings'] })
  }
}

export function isBackupOverdue(
  lastBackupDate: string | null,
  frequency: 'weekly' | 'monthly',
): { overdue: boolean; daysSince: number } {
  if (!lastBackupDate) return { overdue: true, daysSince: -1 }
  const last = new Date(lastBackupDate)
  const now = new Date()
  const daysSince = Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
  const threshold = frequency === 'weekly' ? 7 : 30
  return { overdue: daysSince >= threshold, daysSince }
}
