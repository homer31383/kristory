import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, parse } from 'date-fns'
import { useItem, useUpdateItem, useDeleteItem, useUsers } from '../hooks/useItems'

export default function ItemDetail() {
  const { itemId } = useParams<{ itemId: string }>()
  const navigate = useNavigate()
  const { data: item, isLoading } = useItem(itemId ?? '')
  const updateItem = useUpdateItem()
  const deleteItem = useDeleteItem()
  const [editing, setEditing] = useState(false)

  if (!itemId) return null

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
        <div className="h-32 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="text-center py-16">
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Item not found.</p>
      </div>
    )
  }

  // If this is a Home Cooking item, redirect to recipe detail
  const isHomeCooking = item.category?.name?.toLowerCase() === 'home cooking'
  if (isHomeCooking) {
    navigate(`/recipes/${itemId}`, { replace: true })
    return null
  }

  const entryDate = item.entry?.entry_date
  const userName = item.user?.name
  const displayDate = item.item_date ?? entryDate

  const handleRatingChange = async (newRating: number) => {
    const rating = item.rating === newRating ? null : newRating
    await updateItem.mutateAsync({ id: itemId, rating })
  }

  const handleDelete = async () => {
    if (!confirm(`Delete "${item.name}"?`)) return
    await deleteItem.mutateAsync(itemId)
    navigate(-1)
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
          <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>
            {item.category?.emoji} {item.category?.name}
          </div>
          <h1
            className="text-xl"
            style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
          >
            {item.name}
          </h1>
        </div>
      </div>

      {/* Participants */}
      {item.participants && item.participants.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          {item.participants.map((p) => {
            const isChris = p.user.name.toLowerCase() === 'chris'
            return (
              <div
                key={p.user.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: isChris ? 'var(--chris-color)' : 'var(--krista-color)' }}
              >
                {p.user.name}
              </div>
            )
          })}
        </div>
      )}

      {/* Rating */}
      <div className="flex gap-1 mb-4">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => handleRatingChange(star)}
            className="w-8 h-8 flex items-center justify-center text-lg cursor-pointer"
          >
            <span style={{ color: item.rating && star <= item.rating ? '#F59E0B' : 'var(--border-card)' }}>
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

      {/* Details card */}
      <div
        className="rounded-xl border p-4 space-y-3 mb-5"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
      >
        {displayDate && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>
              Date
            </div>
            <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {format(parse(displayDate, 'yyyy-MM-dd', new Date()), 'MMMM d, yyyy')}
            </div>
          </div>
        )}

        {item.location_name && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider mb-0.5" style={{ color: 'var(--text-muted)' }}>
              Location
            </div>
            <div className="text-sm" style={{ color: 'var(--text-primary)' }}>
              {item.location_name}
            </div>
          </div>
        )}

        {!displayDate && !item.location_name && (
          <div className="text-sm text-center py-2" style={{ color: 'var(--text-muted)' }}>
            No additional details
          </div>
        )}
      </div>

      {/* Journal entry link */}
      {entryDate && (
        <button
          onClick={() => navigate(`/journal/${entryDate}`)}
          className="w-full text-left rounded-xl border p-3.5 cursor-pointer transition-all duration-150 hover:shadow-md mb-5"
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

      {/* Edit / Delete */}
      <div className="flex gap-2">
        <button
          onClick={() => setEditing(true)}
          className="flex-1 py-2.5 rounded-lg text-sm font-medium border cursor-pointer"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          Edit
        </button>
        <button
          onClick={handleDelete}
          className="px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer"
          style={{ color: '#E5534B' }}
        >
          Delete
        </button>
      </div>

      {/* Edit sheet */}
      {editing && (
        <EditItemSheet
          item={item}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  )
}

// ─── Inline edit sheet ─────────────────────────────────────────────────

import type { TaggedItem } from '../types'

function EditItemSheet({ item, onClose }: { item: TaggedItem; onClose: () => void }) {
  const updateItem = useUpdateItem()
  const { data: allUsers = [] } = useUsers()
  const [name, setName] = useState(item.name)
  const [rating, setRating] = useState<number | null>(item.rating)
  const [locationName, setLocationName] = useState(item.location_name ?? '')
  const [itemDate, setItemDate] = useState(item.item_date ?? '')
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(
    () => new Set(item.participants?.map((p) => p.user.id) ?? [])
  )
  const [saving, setSaving] = useState(false)

  const toggleParticipant = (userId: string) => {
    setSelectedParticipants((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateItem.mutateAsync({
        id: item.id,
        name: name.trim(),
        rating,
        locationName: locationName.trim() || null,
        itemDate: itemDate || null,
        participantIds: [...selectedParticipants],
      })
      onClose()
    } catch (err) {
      console.error('Failed to update item:', err)
    }
    setSaving(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
        style={{ backgroundColor: 'var(--bg-card)', animation: 'slideUp 200ms ease' }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Edit Item
          </h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full cursor-pointer"
            style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[10px] border p-3 text-sm"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }} />
        </div>

        {/* Who? (Participants) */}
        {allUsers.length > 0 && (
          <div className="mb-4">
            <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Who?</label>
            <div className="flex gap-2">
              {allUsers.map((u) => {
                const isSelected = selectedParticipants.has(u.id)
                const isChris = u.name.toLowerCase() === 'chris'
                const color = isChris ? 'var(--chris-color)' : 'var(--krista-color)'
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleParticipant(u.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium cursor-pointer transition-all duration-150"
                    style={{
                      backgroundColor: isSelected ? color : 'var(--bg-page)',
                      color: isSelected ? 'white' : 'var(--text-secondary)',
                      border: isSelected ? 'none' : '1px solid var(--border-card)',
                    }}
                  >
                    {u.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Rating</label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button key={star} type="button" onClick={() => setRating(rating === star ? null : star)}
                className="w-10 h-10 flex items-center justify-center text-xl cursor-pointer">
                {rating !== null && star <= rating ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Location</label>
          <input type="text" placeholder="Place name..." value={locationName} onChange={(e) => setLocationName(e.target.value)}
            className="w-full rounded-[10px] border p-3 text-sm"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }} />
        </div>

        <div className="mb-6">
          <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-muted)' }}>Date</label>
          <input type="date" value={itemDate} onChange={(e) => setItemDate(e.target.value)}
            className="w-full rounded-[10px] border p-3 text-sm"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }} />
        </div>

        <button onClick={handleSave} disabled={!name.trim() || saving}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}>
          {saving ? 'Saving...' : 'Save Changes'}
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
