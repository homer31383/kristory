import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { FamilyPost, BabyProfile } from '../types'

export function useFamilyPosts() {
  return useQuery({
    queryKey: ['family-posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_posts')
        .select('*, photos:family_post_photos!family_post_id(display_order, entry_photo:entry_photos!entry_photo_id(storage_path))')
        .order('published_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as FamilyPost[]
    },
  })
}

export function useFamilyPostForEntry(entryId: string | undefined) {
  return useQuery({
    queryKey: ['family-post', entryId],
    queryFn: async () => {
      if (!entryId) return null
      const { data, error } = await supabase
        .from('family_posts')
        .select('*, photos:family_post_photos!family_post_id(id, entry_photo_id, display_order)')
        .eq('entry_id', entryId)
        .maybeSingle()

      if (error) throw error
      return data as FamilyPost | null
    },
    enabled: !!entryId,
  })
}

export function useCreateFamilyPost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      entryId: string
      caption: string | null
      userId: string
      photoIds: string[]
      entryDate: string
    }) => {
      const { data: post, error: postError } = await supabase
        .from('family_posts')
        .insert({
          entry_id: params.entryId,
          caption: params.caption,
          user_id: params.userId,
          published_at: `${params.entryDate}T12:00:00Z`,
        })
        .select()
        .single()

      if (postError) throw postError

      if (params.photoIds.length > 0) {
        const photoRows = params.photoIds.map((photoId, i) => ({
          family_post_id: post.id,
          entry_photo_id: photoId,
          display_order: i,
        }))
        const { error: photosError } = await supabase
          .from('family_post_photos')
          .insert(photoRows)
        if (photosError) throw photosError
      }

      return post as FamilyPost
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-posts'] })
      queryClient.invalidateQueries({ queryKey: ['family-post'] })
    },
  })
}

export function useUpdateFamilyPost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      postId: string
      caption: string | null
      photoIds: string[]
    }) => {
      const { error: updateError } = await supabase
        .from('family_posts')
        .update({ caption: params.caption, updated_at: new Date().toISOString() })
        .eq('id', params.postId)

      if (updateError) throw updateError

      // Replace photo selections: delete existing, insert new
      const { error: deleteError } = await supabase
        .from('family_post_photos')
        .delete()
        .eq('family_post_id', params.postId)
      if (deleteError) throw deleteError

      if (params.photoIds.length > 0) {
        const photoRows = params.photoIds.map((photoId, i) => ({
          family_post_id: params.postId,
          entry_photo_id: photoId,
          display_order: i,
        }))
        const { error: insertError } = await supabase
          .from('family_post_photos')
          .insert(photoRows)
        if (insertError) throw insertError
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-posts'] })
      queryClient.invalidateQueries({ queryKey: ['family-post'] })
    },
  })
}

export function useDeleteFamilyPost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from('family_posts')
        .delete()
        .eq('id', postId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['family-posts'] })
      queryClient.invalidateQueries({ queryKey: ['family-post'] })
    },
  })
}

export function useFamilyFeedProfile() {
  return useQuery({
    queryKey: ['family-feed-profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_profile')
        .select('*')
        .maybeSingle()

      if (error) throw error
      return data as BabyProfile | null
    },
  })
}

export function useUpdateFamilyPin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: { id: string; family_pin: string }) => {
      const { error } = await supabase
        .from('baby_profile')
        .update({ family_pin: params.family_pin, updated_at: new Date().toISOString() })
        .eq('id', params.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baby-profile'] })
      queryClient.invalidateQueries({ queryKey: ['family-feed-profile'] })
    },
  })
}

export function useFamilyPostIds() {
  return useQuery({
    queryKey: ['family-post-ids'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_posts')
        .select('entry_id')
      if (error) throw error
      return new Set((data ?? []).map(d => d.entry_id))
    },
  })
}
