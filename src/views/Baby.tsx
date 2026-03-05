import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, parse, differenceInWeeks, differenceInDays, differenceInMonths } from 'date-fns'
import {
  useBabyProfile,
  useUpdateBabyProfile,
  useBabyMilestones,
  useCreateBabyMilestone,
  useUpdateBabyMilestone,
  useDeleteBabyMilestone,
  useBabyTaggedEntries,
  PREGNANCY_MILESTONES,
  FIRST_YEAR_MILESTONES,
} from '../hooks/useBaby'
import { getStorageUrl, truncateText } from '../lib/helpers'
import type { BabyMilestone } from '../types'

type Tab = 'timeline' | 'milestones' | 'firsts'

function BabyCountdown({ dueDate, birthDate, name }: { dueDate: string | null; birthDate: string | null; name: string | null }) {
  const today = new Date()

  if (birthDate) {
    const birth = parse(birthDate, 'yyyy-MM-dd', new Date())
    const months = differenceInMonths(today, birth)
    const remainingDays = differenceInDays(today, birth) - months * 30
    const displayName = name || 'Baby'
    return (
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        {displayName} is {months > 0 ? `${months} month${months !== 1 ? 's' : ''}, ` : ''}{Math.max(0, remainingDays)} day{remainingDays !== 1 ? 's' : ''} old
      </p>
    )
  }

  if (dueDate) {
    const due = parse(dueDate, 'yyyy-MM-dd', new Date())
    const weeks = differenceInWeeks(due, today)
    const days = differenceInDays(due, today) - weeks * 7
    const currentWeek = 40 - weeks
    if (weeks >= 0) {
      return (
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Week {currentWeek} — {weeks} week{weeks !== 1 ? 's' : ''}, {days} day{days !== 1 ? 's' : ''} to go
        </p>
      )
    }
    return (
      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
        Past due date by {Math.abs(differenceInDays(due, today))} days
      </p>
    )
  }

  return null
}

export default function Baby() {
  const navigate = useNavigate()
  const { data: profile, isLoading: profileLoading } = useBabyProfile()
  const updateProfile = useUpdateBabyProfile()
  const { data: milestones = [], isLoading: milestonesLoading } = useBabyMilestones()
  const createMilestone = useCreateBabyMilestone()
  const updateMilestone = useUpdateBabyMilestone()
  const deleteMilestone = useDeleteBabyMilestone()
  const { data: taggedEntries = [] } = useBabyTaggedEntries()

  const [activeTab, setActiveTab] = useState<Tab>('timeline')
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileDueDate, setProfileDueDate] = useState('')
  const [profileBirthDate, setProfileBirthDate] = useState('')
  const [profileWeight, setProfileWeight] = useState('')
  const [profileLength, setProfileLength] = useState('')

  // Milestone interaction state
  const [expandedMilestone, setExpandedMilestone] = useState<string | null>(null)
  const [newMilestoneTitle, setNewMilestoneTitle] = useState('')
  const [newMilestoneType, setNewMilestoneType] = useState<'pregnancy' | 'first_year' | 'custom'>('custom')
  const [showAddMilestone, setShowAddMilestone] = useState(false)
  const [editingMilestoneId, setEditingMilestoneId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editNotes, setEditNotes] = useState('')

  const startEditProfile = () => {
    setProfileName(profile?.name ?? '')
    setProfileDueDate(profile?.due_date ?? '')
    setProfileBirthDate(profile?.birth_date ?? '')
    setProfileWeight(profile?.birth_weight ?? '')
    setProfileLength(profile?.birth_length ?? '')
    setEditingProfile(true)
  }

  const saveProfile = async () => {
    if (!profile) return
    await updateProfile.mutateAsync({
      id: profile.id,
      name: profileName.trim() || null,
      due_date: profileDueDate || null,
      birth_date: profileBirthDate || null,
      birth_weight: profileWeight.trim() || null,
      birth_length: profileLength.trim() || null,
    })
    setEditingProfile(false)
  }

  // Merge milestones + tagged entries for timeline
  const timelineItems = useMemo(() => {
    const items: Array<{ type: 'milestone'; data: BabyMilestone; date: string } | { type: 'entry'; data: typeof taggedEntries[0]; date: string }> = []

    for (const m of milestones) {
      items.push({ type: 'milestone', data: m, date: m.milestone_date })
    }
    for (const te of taggedEntries) {
      const entryDate = (te as { entry?: { entry_date: string } }).entry?.entry_date
      if (entryDate) {
        items.push({ type: 'entry', data: te, date: entryDate })
      }
    }

    items.sort((a, b) => b.date.localeCompare(a.date))
    return items
  }, [milestones, taggedEntries])

  // Group milestones by type for checklist
  const milestonesByTitle = useMemo(() => {
    const map = new Map<string, BabyMilestone>()
    for (const m of milestones) {
      map.set(m.title, m)
    }
    return map
  }, [milestones])

  // "Firsts" — completed milestones that start with "First"
  const firsts = useMemo(() => {
    return milestones.filter(m => m.title.toLowerCase().startsWith('first'))
  }, [milestones])

  const handleCompleteMilestone = async (title: string, type: string) => {
    const today = format(new Date(), 'yyyy-MM-dd')
    await createMilestone.mutateAsync({
      title,
      milestone_type: type,
      milestone_date: today,
    })
  }

  const handleAddCustomMilestone = async () => {
    if (!newMilestoneTitle.trim()) return
    const today = format(new Date(), 'yyyy-MM-dd')
    await createMilestone.mutateAsync({
      title: newMilestoneTitle.trim(),
      milestone_type: newMilestoneType,
      milestone_date: today,
    })
    setNewMilestoneTitle('')
    setShowAddMilestone(false)
  }

  const startEditMilestone = (m: BabyMilestone) => {
    setEditingMilestoneId(m.id)
    setEditDate(m.milestone_date)
    setEditNotes(m.notes ?? '')
  }

  const saveEditMilestone = async () => {
    if (!editingMilestoneId) return
    await updateMilestone.mutateAsync({
      id: editingMilestoneId,
      milestone_date: editDate,
      notes: editNotes.trim() || null,
    })
    setEditingMilestoneId(null)
  }

  const isLoading = profileLoading || milestonesLoading

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 rounded animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
        <div className="h-32 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
        <div className="h-48 rounded-xl animate-pulse" style={{ backgroundColor: 'var(--bg-card)' }} />
      </div>
    )
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
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
          <h1
            className="text-2xl"
            style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
          >
            {profile?.name || 'Baby'}
          </h1>
          <BabyCountdown dueDate={profile?.due_date ?? null} birthDate={profile?.birth_date ?? null} name={profile?.name ?? null} />
        </div>
        <button
          onClick={startEditProfile}
          className="px-3 py-1.5 rounded-lg text-sm font-medium cursor-pointer"
          style={{ backgroundColor: 'var(--accent)', color: 'white' }}
        >
          Edit
        </button>
      </div>

      {/* Edit Profile Inline */}
      {editingProfile && (
        <div
          className="rounded-xl border p-4 mb-4 space-y-3"
          style={{ backgroundColor: '#FFF8E7', borderColor: 'var(--border-card)' }}
        >
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Name</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
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
                value={profileDueDate}
                onChange={(e) => setProfileDueDate(e.target.value)}
                className="w-full rounded-lg border p-2.5 text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Birth Date</label>
              <input
                type="date"
                value={profileBirthDate}
                onChange={(e) => setProfileBirthDate(e.target.value)}
                className="w-full rounded-lg border p-2.5 text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Birth Weight</label>
              <input
                type="text"
                value={profileWeight}
                onChange={(e) => setProfileWeight(e.target.value)}
                placeholder="e.g. 7 lbs 4 oz"
                className="w-full rounded-lg border p-2.5 text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
            </div>
            <div>
              <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Birth Length</label>
              <input
                type="text"
                value={profileLength}
                onChange={(e) => setProfileLength(e.target.value)}
                placeholder="e.g. 20 inches"
                className="w-full rounded-lg border p-2.5 text-sm"
                style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setEditingProfile(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={saveProfile}
              disabled={updateProfile.isPending}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              {updateProfile.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-5 rounded-xl p-1" style={{ backgroundColor: 'var(--bg-card)' }}>
        {(['timeline', 'milestones', 'firsts'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer capitalize"
            style={{
              backgroundColor: activeTab === tab ? 'var(--accent)' : 'transparent',
              color: activeTab === tab ? 'white' : 'var(--text-secondary)',
            }}
          >
            {tab === 'timeline' ? 'Timeline' : tab === 'milestones' ? 'Milestones' : 'Firsts'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'timeline' && (
        <TimelineTab
          items={timelineItems}
          navigate={navigate}
        />
      )}

      {activeTab === 'milestones' && (
        <MilestonesTab
          milestonesByTitle={milestonesByTitle}
          milestones={milestones}
          expandedMilestone={expandedMilestone}
          setExpandedMilestone={setExpandedMilestone}
          editingMilestoneId={editingMilestoneId}
          editDate={editDate}
          setEditDate={setEditDate}
          editNotes={editNotes}
          setEditNotes={setEditNotes}
          startEditMilestone={startEditMilestone}
          saveEditMilestone={saveEditMilestone}
          setEditingMilestoneId={setEditingMilestoneId}
          handleCompleteMilestone={handleCompleteMilestone}
          deleteMilestone={deleteMilestone}
          showAddMilestone={showAddMilestone}
          setShowAddMilestone={setShowAddMilestone}
          newMilestoneTitle={newMilestoneTitle}
          setNewMilestoneTitle={setNewMilestoneTitle}
          newMilestoneType={newMilestoneType}
          setNewMilestoneType={setNewMilestoneType}
          handleAddCustomMilestone={handleAddCustomMilestone}
          createMilestone={createMilestone}
        />
      )}

      {activeTab === 'firsts' && (
        <FirstsTab firsts={firsts} />
      )}
    </div>
  )
}

// ---- Timeline Tab ----
function TimelineTab({
  items,
  navigate,
}: {
  items: Array<{ type: 'milestone' | 'entry'; data: any; date: string }>
  navigate: (path: string) => void
}) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">👶</div>
        <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
          No baby moments yet
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Tag journal entries with Baby or add milestones to start building your timeline.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const d = parse(item.date, 'yyyy-MM-dd', new Date())
        const dateLabel = format(d, 'MMM d, yyyy')

        if (item.type === 'milestone') {
          const m = item.data as BabyMilestone
          return (
            <div
              key={`m-${m.id}`}
              className="rounded-xl border-2 p-4"
              style={{ borderColor: '#F0C987', backgroundColor: '#FFF8E7' }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">🌟</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {m.title}
                </span>
              </div>
              <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{dateLabel}</div>
              {m.notes && (
                <p className="text-xs mt-2 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {m.notes}
                </p>
              )}
              {m.photo_path && (
                <div className="mt-2 w-20 h-20 rounded-lg overflow-hidden">
                  <img src={getStorageUrl(m.photo_path)} alt="" className="w-full h-full object-cover" loading="lazy" />
                </div>
              )}
              {m.entry?.entry_date && (
                <button
                  onClick={() => navigate(`/journal/${m.entry!.entry_date}`)}
                  className="text-xs font-medium mt-2 cursor-pointer"
                  style={{ color: 'var(--accent)' }}
                >
                  View journal entry →
                </button>
              )}
            </div>
          )
        }

        // Tagged entry
        const te = item.data
        const entry = te.entry
        if (!entry) return null
        const preview = entry.sections?.[0]?.content ? truncateText(entry.sections[0].content, 100) : ''
        const firstPhoto = entry.photos?.[0]

        return (
          <button
            key={`e-${te.id}-${i}`}
            onClick={() => navigate(`/journal/${entry.entry_date}`)}
            className="w-full text-left rounded-xl border p-4 transition-all duration-150 hover:shadow-md cursor-pointer"
            style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
          >
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: '#F0FAF0', color: '#4A9D5A' }}>
                    👶 Baby
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{dateLabel}</span>
                </div>
                {preview && (
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {preview}
                  </p>
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
      })}
    </div>
  )
}

// ---- Milestones Tab ----
function MilestonesTab({
  milestonesByTitle,
  milestones,
  expandedMilestone,
  setExpandedMilestone,
  editingMilestoneId,
  editDate,
  setEditDate,
  editNotes,
  setEditNotes,
  startEditMilestone,
  saveEditMilestone,
  setEditingMilestoneId,
  handleCompleteMilestone,
  deleteMilestone,
  showAddMilestone,
  setShowAddMilestone,
  newMilestoneTitle,
  setNewMilestoneTitle,
  newMilestoneType,
  setNewMilestoneType,
  handleAddCustomMilestone,
  createMilestone,
}: {
  milestonesByTitle: Map<string, BabyMilestone>
  milestones: BabyMilestone[]
  expandedMilestone: string | null
  setExpandedMilestone: (id: string | null) => void
  editingMilestoneId: string | null
  editDate: string
  setEditDate: (d: string) => void
  editNotes: string
  setEditNotes: (n: string) => void
  startEditMilestone: (m: BabyMilestone) => void
  saveEditMilestone: () => void
  setEditingMilestoneId: (id: string | null) => void
  handleCompleteMilestone: (title: string, type: string) => void
  deleteMilestone: { mutateAsync: (id: string) => Promise<void> }
  showAddMilestone: boolean
  setShowAddMilestone: (v: boolean) => void
  newMilestoneTitle: string
  setNewMilestoneTitle: (t: string) => void
  newMilestoneType: 'pregnancy' | 'first_year' | 'custom'
  setNewMilestoneType: (t: 'pregnancy' | 'first_year' | 'custom') => void
  handleAddCustomMilestone: () => void
  createMilestone: { isPending: boolean }
}) {
  // Custom milestones that aren't in the preset lists
  const customMilestones = milestones.filter(
    m => !PREGNANCY_MILESTONES.includes(m.title) && !FIRST_YEAR_MILESTONES.includes(m.title)
  )

  return (
    <div className="space-y-6">
      {/* Pregnancy Milestones */}
      <MilestoneGroup
        title="Pregnancy"
        emoji="🤰"
        presets={PREGNANCY_MILESTONES}
        type="pregnancy"
        milestonesByTitle={milestonesByTitle}
        expandedMilestone={expandedMilestone}
        setExpandedMilestone={setExpandedMilestone}
        editingMilestoneId={editingMilestoneId}
        editDate={editDate}
        setEditDate={setEditDate}
        editNotes={editNotes}
        setEditNotes={setEditNotes}
        startEditMilestone={startEditMilestone}
        saveEditMilestone={saveEditMilestone}
        setEditingMilestoneId={setEditingMilestoneId}
        handleCompleteMilestone={handleCompleteMilestone}
        deleteMilestone={deleteMilestone}
      />

      {/* First Year Milestones */}
      <MilestoneGroup
        title="First Year"
        emoji="👶"
        presets={FIRST_YEAR_MILESTONES}
        type="first_year"
        milestonesByTitle={milestonesByTitle}
        expandedMilestone={expandedMilestone}
        setExpandedMilestone={setExpandedMilestone}
        editingMilestoneId={editingMilestoneId}
        editDate={editDate}
        setEditDate={setEditDate}
        editNotes={editNotes}
        setEditNotes={setEditNotes}
        startEditMilestone={startEditMilestone}
        saveEditMilestone={saveEditMilestone}
        setEditingMilestoneId={setEditingMilestoneId}
        handleCompleteMilestone={handleCompleteMilestone}
        deleteMilestone={deleteMilestone}
      />

      {/* Custom Milestones */}
      {customMilestones.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
            Custom Milestones
          </h3>
          <div className="space-y-2">
            {customMilestones.map((m) => (
              <CompletedMilestoneRow
                key={m.id}
                milestone={m}
                expanded={expandedMilestone === m.id}
                onToggle={() => setExpandedMilestone(expandedMilestone === m.id ? null : m.id)}
                editingMilestoneId={editingMilestoneId}
                editDate={editDate}
                setEditDate={setEditDate}
                editNotes={editNotes}
                setEditNotes={setEditNotes}
                startEditMilestone={startEditMilestone}
                saveEditMilestone={saveEditMilestone}
                setEditingMilestoneId={setEditingMilestoneId}
                deleteMilestone={deleteMilestone}
              />
            ))}
          </div>
        </div>
      )}

      {/* Add Custom Milestone */}
      {showAddMilestone ? (
        <div
          className="rounded-xl border p-4 space-y-3"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
        >
          <input
            type="text"
            value={newMilestoneTitle}
            onChange={(e) => setNewMilestoneTitle(e.target.value)}
            placeholder="Milestone name..."
            className="w-full rounded-lg border p-2.5 text-sm"
            style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
            autoFocus
          />
          <div className="flex gap-2">
            {(['pregnancy', 'first_year', 'custom'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setNewMilestoneType(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                style={{
                  backgroundColor: newMilestoneType === t ? 'var(--accent)' : 'var(--bg-page)',
                  color: newMilestoneType === t ? 'white' : 'var(--text-secondary)',
                }}
              >
                {t === 'pregnancy' ? 'Pregnancy' : t === 'first_year' ? 'First Year' : 'Custom'}
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAddMilestone(false); setNewMilestoneTitle('') }}
              className="px-3 py-1.5 rounded-lg text-sm cursor-pointer"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleAddCustomMilestone}
              disabled={!newMilestoneTitle.trim() || createMilestone.isPending}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white cursor-pointer disabled:opacity-50"
              style={{ backgroundColor: 'var(--accent)' }}
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAddMilestone(true)}
          className="w-full py-2.5 rounded-xl text-sm font-medium border-2 border-dashed cursor-pointer"
          style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
        >
          + Add Custom Milestone
        </button>
      )}
    </div>
  )
}

function MilestoneGroup({
  title,
  emoji,
  presets,
  type,
  milestonesByTitle,
  expandedMilestone,
  setExpandedMilestone,
  editingMilestoneId,
  editDate,
  setEditDate,
  editNotes,
  setEditNotes,
  startEditMilestone,
  saveEditMilestone,
  setEditingMilestoneId,
  handleCompleteMilestone,
  deleteMilestone,
}: {
  title: string
  emoji: string
  presets: string[]
  type: string
  milestonesByTitle: Map<string, BabyMilestone>
  expandedMilestone: string | null
  setExpandedMilestone: (id: string | null) => void
  editingMilestoneId: string | null
  editDate: string
  setEditDate: (d: string) => void
  editNotes: string
  setEditNotes: (n: string) => void
  startEditMilestone: (m: BabyMilestone) => void
  saveEditMilestone: () => void
  setEditingMilestoneId: (id: string | null) => void
  handleCompleteMilestone: (title: string, type: string) => void
  deleteMilestone: { mutateAsync: (id: string) => Promise<void> }
}) {
  const [isOpen, setIsOpen] = useState(true)
  const completed = presets.filter(p => milestonesByTitle.has(p)).length

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full text-left py-2 cursor-pointer"
      >
        <span className="text-lg">{emoji}</span>
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {title}
        </span>
        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--bg-page)', color: 'var(--text-secondary)' }}>
          {completed}/{presets.length}
        </span>
        <svg
          className="w-3.5 h-3.5 ml-auto transition-transform duration-200"
          style={{ color: 'var(--text-muted)', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className={`collapsible-content ${isOpen ? 'open' : ''}`}>
        <div>
          {/* Progress bar */}
          <div className="h-1.5 rounded-full mb-3" style={{ backgroundColor: 'var(--bg-page)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(completed / presets.length) * 100}%`,
                backgroundColor: 'var(--accent)',
              }}
            />
          </div>

          <div className="space-y-2">
            {presets.map((preset) => {
              const existing = milestonesByTitle.get(preset)
              if (existing) {
                return (
                  <CompletedMilestoneRow
                    key={existing.id}
                    milestone={existing}
                    expanded={expandedMilestone === existing.id}
                    onToggle={() => setExpandedMilestone(expandedMilestone === existing.id ? null : existing.id)}
                    editingMilestoneId={editingMilestoneId}
                    editDate={editDate}
                    setEditDate={setEditDate}
                    editNotes={editNotes}
                    setEditNotes={setEditNotes}
                    startEditMilestone={startEditMilestone}
                    saveEditMilestone={saveEditMilestone}
                    setEditingMilestoneId={setEditingMilestoneId}
                    deleteMilestone={deleteMilestone}
                  />
                )
              }
              return (
                <div
                  key={preset}
                  className="flex items-center gap-3 rounded-xl border p-3"
                  style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-card)' }}
                >
                  <button
                    onClick={() => handleCompleteMilestone(preset, type)}
                    className="w-6 h-6 rounded-full border-2 flex-shrink-0 cursor-pointer transition-colors duration-150 hover:border-[var(--accent)]"
                    style={{ borderColor: 'var(--border-card)' }}
                    title="Mark complete"
                  />
                  <span className="text-sm flex-1" style={{ color: 'var(--text-secondary)' }}>
                    {preset}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function CompletedMilestoneRow({
  milestone,
  expanded,
  onToggle,
  editingMilestoneId,
  editDate,
  setEditDate,
  editNotes,
  setEditNotes,
  startEditMilestone,
  saveEditMilestone,
  setEditingMilestoneId,
  deleteMilestone,
}: {
  milestone: BabyMilestone
  expanded: boolean
  onToggle: () => void
  editingMilestoneId: string | null
  editDate: string
  setEditDate: (d: string) => void
  editNotes: string
  setEditNotes: (n: string) => void
  startEditMilestone: (m: BabyMilestone) => void
  saveEditMilestone: () => void
  setEditingMilestoneId: (id: string | null) => void
  deleteMilestone: { mutateAsync: (id: string) => Promise<void> }
}) {
  const d = parse(milestone.milestone_date, 'yyyy-MM-dd', new Date())
  const isEditing = editingMilestoneId === milestone.id

  return (
    <div
      className="rounded-xl border-2 overflow-hidden"
      style={{ borderColor: '#F0C987', backgroundColor: '#FFF8E7' }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 cursor-pointer"
      >
        <div
          className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ backgroundColor: 'var(--accent)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {milestone.title}
          </span>
          <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
            {format(d, 'MMM d, yyyy')}
          </span>
        </div>
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200"
          style={{ color: 'var(--text-muted)', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div className={`collapsible-content ${expanded ? 'open' : ''}`}>
        <div>
          <div className="px-3 pb-3 space-y-2">
            {isEditing ? (
              <>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full rounded-lg border p-2 text-sm"
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1" style={{ color: 'var(--text-muted)' }}>Notes</label>
                  <textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Add notes..."
                    rows={2}
                    className="w-full rounded-lg border p-2 text-sm resize-none"
                    style={{ backgroundColor: 'var(--input-bg)', borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingMilestoneId(null)}
                    className="px-3 py-1 rounded-lg text-xs cursor-pointer"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEditMilestone}
                    className="px-3 py-1 rounded-lg text-xs font-medium text-white cursor-pointer"
                    style={{ backgroundColor: 'var(--accent)' }}
                  >
                    Save
                  </button>
                </div>
              </>
            ) : (
              <>
                {milestone.notes && (
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {milestone.notes}
                  </p>
                )}
                {milestone.photo_path && (
                  <div className="w-16 h-16 rounded-lg overflow-hidden">
                    <img src={getStorageUrl(milestone.photo_path)} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => startEditMilestone(milestone)}
                    className="text-xs font-medium cursor-pointer"
                    style={{ color: 'var(--accent)' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm(`Remove "${milestone.title}" milestone?`)) {
                        await deleteMilestone.mutateAsync(milestone.id)
                      }
                    }}
                    className="text-xs font-medium cursor-pointer"
                    style={{ color: '#E5534B' }}
                  >
                    Remove
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- Firsts Tab ----
function FirstsTab({ firsts }: { firsts: BabyMilestone[] }) {
  if (firsts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">📖</div>
        <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
          Book of Firsts
        </h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Complete milestones that start with "First" and they'll appear here as keepsake cards.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h3
        className="text-center text-lg mb-4"
        style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, color: 'var(--text-primary)' }}
      >
        Book of Firsts
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {firsts.map((m) => {
          const d = parse(m.milestone_date, 'yyyy-MM-dd', new Date())
          return (
            <div
              key={m.id}
              className="rounded-xl p-4 text-center"
              style={{ backgroundColor: '#FFF8E7', border: '2px solid #F0C987' }}
            >
              {m.photo_path ? (
                <div className="w-16 h-16 rounded-full overflow-hidden mx-auto mb-2">
                  <img src={getStorageUrl(m.photo_path)} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div
                  className="w-16 h-16 rounded-full mx-auto mb-2 flex items-center justify-center"
                  style={{ backgroundColor: '#F0FAF0' }}
                >
                  <span className="text-2xl">🌟</span>
                </div>
              )}
              <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                {m.title}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {format(d, 'MMMM d, yyyy')}
              </div>
              {m.notes && (
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {m.notes}
                </p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
