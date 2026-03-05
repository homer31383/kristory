import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { useSearchEntries } from '../hooks/useEntries'
import { useCategoryCounts } from '../hooks/useCategories'
import { useDebouncedValue } from '../hooks/useDebounce'
import { truncateText, getStorageUrl } from '../lib/helpers'
import type { JournalEntry } from '../types'

export default function Explore() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')
  const debouncedQuery = useDebouncedValue(searchInput, 300)
  const { data: results = [], isLoading: searching } = useSearchEntries(debouncedQuery)
  const { data: categoryCounts = [] } = useCategoryCounts()

  const isSearching = searchInput.trim().length > 0

  return (
    <div className="pb-24">
      <h1
        className="text-2xl mb-4"
        style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
      >
        Explore
      </h1>

      {/* Search */}
      <div className="relative mb-6">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
          style={{ color: 'var(--text-muted)' }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <circle cx="11" cy="11" r="8" />
          <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input
          type="text"
          placeholder="Search entries, items..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="w-full rounded-xl border py-3 pl-10 pr-4 text-sm"
          style={{
            backgroundColor: 'var(--input-bg)',
            borderColor: 'var(--border-card)',
            color: 'var(--text-primary)',
          }}
        />
        {searchInput && (
          <button
            onClick={() => setSearchInput('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-xs cursor-pointer"
            style={{ color: 'var(--text-muted)' }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Search Results */}
      {isSearching ? (
        <div>
          {searching ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {results.length} result{results.length !== 1 ? 's' : ''}
              </p>
              {results.map((entry) => (
                <SearchResultCard key={entry.id} entry={entry} onClick={() => navigate(`/journal/${entry.entry_date}`)} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">🔍</div>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                No results found for "{debouncedQuery}"
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Browse by Category */
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Browse by Category
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {categoryCounts.map((cat) => (
              <button
                key={cat.id}
                onClick={() => navigate(`/lists/${cat.id}`)}
                className="rounded-xl border p-4 text-left transition-all duration-150 hover:shadow-md cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-card)',
                  borderColor: 'var(--border-card)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                <div className="text-2xl mb-1">{cat.emoji}</div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {cat.name}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {cat.count} item{cat.count !== 1 ? 's' : ''}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SearchResultCard({ entry, onClick }: { entry: JournalEntry; onClick: () => void }) {
  const date = parse(entry.entry_date, 'yyyy-MM-dd', new Date())
  const dateLabel = format(date, 'MMM d, yyyy')
  const firstSection = entry.sections?.[0]
  const preview = firstSection?.content ? truncateText(firstSection.content, 150) : ''
  const firstPhoto = entry.photos?.[0]
  const tags = entry.tagged_items ?? []

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
      <div className="flex gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            {dateLabel}
          </div>
          {preview && (
            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
              {preview}
            </p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.slice(0, 3).map((tag) => (
                <span
                  key={tag.id}
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-secondary)' }}
                >
                  {tag.category?.emoji} {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
        {firstPhoto && (
          <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
            <img src={getStorageUrl(firstPhoto.storage_path)} alt="" className="w-full h-full object-cover" loading="lazy" />
          </div>
        )}
      </div>
    </button>
  )
}
