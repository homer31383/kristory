import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useTheme } from '../hooks/useTheme'
import { useUser } from '../hooks/useUser'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '../hooks/useCategories'
import { useTrips } from '../hooks/useTrips'
import { useBabyProfile, useUpdateBabyProfile } from '../hooks/useBaby'
import { useUpdateFamilyPin } from '../hooks/useFamilyFeed'
import { useAppPin, useSetAppPin, useRemoveAppPin } from '../hooks/useAppPin'
import { useBackupSettings, useUpdateBackupReminder } from '../hooks/useBackup'
import { createFullBackup, estimateBackupSize, type BackupProgress } from '../lib/backup'
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
  const updateFamilyPin = useUpdateFamilyPin()
  const { data: currentAppPin } = useAppPin()
  const setAppPin = useSetAppPin()
  const removeAppPin = useRemoveAppPin()
  const { data: backupSettings } = useBackupSettings()
  const updateBackupReminder = useUpdateBackupReminder()

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

  // Family feed
  const [editingPin, setEditingPin] = useState(false)
  const [familyPin, setFamilyPin] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)

  // App PIN
  const [editingAppPin, setEditingAppPin] = useState(false)
  const [appPinInput, setAppPinInput] = useState('')
  const [appPinConfirm, setAppPinConfirm] = useState('')
  const [appPinError, setAppPinError] = useState('')

  // Backup
  const [backingUp, setBackingUp] = useState(false)
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null)
  const [backupEstimate, setBackupEstimate] = useState<{ photoCount: number; estimatedMB: number } | null>(null)
  const [estimateLoading, setEstimateLoading] = useState(false)

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

      {/* App PIN */}
      <Section title="App PIN">
        {editingAppPin ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>
                {currentAppPin ? 'New PIN' : 'Set a PIN'}
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={appPinInput}
                onChange={(e) => { setAppPinInput(e.target.value); setAppPinError('') }}
                placeholder="Enter PIN"
                autoFocus
                className="w-full rounded-lg border p-2.5 text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)', letterSpacing: 4 }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={appPinConfirm}
                onChange={(e) => { setAppPinConfirm(e.target.value); setAppPinError('') }}
                placeholder="Confirm PIN"
                className="w-full rounded-lg border p-2.5 text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)', letterSpacing: 4 }}
              />
            </div>
            {appPinError && (
              <p className="text-xs" style={{ color: '#E5534B' }}>{appPinError}</p>
            )}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setEditingAppPin(false); setAppPinInput(''); setAppPinConfirm(''); setAppPinError('') }}
                className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
                style={{ color: 'var(--text-secondary)' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!appPinInput.trim()) {
                    setAppPinError('PIN cannot be empty')
                    return
                  }
                  if (appPinInput !== appPinConfirm) {
                    setAppPinError('PINs do not match')
                    return
                  }
                  await setAppPin.mutateAsync(appPinInput.trim())
                  setEditingAppPin(false)
                  setAppPinInput('')
                  setAppPinConfirm('')
                }}
                disabled={setAppPin.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
                style={{ backgroundColor: 'var(--accent)' }}
              >
                {setAppPin.isPending ? 'Saving...' : 'Save PIN'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div
              className="rounded-lg border p-3 flex items-center justify-between"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {currentAppPin ? 'PIN is set' : 'No PIN set'}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {currentAppPin
                    ? 'A PIN is required to open the app'
                    : 'Anyone can open the app without a PIN'}
                </div>
              </div>
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ backgroundColor: currentAppPin ? '#F0FAF0' : 'var(--bg-page)' }}
              >
                {currentAppPin ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4A9D5A" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                  </svg>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditingAppPin(true)}
                className="flex-1 py-2.5 rounded-lg text-sm font-medium border border-dashed cursor-pointer"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                {currentAppPin ? 'Change PIN' : 'Set PIN'}
              </button>
              {currentAppPin && (
                <button
                  onClick={async () => {
                    if (!confirm('Remove the app PIN? Anyone will be able to open the app.')) return
                    await removeAppPin.mutateAsync()
                  }}
                  disabled={removeAppPin.isPending}
                  className="px-4 py-2.5 rounded-lg text-sm font-medium cursor-pointer disabled:opacity-50"
                  style={{ color: '#E5534B' }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        )}
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

      {/* Family Feed */}
      {babyProfile && (
        <Section title="Family Feed">
          <div className="space-y-3">
            {/* PIN */}
            <div
              className="rounded-lg border p-3"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
                    Family PIN
                  </div>
                  {editingPin ? (
                    <div className="flex gap-2 mt-1">
                      <input
                        type="text"
                        value={familyPin}
                        onChange={(e) => setFamilyPin(e.target.value)}
                        className="w-24 rounded-lg border p-1.5 text-sm text-center"
                        style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                        autoFocus
                      />
                      <button
                        onClick={async () => {
                          if (familyPin.trim()) {
                            await updateFamilyPin.mutateAsync({ id: babyProfile.id, family_pin: familyPin.trim() })
                          }
                          setEditingPin(false)
                        }}
                        className="px-3 py-1 rounded-lg text-xs font-medium text-white cursor-pointer"
                        style={{ backgroundColor: 'var(--accent)' }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingPin(false)}
                        className="text-xs cursor-pointer"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm font-mono" style={{ color: 'var(--text-primary)' }}>
                      {babyProfile.family_pin || '(not set)'}
                    </div>
                  )}
                </div>
                {!editingPin && (
                  <button
                    onClick={() => { setFamilyPin(babyProfile.family_pin ?? ''); setEditingPin(true) }}
                    className="text-xs cursor-pointer"
                    style={{ color: 'var(--accent)' }}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Share link */}
            <div
              className="rounded-lg border p-3"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <div className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                Share Link
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs flex-1 truncate" style={{ color: 'var(--text-secondary)' }}>
                  {window.location.origin}/family
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/family`)
                    setLinkCopied(true)
                    setTimeout(() => setLinkCopied(false), 2000)
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                  style={{
                    backgroundColor: linkCopied ? '#F0FAF0' : 'var(--accent)',
                    color: linkCopied ? '#4A9D5A' : 'white',
                  }}
                >
                  {linkCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* View feed */}
            <a
              href="/family"
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-2.5 rounded-lg text-sm font-medium border border-dashed text-center cursor-pointer"
              style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
            >
              View Family Feed
            </a>
          </div>
        </Section>
      )}

      {/* Import */}
      <Section title="Import Journal">
        <ImportJournal />
      </Section>

      <Section title="Import Recipes">
        <ImportRecipes />
      </Section>

      {/* Backup & Restore */}
      <Section title="Backup & Restore">
        <div className="space-y-3">
          {/* Last backup info */}
          {backupSettings?.lastBackupDate && (
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Last backup: {format(new Date(backupSettings.lastBackupDate), 'MMM d, yyyy h:mm a')}
            </div>
          )}

          {/* Estimate */}
          {backupEstimate && !backingUp && (
            <div
              className="rounded-lg border p-3 text-xs"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)', color: 'var(--text-secondary)' }}
            >
              {backupEstimate.photoCount} photos · ~{backupEstimate.estimatedMB} MB estimated
              {backupEstimate.estimatedMB > 500 && (
                <div className="mt-1" style={{ color: '#D4A853' }}>
                  Large backup — may use significant memory
                </div>
              )}
            </div>
          )}

          {/* Progress */}
          {backingUp && backupProgress && (
            <div
              className="rounded-lg border p-3"
              style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
            >
              <div className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                {backupProgress.phase}
              </div>
              {backupProgress.detail && (
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {backupProgress.detail}
                </div>
              )}
              {backupProgress.total != null && backupProgress.current != null && (
                <div className="mt-2 h-1.5 rounded-full" style={{ backgroundColor: 'var(--bg-page)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${(backupProgress.current / backupProgress.total) * 100}%`,
                      backgroundColor: 'var(--accent)',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Download button */}
          <button
            onClick={async () => {
              if (backingUp) return
              if (!backupEstimate) {
                setEstimateLoading(true)
                try {
                  const est = await estimateBackupSize()
                  setBackupEstimate(est)
                } catch (err) {
                  console.error('Failed to estimate:', err)
                }
                setEstimateLoading(false)
                return
              }
              setBackingUp(true)
              try {
                await createFullBackup((p) => setBackupProgress(p))
              } catch (err) {
                console.error('Backup failed:', err)
                alert('Backup failed. Please try again.')
              }
              setBackingUp(false)
              setBackupProgress(null)
              setBackupEstimate(null)
            }}
            disabled={backingUp || estimateLoading}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
            style={{ backgroundColor: 'var(--accent)' }}
          >
            {estimateLoading ? 'Checking size...' : backingUp ? 'Backing up...' : backupEstimate ? 'Download Full Backup' : 'Prepare Full Backup'}
          </button>

          {/* Reminder toggle */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Remind me to backup</span>
            </div>
            <button
              onClick={async () => {
                const newVal = !backupSettings?.reminderEnabled
                await updateBackupReminder(newVal, backupSettings?.reminderFrequency ?? 'monthly')
              }}
              className="w-10 h-6 rounded-full relative cursor-pointer transition-colors duration-200"
              style={{ backgroundColor: backupSettings?.reminderEnabled ? 'var(--accent)' : 'var(--border-card)' }}
            >
              <div
                className="w-4 h-4 rounded-full bg-white absolute top-1 transition-all duration-200"
                style={{ left: backupSettings?.reminderEnabled ? '22px' : '2px' }}
              />
            </button>
          </div>

          {/* Frequency selector */}
          {backupSettings?.reminderEnabled && (
            <div className="flex gap-2">
              {(['monthly', 'weekly'] as const).map((freq) => (
                <button
                  key={freq}
                  onClick={() => updateBackupReminder(true, freq)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium cursor-pointer capitalize"
                  style={{
                    backgroundColor: backupSettings.reminderFrequency === freq ? 'var(--accent)' : 'var(--bg-card)',
                    color: backupSettings.reminderFrequency === freq ? 'white' : 'var(--text-secondary)',
                    border: backupSettings.reminderFrequency === freq ? 'none' : '1px solid var(--border-card)',
                  }}
                >
                  {freq}
                </button>
              ))}
            </div>
          )}

          {/* Restore placeholder */}
          <button
            disabled
            className="w-full py-2.5 rounded-lg text-sm font-medium border cursor-not-allowed opacity-40"
            style={{ borderColor: 'var(--border-card)', color: 'var(--text-muted)' }}
          >
            Restore from Backup — Coming soon
          </button>
        </div>
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
