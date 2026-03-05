import { useNavigate } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { useOnThisDay } from '../hooks/useEntries'
import { getTodayString, truncateText, getStorageUrl } from '../lib/helpers'
import type { JournalEntry } from '../types'

export default function OnThisDay() {
  const navigate = useNavigate()
  const today = getTodayString()
  const todayDate = parse(today, 'yyyy-MM-dd', new Date())
  const { data: memories = [], isLoading } = useOnThisDay()

  return (
    <div className="pb-24">
      <h1
        className="text-2xl mb-1"
        style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
      >
        On This Day
      </h1>
      <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
        {format(todayDate, 'MMMM d')}
      </p>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
          ))}
        </div>
      ) : memories.length > 0 ? (
        <div className="space-y-6">
          {memories.map((entry) => (
            <MemoryCard
              key={entry.id}
              entry={entry}
              onClick={() => navigate(`/journal/${entry.entry_date}`)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🌱</div>
          <h3 className="text-lg font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
            No memories yet for this date
          </h3>
          <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Keep writing! Future you will love looking back on today's adventures.
          </p>
        </div>
      )}
    </div>
  )
}

function MemoryCard({ entry, onClick }: { entry: JournalEntry; onClick: () => void }) {
  const date = parse(entry.entry_date, 'yyyy-MM-dd', new Date())
  const year = format(date, 'yyyy')
  const yearsAgo = new Date().getFullYear() - date.getFullYear()
  const sections = entry.sections ?? []
  const photos = entry.photos ?? []
  const tags = entry.tagged_items ?? []
  const preview = sections[0]?.content ? truncateText(sections[0].content, 200) : ''

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-xl border overflow-hidden transition-all duration-150 hover:shadow-md cursor-pointer"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-card)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Year badge */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-2">
        <span
          className="text-lg font-bold"
          style={{ fontFamily: "'Playfair Display', serif", color: 'var(--accent)' }}
        >
          {year}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {yearsAgo} year{yearsAgo !== 1 ? 's' : ''} ago
        </span>
      </div>

      {/* Photos strip */}
      {photos.length > 0 && (
        <div className="flex gap-1 px-4 pb-3 overflow-x-auto photo-scroll">
          {photos.slice(0, 4).map((photo) => (
            <img
              key={photo.id}
              src={getStorageUrl(photo.storage_path)}
              alt=""
              className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {/* Content preview */}
      {preview && (
        <div className="px-4 pb-3">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-primary)' }}>
            {preview}
          </p>
        </div>
      )}

      {/* Tags */}
      {tags.length > 0 && (
        <div className="px-4 pb-4 flex flex-wrap gap-1.5">
          {tags.slice(0, 4).map((tag) => (
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
    </button>
  )
}
