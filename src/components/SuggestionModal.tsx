import { useState } from 'react'
import type { TaggedItem } from '../types'

type SuggestionMode = 'menu' | 'single' | 'week' | 'ingredient' | 'surprise'

interface SuggestionModalProps {
  recipes: TaggedItem[]
  onClose: () => void
  onSelect: (recipeId: string) => void
}

function weightedRandom(recipes: TaggedItem[]): TaggedItem | null {
  if (recipes.length === 0) return null
  // Weight by rating: 5-star = 5, unrated = 3
  const weighted = recipes.map((r) => ({
    recipe: r,
    weight: r.rating ?? 3,
  }))
  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0)
  let random = Math.random() * totalWeight
  for (const w of weighted) {
    random -= w.weight
    if (random <= 0) return w.recipe
  }
  return weighted[weighted.length - 1].recipe
}

function pickVariety(recipes: TaggedItem[], count: number): TaggedItem[] {
  if (recipes.length <= count) return [...recipes]

  // Group by primary recipe tag
  const byTag: Record<string, TaggedItem[]> = { _untagged: [] }
  for (const r of recipes) {
    const tags = r.recipe_tags ?? []
    if (tags.length === 0) {
      byTag._untagged.push(r)
    } else {
      for (const rt of tags) {
        const key = rt.tag.id
        if (!byTag[key]) byTag[key] = []
        byTag[key].push(r)
      }
    }
  }

  const picked = new Set<string>()
  const results: TaggedItem[] = []
  const tagKeys = Object.keys(byTag).filter((k) => byTag[k].length > 0)

  // Round-robin through tags, picking weighted random from each
  let safety = 0
  while (results.length < count && safety < count * 10) {
    safety++
    const tagKey = tagKeys[results.length % tagKeys.length]
    const candidates = byTag[tagKey].filter((r) => !picked.has(r.id))
    if (candidates.length === 0) {
      // Try any remaining recipe
      const any = recipes.filter((r) => !picked.has(r.id))
      if (any.length === 0) break
      const pick = weightedRandom(any)
      if (pick) {
        picked.add(pick.id)
        results.push(pick)
      }
    } else {
      const pick = weightedRandom(candidates)
      if (pick) {
        picked.add(pick.id)
        results.push(pick)
      }
    }
  }

  return results
}

function searchIngredient(recipes: TaggedItem[], query: string): TaggedItem[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  return recipes.filter((r) => {
    const text = `${r.ingredients ?? ''} ${r.name}`.toLowerCase()
    return text.includes(q)
  })
}

function RecipeSuggestionCard({ item, onSelect }: { item: TaggedItem; onSelect: () => void }) {
  const recipeTags = item.recipe_tags ?? []
  return (
    <button
      onClick={onSelect}
      className="w-full text-left rounded-xl border p-3.5 transition-all duration-150 hover:shadow-md cursor-pointer"
      style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {item.name}
          </div>
          {recipeTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
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

export default function SuggestionModal({ recipes, onClose, onSelect }: SuggestionModalProps) {
  const [mode, setMode] = useState<SuggestionMode>('menu')
  const [results, setResults] = useState<TaggedItem[]>([])
  const [ingredientQuery, setIngredientQuery] = useState('')
  const [ingredientResults, setIngredientResults] = useState<TaggedItem[]>([])

  const handleSingle = () => {
    const pick = weightedRandom(recipes)
    setResults(pick ? [pick] : [])
    setMode('single')
  }

  const handleWeek = () => {
    setResults(pickVariety(recipes, 5))
    setMode('week')
  }

  const handleSurprise = () => {
    const pick = weightedRandom(recipes)
    setResults(pick ? [pick] : [])
    setMode('surprise')
  }

  const handleIngredientSearch = () => {
    setIngredientResults(searchIngredient(recipes, ingredientQuery))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--bg-card)',
          animation: 'slideUp 200ms ease',
        }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3
            className="text-lg"
            style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
          >
            What should we make?
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        {mode === 'menu' && (
          <div className="space-y-2">
            <button
              onClick={handleSingle}
              className="w-full text-left rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md"
              style={{ backgroundColor: 'var(--bg-page)', borderColor: 'var(--border-card)' }}
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                🍽️ Suggest a dinner tonight
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Picks one recipe, weighted toward favorites
              </div>
            </button>

            <button
              onClick={handleWeek}
              className="w-full text-left rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md"
              style={{ backgroundColor: 'var(--bg-page)', borderColor: 'var(--border-card)' }}
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                📅 Plan 5 dinners this week
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Picks 5 recipes with variety across types
              </div>
            </button>

            <div
              className="rounded-xl border p-4"
              style={{ backgroundColor: 'var(--bg-page)', borderColor: 'var(--border-card)' }}
            >
              <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                🔍 Something with...
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. chicken, lemon..."
                  value={ingredientQuery}
                  onChange={(e) => setIngredientQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleIngredientSearch()}
                  className="flex-1 rounded-lg border p-2.5 text-sm"
                  style={{
                    backgroundColor: 'var(--input-bg)',
                    borderColor: 'var(--border-card)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  onClick={() => {
                    handleIngredientSearch()
                    setMode('ingredient')
                  }}
                  disabled={!ingredientQuery.trim()}
                  className="px-3 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Search
                </button>
              </div>
            </div>

            <button
              onClick={handleSurprise}
              className="w-full text-left rounded-xl border p-4 cursor-pointer transition-all hover:shadow-md"
              style={{ backgroundColor: 'var(--bg-page)', borderColor: 'var(--border-card)' }}
            >
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                🎲 Surprise us!
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Random pick weighted toward higher-rated recipes
              </div>
            </button>
          </div>
        )}

        {(mode === 'single' || mode === 'surprise') && (
          <div>
            {results.length > 0 ? (
              <div>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  {mode === 'surprise' ? 'How about...' : 'Tonight you should make:'}
                </p>
                <RecipeSuggestionCard item={results[0]} onSelect={() => onSelect(results[0].id)} />
                <button
                  onClick={mode === 'surprise' ? handleSurprise : handleSingle}
                  className="w-full mt-3 py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  Pick again
                </button>
              </div>
            ) : (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
                No recipes to suggest. Add some recipes first!
              </p>
            )}
            <button
              onClick={() => setMode('menu')}
              className="w-full mt-2 py-2 text-sm cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              Back
            </button>
          </div>
        )}

        {mode === 'week' && (
          <div>
            {results.length > 0 ? (
              <div>
                <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Here's your dinner plan:
                </p>
                <div className="space-y-2">
                  {results.map((r, i) => (
                    <div key={r.id} className="flex items-center gap-2">
                      <span className="text-xs font-medium w-6 text-center" style={{ color: 'var(--text-muted)' }}>
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <RecipeSuggestionCard item={r} onSelect={() => onSelect(r.id)} />
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleWeek}
                  className="w-full mt-3 py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  Reshuffle
                </button>
              </div>
            ) : (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
                Not enough recipes to plan a week. Add some more!
              </p>
            )}
            <button
              onClick={() => setMode('menu')}
              className="w-full mt-2 py-2 text-sm cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              Back
            </button>
          </div>
        )}

        {mode === 'ingredient' && (
          <div>
            <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Recipes with "{ingredientQuery}":
            </p>
            {ingredientResults.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {ingredientResults.map((r) => (
                  <RecipeSuggestionCard key={r.id} item={r} onSelect={() => onSelect(r.id)} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>
                No recipes found with that ingredient.
              </p>
            )}
            <button
              onClick={() => setMode('menu')}
              className="w-full mt-3 py-2 text-sm cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              Back
            </button>
          </div>
        )}
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
