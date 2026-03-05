import { useState } from 'react'
import { useUser } from '../hooks/useUser'
import { useCreateStandaloneItem, useUsers } from '../hooks/useItems'
import { useRecipeTags, useCreateRecipeTag } from '../hooks/useRecipes'
import { supabase } from '../lib/supabase'
import type { Category } from '../types'

interface AddStandaloneItemSheetProps {
  category: Category
  onClose: () => void
  onCreated?: (itemId: string) => void
}

export default function AddStandaloneItemSheet({ category, onClose, onCreated }: AddStandaloneItemSheetProps) {
  const { user } = useUser()
  const createItem = useCreateStandaloneItem()
  const { data: recipeTags = [] } = useRecipeTags()
  const createRecipeTag = useCreateRecipeTag()
  const { data: allUsers = [] } = useUsers()

  const isHomeCooking = category.name.toLowerCase() === 'home cooking'

  const [name, setName] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    () => new Set(user ? [user.id] : [])
  )
  const [rating, setRating] = useState<number | null>(null)
  const [locationName, setLocationName] = useState('')
  const [itemDate, setItemDate] = useState('')
  const [journalDate, setJournalDate] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [instructions, setInstructions] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagEmoji, setNewTagEmoji] = useState('')
  const [saving, setSaving] = useState(false)

  // Determine which fields to show based on category
  const catLower = category.name.toLowerCase()
  const showLocation = ['restaurants', 'activities', 'music/concerts', 'music'].some((c) => catLower.includes(c))
  const showRating = catLower !== 'shopping'

  const singularName = getSingularLabel(category.name)

  const toggleParticipant = (userId: string) => {
    setSelectedParticipants((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleAddTag = async () => {
    if (!newTagName.trim()) return
    try {
      const tag = await createRecipeTag.mutateAsync({
        name: newTagName.trim(),
        emoji: newTagEmoji.trim() || undefined,
      })
      setSelectedTagIds((prev) => new Set([...prev, tag.id]))
      setNewTagName('')
      setNewTagEmoji('')
      setShowNewTag(false)
    } catch (err) {
      console.error('Failed to create tag:', err)
    }
  }

  const handleSubmit = async () => {
    if (!name.trim() || !user) return
    setSaving(true)

    try {
      // If a journal date is provided, try to find/create the entry
      let entryId: string | null = null
      if (journalDate) {
        const { data: existing } = await supabase
          .from('journal_entries')
          .select('id')
          .eq('entry_date', journalDate)
          .maybeSingle()

        if (existing) {
          entryId = existing.id
        } else {
          const { data: created } = await supabase
            .from('journal_entries')
            .insert({ entry_date: journalDate })
            .select('id')
            .single()
          if (created) entryId = created.id
        }
      }

      const result = await createItem.mutateAsync({
        categoryId: category.id,
        userId: user.id,
        name: name.trim(),
        rating,
        locationName: locationName.trim() || null,
        itemDate: itemDate || null,
        entryId,
        participantIds: [...selectedParticipants],
        ...(isHomeCooking ? {
          ingredients: ingredients.trim() || null,
          instructions: instructions.trim() || null,
          recipeTagIds: [...selectedTagIds],
        } : {}),
      })

      onCreated?.(result.id)
      onClose()
    } catch (err) {
      console.error('Failed to create item:', err)
    }

    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg-card)',
          animation: 'slideUp 200ms ease',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            {category.emoji} Add {singularName}
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Name
          </label>
          <input
            type="text"
            placeholder={getPlaceholder(catLower)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[10px] border p-3 text-sm"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Who? (Participants) */}
        {allUsers.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Who?
            </label>
            <div className="flex gap-2">
              {allUsers.map((u) => {
                const isSelected = selectedParticipants.has(u.id)
                const isChris = u.name.toLowerCase() === 'chris'
                const color = isChris ? 'var(--chris-color)' : 'var(--krista-color)'
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleParticipant(u.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all duration-150"
                    style={{
                      backgroundColor: isSelected ? color : 'var(--bg-page)',
                      color: isSelected ? 'white' : 'var(--text-secondary)',
                      border: isSelected ? 'none' : '1px solid var(--border-card)',
                    }}
                  >
                    {u.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Rating */}
        {showRating && (
          <div className="mb-4">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Rating (optional)
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(rating === star ? null : star)}
                  className="w-10 h-10 flex items-center justify-center text-xl cursor-pointer"
                >
                  {rating !== null && star <= rating ? '★' : '☆'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Location */}
        {showLocation && (
          <div className="mb-4">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
              Location (optional)
            </label>
            <input
              type="text"
              placeholder="Place name..."
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              className="w-full rounded-[10px] border p-3 text-sm"
              style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
            />
          </div>
        )}

        {/* Item Date */}
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            {getDateLabel(catLower)}
          </label>
          <input
            type="date"
            value={itemDate}
            onChange={(e) => setItemDate(e.target.value)}
            className="w-full rounded-[10px] border p-3 text-sm"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
          />
        </div>

        {/* Home Cooking specific fields */}
        {isHomeCooking && (
          <>
            {/* Recipe Tags */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Recipe Tags
              </label>
              <div className="flex flex-wrap gap-1.5">
                {recipeTags.map((tag) => {
                  const isSelected = selectedTagIds.has(tag.id)
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className="px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer"
                      style={{
                        backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-page)',
                        color: isSelected ? 'white' : 'var(--text-secondary)',
                      }}
                    >
                      {tag.emoji} {tag.name}
                    </button>
                  )
                })}
                {!showNewTag && (
                  <button
                    type="button"
                    onClick={() => setShowNewTag(true)}
                    className="px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer border border-dashed"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  >
                    + New Tag
                  </button>
                )}
              </div>
              {showNewTag && (
                <div className="flex gap-2 mt-2">
                  <input type="text" placeholder="🍜" value={newTagEmoji} onChange={(e) => setNewTagEmoji(e.target.value)}
                    className="w-14 rounded-[10px] border p-2 text-sm text-center"
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }} />
                  <input type="text" placeholder="Tag name" value={newTagName} onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 rounded-[10px] border p-2 text-sm"
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }} />
                  <button onClick={handleAddTag} disabled={createRecipeTag.isPending}
                    className="px-3 rounded-[10px] text-sm font-medium text-white cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)' }}>Add</button>
                </div>
              )}
            </div>

            {/* Ingredients */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Ingredients</label>
              <textarea placeholder="One ingredient per line..." value={ingredients} onChange={(e) => setIngredients(e.target.value)}
                rows={4} className="w-full rounded-[10px] border p-3 text-sm resize-none"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }} />
            </div>

            {/* Instructions */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Instructions</label>
              <textarea placeholder="How to make it..." value={instructions} onChange={(e) => setInstructions(e.target.value)}
                rows={4} className="w-full rounded-[10px] border p-3 text-sm resize-none"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }} />
            </div>
          </>
        )}

        {/* Link to Journal Entry */}
        <div className="mb-6">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Link to Journal Entry (optional)
          </label>
          <input
            type="date"
            value={journalDate}
            onChange={(e) => setJournalDate(e.target.value)}
            className="w-full rounded-[10px] border p-3 text-sm"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
          />
          <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Associate this item with a journal entry date
          </p>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || saving}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {saving ? 'Saving...' : `Add ${singularName}`}
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

function getSingularLabel(categoryName: string): string {
  const lower = categoryName.toLowerCase()
  if (lower === 'movies') return 'Movie'
  if (lower === 'tv shows') return 'TV Show'
  if (lower === 'restaurants') return 'Restaurant'
  if (lower === 'activities') return 'Activity'
  if (lower === 'books') return 'Book'
  if (lower.includes('music') || lower.includes('concert')) return 'Concert'
  if (lower === 'shopping') return 'Item'
  if (lower === 'home cooking') return 'Recipe'
  // Fallback: remove trailing 's' if plural-looking
  if (categoryName.endsWith('s') && categoryName.length > 3) return categoryName.slice(0, -1)
  return categoryName
}

function getPlaceholder(catLower: string): string {
  if (catLower === 'movies') return 'e.g. The Shawshank Redemption'
  if (catLower === 'tv shows') return 'e.g. Breaking Bad'
  if (catLower === 'restaurants') return 'e.g. Blue Duck Bakery'
  if (catLower === 'activities') return 'e.g. Hiking at Bear Mountain'
  if (catLower === 'books') return 'e.g. Atomic Habits'
  if (catLower.includes('music') || catLower.includes('concert')) return 'e.g. Taylor Swift — Eras Tour'
  if (catLower === 'shopping') return 'e.g. New couch from IKEA'
  if (catLower === 'home cooking') return 'e.g. Lemon Butter Pasta'
  return 'Item name...'
}

function getDateLabel(catLower: string): string {
  if (catLower === 'movies' || catLower === 'tv shows') return 'Date watched (optional)'
  if (catLower === 'books') return 'Date read (optional)'
  if (catLower === 'restaurants') return 'Date visited (optional)'
  if (catLower.includes('music') || catLower.includes('concert')) return 'Date attended (optional)'
  return 'Date (optional)'
}
