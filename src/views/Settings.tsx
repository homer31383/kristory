import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'
import { useUser } from '../hooks/useUser'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories'
import { useTrips } from '../hooks/useTrips'
import { useBabyProfile, useUpdateBabyProfile } from '../hooks/useBaby'
import { exportJSON, exportPDF } from '../lib/export'
import ImportJournal from '../components/ImportJournal'
import ImportRecipes from '../components/ImportRecipes'
import type { ThemeMode, Category } from '../types'

export default function Settings() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { theme, setTheme } = useTheme()
  const { data: categories = [] } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()
  const { data: trips = [] } = useTrips()
  const { data: babyProfile } = useBabyProfile()
  const updateBabyProfile = useUpdateBabyProfile()

  const [showAddCategory, setShowAddCategory] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatEmoji, setNewCatEmoji] = useState('')
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatEmoji, setEditCatEmoji] = useState('')

  const [exportFormat, setExportFormat] = useState<'json' | 'pdf'>('json')
  const [exporting, setExporting] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<string | null>(null)

  // Baby profile editing
  const [editingBaby, setEditingBaby] = useState(false)
  const [babyName, setBabyName] = useState('')
  const [babyDueDate, setBabyDueDate] = useState('')
  const [babyBirthDate, setBabyBirthDate] = useState('')
  const [babyWeight, setBabyWeight] = useState('')
  const [babyLength, setBabyLength] = useState('')
  const [showBabyWidget, setShowBabyWidget] = useState(() => localStorage.getItem('kristory-baby-widget-hidden') !== 'true')

  const startEditBaby = () => {
    setBabyName(babyProfile?.name ?? '')
    setBabyDueDate(babyProfile?.due_date ?? '')
    setBabyBirthDate(babyProfile?.birth_date ?? '')
    setBabyWeight(babyProfile?.birth_weight ?? '')
    setBabyLength(babyProfile?.birth_length ?? '')
    setEditingBaby(true)
  }

  const saveBaby = async () => {
    if (!babyProfile) return
    await updateBabyProfile.mutateAsync({
      id: babyProfile.id,
      name: babyName.trim() || null,
      due_date: babyDueDate || null,
      birth_date: babyBirthDate || null,
      birth_weight: babyWeight.trim() || null,
      birth_length: babyLength.trim() || null,
    })
    setEditingBaby(false)
  }

  const toggleBabyWidget = () => {
    const newVal = !showBabyWidget
    setShowBabyWidget(newVal)
    if (newVal) {
      localStorage.removeItem('kristory-baby-widget-hidden')
    } else {
      localStorage.setItem('kristory-baby-widget-hidden', 'true')
    }
  }

  const handleAddCategory = async () => {
    if (!newCatName.trim()) return
    await createCategory.mutateAsync({
      name: newCatName.trim(),
      emoji: newCatEmoji.trim() || '📌',
      userId: user!.id,
    })
    setNewCatName('')
    setNewCatEmoji('')
    setShowAddCategory(false)
  }

  const handleUpdateCategory = async () => {
    if (!editingCat || !editCatName.trim()) return
    await updateCategory.mutateAsync({
      id: editingCat.id,
      name: editCatName.trim(),
      emoji: editCatEmoji.trim() || '📌',
    })
    setEditingCat(null)
  }

  const handleDeleteCategory = async (cat: Category) => {
    if (cat.is_default) return
    if (!confirm(`Delete "${cat.name}" category?`)) return
    await deleteCategory.mutateAsync(cat.id)
  }

  const startEditing = (cat: Category) => {
    setEditingCat(cat)
    setEditCatName(cat.name)
    setEditCatEmoji(cat.emoji ?? '')
  }

  const handleCheckForUpdates = async () => {
    setCheckingUpdate(true)
    setUpdateStatus(null)
    try {
      const registration = await navigator.serviceWorker?.getRegistration()
      if (!registration) {
        setUpdateStatus('No service worker found.')
        setCheckingUpdate(false)
        return
      }
      await registration.update()
      // If a new SW was found and is waiting/installing, reload to activate it
      if (registration.waiting || registration.installing) {
        setUpdateStatus('Update found! Reloading...')
        setTimeout(() => window.location.reload(), 500)
      } else {
        setUpdateStatus('Already up to date.')
        setCheckingUpdate(false)
      }
    } catch (err) {
      console.error('Update check failed:', err)
      setUpdateStatus('Update check failed.')
      setCheckingUpdate(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      if (exportFormat === 'json') {
        await exportJSON()
      } else {
        await exportPDF()
      }
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please try again.')
    }
    setExporting(false)
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer"
          style={{ color: 'var(--text-secondary)' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1
          className="text-2xl"
          style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
        >
          Settings
        </h1>
      </div>

      {/* Theme */}
      <Section title="Appearance">
        <div className="flex gap-2">
          {(['light', 'dark', 'system'] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer capitalize"
              style={{
                backgroundColor: theme === mode ? 'var(--accent)' : 'var(--bg-card)',
                color: theme === mode ? 'white' : 'var(--text-secondary)',
                border: theme === mode ? 'none' : '1px solid var(--border-card)',
              }}
            >
              {mode === 'system' ? '⚙️ System' : mode === 'light' ? '☀️ Light' : '🌙 Dark'}
            </button>
          ))}
        </div>
      </Section>

      {/* Categories */}
      <Section title="Categories">
        <div className="space-y-2">
          {categories.map((cat) => (
            <div key={cat.id}>
              {editingCat?.id === cat.id ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editCatEmoji}
                    onChange={(e) => setEditCatEmoji(e.target.value)}
                    className="w-14 rounded-lg border p-2 text-center text-sm"
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                  />
                  <input
                    type="text"
                    value={editCatName}
                    onChange={(e) => setEditCatName(e.target.value)}
                    className="flex-1 rounded-lg border p-2 text-sm"
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                  />
                  <button
                    onClick={handleUpdateCategory}
                    className="px-3 rounded-lg text-sm font-medium text-white cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingCat(null)}
                    className="px-2 text-sm cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div
                  className="flex items-center gap-3 rounded-lg border p-3"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                >
                  <span className="text-lg">{cat.emoji}</span>
                  <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {cat.name}
                  </span>
                  <button
                    onClick={() => startEditing(cat)}
                    className="text-xs cursor-pointer"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    Edit
                  </button>
                  {!cat.is_default && (
                    <button
                      onClick={() => handleDeleteCategory(cat)}
                      className="text-xs cursor-pointer"
                      style={{ color: '#E5534B' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {showAddCategory ? (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="🎯"
                value={newCatEmoji}
                onChange={(e) => setNewCatEmoji(e.target.value)}
                className="w-14 rounded-lg border p-2 text-center text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
              <input
                type="text"
                placeholder="Category name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="flex-1 rounded-lg border p-2 text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
              <button
                onClick={handleAddCategory}
                className="px-3 rounded-lg text-sm font-medium text-white cursor-pointer"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                Add
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddCategory(true)}
              className="w-full py-2.5 rounded-lg text-sm font-medium border border-dashed cursor-pointer"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              + Add Category
            </button>
          )}
        </div>
      </Section>

      {/* Trips */}
      <Section title="Trips">
        {trips.length > 0 && (
          <div className="space-y-2 mb-3">
            {trips.map((trip) => (
              <button
                key={trip.id}
                onClick={() => navigate(`/trips/${trip.id}`)}
                className="w-full text-left rounded-lg border p-3 cursor-pointer transition-colors duration-150"
                style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
              >
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  ✈️ {trip.title}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {trip.start_date} — {trip.end_date}
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          onClick={() => navigate('/trips/new')}
          className="w-full py-2.5 rounded-lg text-sm font-medium border border-dashed cursor-pointer"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          + Create Trip
        </button>
      </Section>

      {/* Baby Profile */}
      <Section title="Baby">
        {editingBaby ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
              <input
                type="text"
                value={babyName}
                onChange={(e) => setBabyName(e.target.value)}
                placeholder="Baby's name"
                className="w-full rounded-lg border p-2.5 text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Due Date</label>
                <input
                  type="date"
                  value={babyDueDate}
                  onChange={(e) => setBabyDueDate(e.target.value)}
                  className="w-full rounded-lg border p-2.5 text-sm"
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Birth Date</label>
                <input
                  type="date"
                  value={babyBirthDate}
                  onChange={(e) => setBabyBirthDate(e.target.value)}
                  className="w-full rounded-lg border p-2.5 text-sm"
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Weight</label>
                <input
                  type="text"
                  value={babyWeight}
                  onChange={(e) => setBabyWeight(e.target.value)}
                  placeholder="e.g. 7 lbs 4 oz"
                  className="w-full rounded-lg border p-2.5 text-sm"
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Length</label>
                <input
                  type="text"
                  value={babyLength}
                  onChange={(e) => setBabyLength(e.target.value)}
                  placeholder="e.g. 20 inches"
                  className="w-full rounded-lg border p-2.5 text-sm"
                  style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditingBaby(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={saveBaby}
                disabled={updateBabyProfile.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {updateBabyProfile.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="rounded-lg border p-3"
              style={{ backgroundColor: '#FFF8E7', borderColor: '#F0C987' }}
            >
              <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {babyProfile?.name || 'Not set'}
              </div>
              {babyProfile?.due_date && (
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Due: {babyProfile.due_date}
                </div>
              )}
              {babyProfile?.birth_date && (
                <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                  Born: {babyProfile.birth_date}
                  {babyProfile.birth_weight && ` · ${babyProfile.birth_weight}`}
                  {babyProfile.birth_length && ` · ${babyProfile.birth_length}`}
                </div>
              )}
            </div>
            <button
              onClick={startEditBaby}
              className="w-full py-2.5 rounded-lg text-sm font-medium border border-dashed cursor-pointer"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              Edit Baby Profile
            </button>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Show countdown on Journal</span>
              <button
                onClick={toggleBabyWidget}
                className="w-10 h-6 rounded-full relative cursor-pointer transition-colors duration-200"
                style={{ backgroundColor: showBabyWidget ? 'var(--accent)' : 'var(--border-card)' }}
              >
                <div
                  className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all duration-200"
                  style={{ left: showBabyWidget ? '22px' : '2px' }}
                />
              </button>
            </div>
          </div>
        )}
      </Section>

      {/* Import */}
      <Section title="Import Journal">
        <ImportJournal />
      </Section>

      <Section title="Import Recipes">
        <ImportRecipes />
      </Section>

      {/* Export */}
      <Section title="Export Data">
        <div className="space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setExportFormat('json')}
              className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{
                backgroundColor: exportFormat === 'json' ? 'var(--accent)' : 'var(--bg-card)',
                color: exportFormat === 'json' ? 'white' : 'var(--text-secondary)',
                border: exportFormat === 'json' ? 'none' : '1px solid var(--border-card)',
              }}
            >
              JSON
            </button>
            <button
              onClick={() => setExportFormat('pdf')}
              className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{
                backgroundColor: exportFormat === 'pdf' ? 'var(--accent)' : 'var(--bg-card)',
                color: exportFormat === 'pdf' ? 'white' : 'var(--text-secondary)',
                border: exportFormat === 'pdf' ? 'none' : '1px solid var(--border-card)',
              }}
            >
              PDF
            </button>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {exporting ? 'Exporting...' : `Export as ${exportFormat.toUpperCase()}`}
          </button>
        </div>
      </Section>

      {/* App Updates */}
      <Section title="App Updates">
        <button
          onClick={handleCheckForUpdates}
          disabled={checkingUpdate}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          {checkingUpdate ? 'Checking...' : 'Check for Updates'}
        </button>
        {updateStatus && (
          <p className="text-xs text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
            {updateStatus}
          </p>
        )}
      </Section>

      {/* About */}
      <Section title="About">
        <div className="text-center py-4">
          <h3
            className="text-lg mb-1"
            style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
          >
            The Kristory
          </h3>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Version 1.0.0
          </p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-secondary)' }}>
            Made with ❤️ by Chris & Krista
          </p>
        </div>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h2>
      {children}
    </div>
  )
}
