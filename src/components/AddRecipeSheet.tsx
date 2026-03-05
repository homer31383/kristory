import { useState, useEffect } from 'react'
import { useUser } from '../hooks/useUser'
import { useCategories } from '../hooks/useCategories'
import { useRecipeTags, useCreateRecipeTag, useCreateRecipe, useUpdateRecipe } from '../hooks/useRecipes'
import type { TaggedItem } from '../types'

interface AddRecipeSheetProps {
  onClose: () => void
  editItem?: TaggedItem
  prefillEntryId?: string
}

export default function AddRecipeSheet({ onClose, editItem, prefillEntryId }: AddRecipeSheetProps) {
  const { user } = useUser()
  const { data: categories = [] } = useCategories()
  const { data: recipeTags = [] } = useRecipeTags()
  const createRecipeTag = useCreateRecipeTag()
  const createRecipe = useCreateRecipe()
  const updateRecipe = useUpdateRecipe()

  const homeCookingCat = categories.find((c) => c.name.toLowerCase() === 'home cooking')

  const [name, setName] = useState(editItem?.name ?? '')
  const [rating, setRating] = useState<number | null>(editItem?.rating ?? null)
  const [ingredients, setIngredients] = useState(editItem?.ingredients ?? '')
  const [instructions, setInstructions] = useState(editItem?.instructions ?? '')
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagEmoji, setNewTagEmoji] = useState('')
  const [saving, setSaving] = useState(false)

  // Initialize selected tags from edit item
  useEffect(() => {
    if (editItem?.recipe_tags) {
      setSelectedTagIds(new Set(editItem.recipe_tags.map((rt) => rt.tag.id)))
    }
  }, [editItem])

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
    if (!name.trim() || !user || !homeCookingCat) return
    setSaving(true)

    try {
      if (editItem) {
        await updateRecipe.mutateAsync({
          id: editItem.id,
          name: name.trim(),
          rating,
          ingredients: ingredients.trim() || null,
          instructions: instructions.trim() || null,
          recipeTagIds: [...selectedTagIds],
        })
      } else {
        await createRecipe.mutateAsync({
          categoryId: homeCookingCat.id,
          userId: user.id,
          name: name.trim(),
          rating,
          ingredients: ingredients.trim() || null,
          instructions: instructions.trim() || null,
          entryId: prefillEntryId ?? null,
          recipeTagIds: [...selectedTagIds],
        })
      }
      onClose()
    } catch (err) {
      console.error('Failed to save recipe:', err)
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
            {editItem ? 'Edit Recipe' : 'Add Recipe'}
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
            Recipe Name
          </label>
          <input
            type="text"
            placeholder="e.g. Lemon Butter Pasta"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[10px] border p-3 text-sm"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Recipe Tags */}
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Tags
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
              <input
                type="text"
                placeholder="🍜"
                value={newTagEmoji}
                onChange={(e) => setNewTagEmoji(e.target.value)}
                className="w-14 rounded-[10px] border p-2 text-sm text-center"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  borderColor: 'var(--border-card)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                type="text"
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="flex-1 rounded-[10px] border p-2 text-sm"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  borderColor: 'var(--border-card)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={handleAddTag}
                disabled={createRecipeTag.isPending}
                className="px-3 rounded-[10px] text-sm font-medium text-white cursor-pointer"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Ingredients */}
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Ingredients
          </label>
          <textarea
            placeholder="One ingredient per line..."
            value={ingredients}
            onChange={(e) => setIngredients(e.target.value)}
            rows={5}
            className="w-full rounded-[10px] border p-3 text-sm resize-none"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Instructions */}
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Instructions
          </label>
          <textarea
            placeholder="How to make it..."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
            className="w-full rounded-[10px] border p-3 text-sm resize-none"
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Rating */}
        <div className="mb-6">
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

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || saving}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {saving ? 'Saving...' : editItem ? 'Save Changes' : 'Add Recipe'}
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
