import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { useRecipe, useUpdateRecipe } from '../hooks/useRecipes'
import AddRecipeSheet from '../components/AddRecipeSheet'
import SaveAsMealModal from '../components/SaveAsMealModal'

export default function RecipeDetail() {
  const { recipeId } = useParams<{ recipeId: string }>()
  const navigate = useNavigate()
  const { data: recipe, isLoading } = useRecipe(recipeId ?? '')
  const updateRecipe = useUpdateRecipe()
  const [editing, setEditing] = useState(false)
  const [showMealModal, setShowMealModal] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  if (!recipeId) return null

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
        <div className="h-32 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
        <div className="h-48 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
      </div>
    )
  }

  if (!recipe) {
    return (
      <div className="text-center py-16">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Recipe not found.</p>
      </div>
    )
  }

  const recipeTags = recipe.recipe_tags ?? []
  const entryDate = recipe.entry?.entry_date
  const userName = recipe.user?.name

  const handleRatingChange = async (newRating: number) => {
    const rating = recipe.rating === newRating ? null : newRating
    await updateRecipe.mutateAsync({ id: recipeId, rating })
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1
            className="text-xl"
            style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
          >
            {recipe.name}
          </h1>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
          style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        >
          Edit
        </button>
      </div>

      {/* Rating */}
      <div className="flex gap-1 mb-4">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRatingChange(star)}
            className="w-8 h-8 flex items-center justify-center text-lg cursor-pointer"
          >
            <span style={{ color: recipe.rating && star <= recipe.rating ? '#F59E0B' : 'var(--border-card)' }}>
              ★
            </span>
          </button>
        ))}
        {userName && (
          <span className="text-xs self-center ml-3" style={{ color: 'var(--text-muted)' }}>
            Added by {userName}
          </span>
        )}
      </div>

      {/* Recipe tags */}
      {recipeTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {recipeTags.map((rt) => (
            <span
              key={rt.tag.id}
              className="text-xs px-2.5 py-1 rounded-full"
              style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-secondary)' }}
            >
              {rt.tag.emoji} {rt.tag.name}
            </span>
          ))}
        </div>
      )}

      {/* Ingredients */}
      {recipe.ingredients && (
        <div className="mb-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Ingredients
            </h2>
            <button
              onClick={() => setShowMealModal(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer flex-shrink-0"
              style={{ borderColor: 'var(--border-card)', color: 'var(--accent)' }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"
                />
              </svg>
              Save as Axiom Meal
            </button>
          </div>
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
          >
            <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-primary)' }}>
              {recipe.ingredients}
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      {recipe.instructions && (
        <div className="mb-5">
          <h2
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: 'var(--text-muted)' }}
          >
            Instructions
          </h2>
          <div
            className="rounded-xl border p-4"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
          >
            <div className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-primary)' }}>
              {recipe.instructions}
            </div>
          </div>
        </div>
      )}

      {/* No content */}
      {!recipe.ingredients && !recipe.instructions && (
        <div
          className="rounded-xl border p-6 text-center mb-5"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No ingredients or instructions yet. Tap Edit to add them.
          </p>
        </div>
      )}

      {/* Journal entry link */}
      {entryDate && (
        <button
          onClick={() => navigate(`/journal/${entryDate}`)}
          className="w-full text-left rounded-xl border p-3.5 cursor-pointer transition-all duration-150 hover:shadow-md"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
            Journal Entry
          </div>
          <div className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
            {format(parse(entryDate, 'yyyy-MM-dd', new Date()), 'MMMM d, yyyy')}
          </div>
        </button>
      )}

      {/* Edit Sheet */}
      {editing && (
        <AddRecipeSheet
          onClose={() => setEditing(false)}
          editItem={recipe}
        />
      )}

      {/* Save as Axiom Meal */}
      {showMealModal && (
        <SaveAsMealModal
          recipe={recipe}
          onClose={() => setShowMealModal(false)}
          onSaved={() => {
            setShowMealModal(false)
            setToast('Saved to Axiom Meals!')
            setTimeout(() => setToast(null), 4000)
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg z-50"
          style={{
            bottom: 88,
            backgroundColor: 'var(--text-primary)',
            color: 'var(--bg-card)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}
