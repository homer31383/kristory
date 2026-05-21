import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parse, differenceInWeeks, differenceInDays, differenceInMonths } from 'date-fns'
import { supabase } from '../lib/supabase'
import { getStorageUrl, truncateText } from '../lib/helpers'
import type { FamilyPost, BabyProfile, BabyNameSuggestion } from '../types'

// -- Design tokens --
const C = {
  bg: '#EDE6DE',
  card: '#F7F3EF',
  border: '#DDD5CB',
  text: '#2C2522',
  secondary: '#8C8078',
  muted: '#B5ADA5',
  accent: '#6B5CA5',
  milestoneBackground: '#FFF8E7',
  milestoneBorder: '#F0E6C8',
  milestoneText: '#B8860B',
  error: '#E5534B',
  inputBg: '#F7F3EF',
} as const

const STORAGE_KEY = 'kristory-family-pin-ok'

// -- Queries --

function useFeedProfile() {
  return useQuery({
    queryKey: ['family-feed-profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_profile')
        .select('*')
        .maybeSingle()
      if (error) throw error
      return data as BabyProfile | null
    },
  })
}

function useFeedPosts(authenticated: boolean) {
  return useQuery({
    queryKey: ['family-feed-posts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_posts')
        .select('*, entry:journal_entries!entry_id(entry_date), photos:family_post_photos!family_post_id(display_order, entry_photo:entry_photos!entry_photo_id(storage_path))')
        .order('published_at', { ascending: false })
      if (error) throw error

      const entryIds = (data ?? []).map(p => p.entry_id).filter(Boolean)
      const milestoneMap = new Map<string, string>()
      if (entryIds.length > 0) {
        const { data: milestones } = await supabase
          .from('baby_milestones')
          .select('entry_id, title')
          .in('entry_id', entryIds)
        if (milestones) {
          for (const m of milestones) {
            if (m.entry_id) milestoneMap.set(m.entry_id, m.title)
          }
        }
      }

      return { posts: (data ?? []) as FamilyPost[], milestoneMap }
    },
    enabled: authenticated,
  })
}

function useFeedNameSuggestions(authenticated: boolean) {
  return useQuery({
    queryKey: ['baby-name-suggestions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('baby_name_suggestions')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as BabyNameSuggestion[]
    },
    enabled: authenticated,
  })
}

function useAddNameSuggestion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: { name: string; suggested_by: string | null }) => {
      const { data, error } = await supabase
        .from('baby_name_suggestions')
        .insert({ name: params.name, suggested_by: params.suggested_by })
        .select()
        .single()
      if (error) throw error
      return data as BabyNameSuggestion
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['baby-name-suggestions'] })
    },
  })
}

// -- Helpers --

function BabyAge({ profile }: { profile: BabyProfile }) {
  const today = new Date()

  if (profile.birth_date) {
    const birth = parse(profile.birth_date, 'yyyy-MM-dd', new Date())
    const months = differenceInMonths(today, birth)
    const remainingDays = differenceInDays(today, birth) - months * 30
    const name = profile.name || 'Baby'
    return (
      <p style={{ color: C.secondary, fontSize: 14, margin: 0 }}>
        {name} is {months > 0 ? `${months} month${months !== 1 ? 's' : ''}, ` : ''}{Math.max(0, remainingDays)} day{remainingDays !== 1 ? 's' : ''} old
      </p>
    )
  }

  if (profile.due_date) {
    const due = parse(profile.due_date, 'yyyy-MM-dd', new Date())
    const weeks = differenceInWeeks(due, today)
    const days = differenceInDays(due, today) - weeks * 7
    if (weeks >= 0) {
      return (
        <p style={{ color: C.secondary, fontSize: 14, margin: 0 }}>
          Due in {weeks} week{weeks !== 1 ? 's' : ''}, {days} day{days !== 1 ? 's' : ''}
        </p>
      )
    }
  }

  return null
}

function getPostDate(post: FamilyPost): string {
  // Prefer the linked journal entry date over published_at
  if (post.entry?.entry_date) return post.entry.entry_date
  return format(new Date(post.published_at), 'yyyy-MM-dd')
}

function getFirstPhotoUrl(post: FamilyPost): string | null {
  const photos = (post.photos ?? [])
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .filter(p => p.entry_photo?.storage_path)
  return photos[0] ? getStorageUrl(photos[0].entry_photo!.storage_path) : null
}

// -- Chevron icon --
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14" height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      style={{
        color: C.muted,
        transition: 'transform 200ms ease',
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
        flexShrink: 0,
      }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  )
}

// -- PIN Gate --

function PinGate({ profile, onSuccess }: { profile: BabyProfile; onSuccess: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (pin === profile.family_pin) {
      localStorage.setItem(STORAGE_KEY, 'true')
      onSuccess()
    } else {
      setError(true)
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: C.bg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700,
          fontSize: 32,
          color: C.text,
          margin: '0 0 6px 0',
        }}>
          The Babory
        </h1>
        <p style={{ color: C.secondary, fontSize: 15, margin: '0 0 4px 0' }}>
          {profile.name || 'Baby'}
        </p>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 32 }}>
          Family Updates
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ animation: shake ? 'shake 0.4s ease-in-out' : undefined }}>
            <input
              type="text"
              inputMode="numeric"
              value={pin}
              onChange={(e) => { setPin(e.target.value); setError(false) }}
              placeholder="Enter PIN"
              autoFocus
              style={{
                width: '100%',
                padding: '14px 16px',
                fontSize: 18,
                textAlign: 'center',
                letterSpacing: 8,
                border: `2px solid ${error ? C.error : C.border}`,
                borderRadius: 12,
                backgroundColor: C.inputBg,
                color: C.text,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {error && (
            <p style={{ color: C.error, fontSize: 13, marginTop: 8 }}>
              That's not right, try again
            </p>
          )}
          <button
            type="submit"
            style={{
              width: '100%',
              marginTop: 16,
              padding: '14px 24px',
              fontSize: 15,
              fontWeight: 600,
              color: 'white',
              backgroundColor: C.accent,
              border: 'none',
              borderRadius: 12,
              cursor: 'pointer',
            }}
          >
            Enter
          </button>
        </form>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
      `}</style>
    </div>
  )
}

// -- Post Detail View --

function PostDetail({
  post,
  milestone,
  onBack,
}: {
  post: FamilyPost
  milestone: string | undefined
  onBack: () => void
}) {
  const photos = (post.photos ?? [])
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .filter(p => p.entry_photo?.storage_path)

  const entryDate = post.entry?.entry_date
    ? parse(post.entry.entry_date, 'yyyy-MM-dd', new Date())
    : new Date(post.published_at)
  const dateStr = format(entryDate, 'EEEE, MMMM d, yyyy')

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: C.bg,
      fontFamily: "'Inter', sans-serif",
    }}>
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '0 16px 32px' }}>
        {/* Back button + date heading */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 0' }}>
          <button
            onClick={onBack}
            style={{
              width: 40,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 8,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: C.secondary,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700,
            fontSize: 20,
            color: C.text,
            margin: 0,
          }}>
            {dateStr}
          </h1>
        </div>

        {/* Content card */}
        <div style={{
          backgroundColor: C.card,
          borderRadius: 12,
          border: `1px solid ${C.border}`,
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        }}>
          {/* Milestone badge */}
          {milestone && (
            <div style={{
              padding: '10px 16px',
              backgroundColor: C.milestoneBackground,
              borderBottom: `1px solid ${C.milestoneBorder}`,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}>
              <span style={{ fontSize: 16 }}>🏆</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.milestoneText }}>
                {milestone}
              </span>
            </div>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <div>
              {photos.map((photo, i) => (
                <img
                  key={i}
                  src={getStorageUrl(photo.entry_photo!.storage_path)}
                  alt=""
                  style={{ width: '100%', display: 'block' }}
                  loading="lazy"
                />
              ))}
            </div>
          )}

          {/* Caption */}
          <div style={{ padding: '14px 16px 16px' }}>
            {post.caption && (
              <p style={{
                fontSize: 15,
                lineHeight: 1.6,
                color: C.text,
                margin: '0 0 8px 0',
                whiteSpace: 'pre-wrap',
              }}>
                {post.caption}
              </p>
            )}
            <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
              {format(entryDate, 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// -- Timeline Card (compact, in the feed) --

function PostCard({
  post,
  milestone,
  onClick,
}: {
  post: FamilyPost
  milestone: string | undefined
  onClick: () => void
}) {
  const d = parse(getPostDate(post), 'yyyy-MM-dd', new Date())
  const dateLabel = format(d, 'MMM d, EEEE')
  const preview = post.caption ? truncateText(post.caption, 100) : ''
  const thumb = getFirstPhotoUrl(post)

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left' as const,
        backgroundColor: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: 16,
        cursor: 'pointer',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        display: 'block',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Milestone badge */}
          {milestone && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontWeight: 600,
              color: C.milestoneText,
              backgroundColor: C.milestoneBackground,
              border: `1px solid ${C.milestoneBorder}`,
              borderRadius: 20,
              padding: '2px 8px',
              marginBottom: 6,
            }}>
              🏆 {milestone}
            </span>
          )}
          <div style={{
            fontSize: 14,
            fontWeight: 500,
            color: C.text,
            marginBottom: milestone ? 0 : undefined,
          }}>
            {dateLabel}
          </div>
          {preview && (
            <p style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: C.secondary,
              margin: '4px 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
            }}>
              {preview}
            </p>
          )}
        </div>
        {thumb && (
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 8,
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <img
              src={thumb}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              loading="lazy"
            />
          </div>
        )}
      </div>
    </button>
  )
}

// -- Collapsible Month Group --

function MonthGroup({
  label,
  posts,
  milestoneMap,
  onPostClick,
  initialOpen,
}: {
  label: string
  posts: FamilyPost[]
  milestoneMap: Map<string, string>
  onPostClick: (post: FamilyPost) => void
  initialOpen: boolean
}) {
  const [isOpen, setIsOpen] = useState(initialOpen)

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          textAlign: 'left' as const,
          padding: '8px 0',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.05em',
          color: C.muted,
        }}>
          {label}
        </span>
        <Chevron open={isOpen} />
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 200ms ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16 }}>
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                milestone={milestoneMap.get(post.entry_id)}
                onClick={() => onPostClick(post)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// -- Collapsible Year Group --

function YearGroup({
  year,
  months,
  totalPosts,
  milestoneMap,
  onPostClick,
  initialOpen,
}: {
  year: string
  months: { label: string; posts: FamilyPost[] }[]
  totalPosts: number
  milestoneMap: Map<string, string>
  onPostClick: (post: FamilyPost) => void
  initialOpen: boolean
}) {
  const [isOpen, setIsOpen] = useState(initialOpen)

  return (
    <div>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          textAlign: 'left' as const,
          padding: '12px 0',
          border: 'none',
          background: 'none',
          cursor: 'pointer',
          fontFamily: "'Inter', sans-serif",
        }}
      >
        <span style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700,
          fontSize: 18,
          color: C.text,
        }}>
          {year}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>
          {totalPosts} {totalPosts === 1 ? 'post' : 'posts'}
        </span>
        <span style={{ marginLeft: 'auto' }}>
          <Chevron open={isOpen} />
        </span>
      </button>
      <div
        style={{
          display: 'grid',
          gridTemplateRows: isOpen ? '1fr' : '0fr',
          transition: 'grid-template-rows 200ms ease',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div style={{ paddingLeft: 4 }}>
            {months.map(({ label, posts }) => (
              <MonthGroup
                key={label}
                label={label}
                posts={posts}
                milestoneMap={milestoneMap}
                onPostClick={onPostClick}
                initialOpen={initialOpen}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// -- Names Tab --

function NamesTab() {
  const { data: names = [], isLoading } = useFeedNameSuggestions(true)
  const addName = useAddNameSuggestion()
  const [nameInput, setNameInput] = useState('')
  const [byInput, setByInput] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nameInput.trim()) return
    await addName.mutateAsync({
      name: nameInput.trim(),
      suggested_by: byInput.trim() || null,
    })
    setNameInput('')
  }

  return (
    <div>
      {/* Add form */}
      <form
        onSubmit={handleSubmit}
        style={{
          backgroundColor: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 16,
          marginBottom: 20,
        }}
      >
        <h3 style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700,
          fontSize: 16,
          color: C.text,
          margin: '0 0 12px 0',
        }}>
          Suggest a Name
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Baby name..."
            style={{
              width: '100%',
              padding: '10px 12px',
              fontSize: 15,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              backgroundColor: C.inputBg,
              color: C.text,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={byInput}
              onChange={(e) => setByInput(e.target.value)}
              placeholder="Your name (optional)"
              style={{
                flex: 1,
                padding: '10px 12px',
                fontSize: 13,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                backgroundColor: C.inputBg,
                color: C.text,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
            <button
              type="submit"
              disabled={!nameInput.trim() || addName.isPending}
              style={{
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: 'white',
                backgroundColor: C.accent,
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                opacity: !nameInput.trim() || addName.isPending ? 0.5 : 1,
              }}
            >
              {addName.isPending ? '...' : 'Add'}
            </button>
          </div>
        </div>
      </form>

      {/* Names list */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <p style={{ color: C.secondary, fontSize: 14 }}>Loading...</p>
        </div>
      ) : names.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>💭</div>
          <p style={{ color: C.secondary, fontSize: 14 }}>
            No name suggestions yet — be the first!
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {names.map((n) => (
            <div
              key={n.id}
              style={{
                backgroundColor: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: '10px 14px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
              }}
            >
              <div style={{
                fontSize: 15,
                fontWeight: 500,
                color: C.text,
              }}>
                {n.name}
              </div>
              {n.suggested_by && (
                <div style={{
                  fontSize: 11,
                  color: C.muted,
                  marginTop: 2,
                }}>
                  by {n.suggested_by}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// -- Feed Content (timeline) --

type FeedTab = 'updates' | 'names'

function FeedContent({ profile }: { profile: BabyProfile }) {
  const { data, isLoading } = useFeedPosts(true)
  const posts = data?.posts ?? []
  const milestoneMap = data?.milestoneMap ?? new Map()

  const [selectedPost, setSelectedPost] = useState<FamilyPost | null>(null)
  const [activeTab, setActiveTab] = useState<FeedTab>('updates')

  const currentYear = new Date().getFullYear().toString()

  // Group posts into year → month hierarchy, newest first
  const yearGroups = useMemo(() => {
    const byYear: Record<string, Record<number, FamilyPost[]>> = {}
    for (const post of posts) {
      const dateStr = getPostDate(post)
      const d = parse(dateStr, 'yyyy-MM-dd', new Date())
      const y = d.getFullYear().toString()
      const m = d.getMonth()
      if (!byYear[y]) byYear[y] = {}
      if (!byYear[y][m]) byYear[y][m] = []
      byYear[y][m].push(post)
    }

    return Object.entries(byYear)
      .sort(([a], [b]) => parseInt(b) - parseInt(a))
      .map(([year, months]) => {
        const monthGroups = Object.entries(months)
          .sort(([a], [b]) => parseInt(b) - parseInt(a))
          .map(([monthNum, monthPosts]) => ({
            label: format(new Date(parseInt(year), parseInt(monthNum)), 'MMMM'),
            posts: [...monthPosts].sort((a, b) => getPostDate(b).localeCompare(getPostDate(a))),
          }))
        const totalPosts = monthGroups.reduce((sum, g) => sum + g.posts.length, 0)
        return { year, months: monthGroups, totalPosts }
      })
  }, [posts])

  // Post detail view
  if (selectedPost) {
    return (
      <PostDetail
        post={selectedPost}
        milestone={milestoneMap.get(selectedPost.entry_id)}
        onBack={() => setSelectedPost(null)}
      />
    )
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: C.bg,
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* Header */}
      <div style={{
        maxWidth: 540,
        margin: '0 auto',
        padding: '28px 16px 8px',
        textAlign: 'center',
      }}>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontWeight: 700,
          fontSize: 28,
          color: C.text,
          margin: '0 0 4px 0',
        }}>
          The Babory
        </h1>
        <BabyAge profile={profile} />
      </div>

      {/* Tab bar */}
      <div style={{
        maxWidth: 540,
        margin: '0 auto',
        padding: '4px 16px 0',
      }}>
        <div style={{
          display: 'flex',
          gap: 4,
          borderRadius: 10,
          padding: 3,
          backgroundColor: C.card,
        }}>
          {(['updates', 'names'] as FeedTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 8,
                border: 'none',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 150ms, color 150ms',
                backgroundColor: activeTab === tab ? C.accent : 'transparent',
                color: activeTab === tab ? 'white' : C.secondary,
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {tab === 'updates' ? 'Updates' : 'Names'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '12px 16px 32px' }}>
        {activeTab === 'names' ? (
          <NamesTab />
        ) : isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: 80,
                  borderRadius: 12,
                  backgroundColor: C.card,
                  animation: 'pulse 1.5s infinite',
                }}
              />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💛</div>
            <p style={{ color: C.secondary, fontSize: 15 }}>
              No updates yet! Check back soon
            </p>
          </div>
        ) : (
          <div>
            {yearGroups.map(({ year, months, totalPosts }) => (
              <YearGroup
                key={year}
                year={year}
                months={months}
                totalPosts={totalPosts}
                milestoneMap={milestoneMap}
                onPostClick={setSelectedPost}
                initialOpen={year === currentYear}
              />
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}

// -- Root --

export default function FamilyFeed() {
  const { data: profile, isLoading } = useFeedProfile()
  const [authenticated, setAuthenticated] = useState(() =>
    localStorage.getItem(STORAGE_KEY) === 'true'
  )

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
      }}>
        <p style={{ color: C.secondary, fontSize: 14 }}>Loading...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div style={{
        minHeight: '100vh',
        backgroundColor: C.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Inter', sans-serif",
        textAlign: 'center',
        padding: 24,
      }}>
        <div>
          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700,
            fontSize: 28,
            color: C.text,
            margin: '0 0 12px 0',
          }}>
            The Babory
          </h1>
          <p style={{ color: C.secondary, fontSize: 15 }}>
            Family feed is not set up yet.
          </p>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return <PinGate profile={profile} onSuccess={() => setAuthenticated(true)} />
  }

  return <FeedContent profile={profile} />
}
