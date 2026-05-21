import { useState, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { useHomeCookingRecipes, useRecipeTags } from '../hooks/useRecipes'
import type { TaggedItem } from '../types'
import { resizeImage } from '../lib/helpers'
import { scanRecipe, scannedRecipeToPrefill, blobToBase64 } from '../lib/scanRecipe'
import AddRecipeSheet, { type RecipePrefill } from '../components/AddRecipeSheet'
import SuggestionModal from '../components/SuggestionModal'

type SortMode = 'recent' | 'rating' | 'alpha'

function Spinner() {
  return (
    <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="var(--border-card)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function RecipeCard({ item, onClick }: { item: TaggedItem; onClick: () => void }) {
  const entryDate = item.entry?.entry_date
  const recipeTags = item.recipe_tags ?? []
  const ingredientPreview = item.ingredients
    ? item.ingredients.slice(0, 60).replace(/\n/g, ', ') + (item.ingredients.length > 60 ? '...' : '')
    : ''

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border p-4 transition-all duration-150 hover:shadow-md cursor-pointer"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-card)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {item.name}
          </div>
          {recipeTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {recipeTags.map((rt) => (
                <span
                  key={rt.tag.id}
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-muted)' }}
                >
                  {rt.tag.emoji} {rt.tag.name}
                </span>
              ))}
            </div>
          )}
          <div className="text-xs mt-1.5 flex gap-2" style={{ color: 'var(--text-secondary)' }}>
            {entryDate && (
              <span>{format(parse(entryDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}</span>
            )}
            {ingredientPreview && <span className="truncate">{ingredientPreview}</span>}
          </div>
        </div>
        {item.rating && (
          <div className="flex gap-0.5 text-sm flex-shrink-0">
            {[1, 2, 3, 4, 5].map((star) => (
              <span key={star} style={{ color: star <= item.rating! ? '#F59E0B' : 'var(--border-card)' }}>
                ★
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

export default function BookOfFood() {
  const navigate = useNavigate()
  const [sort, setSort] = useState<SortMode>('recent')
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showAddRecipe, setShowAddRecipe] = useState(false)

  // Recipe photo scanning
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [scanPrefill, setScanPrefill] = useState<RecipePrefill | null>(null)

  const { data: recipes = [], isLoading } = useHomeCookingRecipes(sort)
  const { data: recipeTags = [] } = useRecipeTags()

  const filteredRecipes = useMemo(() => {
    if (selectedTagIds.size === 0) return recipes
    return recipes.filter((r) => {
      const itemTagIds = new Set((r.recipe_tags ?? []).map((rt) => rt.tag.id))
      for (const id of selectedTagIds) {
        if (!itemTagIds.has(id)) return false
      }
      return true
    })
  }, [recipes, selectedTagIds])

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) {
        next.delete(tagId)
      } else {
        next.add(tagId)
      }
      return next
    })
  }

  const openManualAdd = () => {
    setScanPrefill(null)
    setShowAddRecipe(true)
  }

  const handleScanClick = () => {
    setScanError(null)
    fileInputRef.current?.click()
  }

  const handleScanFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // reset so picking the same file again still fires onChange
    if (!file) return

    setScanError(null)
    setScanning(true)
    try {
      // resizeImage always outputs JPEG, so the media type is always image/jpeg.
      const resized = await resizeImage(file, 1200, 0.85)
      const base64 = await blobToBase64(resized)
      const scanned = await scanRecipe(base64, 'image/jpeg')
      setScanPrefill(scannedRecipeToPrefill(scanned))
      setShowAddRecipe(true)
    } catch {
      setScanError("Couldn't read the recipe. Try a clearer photo or add manually.")
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <button
          onClick={() => navigate('/lists')}
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
            The Untitled Book of Food
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            🍳 Home Cooking
          </p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="mt-3 mb-4 space-y-2">
        <button
          onClick={() => setShowSuggestions(true)}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          What should we make?
        </button>
        <div className="flex gap-2">
          <button
            onClick={openManualAdd}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            + Add Recipe
          </button>
          <button
            onClick={handleScanClick}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium border cursor-pointer flex items-center justify-center gap-1.5"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 9a2 2 0 0 1 2-2h1.5l1-2h7l1 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"
              />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            Scan Recipe
          </button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={(e) => { void handleScanFile(e) }}
        className="hidden"
      />

      {/* Tag filter pills */}
      <div className="flex flex-wrap gap-1.5 pb-3">
        <button
          onClick={() => setSelectedTagIds(new Set())}
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap"
          style={{
            backgroundColor: selectedTagIds.size === 0 ? 'var(--accent)' : 'var(--bg-card)',
            color: selectedTagIds.size === 0 ? 'white' : 'var(--text-secondary)',
            border: selectedTagIds.size === 0 ? 'none' : '1px solid var(--border-card)',
          }}
        >
          All
        </button>
        {recipeTags.map((tag) => {
          const isSelected = selectedTagIds.has(tag.id)
          return (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium cursor-pointer whitespace-nowrap"
              style={{
                backgroundColor: isSelected ? 'var(--accent)' : 'var(--bg-card)',
                color: isSelected ? 'white' : 'var(--text-secondary)',
                border: isSelected ? 'none' : '1px solid var(--border-card)',
              }}
            >
              {tag.emoji} {tag.name}
            </button>
          )
        })}
      </div>

      {/* Sort controls */}
      <div className="flex gap-2 mb-4">
        {(['recent', 'rating', 'alpha'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setSort(mode)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 cursor-pointer"
            style={{
              backgroundColor: sort === mode ? 'var(--accent)' : 'var(--bg-card)',
              color: sort === mode ? 'white' : 'var(--text-secondary)',
              border: sort === mode ? 'none' : '1px solid var(--border-card)',
            }}
          >
            {mode === 'recent' ? 'Recent' : mode === 'rating' ? 'Top Rated' : 'A-Z'}
          </button>
        ))}
        <span className="text-xs self-center ml-auto" style={{ color: 'var(--text-muted)' }}>
          {filteredRecipes.length} recipe{filteredRecipes.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Recipe list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
          ))}
        </div>
      ) : filteredRecipes.length > 0 ? (
        <div className="space-y-2">
          {filteredRecipes.map((item) => (
            <RecipeCard
              key={item.id}
              item={item}
              onClick={() => navigate(`/recipes/${item.id}`)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🍳</div>
          <h3 className="text-lg font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            {selectedTagIds.size > 0 ? 'No matching recipes' : 'No recipes yet'}
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {selectedTagIds.size > 0
              ? 'Try adjusting your filters.'
              : 'Add your first recipe to start building your cookbook!'}
          </p>
        </div>
      )}

      {/* Add Recipe Sheet (also used to review a scanned recipe) */}
      {showAddRecipe && (
        <AddRecipeSheet
          onClose={() => {
            setShowAddRecipe(false)
            setScanPrefill(null)
          }}
          prefill={scanPrefill ?? undefined}
        />
      )}

      {/* Suggestions Modal */}
      {showSuggestions && (
        <SuggestionModal
          recipes={recipes}
          onClose={() => setShowSuggestions(false)}
          onSelect={(id) => {
            setShowSuggestions(false)
            navigate(`/recipes/${id}`)
          }}
        />
      )}

      {/* Scanning overlay */}
      {scanning && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
        >
          <div
            className="rounded-2xl px-8 py-7 flex flex-col items-center gap-3"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <Spinner />
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Reading recipe with AI…
            </p>
          </div>
        </div>
      )}

      {/* Scan error */}
      {scanError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setScanError(null) }}
        >
          <div
            className="rounded-2xl p-6 w-full max-w-sm text-center"
            style={{ backgroundColor: 'var(--bg-card)' }}
          >
            <p className="text-sm mb-5" style={{ color: 'var(--text-primary)' }}>
              {scanError}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setScanError(null)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
                style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setScanError(null)
                  fileInputRef.current?.click()
                }}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
