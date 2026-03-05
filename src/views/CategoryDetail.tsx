import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { useCategoryWithItems, useCategories } from '../hooks/useCategories'
import AddStandaloneItemSheet from '../components/AddStandaloneItemSheet'

type SortMode = 'recent' | 'rating' | 'alpha'

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
  if (categoryName.endsWith('s') && categoryName.length > 3) return categoryName.slice(0, -1)
  return categoryName
}

export default function CategoryDetail() {
  const { categoryId } = useParams<{ categoryId: string }>()
  const navigate = useNavigate()
  const [sort, setSort] = useState<SortMode>('recent')
  const [showAdd, setShowAdd] = useState(false)
  const { data: categories = [] } = useCategories()
  const { data: items = [], isLoading } = useCategoryWithItems(categoryId ?? '', sort)

  const category = categories.find((c) => c.id === categoryId)

  // Redirect Home Cooking to the Book of Food view
  useEffect(() => {
    if (category && category.name.toLowerCase() === 'home cooking') {
      navigate('/book-of-food', { replace: true })
    }
  }, [category, navigate])

  if (!categoryId) return null

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
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
            {category?.emoji} {category?.name}
          </h1>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {items.length} item{items.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Add button */}
      {category && (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full py-2.5 mb-4 rounded-lg text-sm font-medium border border-dashed cursor-pointer"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          + Add {getSingularLabel(category.name)}
        </button>
      )}

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
      </div>

      {/* Items list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-2">
          {items.map((item) => {
            const entryDate = item.entry?.entry_date
            const userName = item.user?.name
            const displayDate = item.item_date ?? entryDate

            return (
              <button
                key={item.id}
                onClick={() => navigate(`/items/${item.id}`)}
                className="w-full text-left flex items-center gap-3 rounded-xl border p-3.5 transition-all duration-150 hover:shadow-md cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-card)',
                }}
              >
                {/* Participant dots */}
                {item.participants && item.participants.length > 0 && (
                  <div className="flex -space-x-1 flex-shrink-0">
                    {item.participants.map((p) => {
                      const isChris = p.user.name.toLowerCase() === 'chris'
                      return (
                        <div
                          key={p.user.id}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold text-white border-2"
                          style={{
                            backgroundColor: isChris ? 'var(--chris-color)' : 'var(--krista-color)',
                            borderColor: 'var(--bg-card)',
                          }}
                        >
                          {p.user.name[0]}
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                    {item.name}
                  </div>
                  <div className="text-xs flex gap-2" style={{ color: 'var(--text-secondary)' }}>
                    {displayDate ? (
                      <span>{format(parse(displayDate, 'yyyy-MM-dd', new Date()), 'MMM d, yyyy')}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>No date</span>
                    )}
                    {userName && <span>· {userName}</span>}
                    {item.location_name && <span>· {item.location_name}</span>}
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
              </button>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">{category?.emoji}</div>
          <h3 className="text-lg font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            No items yet
          </h3>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Add your first {category?.name?.toLowerCase()} item or tag one in a journal entry!
          </p>
        </div>
      )}

      {/* Add Item Sheet */}
      {showAdd && category && (
        <AddStandaloneItemSheet
          category={category}
          onClose={() => setShowAdd(false)}
          onCreated={(itemId) => navigate(`/items/${itemId}`)}
        />
      )}
    </div>
  )
}
