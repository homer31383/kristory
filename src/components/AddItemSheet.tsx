import { useState } from 'react'
import { useCategories, useCreateCategory } from '../hooks/useCategories'
import { useUser } from '../hooks/useUser'
import { useRecipeTags, useCreateRecipeTag } from '../hooks/useRecipes'

interface AddItemSheetProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (data: {
    categoryId: string
    name: string
    rating: number | null
    locationName: string | null
    ingredients?: string | null
    instructions?: string | null
    recipeTagIds?: string[]
  }) => void
}

export default function AddItemSheet({ isOpen, onClose, onAdd }: AddItemSheetProps) {
  const { user } = useUser()
  const { data: categories = [] } = useCategories()
  const createCategory = useCreateCategory()
  const { data: recipeTags = [] } = useRecipeTags()
  const createRecipeTag = useCreateRecipeTag()

  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [name, setName] = useState('')
  const [rating, setRating] = useState<number | null>(null)
  const [locationName, setLocationName] = useState('')
  const [ingredients, setIngredients] = useState('')
  const [instructions, setInstructions] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatEmoji, setNewCatEmoji] = useState('')
  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagEmoji, setNewTagEmoji] = useState('')

  const selectedCat = categories.find((c) => c.id === selectedCategory)
  const isHomeCooking = selectedCat?.name?.toLowerCase() === 'home cooking'

  const reset = () => {
    setSelectedCategory('')
    setName('')
    setRating(null)
    setLocationName('')
    setIngredients('')
    setInstructions('')
    setSelectedTagIds(new Set())
    setShowNewCategory(false)
    setNewCatName('')
    setNewCatEmoji('')
    setShowNewTag(false)
    setNewTagName('')
    setNewTagEmoji('')
  }

  const handleSubmit = () => {
    if (!selectedCategory || !name.trim()) return
    onAdd({
      categoryId: selectedCategory,
      name: name.trim(),
      rating,
      locationName: locationName.trim() || null,
      ...(isHomeCooking ? {
        ingredients: ingredients.trim() || null,
        instructions: instructions.trim() || null,
        recipeTagIds: [...selectedTagIds],
      } : {}),
    })
    reset()
    onClose()
  }

  const toggleRecipeTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      return next
    })
  }

  const handleAddRecipeTag = async () => {
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

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    try {
      const cat = await createCategory.mutateAsync({
        name: newCatName.trim(),
        emoji: newCatEmoji.trim() || '📌',
        userId: user!.id,
      })
      setSelectedCategory(cat.id)
      setShowNewCategory(false)
      setNewCatName('')
      setNewCatEmoji('')
    } catch (err) {
      console.error('Failed to create category:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center backdrop"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) { reset(); onClose() } }}
    >
      <div
        className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[85vh] overflow-y-auto animate-slide-up"
        style={{
          backgroundColor: 'var(--bg-card)',
          animation: 'slideUp 200ms ease',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Add Item
          </h3>
          <button
            onClick={() => { reset(); onClose() }}
            className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        {/* Category */}
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Category
          </label>
          {!showNewCategory ? (
            <div>
              <select
                value={selectedCategory}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setShowNewCategory(true)
                    setSelectedCategory('')
                  } else {
                    setSelectedCategory(e.target.value)
                  }
                }}
                className="w-full rounded-[10px] border p-3 text-sm appearance-none cursor-pointer"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  borderColor: 'var(--border-card)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">Select category...</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.emoji} {cat.name}
                  </option>
                ))}
                <option value="__new__">+ Add New Category</option>
              </select>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Emoji"
                value={newCatEmoji}
                onChange={(e) => setNewCatEmoji(e.target.value)}
                className="w-16 rounded-[10px] border p-3 text-sm text-center"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  borderColor: 'var(--border-card)',
                  color: 'var(--text-primary)',
                }}
              />
              <input
                type="text"
                placeholder="Category name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="flex-1 rounded-[10px] border p-3 text-sm"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  borderColor: 'var(--border-card)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                onClick={handleAddCategory}
                disabled={createCategory.isPending}
                className="px-3 rounded-[10px] text-sm font-medium text-white cursor-pointer"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Name */}
        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Name
          </label>
          <input
            type="text"
            placeholder="e.g. Oppenheimer, Blue Duck Bakery..."
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

        {/* Rating */}
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

        {/* Location */}
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
            style={{
              backgroundColor: 'var(--input-bg)',
              borderColor: 'var(--border-card)',
              color: 'var(--text-primary)',
            }}
          />
        </div>

        {/* Recipe fields — shown only when Home Cooking is selected */}
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
                      onClick={() => toggleRecipeTag(tag.id)}
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
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                  />
                  <input
                    type="text"
                    placeholder="Tag name"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 rounded-[10px] border p-2 text-sm"
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={handleAddRecipeTag}
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
                Ingredients (optional)
              </label>
              <textarea
                placeholder="One ingredient per line..."
                value={ingredients}
                onChange={(e) => setIngredients(e.target.value)}
                rows={4}
                className="w-full rounded-[10px] border p-3 text-sm resize-none"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
            </div>

            {/* Instructions */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Instructions (optional)
              </label>
              <textarea
                placeholder="How to make it..."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={4}
                className="w-full rounded-[10px] border p-3 text-sm resize-none"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
            </div>
          </>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!selectedCategory || !name.trim()}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white transition-colors duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Add Item
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
