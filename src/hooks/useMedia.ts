import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { getMediaUrl, removeMediaFiles } from '../lib/media'
import type { JournalMedia, MediaFileType } from '../types'

// Returned so mutations resolve only after the entry has refetched; the
// reorder UI holds its local order until then to avoid snapping back.
function invalidateMedia(queryClient: QueryClient, entryDate: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['entry', entryDate] }),
    queryClient.invalidateQueries({ queryKey: ['entries'] }),
    queryClient.invalidateQueries({ queryKey: ['family-feed-posts'] }),
  ])
}

/** Inserts the journal_media row once the file (and thumbnail) are in storage. */
export function useCreateMedia() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      entryId: string
      entryDate: string
      userId: string
      filePath: string
      fileName: string
      fileType: MediaFileType
      mimeType: string
      fileSizeBytes: number
      durationSeconds: number | null
      thumbnailPath: string | null
      sortOrder: number
    }) => {
      const { data, error } = await supabase
        .from('journal_media')
        .insert({
          entry_id: params.entryId,
          user_id: params.userId,
          file_path: params.filePath,
          file_url: getMediaUrl(params.filePath),
          file_name: params.fileName,
          file_type: params.fileType,
          mime_type: params.mimeType,
          file_size_bytes: params.fileSizeBytes,
          duration_seconds: params.durationSeconds,
          thumbnail_path: params.thumbnailPath,
          sort_order: params.sortOrder,
        })
        .select()
        .single()

      if (error) throw error
      return data as JournalMedia
    },
    onSuccess: (_data, variables) => invalidateMedia(queryClient, variables.entryDate),
  })
}

export function useUpdateMedia() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      mediaId: string
      entryDate: string
      changes: Partial<Pick<JournalMedia, 'caption' | 'file_name' | 'share_to_family'>>
    }) => {
      const { error } = await supabase
        .from('journal_media')
        .update(params.changes)
        .eq('id', params.mediaId)
      if (error) throw error
    },
    onSuccess: (_data, variables) => invalidateMedia(queryClient, variables.entryDate),
  })
}

/** Persists a new order: each id gets its index as sort_order. */
export function useReorderMedia() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ orderedIds }: { orderedIds: string[]; entryDate: string }) => {
      const results = await Promise.all(
        orderedIds.map((id, index) =>
          supabase.from('journal_media').update({ sort_order: index }).eq('id', id),
        ),
      )
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onSuccess: (_data, variables) => invalidateMedia(queryClient, variables.entryDate),
  })
}

export function useDeleteMedia() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ media }: { media: JournalMedia; entryDate: string }) => {
      await removeMediaFiles([media])
      const { error } = await supabase.from('journal_media').delete().eq('id', media.id)
      if (error) throw error
    },
    onSuccess: (_data, variables) => invalidateMedia(queryClient, variables.entryDate),
  })
}
