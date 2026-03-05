import { useState, useRef } from 'react'
import { useUser } from '../hooks/useUser'
import { useCategories } from '../hooks/useCategories'
import { useRecipeTags } from '../hooks/useRecipes'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { parseRecipeFile, type ParsedRecipe } from '../lib/recipe-parser'

type ImportStage = 'idle' | 'preview' | 'importing' | 'done'

export default function ImportRecipes() {
  const { user } = useUser()
  const { data: categories = [] } = useCategories()
  const { data: recipeTags = [] } = useRecipeTags()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<ImportStage>('idle')
  const [parsedRecipes, setParsedRecipes] = useState<ParsedRecipe[]>([])

  const [importProgress, setImportProgress] = useState(0)
  const [importTotal, setImportTotal] = useState(0)
  const [importedCount, setImportedCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const text = await file.text()
    const recipes = parseRecipeFile(text)
    setParsedRecipes(recipes)
    setStage('preview')
    e.target.value = ''
  }

  const handleImport = async () => {
    if (!user || parsedRecipes.length === 0) return

    const homeCookingCat = categories.find((c) => c.name.toLowerCase() === 'home cooking')
    if (!homeCookingCat) {
      alert('Could not find "Home Cooking" category. Please create it first in Settings.')
      return
    }

    // Build tag name → id map
    const tagMap = new Map<string, string>()
    for (const t of recipeTags) {
      tagMap.set(t.name.toLowerCase(), t.id)
    }

    setStage('importing')
    setImportTotal(parsedRecipes.length)
    setImportProgress(0)
    setImportedCount(0)
    setFailedCount(0)

    let imported = 0
    let failed = 0

    for (let i = 0; i < parsedRecipes.length; i++) {
      const recipe = parsedRecipes[i]
      setImportProgress(i + 1)

      try {
        // Create the tagged item
        const { data: item, error } = await supabase
          .from('tagged_items')
          .insert({
            entry_id: null,
            category_id: homeCookingCat.id,
            user_id: user.id,
            name: recipe.name,
            ingredients: recipe.ingredients || null,
            instructions: recipe.instructions || null,
            rating: null,
          })
          .select()
          .single()

        if (error) {
          failed++
          setFailedCount(failed)
          console.error(`Failed to create recipe "${recipe.name}":`, error)
          continue
        }

        // Add recipe tags
        const tagIds = recipe.autoTags
          .map((name) => tagMap.get(name.toLowerCase()))
          .filter((id): id is string => !!id)

        if (tagIds.length > 0) {
          const junctionRows = tagIds.map((tagId) => ({
            tagged_item_id: item.id,
            recipe_tag_id: tagId,
          }))
          await supabase.from('tagged_item_recipe_tags').insert(junctionRows)
        }

        imported++
        setImportedCount(imported)
      } catch (err) {
        failed++
        setFailedCount(failed)
        console.error(`Error on "${recipe.name}":`, err)
      }
    }

    queryClient.invalidateQueries({ queryKey: ['home-cooking-recipes'] })
    queryClient.invalidateQueries({ queryKey: ['category-items'] })
    queryClient.invalidateQueries({ queryKey: ['category-counts'] })
    setStage('done')
  }

  const handleReset = () => {
    setStage('idle')
    setParsedRecipes([])
    setImportProgress(0)
    setImportTotal(0)
    setImportedCount(0)
    setFailedCount(0)
  }

  if (stage === 'idle') {
    return (
      <div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-2.5 rounded-lg text-sm font-medium border border-dashed cursor-pointer"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          Import Recipes from Text File
        </button>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Import recipes from the Untitled Book of Food text format
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.text,text/plain"
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>
    )
  }

  if (stage === 'preview') {
    return (
      <div
        className="rounded-xl border p-4 space-y-4"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
            Found {parsedRecipes.length} recipes
          </h3>
        </div>

        {/* Recipe preview list */}
        {parsedRecipes.length > 0 && (
          <div
            className="max-h-60 overflow-y-auto rounded-lg border divide-y"
            style={{ borderColor: 'var(--border-card)' }}
          >
            {parsedRecipes.map((recipe, i) => (
              <div key={i} className="px-3 py-2" style={{ borderColor: 'var(--border-divider)' }}>
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {recipe.name}
                </span>
                {recipe.autoTags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {recipe.autoTags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-muted)' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {recipe.ingredients && (
                  <span className="text-xs ml-2 block truncate" style={{ color: 'var(--text-secondary)' }}>
                    {recipe.ingredients.slice(0, 60).replace(/\n/g, ', ')}
                    {recipe.ingredients.length > 60 ? '...' : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleImport}
            disabled={parsedRecipes.length === 0}
            className="flex-1 py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            Import All ({parsedRecipes.length})
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2.5 rounded-lg text-sm cursor-pointer"
            style={{ color: 'var(--text-secondary)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (stage === 'importing') {
    const pct = importTotal > 0 ? Math.round((importProgress / importTotal) * 100) : 0

    return (
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Importing recipes...
        </h3>
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-card)' }}>
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ backgroundColor: 'var(--accent)', width: `${pct}%` }}
          />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {importProgress} of {importTotal} ({pct}%)
        </p>
        <div className="text-xs space-y-0.5" style={{ color: 'var(--text-muted)' }}>
          <p>Imported: {importedCount}</p>
          {failedCount > 0 && <p style={{ color: '#E5534B' }}>Failed: {failedCount}</p>}
        </div>
      </div>
    )
  }

  if (stage === 'done') {
    return (
      <div
        className="rounded-xl border p-4 space-y-3"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Import complete!
        </h3>
        <div className="text-sm space-y-1" style={{ color: 'var(--text-secondary)' }}>
          <p>Successfully imported {importedCount} recipes</p>
          {failedCount > 0 && <p style={{ color: '#E5534B' }}>{failedCount} recipes failed</p>}
        </div>
        <button
          onClick={handleReset}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          Done
        </button>
      </div>
    )
  }

  return null
}
