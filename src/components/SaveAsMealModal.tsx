import { useState, useEffect, useRef, useCallback } from 'react'
import type { TaggedItem } from '../types'
import {
  useGroceryCategories,
  useSaveAxiomMeal,
  findMealByName,
  findAvailableMealName,
} from '../hooks/useAxiomMeals'
import { parseRecipeIngredients } from '../lib/parseIngredients'

interface SaveAsMealModalProps {
  recipe: TaggedItem
  onClose: () => void
  onSaved: (mealName: string) => void
}

interface EditableIngredient {
  key: string
  include: boolean
  name: string
  quantity: string
  unit: string
  category: string
  notes: string
}

type Stage = 'loading' | 'review' | 'duplicate' | 'saving' | 'error'

const PARSE_FAIL_MESSAGE =
  "Couldn't parse ingredients. Try again or add manually in Axiom."
const SAVE_FAIL_MESSAGE = "Couldn't save to Axiom. Please retry."

function Spinner() {
  return (
    <svg className="animate-spin" width="28" height="28" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="var(--border-card)" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export default function SaveAsMealModal({ recipe, onClose, onSaved }: SaveAsMealModalProps) {
  const {
    data: categories = [],
    isLoading: catsLoading,
    isError: catsError,
    refetch: refetchCategories,
  } = useGroceryCategories()
  const saveMeal = useSaveAxiomMeal()

  const [stage, setStage] = useState<Stage>('loading')
  const [errorKind, setErrorKind] = useState<'parse' | 'save'>('parse')
  const [formError, setFormError] = useState('')

  const [mealName, setMealName] = useState(recipe.name)
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<EditableIngredient[]>([])
  const [duplicateMealId, setDuplicateMealId] = useState<string | null>(null)

  const startedRef = useRef(false)

  const inputStyle = {
    backgroundColor: 'var(--input-bg)',
    borderColor: 'var(--border-card)',
    color: 'var(--text-primary)',
  } as const

  // Note: the first statement runs to the `await` before any setState, so this
  // never triggers a synchronous render cascade when called from the effect.
  const runParse = useCallback(async () => {
    try {
      const categoryNames = categories.map((c) => c.name)
      const parsed = await parseRecipeIngredients(recipe.ingredients ?? '', categoryNames)
      const known = new Set(categoryNames)
      const fallbackCategory = known.has('Other') ? 'Other' : categoryNames[0] ?? ''
      setItems(
        parsed.map((p) => ({
          key: crypto.randomUUID(),
          include: true,
          name: p.name,
          quantity: p.quantity > 0 ? String(p.quantity) : '1',
          unit: p.unit ?? '',
          category: known.has(p.category) ? p.category : fallbackCategory,
          notes: p.notes ?? '',
        })),
      )
      setStage('review')
    } catch {
      setErrorKind('parse')
      setStage('error')
    }
  }, [categories, recipe.ingredients])

  // Kick off parsing once the grocery categories have loaded. The ref guard
  // keeps this to a single run even under React StrictMode double-invocation.
  // The category-load failure is handled as a render branch, not here.
  useEffect(() => {
    if (startedRef.current) return
    if (catsLoading || catsError) return
    startedRef.current = true
    // One-shot async kickoff: runParse awaits the network before any setState,
    // so there is no synchronous render cascade despite the rule's heuristic.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runParse()
  }, [catsLoading, catsError, runParse])

  const updateItem = (key: string, patch: Partial<EditableIngredient>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)))
  }

  const persist = async (mode: 'new' | 'replace', name: string, existingMealId?: string) => {
    setStage('saving')
    try {
      const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]))
      const ingredients = items
        .filter((it) => it.include && it.name.trim())
        .map((it) => {
          const qty = Number.parseFloat(it.quantity)
          return {
            name: it.name.trim(),
            category_id: categoryIdByName.get(it.category) ?? null,
            quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
            unit: it.unit.trim() || null,
            notes: it.notes.trim() || null,
          }
        })
      const result = await saveMeal.mutateAsync({
        name,
        description: description.trim() || null,
        ingredients,
        mode,
        existingMealId,
      })
      onSaved(result.name)
    } catch {
      setErrorKind('save')
      setStage('error')
    }
  }

  const handleSave = async () => {
    const name = mealName.trim()
    if (!name) {
      setFormError('Give the meal a name.')
      return
    }
    if (items.filter((it) => it.include && it.name.trim()).length === 0) {
      setFormError('Select at least one ingredient.')
      return
    }
    setFormError('')
    setStage('saving')
    try {
      const existing = await findMealByName(name)
      if (existing) {
        setDuplicateMealId(existing.id)
        setStage('duplicate')
        return
      }
      await persist('new', name)
    } catch {
      setErrorKind('save')
      setStage('error')
    }
  }

  const handleReplace = () => {
    if (!duplicateMealId) return
    void persist('replace', mealName.trim(), duplicateMealId)
  }

  const handleSaveAsNew = async () => {
    setStage('saving')
    try {
      const freeName = await findAvailableMealName(mealName.trim())
      await persist('new', freeName)
    } catch {
      setErrorKind('save')
      setStage('error')
    }
  }

  const handleRetry = () => {
    if (errorKind === 'parse') {
      setStage('loading')
      void runParse()
    } else {
      void handleSave()
    }
  }

  const labelClass = 'block text-xs font-medium mb-1'
  const includedCount = items.filter((it) => it.include).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget && stage !== 'saving') onClose()
      }}
    >
      <div
        className="w-full md:max-w-lg rounded-t-2xl md:rounded-2xl max-h-[88vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-card)', animation: 'slideUp 200ms ease' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 pt-5 pb-3"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          <h3
            className="text-lg"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Save as Axiom Meal
          </h3>
          <button
            onClick={onClose}
            disabled={stage === 'saving'}
            className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer disabled:opacity-40"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        </div>

        <div className="px-6 pb-6">
          {/* Grocery categories failed to load */}
          {catsError && (
            <div className="py-6 text-center">
              <p className="text-sm mb-5" style={{ color: 'var(--text-primary)' }}>
                Couldn't load grocery categories. Check your connection and try again.
              </p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer"
                  style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => void refetchCategories()}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Loading */}
          {!catsError && stage === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Spinner />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Parsing ingredients with AI…
              </p>
            </div>
          )}

          {/* Saving */}
          {!catsError && stage === 'saving' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12">
              <Spinner />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Saving to Axiom Meals…
              </p>
            </div>
          )}

          {/* Parse / save error */}
          {!catsError && stage === 'error' && (
            <div className="py-6 text-center">
              <p className="text-sm mb-5" style={{ color: 'var(--text-primary)' }}>
                {errorKind === 'parse' ? PARSE_FAIL_MESSAGE : SAVE_FAIL_MESSAGE}
              </p>
              <div className="flex gap-2 justify-center">
                {errorKind === 'save' ? (
                  <button
                    onClick={() => setStage('review')}
                    className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer"
                    style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
                  >
                    Back to review
                  </button>
                ) : (
                  <button
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-sm font-medium border cursor-pointer"
                    style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Try again
                </button>
              </div>
            </div>
          )}

          {/* Duplicate prompt */}
          {!catsError && stage === 'duplicate' && (
            <div className="py-4">
              <p className="text-sm mb-5" style={{ color: 'var(--text-primary)' }}>
                A meal called <strong>“{mealName.trim()}”</strong> already exists in
                Axiom. Replace it, or save this as a new meal?
              </p>
              <div className="space-y-2">
                <button
                  onClick={handleReplace}
                  className="w-full py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Replace existing meal
                </button>
                <button
                  onClick={handleSaveAsNew}
                  className="w-full py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
                  style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                >
                  Save as new meal
                </button>
                <button
                  onClick={() => setStage('review')}
                  className="w-full py-2 text-sm cursor-pointer"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Review */}
          {!catsError && stage === 'review' && (
            <div>
              <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>
                Meal name
              </label>
              <input
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
                className="w-full rounded-lg border p-2.5 text-sm mb-3"
                style={inputStyle}
              />

              <label className={labelClass} style={{ color: 'var(--text-secondary)' }}>
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Optional"
                className="w-full rounded-lg border p-2.5 text-sm mb-4 resize-none"
                style={inputStyle}
              />

              <div
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--text-muted)' }}
              >
                Ingredients ({includedCount} of {items.length})
              </div>

              {items.length === 0 ? (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--text-muted)' }}>
                  No ingredients were parsed.
                </p>
              ) : (
                <div className="space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-lg border p-2.5"
                      style={{
                        borderColor: 'var(--border-card)',
                        backgroundColor: 'var(--bg-page)',
                      }}
                    >
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={item.include}
                          onChange={(e) => updateItem(item.key, { include: e.target.checked })}
                          className="mt-2 w-4 h-4 cursor-pointer flex-shrink-0"
                          style={{ accentColor: 'var(--accent)' }}
                        />
                        <div
                          className="flex-1 min-w-0"
                          style={{ opacity: item.include ? 1 : 0.5 }}
                        >
                          <input
                            value={item.name}
                            onChange={(e) => updateItem(item.key, { name: e.target.value })}
                            placeholder="Ingredient"
                            className="w-full rounded-md border px-2 py-1.5 text-sm mb-1.5"
                            style={inputStyle}
                          />
                          <div className="flex gap-1.5 mb-1.5">
                            <input
                              value={item.quantity}
                              onChange={(e) =>
                                updateItem(item.key, { quantity: e.target.value })
                              }
                              inputMode="decimal"
                              placeholder="Qty"
                              className="w-14 rounded-md border px-2 py-1.5 text-sm"
                              style={inputStyle}
                            />
                            <input
                              value={item.unit}
                              onChange={(e) => updateItem(item.key, { unit: e.target.value })}
                              placeholder="Unit"
                              className="w-20 rounded-md border px-2 py-1.5 text-sm"
                              style={inputStyle}
                            />
                            <select
                              value={item.category}
                              onChange={(e) =>
                                updateItem(item.key, { category: e.target.value })
                              }
                              className="flex-1 min-w-0 rounded-md border px-2 py-1.5 text-sm"
                              style={inputStyle}
                            >
                              {!categories.some((c) => c.name === item.category) && (
                                <option value={item.category}>
                                  {item.category || '—'}
                                </option>
                              )}
                              {categories.map((c) => (
                                <option key={c.id} value={c.name}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <input
                            value={item.notes}
                            onChange={(e) => updateItem(item.key, { notes: e.target.value })}
                            placeholder="Notes (optional)"
                            className="w-full rounded-md border px-2 py-1.5 text-xs"
                            style={inputStyle}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {formError && (
                <p className="text-xs mt-3" style={{ color: '#C0473E' }}>
                  {formError}
                </p>
              )}

              <div className="flex gap-2 mt-5">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
                  style={{ borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer"
                  style={{ backgroundColor: 'var(--accent)' }}
                >
                  Save Meal
                </button>
              </div>
            </div>
          )}
        </div>
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
