/**
 * The Library — personal cultural / experience log surface.
 *
 * Filename is still Explore.tsx and route is still /explore for back-compat
 * (the rest of the app links here by that path). The label and content are
 * now the Library — Hall of Fame, Currently Reading, and per-Library-category
 * horizontal previews.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { useSearchEntries } from '../hooks/useEntries'
import { useDebouncedValue } from '../hooks/useDebounce'
import { truncateText, getStorageUrl } from '../lib/helpers'
import { useHallOfFame, useCurrentlyReading, useLibraryCategoryPreviews } from '../hooks/useLibrary'
import { useCreateCategory } from '../hooks/useCategories'
import { useUser } from '../hooks/useUser'
import {
  BOOKS_CATEGORY_NAME,
  DEFAULT_LIBRARY_CATEGORIES,
  matchDefaultSlot,
  type DefaultCategory,
} from '../lib/constants'
import type { Category, JournalEntry, TaggedItem } from '../types'

export default function Library() {
  const navigate = useNavigate()
  const { user } = useUser()
  const createCategory = useCreateCategory()
  const [creatingName, setCreatingName] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const debouncedQuery = useDebouncedValue(searchInput, 300)
  const { data: results = [], isLoading: searching } = useSearchEntries(debouncedQuery)
  const { data: hallOfFame = [] } = useHallOfFame()
  const { data: currentlyReading = [] } = useCurrentlyReading()
  const { data: previews = [] } = useLibraryCategoryPreviews()

  const isSearching = searchInput.trim().length > 0

  /**
   * Resolve a default Library slot to a real category, creating it lazily
   * if it doesn't exist yet, then navigate. Books has its own surface;
   * everything else uses the generic /lists/:id detail page.
   */
  async function openSlot(slot: DefaultCategory, match: Category | null) {
    const isBooks = slot.name === BOOKS_CATEGORY_NAME
    if (match) {
      navigate(isBooks ? '/library/books' : `/lists/${match.id}`)
      return
    }
    if (!user) return
    setCreatingName(slot.name)
    try {
      const created = await createCategory.mutateAsync({
        name: slot.name,
        emoji: slot.emoji,
        userId: user.id,
      })
      navigate(isBooks ? '/library/books' : `/lists/${created.id}`)
    } catch {
      // The category-creation mutation surfaces errors via toasts elsewhere;
      // we don't navigate on failure.
    } finally {
      setCreatingName(null)
    }
  }

  return (
    <div className="pb-24">
      <h1
        className="text-2xl mb-4"
        style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
      >
        The Library
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

      {isSearching ? (
        <SearchResults
          searching={searching}
          query={debouncedQuery}
          results={results}
          onSelect={(date) => navigate(`/journal/${date}`)}
        />
      ) : (
        <div className="space-y-8">
          {hallOfFame.length > 0 && (
            <HallOfFameRow
              items={hallOfFame}
              onSelect={(item) => navigateToItem(navigate, item)}
            />
          )}

          {currentlyReading.length > 0 && (
            <CategoryRow
              title="Currently Reading"
              items={currentlyReading}
              onSelect={(item) => navigateToItem(navigate, item)}
              onSeeAll={() => navigate('/library/books?status=reading')}
              compact
            />
          )}

          <section>
            <h2
              className="text-base mb-3"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              Categories
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {DEFAULT_LIBRARY_CATEGORIES.map((slot) => {
                // Match by canonical name or any alias so a legacy "Music"
                // still fills the new "Music/Concerts" slot.
                const matched = matchDefaultSlot(
                  slot,
                  previews.map((p) => p.category),
                )
                const matchedSlot = matched
                  ? previews.find((p) => p.category.id === matched.id) ?? null
                  : null
                const count = matchedSlot?.count ?? 0
                const items = matchedSlot?.items ?? []
                // Prefer the user's chosen emoji if they renamed the category,
                // otherwise fall back to the canonical default emoji.
                const emoji = matched?.emoji ?? slot.emoji
                const displayName = matched?.name ?? slot.name
                const busy = creatingName === slot.name
                return (
                  <LibraryCategoryCard
                    key={slot.name}
                    emoji={emoji}
                    name={displayName}
                    count={count}
                    previewItems={items}
                    busy={busy}
                    onClick={() => openSlot(slot, matched ?? null)}
                  />
                )
              })}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

// ─── Tappable category card with text preview of recent items ─────────
function LibraryCategoryCard({
  emoji,
  name,
  count,
  previewItems,
  busy,
  onClick,
}: {
  emoji: string
  name: string
  count: number
  previewItems: TaggedItem[]
  busy?: boolean
  onClick: () => void
}) {
  const previews = previewItems.slice(0, 3)
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-xl border p-4 text-left transition-all duration-150 hover:shadow-md cursor-pointer flex flex-col"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-card)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        minHeight: '8.5rem',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="text-2xl leading-none">{emoji}</div>
        <div
          className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-muted)' }}
        >
          {busy ? '…' : count}
        </div>
      </div>
      <div className="text-sm font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
        {name}
      </div>
      <ul className="space-y-0.5 flex-1">
        {previews.length === 0 ? (
          <li className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>
            {count === 0 ? '0 items' : 'Empty'}
          </li>
        ) : (
          previews.map((it) => (
            <li
              key={it.id}
              className="text-[11px] truncate leading-snug"
              style={{ color: 'var(--text-secondary)' }}
            >
              {it.name}
            </li>
          ))
        )}
      </ul>
      {count > previews.length && (
        <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
          + {count - previews.length} more
        </div>
      )}
    </button>
  )
}

function navigateToItem(navigate: ReturnType<typeof useNavigate>, item: TaggedItem) {
  const isBook = item.category?.name?.toLowerCase() === BOOKS_CATEGORY_NAME.toLowerCase()
  if (isBook) navigate(`/library/books/${item.id}`)
  else navigate(`/items/${item.id}`)
}

// ─── Hall of Fame row ──────────────────────────────────────────────────
function HallOfFameRow({
  items,
  onSelect,
}: {
  items: TaggedItem[]
  onSelect: (item: TaggedItem) => void
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className="text-lg"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700,
            color: 'var(--text-primary)',
          }}
        >
          🏆 Hall of Fame
        </h2>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {items.length}/20
        </span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 photo-scroll">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="flex-shrink-0 w-28 text-left cursor-pointer"
          >
            <Cover item={item} sizeClass="w-28 h-40" highlight />
            <div
              className="text-xs mt-2 font-medium leading-tight line-clamp-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {item.name}
            </div>
            {item.author && (
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {item.author}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

// ─── Generic horizontal category row ───────────────────────────────────
function CategoryRow({
  title,
  items,
  onSelect,
  onSeeAll,
  compact,
}: {
  title: string
  items: TaggedItem[]
  onSelect: (item: TaggedItem) => void
  onSeeAll: () => void
  compact?: boolean
}) {
  if (items.length === 0) return null
  const w = compact ? 'w-24 h-36' : 'w-24 h-36'
  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className="text-base"
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          {title}
        </h2>
        <button
          onClick={onSeeAll}
          className="text-xs font-medium cursor-pointer"
          style={{ color: 'var(--accent)' }}
        >
          See all →
        </button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 photo-scroll">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className="flex-shrink-0 w-24 text-left cursor-pointer"
          >
            <Cover item={item} sizeClass={w} />
            <div
              className="text-xs mt-2 font-medium leading-tight line-clamp-2"
              style={{ color: 'var(--text-primary)' }}
            >
              {item.name}
            </div>
            {item.author && (
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {item.author}
              </div>
            )}
          </button>
        ))}
      </div>
    </section>
  )
}

// ─── Cover thumbnail (image when available, fallback card) ─────────────
function Cover({
  item,
  sizeClass,
  highlight,
}: {
  item: TaggedItem
  sizeClass: string
  highlight?: boolean
}) {
  const border = highlight ? '2px solid #C9A24B' : '1px solid var(--border-card)'
  if (item.cover_url) {
    return (
      <div
        className={`${sizeClass} rounded-lg overflow-hidden`}
        style={{ border, backgroundColor: 'var(--bg-card)' }}
      >
        <img
          src={item.cover_url}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
        />
      </div>
    )
  }
  // Fallback: emoji + first letter card
  return (
    <div
      className={`${sizeClass} rounded-lg flex flex-col items-center justify-center text-center px-2`}
      style={{ border, backgroundColor: 'var(--bg-card)' }}
    >
      <div className="text-2xl mb-1">{item.category?.emoji ?? '📄'}</div>
      <div
        className="text-[11px] font-medium leading-tight line-clamp-3"
        style={{ color: 'var(--text-secondary)' }}
      >
        {item.name}
      </div>
    </div>
  )
}

// ─── Search results (entries) ──────────────────────────────────────────
function SearchResults({
  searching,
  query,
  results,
  onSelect,
}: {
  searching: boolean
  query: string
  results: JournalEntry[]
  onSelect: (date: string) => void
}) {
  if (searching) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-xl animate-pulse"
            style={{ backgroundColor: 'var(--bg-card)' }}
          />
        ))}
      </div>
    )
  }
  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-3xl mb-2">🔍</div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          No results found for "{query}"
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: 'var(--text-muted)' }}
      >
        {results.length} result{results.length !== 1 ? 's' : ''}
      </p>
      {results.map((entry) => (
        <SearchResultCard
          key={entry.id}
          entry={entry}
          onClick={() => onSelect(entry.entry_date)}
        />
      ))}
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
                  style={{
                    backgroundColor: 'var(--bg-page)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  {tag.category?.emoji} {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
        {firstPhoto && (
          <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
            <img
              src={getStorageUrl(firstPhoto.storage_path)}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        )}
      </div>
    </button>
  )
}
