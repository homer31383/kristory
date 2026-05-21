import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { format, parse, startOfToday, isBefore } from 'date-fns'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { resizeImage, getStorageUrl } from '../lib/helpers'
import {
  useShowerEvent, useUpdateShowerEvent, useShowerGuests, useCreateGuest, useUpdateGuest, useDeleteGuest, useMergeGuestRsvp,
  useShowerTasks, useCreateShowerTask, useUpdateShowerTask, useDeleteShowerTask, useSwapTaskOrder,
  useShowerSchedule, useCreateScheduleItem, useUpdateScheduleItem, useDeleteScheduleItem, useSwapScheduleOrder,
  useShowerPhotos, useDeleteShowerPhoto,
  useShowerHelpers, useCreateShowerHelper, useUpdateShowerHelper, useDeleteShowerHelper,
  useShowerMenu, useCreateMenuItem, useUpdateMenuItem, useDeleteMenuItem, useSwapMenuOrder, useImportMenuCsv, useDeleteMenuItems, useShowerGuestCount, useSetShowerGuestCount,
} from '../hooks/useBabyShower'
import type { BabyProfile, BabyShowerEvent, BabyShowerGuest, GuestAddress, BabyShowerScheduleItem, BabyShowerHelper, BabyShowerMenuItem } from '../types'

const C = {
  bg: '#EDE6DE', card: '#F7F3EF', border: '#DDD5CB', text: '#2C2522',
  secondary: '#8C8078', muted: '#B5ADA5', accent: '#6B5CA5',
  baby: '#FFF8E7', babyBorder: '#F0C987', error: '#E5534B',
  inputBg: '#F7F3EF', green: '#4CAF50', yellow: '#F59E0B', red: '#E57373',
  sideLeahy: '#FDE8EF', sideBernier: '#E8F0FE',
} as const

const SIDE_LABEL: Record<'L' | 'B', string> = { L: 'Leahy', B: 'Bernier' }
function sideBg(side: 'L' | 'B' | null | undefined): string {
  if (side === 'L') return C.sideLeahy
  if (side === 'B') return C.sideBernier
  return C.card
}

const STORAGE_KEY = 'kristory-family-pin-ok'
const COLLAPSE_KEY = 'shower-manage-collapsed'
const MAPS_URL = (addr: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`

type Filter = 'all' | 'invited' | 'not-invited' | 'coming' | 'maybe' | 'not-coming' | 'pending' | 'has-gift' | 'need-thank-you' | 'dietary-needs'

const inputBase: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  border: `1px solid ${C.border}`, borderRadius: 8, backgroundColor: C.inputBg,
  color: C.text, outline: 'none', boxSizing: 'border-box', fontFamily: "'Inter', sans-serif",
}

function formatAddr(a: GuestAddress | null): string {
  if (!a) return ''
  const line1 = [a.street, a.apt].filter(Boolean).join(', ')
  const line2 = [a.city, a.state].filter(Boolean).join(', ')
  return [line1, line2, a.zip].filter(Boolean).join(', ')
}

function addrHasValue(a: GuestAddress): boolean {
  return !!(a.street || a.city || a.state || a.zip)
}

function useBabyProfileManage() {
  return useQuery({
    queryKey: ['family-feed-profile'],
    queryFn: async () => { const { data, error } = await supabase.from('baby_profile').select('*').maybeSingle(); if (error) throw error; return data as BabyProfile | null },
  })
}

// -- Collapse state --
function useCollapseState() {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}') } catch { return {} }
  })
  const toggle = useCallback((key: string) => {
    setCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next))
      return next
    })
  }, [])
  return { collapsed, toggle }
}

function SectionHeader({ title, sectionKey, collapsed, onToggle, actions }: { title: string; sectionKey: string; collapsed: Record<string, boolean>; onToggle: (k: string) => void; actions?: React.ReactNode }) {
  const isOpen = !collapsed[sectionKey]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isOpen ? 12 : 0, cursor: 'pointer' }} onClick={() => onToggle(sectionKey)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" style={{ transition: 'transform 200ms', transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        <h3 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 16, color: C.text, margin: 0 }}>{title}</h3>
      </div>
      {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
    </div>
  )
}

// -- Inline Confirm --
function InlineConfirm({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) return (
    <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
      <button onClick={onConfirm} style={{ fontSize: 11, fontWeight: 600, color: C.error, background: 'none', border: 'none', cursor: 'pointer' }}>Confirm</button>
      <button onClick={() => setConfirming(false)} style={{ fontSize: 11, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
    </span>
  )
  return <button onClick={() => setConfirming(true)} style={{ fontSize: 11, color: C.error, background: 'none', border: 'none', cursor: 'pointer' }}>{label}</button>
}

// -- Address Fields --
function AddressFields({ addr, onChange }: { addr: GuestAddress; onChange: (a: GuestAddress) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input type="text" value={addr.street || ''} onChange={(e) => onChange({ ...addr, street: e.target.value })} placeholder="Street address" style={inputBase} />
      <input type="text" value={addr.apt || ''} onChange={(e) => onChange({ ...addr, apt: e.target.value })} placeholder="Apt / Unit (optional)" style={inputBase} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <input type="text" value={addr.city || ''} onChange={(e) => onChange({ ...addr, city: e.target.value })} placeholder="City" style={inputBase} />
        <input type="text" value={addr.state || ''} onChange={(e) => onChange({ ...addr, state: e.target.value })} placeholder="State" style={inputBase} />
      </div>
      <input type="text" value={addr.zip || ''} onChange={(e) => onChange({ ...addr, zip: e.target.value })} placeholder="ZIP code" style={{ ...inputBase, maxWidth: 140 }} />
    </div>
  )
}

// ==================== PIN Gate ====================
function PinGate({ profile, onSuccess }: { profile: BabyProfile; onSuccess: () => void }) {
  const [pin, setPin] = useState(''); const [error, setError] = useState(false); const [shake, setShake] = useState(false)
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (pin === profile.family_pin) { localStorage.setItem(STORAGE_KEY, 'true'); onSuccess() } else { setError(true); setShake(true); setTimeout(() => setShake(false), 500) } }
  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 360, width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 32, color: C.text, margin: '0 0 6px 0' }}>Shower Manager</h1>
        <p style={{ color: C.muted, fontSize: 13, marginBottom: 32 }}>Enter PIN to continue</p>
        <form onSubmit={handleSubmit}>
          <div style={{ animation: shake ? 'shake 0.4s ease-in-out' : undefined }}><input type="text" inputMode="numeric" value={pin} onChange={(e) => { setPin(e.target.value); setError(false) }} placeholder="Enter PIN" autoFocus style={{ width: '100%', padding: '14px 16px', fontSize: 18, textAlign: 'center', letterSpacing: 8, border: `2px solid ${error ? C.error : C.border}`, borderRadius: 12, backgroundColor: C.inputBg, color: C.text, outline: 'none', boxSizing: 'border-box' }} /></div>
          {error && <p style={{ color: C.error, fontSize: 13, marginTop: 8 }}>That's not right, try again</p>}
          <button type="submit" style={{ width: '100%', marginTop: 16, padding: '14px 24px', fontSize: 15, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 12, cursor: 'pointer' }}>Enter</button>
        </form>
      </div>
      <style>{`@keyframes shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }`}</style>
    </div>
  )
}

// ==================== Send Blast (improved) ====================
function SendBlastScreen({ guests, event, onBack }: { guests: BabyShowerGuest[]; event: BabyShowerEvent | null; onBack: () => void }) {
  const updateGuest = useUpdateGuest()
  const [confirmText, setConfirmText] = useState('')
  const emailGuests = guests.filter(g => g.email); const phoneGuests = guests.filter(g => g.phone)
  const [emailSelected, setEmailSelected] = useState<Set<string>>(() => new Set(emailGuests.map(g => g.id)))
  const [phoneSelected, setPhoneSelected] = useState<Set<string>>(() => new Set(phoneGuests.map(g => g.id)))
  const rsvpUrl = `${window.location.origin}/shower`
  const eventDetails = event?.event_date ? `Date: ${format(new Date(event.event_date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}${event.event_time ? ` at ${event.event_time}` : ''}${event.location_name ? `\nLocation: ${event.location_name}` : ''}${event.location_address ? ` (${event.location_address})` : ''}` : ''
  const emailSubject = "You're Invited to Our Baby Shower!"
  const emailBody = `You're invited to our baby shower!\n\n${eventDetails}\n\nPlease RSVP here: ${rsvpUrl}\n\nWe hope to see you there! 🎉`
  const smsBody = `You're invited to our baby shower! 🎉${eventDetails ? `\n${eventDetails}` : ''}\n\nRSVP here: ${rsvpUrl}`
  const isConfirmed = confirmText === 'SEND'

  const toggleSet = (set: Set<string>, setFn: (s: Set<string>) => void, id: string) => { const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); setFn(n) }

  const markSent = async (ids: Set<string>) => {
    const today = new Date().toISOString().slice(0, 10)
    for (const id of ids) {
      const g = guests.find(x => x.id === id)
      if (g && !g.invitation_sent) await updateGuest.mutateAsync({ id, invitation_sent: true, invitation_sent_date: today })
    }
  }

  const handleEmailBlast = async () => {
    const selected = emailGuests.filter(g => emailSelected.has(g.id))
    const bcc = selected.map(g => g.email).join(',')
    window.location.href = `mailto:?bcc=${encodeURIComponent(bcc)}&subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    await markSent(emailSelected)
  }

  const handleTextBlast = async () => {
    const selected = phoneGuests.filter(g => phoneSelected.has(g.id))
    const phones = selected.map(g => g.phone).join(',')
    window.location.href = `sms:${phones}?body=${encodeURIComponent(smsBody)}`
    await markSent(phoneSelected)
  }

  const RecipientList = ({ list, selected, setSelected, type }: { list: BabyShowerGuest[]; selected: Set<string>; setSelected: (s: Set<string>) => void; type: 'email' | 'phone' }) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
        <button onClick={() => setSelected(selected.size === list.length ? new Set() : new Set(list.map(g => g.id)))} style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>
          {selected.size === list.length ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto', padding: 4, backgroundColor: C.bg, borderRadius: 8 }}>
        {list.map(g => (
          <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', cursor: 'pointer', fontSize: 13, color: C.text }}>
            <input type="checkbox" checked={selected.has(g.id)} onChange={() => toggleSet(selected, setSelected, g.id)} style={{ width: 16, height: 16, accentColor: C.accent }} />
            <span style={{ fontWeight: 500 }}>{g.name}</span>
            <span style={{ color: C.muted, fontSize: 12 }}>{type === 'email' ? g.email : g.phone}</span>
            {g.invitation_sent && <span style={{ color: C.muted, fontSize: 10, marginLeft: 'auto' }}>✉️ Sent {g.invitation_sent_date}</span>}
          </label>
        ))}
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 540, margin: '0 auto', padding: '24px 16px 40px' }}>
        <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: C.secondary, fontSize: 14, fontWeight: 500, padding: '8px 0', marginBottom: 16, fontFamily: "'Inter', sans-serif" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>Back to Dashboard
        </button>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 22, color: C.text, margin: '0 0 8px 0' }}>Send RSVP Link</h1>
        <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 24px 0' }}>Select guests, then open your email or SMS app. Selected guests will be marked as invited.</p>

        <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 8px 0' }}>📧 Email — {emailSelected.size}/{emailGuests.length} selected</h3>
          {emailGuests.length === 0 ? <p style={{ fontSize: 13, color: C.muted, fontStyle: 'italic', margin: 0 }}>No guests have email addresses.</p> : (
            <><RecipientList list={emailGuests} selected={emailSelected} setSelected={setEmailSelected} type="email" />
            <button onClick={handleEmailBlast} disabled={!isConfirmed || emailSelected.size === 0} style={{ width: '100%', marginTop: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600, color: 'white', backgroundColor: isConfirmed && emailSelected.size > 0 ? C.accent : C.muted, border: 'none', borderRadius: 10, cursor: isConfirmed && emailSelected.size > 0 ? 'pointer' : 'default', opacity: isConfirmed && emailSelected.size > 0 ? 1 : 0.5 }}>Open Email App</button></>
          )}
        </div>

        <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 8px 0' }}>💬 Text — {phoneSelected.size}/{phoneGuests.length} selected</h3>
          {phoneGuests.length === 0 ? <p style={{ fontSize: 13, color: C.muted, fontStyle: 'italic', margin: 0 }}>No guests have phone numbers.</p> : (
            <><RecipientList list={phoneGuests} selected={phoneSelected} setSelected={setPhoneSelected} type="phone" />
            <button onClick={handleTextBlast} disabled={!isConfirmed || phoneSelected.size === 0} style={{ width: '100%', marginTop: 12, padding: '12px 16px', fontSize: 14, fontWeight: 600, color: 'white', backgroundColor: isConfirmed && phoneSelected.size > 0 ? C.accent : C.muted, border: 'none', borderRadius: 10, cursor: isConfirmed && phoneSelected.size > 0 ? 'pointer' : 'default', opacity: isConfirmed && phoneSelected.size > 0 ? 1 : 0.5 }}>Open SMS App</button></>
          )}
        </div>

        <div style={{ backgroundColor: C.baby, borderRadius: 12, border: `1px solid ${C.babyBorder}`, padding: 16, textAlign: 'center' }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 4px 0' }}>Type SEND to enable</p>
          <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 12px 0' }}>Your mail/SMS app will open — nothing is sent automatically.</p>
          <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder='Type "SEND"' style={{ width: '100%', padding: '12px 14px', fontSize: 16, textAlign: 'center', letterSpacing: 4, border: `2px solid ${isConfirmed ? C.green : C.border}`, borderRadius: 10, backgroundColor: C.inputBg, color: C.text, outline: 'none', boxSizing: 'border-box', fontWeight: 700 }} />
        </div>
      </div>
    </div>
  )
}

// ==================== Background Adjustment Helpers ====================
const FOCAL_PRESETS: { label: string; x: number; y: number }[] = [
  { label: 'Top', x: 50, y: 0 },
  { label: 'Center', x: 50, y: 50 },
  { label: 'Bottom', x: 50, y: 100 },
  { label: 'Left', x: 0, y: 50 },
  { label: 'Right', x: 100, y: 50 },
]

function parseFocal(s: string | null | undefined): [number, number] {
  if (!s) return [50, 50]
  const parts = s.split(/\s+/).map(p => parseFloat(p))
  return [isNaN(parts[0]) ? 50 : parts[0], isNaN(parts[1]) ? 50 : parts[1]]
}

function SliderRow({ label, value, min, max, step = 1, onChange, suffix = '%' }: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  suffix?: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <label style={{ fontSize: 12, fontWeight: 500, color: C.muted }}>{label}</label>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        style={{ width: '100%', accentColor: C.accent, cursor: 'pointer' }}
      />
    </div>
  )
}

// 8 preset fill colors. Plus a custom color picker as the 9th option.
const FILL_COLOR_PRESETS: { label: string; value: string }[] = [
  { label: 'Cream', value: '#EDE6DE' },
  { label: 'White', value: '#FFFFFF' },
  { label: 'Soft Pink', value: '#FDE8EF' },
  { label: 'Soft Blue', value: '#E8F0FE' },
  { label: 'Sage Green', value: '#E8F0E8' },
  { label: 'Warm Gray', value: '#E0DCD8' },
  { label: 'Charcoal', value: '#2C2522' },
  { label: 'Black', value: '#000000' },
]

// Vignette mask — two linear gradients (one per axis) intersected so the image
// fades evenly on all four edges into the base layer. Shared between the public
// page and this preview so they look identical.
const FEATHER_GRADIENTS = 'linear-gradient(to right, transparent, black 15%, black 85%, transparent), linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)'
const FEATHER_MASK_STYLE: React.CSSProperties = {
  maskImage: FEATHER_GRADIENTS,
  WebkitMaskImage: FEATHER_GRADIENTS,
  maskComposite: 'intersect',
  WebkitMaskComposite: 'source-in',
}

// Live preview of all background layers combined (matches the public page).
// Layers: fill color → tile texture → main image (scaled + positioned, optionally
// feathered) → opacity overlay.
function BackgroundPreview({ imageUrl, focalX, focalY, zoom, overlayOpacity, fillColor, tileUrl, tileCount, featherEdges }: {
  imageUrl: string | null
  focalX: number
  focalY: number
  zoom: number
  overlayOpacity: number
  fillColor: string
  tileUrl: string | null
  tileCount: number
  featherEdges: boolean
}) {
  const pos = `${focalX}% ${focalY}%`
  // Tile sizing: tileCount = N → each tile is 100/N% of element width, so it repeats
  // N times across. Height is "auto" so the tile keeps its native aspect ratio.
  const tileSize = `${100 / Math.max(1, tileCount)}% auto`
  return (
    <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, height: 160 }}>
      {/* Base layer: fill color + optional tile */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundColor: fillColor,
        ...(tileUrl ? {
          backgroundImage: `url(${tileUrl})`,
          backgroundRepeat: 'repeat',
          backgroundSize: tileSize,
          transition: 'background-size 80ms linear',
        } : {}),
      }} />
      {/* Main image (only if uploaded). Same zoom logic as the public page:
          < 100% uses background-size percentage (image paints smaller than the
          element, base layer shows around it); >= 100% uses cover + transform. */}
      {imageUrl && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `url(${imageUrl})`,
          backgroundPosition: pos,
          backgroundRepeat: 'no-repeat',
          transition: 'background-size 80ms linear, transform 80ms linear, background-position 80ms linear',
          ...(featherEdges ? FEATHER_MASK_STYLE : {}),
          ...(zoom < 1
            ? { backgroundSize: `${Math.round(zoom * 100)}% auto` }
            : {
                backgroundSize: 'cover',
                transform: `scale(${zoom})`,
                transformOrigin: pos,
              }
          ),
        }} />
      )}
      {/* Cream overlay — only shown when a main image is set (matches public page) */}
      {imageUrl && (
        <div style={{ position: 'absolute', inset: 0, backgroundColor: `rgba(237, 230, 222, ${overlayOpacity})`, transition: 'background-color 80ms linear' }} />
      )}
    </div>
  )
}

// ==================== Background Settings (image + zoom + position + opacity + fill + tile) ====================
// Storage map:
//   hero_image_path      → main background image
//   hero_focal_point     → position "X% Y%"
//   background_zoom      → scale (allows < 1.0 so the image can be smaller than viewport)
//   background_opacity   → cream overlay opacity (0–0.95)
//   bg_fill_color        → flat color shown behind the image (visible when zoomed out)
//   bg_tile_path         → optional tiled texture image, repeats behind the main image
function BackgroundSettings({ event }: { event: BabyShowerEvent }) {
  const queryClient = useQueryClient()
  const updateEvent = useUpdateShowerEvent()
  const fileRef = useRef<HTMLInputElement>(null)
  const tileFileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingTile, setUploadingTile] = useState(false)
  const imgPath = 'shower/background.jpg'
  const tilePath = 'shower/tile.jpg'

  // DB-backed values (with defaults if the column is null / missing).
  const dbOpacity = event.background_opacity ?? 0.85
  const dbZoom = event.background_zoom ?? 1.0
  const dbFill = event.bg_fill_color ?? '#EDE6DE'
  const dbFeather = event.bg_feather_edges ?? true
  const dbTileCount = event.bg_tile_count ?? 5
  const dbFocal = event.hero_focal_point || '50% 50%'
  const [dbFx, dbFy] = parseFocal(dbFocal)

  // Local state. Initialized from the DB on mount; re-synced via useEffect when the
  // event row changes externally (e.g. after a successful save).
  // Adjustments are LOCAL ONLY — nothing persists until the user clicks "Save".
  const [opacity, setOpacity] = useState(dbOpacity)
  const [zoom, setZoom] = useState(dbZoom)
  const [focalX, setFocalX] = useState(dbFx)
  const [focalY, setFocalY] = useState(dbFy)
  const [fillColor, setFillColor] = useState(dbFill)
  const [featherEdges, setFeatherEdges] = useState(dbFeather)
  const [tileCount, setTileCount] = useState(dbTileCount)

  useEffect(() => { setOpacity(dbOpacity) }, [dbOpacity])
  useEffect(() => { setZoom(dbZoom) }, [dbZoom])
  useEffect(() => { setFocalX(dbFx); setFocalY(dbFy) }, [dbFx, dbFy])
  useEffect(() => { setFillColor(dbFill) }, [dbFill])
  useEffect(() => { setFeatherEdges(dbFeather) }, [dbFeather])
  useEffect(() => { setTileCount(dbTileCount) }, [dbTileCount])

  // "Saved!" confirmation state — set true for 2s after a successful save.
  const [justSaved, setJustSaved] = useState(false)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (savedTimerRef.current) clearTimeout(savedTimerRef.current) }, [])

  const localFocalStr = `${Math.round(focalX)}% ${Math.round(focalY)}%`
  const hasChanges =
    opacity !== dbOpacity ||
    zoom !== dbZoom ||
    localFocalStr !== dbFocal ||
    fillColor.toUpperCase() !== dbFill.toUpperCase() ||
    featherEdges !== dbFeather ||
    tileCount !== dbTileCount

  const handleSave = async () => {
    if (!hasChanges) return
    const updates: Parameters<typeof updateEvent.mutateAsync>[0] = { id: event.id }
    if (opacity !== dbOpacity) updates.background_opacity = opacity
    if (zoom !== dbZoom) updates.background_zoom = zoom
    if (localFocalStr !== dbFocal) updates.hero_focal_point = localFocalStr
    if (fillColor.toUpperCase() !== dbFill.toUpperCase()) updates.bg_fill_color = fillColor
    if (featherEdges !== dbFeather) updates.bg_feather_edges = featherEdges
    if (tileCount !== dbTileCount) updates.bg_tile_count = tileCount

    try {
      await updateEvent.mutateAsync(updates)
      setJustSaved(true)
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setJustSaved(false), 2000)
    } catch {
      // Error is already logged in the mutation's onError handler.
    }
  }

  // Preset buttons set X+Y locally — they don't persist until the user clicks Save.
  const handlePreset = (px: number, py: number) => { setFocalX(px); setFocalY(py) }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setUploading(true)
    try {
      const resized = await resizeImage(file)
      if (event.hero_image_path) {
        const { error: rmErr } = await supabase.storage.from('kristory-photos').remove([event.hero_image_path])
        if (rmErr) console.warn('Failed to remove old background:', rmErr)
      }
      const { error: upErr } = await supabase.storage.from('kristory-photos').upload(imgPath, resized, { contentType: 'image/jpeg', upsert: true }); if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('baby_shower_event').update({ hero_image_path: imgPath, updated_at: new Date().toISOString() }).eq('id', event.id); if (dbErr) throw dbErr
      queryClient.invalidateQueries({ queryKey: ['shower-event'] })
    } catch (err) { console.error(err); alert('Upload failed.') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const handleRemove = async () => {
    if (!event.hero_image_path) return
    const { error: rmErr } = await supabase.storage.from('kristory-photos').remove([event.hero_image_path])
    if (rmErr) console.warn('Failed to remove background:', rmErr)
    await supabase.from('baby_shower_event').update({ hero_image_path: null, updated_at: new Date().toISOString() }).eq('id', event.id)
    queryClient.invalidateQueries({ queryKey: ['shower-event'] })
  }

  const handleTileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return; setUploadingTile(true)
    try {
      const resized = await resizeImage(file)
      if (event.bg_tile_path) {
        const { error: rmErr } = await supabase.storage.from('kristory-photos').remove([event.bg_tile_path])
        if (rmErr) console.warn('Failed to remove old tile:', rmErr)
      }
      const { error: upErr } = await supabase.storage.from('kristory-photos').upload(tilePath, resized, { contentType: 'image/jpeg', upsert: true }); if (upErr) throw upErr
      const { error: dbErr } = await supabase.from('baby_shower_event').update({ bg_tile_path: tilePath, updated_at: new Date().toISOString() }).eq('id', event.id); if (dbErr) throw dbErr
      queryClient.invalidateQueries({ queryKey: ['shower-event'] })
    } catch (err) { console.error(err); alert('Tile upload failed.') }
    finally { setUploadingTile(false); if (tileFileRef.current) tileFileRef.current.value = '' }
  }

  const handleTileRemove = async () => {
    if (!event.bg_tile_path) return
    const { error: rmErr } = await supabase.storage.from('kristory-photos').remove([event.bg_tile_path])
    if (rmErr) console.warn('Failed to remove tile:', rmErr)
    await supabase.from('baby_shower_event').update({ bg_tile_path: null, updated_at: new Date().toISOString() }).eq('id', event.id)
    queryClient.invalidateQueries({ queryKey: ['shower-event'] })
  }

  // Cache-bust both URLs with updated_at so the preview reflects the latest upload.
  const previewUrl = event.hero_image_path ? `${getStorageUrl(event.hero_image_path)}?t=${encodeURIComponent(event.updated_at)}` : null
  const tilePreviewUrl = event.bg_tile_path ? `${getStorageUrl(event.bg_tile_path)}?t=${encodeURIComponent(event.updated_at)}` : null

  return (
    <div>
      <label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Background Image</label>
      {/* Live preview — always shown so the host can preview fill/tile even without a main image */}
      <div style={{ marginBottom: 6, position: 'relative' }}>
        <BackgroundPreview imageUrl={previewUrl} focalX={focalX} focalY={focalY} zoom={zoom} overlayOpacity={opacity} fillColor={fillColor} tileUrl={tilePreviewUrl} tileCount={tileCount} featherEdges={featherEdges} />
        {previewUrl && (
          <button onClick={handleRemove} style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>✕</button>
        )}
      </div>
      <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, color: C.accent, backgroundColor: `${C.accent}10`, border: `1px solid ${C.accent}30`, borderRadius: 8, cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}>{uploading ? 'Uploading...' : event.hero_image_path ? 'Replace' : 'Upload'}</button>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} />

      {/* Per-image sliders only apply when a main image exists */}
      {previewUrl && (
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Position presets — quick shortcuts that set X/Y to common values */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Position</label>
            <div style={{ display: 'flex', gap: 4 }}>
              {FOCAL_PRESETS.map(p => {
                const active = Math.round(focalX) === p.x && Math.round(focalY) === p.y
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => handlePreset(p.x, p.y)}
                    style={{
                      flex: 1,
                      padding: '6px 4px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: active ? C.accent : C.secondary,
                      backgroundColor: active ? `${C.accent}15` : C.inputBg,
                      border: `1px solid ${active ? C.accent : C.border}`,
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontFamily: "'Inter', sans-serif",
                    }}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </div>

          <SliderRow label="Position X" value={Math.round(focalX)} min={0} max={100} onChange={(v) => setFocalX(v)} />
          <SliderRow label="Position Y" value={Math.round(focalY)} min={0} max={100} onChange={(v) => setFocalY(v)} />
          <SliderRow label="Zoom" value={Math.round(zoom * 100)} min={25} max={200} onChange={(v) => setZoom(v / 100)} />

          <div>
            <SliderRow label="Overlay Opacity" value={Math.round(opacity * 100)} min={0} max={95} onChange={(v) => setOpacity(v / 100)} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: C.muted, marginTop: 2 }}>
              <span>0% (no overlay)</span>
              <span>95% (text clearer)</span>
            </div>
          </div>

          {/* Feather edges toggle — applies a radial-gradient mask to the main image
              so it fades smoothly into the fill / tile around the edges. */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '4px 0' }}>
            <input
              type="checkbox"
              checked={featherEdges}
              onChange={(e) => setFeatherEdges(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: C.accent, cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Feather edges</span>
              <span style={{ fontSize: 11, color: C.muted }}>Soft vignette — fades the image into the fill color</span>
            </div>
          </label>
        </div>
      )}

      {/* Behind-the-image fill — visible when the main image is zoomed in below 100% */}
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: C.text, display: 'block', marginBottom: 8 }}>Behind the image</label>

        {/* Flat color picker */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 6 }}>Fill Color</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {FILL_COLOR_PRESETS.map(p => {
              const active = fillColor.toUpperCase() === p.value.toUpperCase()
              return (
                <button
                  key={p.value}
                  type="button"
                  title={p.label}
                  onClick={() => setFillColor(p.value)}
                  style={{
                    width: 30, height: 30, borderRadius: 15,
                    backgroundColor: p.value,
                    border: active ? `3px solid ${C.text}` : `2px solid ${C.border}`,
                    cursor: 'pointer',
                    padding: 0,
                    boxSizing: 'border-box',
                  }}
                />
              )
            })}
            {/* Custom color input — updates local state only; saved via the Save button */}
            <label
              title="Custom color"
              style={{
                width: 30, height: 30, borderRadius: 15,
                border: `2px solid ${C.border}`,
                cursor: 'pointer',
                background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <input
                type="color"
                value={fillColor}
                onChange={(e) => setFillColor(e.target.value)}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
              />
            </label>
            <span style={{ fontSize: 11, color: C.muted, fontFamily: 'monospace', marginLeft: 6 }}>{fillColor.toUpperCase()}</span>
          </div>
        </div>

        {/* Tile texture */}
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 6 }}>Tile Texture (optional)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {tilePreviewUrl && (
              <div style={{
                width: 56, height: 56, borderRadius: 8,
                border: `1px solid ${C.border}`,
                backgroundImage: `url(${tilePreviewUrl})`,
                backgroundRepeat: 'repeat',
                backgroundSize: 'auto',
                flexShrink: 0,
              }} />
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => tileFileRef.current?.click()} disabled={uploadingTile} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, color: C.accent, backgroundColor: `${C.accent}10`, border: `1px solid ${C.accent}30`, borderRadius: 8, cursor: 'pointer', opacity: uploadingTile ? 0.5 : 1 }}>
                {uploadingTile ? 'Uploading...' : tilePreviewUrl ? 'Replace' : 'Upload Tile'}
              </button>
              {tilePreviewUrl && (
                <button onClick={handleTileRemove} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, color: C.error, backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}>Remove</button>
              )}
            </div>
            <input ref={tileFileRef} type="file" accept="image/*" onChange={handleTileUpload} style={{ display: 'none' }} />
          </div>
          <p style={{ fontSize: 10, color: C.muted, margin: '6px 0 0' }}>Small image that repeats. Overrides the fill color if uploaded.</p>

          {/* Repeat count — controls how many times the tile spans the viewport
              horizontally; height auto-scales to keep the tile's aspect ratio. */}
          {tilePreviewUrl && (
            <div style={{ marginTop: 10 }}>
              <SliderRow label="Repeat Count" value={tileCount} min={1} max={20} suffix="x" onChange={(v) => setTileCount(v)} />
            </div>
          )}
        </div>
      </div>

      {/* Save Background Settings — single batched commit for all slider/picker fields */}
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          disabled={!hasChanges || updateEvent.isPending}
          style={{
            padding: '10px 20px',
            fontSize: 14,
            fontWeight: 600,
            color: 'white',
            backgroundColor: justSaved ? C.green : C.accent,
            border: 'none',
            borderRadius: 8,
            cursor: !hasChanges || updateEvent.isPending ? 'default' : 'pointer',
            opacity: !hasChanges || updateEvent.isPending ? 0.5 : 1,
            transition: 'background-color 200ms',
          }}
        >
          {updateEvent.isPending ? 'Saving…' : justSaved ? '✓ Saved!' : 'Save Background Settings'}
        </button>
        {hasChanges && !updateEvent.isPending && !justSaved && (
          <span style={{ fontSize: 12, color: C.muted, fontStyle: 'italic' }}>Unsaved changes</span>
        )}
      </div>
    </div>
  )
}

// ==================== Event Settings ====================
function EventSettings({ event, onSendBlast, collapsed, onToggle }: { event: BabyShowerEvent; onSendBlast: () => void; collapsed: Record<string, boolean>; onToggle: (k: string) => void }) {
  const updateEvent = useUpdateShowerEvent()
  const [editing, setEditing] = useState(false)
  const [eventDate, setEventDate] = useState(event.event_date || ''); const [eventTime, setEventTime] = useState(event.event_time || '')
  const [locationName, setLocationName] = useState(event.location_name || ''); const [locationAddress, setLocationAddress] = useState(event.location_address || '')
  const [description, setDescription] = useState(event.description || ''); const [registryLinks, setRegistryLinks] = useState<{ name: string; url: string }[]>(event.registry_links?.length ? event.registry_links : [])
  const startEdit = () => { setEventDate(event.event_date || ''); setEventTime(event.event_time || ''); setLocationName(event.location_name || ''); setLocationAddress(event.location_address || ''); setDescription(event.description || ''); setRegistryLinks(event.registry_links?.length ? [...event.registry_links] : []); setEditing(true) }
  const handleSave = async () => { await updateEvent.mutateAsync({ id: event.id, event_date: eventDate || null, event_time: eventTime || null, location_name: locationName || null, location_address: locationAddress || null, description: description || null, registry_links: registryLinks.filter(l => l.name && l.url) }); setEditing(false) }
  const isOpen = !collapsed['event']

  return (
    <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
      <SectionHeader title="Event Details" sectionKey="event" collapsed={collapsed} onToggle={onToggle} actions={isOpen ? <div style={{ display: 'flex', gap: 8 }}><a href="/shower" target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, fontWeight: 500, color: C.accent, textDecoration: 'none' }}>View Public Page →</a>{!editing && <button onClick={(e) => { e.stopPropagation(); startEdit() }} style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>}</div> : undefined} />
      {isOpen && !editing && <>
        {event.event_date ? <p style={{ fontSize: 14, color: C.text, margin: '4px 0' }}>{format(new Date(event.event_date + 'T12:00:00'), 'EEEE, MMMM d, yyyy')}{event.event_time ? ` at ${event.event_time}` : ''}</p> : <p style={{ fontSize: 13, color: C.muted, margin: '4px 0', fontStyle: 'italic' }}>No date set</p>}
        {event.location_name && <p style={{ fontSize: 13, color: C.secondary, margin: '2px 0' }}>{event.location_name}{event.location_address && <> — <a href={MAPS_URL(event.location_address)} target="_blank" rel="noopener noreferrer" style={{ color: C.accent, textDecoration: 'none' }}>{event.location_address} →</a></>}</p>}
        {event.description && <p style={{ fontSize: 13, color: C.secondary, margin: '6px 0 0', whiteSpace: 'pre-wrap' }}>{event.description}</p>}
        {event.registry_links && event.registry_links.length > 0 && <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{event.registry_links.map((link, i) => <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.accent, textDecoration: 'none' }}>🎁 {link.name}</a>)}</div>}
        {/* Background image + overlay opacity */}
        <div style={{ marginTop: 12 }}>
          <BackgroundSettings event={event} />
        </div>
        <button onClick={onSendBlast} style={{ marginTop: 12, padding: '10px 16px', fontSize: 13, fontWeight: 600, color: C.accent, backgroundColor: `${C.accent}10`, border: `1px solid ${C.accent}30`, borderRadius: 8, cursor: 'pointer', width: '100%' }}>📨 Send RSVP Link</button>
      </>}
      {isOpen && editing && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Date</label><input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} style={inputBase} /></div><div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Time</label><input type="text" value={eventTime} onChange={(e) => setEventTime(e.target.value)} placeholder="2:00 PM" style={inputBase} /></div></div>
        <div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Location Name</label><input type="text" value={locationName} onChange={(e) => setLocationName(e.target.value)} placeholder="Venue name" style={inputBase} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Location Address</label><input type="text" value={locationAddress} onChange={(e) => setLocationAddress(e.target.value)} placeholder="123 Main St, City, State" style={inputBase} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Description</label><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Personal message..." rows={3} style={{ ...inputBase, resize: 'none' }} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Registry Links</label>{registryLinks.map((link, i) => <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}><input type="text" value={link.name} onChange={(e) => { const u = [...registryLinks]; u[i] = { ...u[i], name: e.target.value }; setRegistryLinks(u) }} placeholder="Name" style={{ ...inputBase, flex: 1 }} /><input type="url" value={link.url} onChange={(e) => { const u = [...registryLinks]; u[i] = { ...u[i], url: e.target.value }; setRegistryLinks(u) }} placeholder="URL" style={{ ...inputBase, flex: 2 }} /><button onClick={() => setRegistryLinks(registryLinks.filter((_, j) => j !== i))} style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, backgroundColor: C.inputBg, color: C.error, cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button></div>)}<button onClick={() => setRegistryLinks([...registryLinks, { name: '', url: '' }])} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, color: C.accent, backgroundColor: 'transparent', border: `1px dashed ${C.accent}`, borderRadius: 8, cursor: 'pointer' }}>+ Add Registry Link</button></div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}><button onClick={() => setEditing(false)} style={{ padding: '10px 16px', fontSize: 13, fontWeight: 500, color: C.secondary, backgroundColor: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button><button onClick={handleSave} disabled={updateEvent.isPending} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: updateEvent.isPending ? 0.5 : 1 }}>{updateEvent.isPending ? 'Saving...' : 'Save'}</button></div>
      </div>}
    </div>
  )
}

// ==================== Schedule (with reorder) ====================
function ScheduleManager({ collapsed, onToggle }: { collapsed: Record<string, boolean>; onToggle: (k: string) => void }) {
  const { data: items = [], isLoading } = useShowerSchedule(); const createItem = useCreateScheduleItem(); const updateItem = useUpdateScheduleItem(); const deleteItem = useDeleteScheduleItem(); const swapOrder = useSwapScheduleOrder()
  const [newTime, setNewTime] = useState(''); const [newDesc, setNewDesc] = useState(''); const [editingId, setEditingId] = useState<string | null>(null); const [editTime, setEditTime] = useState(''); const [editDesc, setEditDesc] = useState('')
  const handleAdd = async (e: React.FormEvent) => { e.preventDefault(); if (!newTime.trim() || !newDesc.trim()) return; await createItem.mutateAsync({ time_slot: newTime.trim(), description: newDesc.trim() }); setNewTime(''); setNewDesc('') }
  const startEdit = (item: BabyShowerScheduleItem) => { setEditingId(item.id); setEditTime(item.time_slot); setEditDesc(item.description) }
  const saveEdit = async () => { if (!editingId) return; await updateItem.mutateAsync({ id: editingId, time_slot: editTime.trim(), description: editDesc.trim() }); setEditingId(null) }
  const moveItem = (idx: number, dir: -1 | 1) => { const other = idx + dir; if (other < 0 || other >= items.length) return; swapOrder.mutate({ idA: items[idx].id, orderA: items[idx].display_order, idB: items[other].id, orderB: items[other].display_order }) }
  if (isLoading) return null
  const isOpen = !collapsed['schedule']
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
      <SectionHeader title="Day-of Schedule" sectionKey="schedule" collapsed={collapsed} onToggle={onToggle} />
      {isOpen && <>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6, marginBottom: items.length > 0 ? 16 : 0 }}><input type="text" value={newTime} onChange={(e) => setNewTime(e.target.value)} placeholder="Time" style={{ ...inputBase, width: 110, flex: 'none' }} /><input type="text" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" style={{ ...inputBase, flex: 1 }} /><button type="submit" disabled={!newTime.trim() || !newDesc.trim()} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: !newTime.trim() || !newDesc.trim() ? 0.5 : 1, flexShrink: 0 }}>Add</button></form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {items.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', gap: 8, position: 'relative', paddingLeft: 20 }}>
              <div style={{ position: 'absolute', left: 0, top: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent }} />
              {i < items.length - 1 && <div style={{ position: 'absolute', left: 4, top: 18, width: 2, height: 'calc(100% - 6px)', backgroundColor: C.border }} />}
              <div style={{ flex: 1, paddingBottom: 14 }}>
                {editingId === item.id ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input type="text" value={editTime} onChange={(e) => setEditTime(e.target.value)} style={{ ...inputBase, width: 90, flex: 'none', padding: '6px 8px', fontSize: 13 }} />
                    <input type="text" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} style={{ ...inputBase, flex: 1, padding: '6px 8px', fontSize: 13 }} />
                    <button onClick={saveEdit} style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
                    <button onClick={() => setEditingId(null)} style={{ fontSize: 12, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1 }}><span style={{ fontSize: 13, fontWeight: 700, color: C.accent }}>{item.time_slot}</span><span style={{ fontSize: 14, color: C.text, marginLeft: 8 }}>{item.description}</span></div>
                    {/* Up/Down arrows */}
                    <button onClick={() => moveItem(i, -1)} disabled={i === 0} style={{ fontSize: 14, color: i === 0 ? C.border : C.muted, background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', padding: '0 2px' }}>▲</button>
                    <button onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} style={{ fontSize: 14, color: i === items.length - 1 ? C.border : C.muted, background: 'none', border: 'none', cursor: i === items.length - 1 ? 'default' : 'pointer', padding: '0 2px' }}>▼</button>
                    <button onClick={() => startEdit(item)} style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                    <InlineConfirm label="Del" onConfirm={() => deleteItem.mutate(item.id)} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </>}
    </div>
  )
}

// ==================== Helpers ====================
const HELPER_COLORS = ['#6B5CA5', '#D4708F', '#4CAF50', '#F59E0B', '#E57373', '#5C9ECE', '#8D6E63', '#26A69A', '#AB47BC', '#FF7043']

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {HELPER_COLORS.map(c => (
        <button key={c} onClick={() => onChange(c)} type="button" style={{
          width: 22, height: 22, borderRadius: 11, backgroundColor: c, border: value === c ? '2px solid #2C2522' : '2px solid transparent',
          cursor: 'pointer', flexShrink: 0, padding: 0,
        }} />
      ))}
    </div>
  )
}

function HelpersSection({ collapsed, onToggle }: { collapsed: Record<string, boolean>; onToggle: (k: string) => void }) {
  const { data: helpers = [], isLoading } = useShowerHelpers(); const createHelper = useCreateShowerHelper(); const updateHelper = useUpdateShowerHelper(); const deleteHelper = useDeleteShowerHelper()
  const [newName, setNewName] = useState(''); const [newRole, setNewRole] = useState(''); const [newColor, setNewColor] = useState(HELPER_COLORS[0])
  const [editingId, setEditingId] = useState<string | null>(null); const [editName, setEditName] = useState(''); const [editRole, setEditRole] = useState(''); const [editColor, setEditColor] = useState(HELPER_COLORS[0])
  const handleAdd = async (e: React.FormEvent) => { e.preventDefault(); if (!newName.trim() || !newRole.trim()) return; await createHelper.mutateAsync({ name: newName.trim(), role: newRole.trim(), color: newColor }); setNewName(''); setNewRole(''); setNewColor(HELPER_COLORS[0]) }
  const startEdit = (h: BabyShowerHelper) => { setEditingId(h.id); setEditName(h.name); setEditRole(h.role); setEditColor(h.color || HELPER_COLORS[0]) }
  const saveEdit = async () => { if (!editingId) return; await updateHelper.mutateAsync({ id: editingId, name: editName.trim(), role: editRole.trim(), color: editColor }); setEditingId(null) }
  if (isLoading) return null
  const isOpen = !collapsed['helpers']
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
      <SectionHeader title="Helpers" sectionKey="helpers" collapsed={collapsed} onToggle={onToggle} />
      {isOpen && <>
        <div style={{ marginBottom: helpers.length > 0 ? 12 : 0 }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" style={{ ...inputBase, width: 120, flex: 'none' }} />
            <input type="text" value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="Role / task" style={{ ...inputBase, flex: 1 }} />
            <button type="submit" disabled={!newName.trim() || !newRole.trim()} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: !newName.trim() || !newRole.trim() ? 0.5 : 1, flexShrink: 0 }}>Add</button>
          </form>
          <ColorPicker value={newColor} onChange={setNewColor} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{helpers.map(h => (
          <div key={h.id} style={{ backgroundColor: C.bg, borderRadius: 8, padding: '10px 12px', borderLeft: `4px solid ${h.color || C.accent}` }}>
            {editingId === h.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...inputBase, width: 100, flex: 'none', padding: '6px 8px', fontSize: 13 }} />
                  <input type="text" value={editRole} onChange={(e) => setEditRole(e.target.value)} style={{ ...inputBase, flex: 1, padding: '6px 8px', fontSize: 13 }} />
                  <button onClick={saveEdit} style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
                  <button onClick={() => setEditingId(null)} style={{ fontSize: 12, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                </div>
                <ColorPicker value={editColor} onChange={setEditColor} />
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: h.color || C.accent, flexShrink: 0 }} />
                <div style={{ flex: 1 }}><span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{h.name}</span><span style={{ fontSize: 13, color: C.secondary, marginLeft: 6 }}>— {h.role}</span></div>
                <button onClick={() => startEdit(h)} style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Edit</button>
                <InlineConfirm label="Del" onConfirm={() => deleteHelper.mutate(h.id)} />
              </div>
            )}
          </div>
        ))}</div>
      </>}
    </div>
  )
}

// ==================== CSV parser ====================
function parseCsv(text: string): string[][] {
  const result: string[][] = []
  let row: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') { inQuote = false }
      else { cur += ch }
    } else {
      if (ch === '"') inQuote = true
      else if (ch === ',') { row.push(cur); cur = '' }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++
        row.push(cur); cur = ''
        if (row.some(c => c.length > 0)) result.push(row)
        row = []
      } else { cur += ch }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur)
    if (row.some(c => c.length > 0)) result.push(row)
  }
  return result
}

// Pottery Cellar catering CSV: columns Item, Price, Unit, Qty, Subtotal.
// Row 3 col 2 = guest count. First 6 rows are header. Skip category headers,
// "Subtotal" rows, blank rows, TBD units, and rows with qty <= 0.
function parsePotteryCellarCsv(text: string): { guestCount: number | null; rows: { name: string; quantity: number; unit: string; notes: string }[] } {
  const all = parseCsv(text)
  const guestRaw = all[2]?.[1] ?? ''
  const guestMatch = guestRaw.match(/\d+/)
  const guestCount = guestMatch ? parseInt(guestMatch[0], 10) : null
  const rows: { name: string; quantity: number; unit: string; notes: string }[] = []
  for (let i = 6; i < all.length; i++) {
    const r = all[i]
    const name = (r[0] || '').trim()
    const price = (r[1] || '').trim()
    const unit = (r[2] || '').trim()
    const qty = parseInt((r[3] || '').trim(), 10)
    if (!name) continue
    if (/subtotal/i.test(name)) continue
    if (unit.toUpperCase() === 'TBD') continue
    if (isNaN(qty) || qty <= 0) continue
    rows.push({ name, quantity: qty, unit: unit || 'servings', notes: price })
  }
  return { guestCount, rows }
}

// ==================== Menu ====================
function MenuSection({ collapsed, onToggle }: { collapsed: Record<string, boolean>; onToggle: (k: string) => void }) {
  const { data: items = [], isLoading } = useShowerMenu()
  const { data: guestCount } = useShowerGuestCount()
  const createItem = useCreateMenuItem(); const updateItem = useUpdateMenuItem(); const deleteItem = useDeleteMenuItem(); const swapOrder = useSwapMenuOrder(); const importCsv = useImportMenuCsv(); const deleteMany = useDeleteMenuItems(); const setGuestCount = useSetShowerGuestCount()
  const fileRef = useRef<HTMLInputElement>(null)

  const [newName, setNewName] = useState(''); const [newQty, setNewQty] = useState('1'); const [newUnit, setNewUnit] = useState('servings'); const [newNotes, setNewNotes] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState(''); const [editQty, setEditQty] = useState('1'); const [editUnit, setEditUnit] = useState('servings'); const [editNotes, setEditNotes] = useState('')
  const [csvPreview, setCsvPreview] = useState<{ guestCount: number | null; rows: { name: string; quantity: number; unit: string; notes: string }[] } | null>(null)
  const [pendingRemoval, setPendingRemoval] = useState<BabyShowerMenuItem[] | null>(null)

  const stats = useMemo(() => ({
    totalItems: items.length,
    totalQty: items.reduce((sum, it) => sum + (it.quantity || 0), 0),
    preparedCount: items.filter(it => it.prepared).length,
  }), [items])

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim()) return
    const qty = parseInt(newQty, 10)
    await createItem.mutateAsync({
      item_name: newName.trim(),
      quantity: isNaN(qty) || qty < 0 ? 1 : qty,
      unit_label: newUnit.trim() || 'servings',
      notes: newNotes.trim() || null,
    })
    setNewName(''); setNewQty('1'); setNewUnit('servings'); setNewNotes('')
  }

  const startEdit = (it: BabyShowerMenuItem) => {
    setEditingId(it.id)
    setEditName(it.item_name); setEditQty(String(it.quantity)); setEditUnit(it.unit_label || 'servings'); setEditNotes(it.notes || '')
  }

  const saveEdit = async () => {
    if (!editingId) return
    const qty = parseInt(editQty, 10)
    await updateItem.mutateAsync({
      id: editingId,
      item_name: editName.trim(),
      quantity: isNaN(qty) || qty < 0 ? 1 : qty,
      unit_label: editUnit.trim() || 'servings',
      notes: editNotes.trim() || null,
    })
    setEditingId(null)
  }

  const moveItem = (idx: number, dir: -1 | 1) => {
    const other = idx + dir
    if (other < 0 || other >= items.length) return
    swapOrder.mutate({ idA: items[idx].id, orderA: items[idx].display_order, idB: items[other].id, orderB: items[other].display_order })
  }

  const handleCsvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (fileRef.current) fileRef.current.value = ''
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parsePotteryCellarCsv(text)
      if (parsed.rows.length === 0) {
        alert('No valid rows found. Expected the Pottery Cellar catering format with Item / Price / Unit / Qty / Subtotal columns.')
        return
      }
      setCsvPreview(parsed)
    } catch (err) {
      console.error(err); alert('Could not read CSV.')
    }
  }

  const handleConfirmImport = async () => {
    if (!csvPreview) return
    const csvNamesLower = new Set(csvPreview.rows.map(r => r.name.toLowerCase()))
    const missing = items.filter(it => !csvNamesLower.has(it.item_name.toLowerCase()))
    await importCsv.mutateAsync({ rows: csvPreview.rows, existing: items })
    if (csvPreview.guestCount != null) await setGuestCount.mutateAsync(csvPreview.guestCount)
    setCsvPreview(null)
    if (missing.length > 0) setPendingRemoval(missing)
  }

  const handleRemoveMissing = async (yes: boolean) => {
    if (yes && pendingRemoval) await deleteMany.mutateAsync(pendingRemoval.map(it => it.id))
    setPendingRemoval(null)
  }

  if (isLoading) return null
  const isOpen = !collapsed['menu']

  return (
    <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
      <SectionHeader title="Menu" sectionKey="menu" collapsed={collapsed} onToggle={onToggle} actions={isOpen ? <button onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }} style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Import CSV</button> : undefined} />
      <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleCsvFile} style={{ display: 'none' }} />
      {isOpen && <>
        {(items.length > 0 || guestCount != null) && (
          <div style={{ display: 'flex', gap: 14, marginBottom: 12, fontSize: 12, color: C.muted, flexWrap: 'wrap' }}>
            {guestCount != null && <span><strong style={{ color: C.text, fontSize: 13 }}>{guestCount}</strong> guests</span>}
            <span><strong style={{ color: C.text, fontSize: 13 }}>{stats.totalItems}</strong> item{stats.totalItems !== 1 ? 's' : ''}</span>
            <span><strong style={{ color: C.text, fontSize: 13 }}>{stats.totalQty}</strong> total qty</span>
            {items.length > 0 && <span><strong style={{ color: C.text, fontSize: 13 }}>{stats.preparedCount}</strong>/{stats.totalItems} ready</span>}
          </div>
        )}
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: items.length > 0 ? 12 : 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Item" style={{ ...inputBase, flex: 1, minWidth: 0 }} />
            <input type="number" min="0" value={newQty} onChange={(e) => setNewQty(e.target.value)} placeholder="Qty" style={{ ...inputBase, width: 64, flex: 'none' }} />
            <input type="text" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} placeholder="Unit" style={{ ...inputBase, width: 96, flex: 'none' }} />
            <button type="submit" disabled={!newName.trim()} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: !newName.trim() ? 0.5 : 1, flexShrink: 0 }}>Add</button>
          </div>
          <input type="text" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Notes (optional)" style={inputBase} />
        </form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{items.map((it, i) => {
          if (editingId === it.id) {
            return (
              <div key={it.id} style={{ backgroundColor: C.bg, borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...inputBase, flex: 1, minWidth: 0 }} />
                  <input type="number" min="0" value={editQty} onChange={(e) => setEditQty(e.target.value)} style={{ ...inputBase, width: 64, flex: 'none' }} />
                  <input type="text" value={editUnit} onChange={(e) => setEditUnit(e.target.value)} style={{ ...inputBase, width: 96, flex: 'none' }} />
                </div>
                <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notes (optional)" style={inputBase} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setEditingId(null)} style={{ fontSize: 12, color: C.muted, background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={saveEdit} style={{ fontSize: 12, fontWeight: 600, color: C.accent, background: 'none', border: 'none', cursor: 'pointer' }}>Save</button>
                </div>
              </div>
            )
          }
          const upDisabled = i === 0
          const downDisabled = i === items.length - 1
          return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0 }}>
                <button onClick={() => moveItem(i, -1)} disabled={upDisabled} title="Move up" style={{ fontSize: 9, lineHeight: 1, color: upDisabled ? C.border : C.muted, background: 'none', border: 'none', cursor: upDisabled ? 'default' : 'pointer', padding: '1px 2px' }}>▲</button>
                <button onClick={() => moveItem(i, 1)} disabled={downDisabled} title="Move down" style={{ fontSize: 9, lineHeight: 1, color: downDisabled ? C.border : C.muted, background: 'none', border: 'none', cursor: downDisabled ? 'default' : 'pointer', padding: '1px 2px' }}>▼</button>
              </div>
              <input type="checkbox" checked={it.prepared} onChange={() => updateItem.mutate({ id: it.id, prepared: !it.prepared })} title="Prepared / ordered" style={{ width: 18, height: 18, accentColor: C.accent, cursor: 'pointer', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, color: it.prepared ? C.muted : C.text, textDecoration: it.prepared ? 'line-through' : 'none' }}>
                  {it.item_name} <span style={{ fontSize: 12, color: C.secondary, fontWeight: 500 }}>· {it.quantity} {it.unit_label}</span>
                </div>
                {/* Notes hidden in display (currently stores CSV-imported price); data preserved, edit input still available */}
              </div>
              <button onClick={() => startEdit(it)} style={{ fontSize: 11, color: C.accent, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>Edit</button>
              <InlineConfirm label="Del" onConfirm={() => deleteItem.mutate(it.id)} />
            </div>
          )
        })}</div>
      </>}
      {csvPreview && (
        <div onClick={() => setCsvPreview(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '100%', backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 4px 0', fontFamily: "'Playfair Display', serif" }}>Import Preview</h3>
            <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 12px 0' }}>
              {csvPreview.rows.length} item{csvPreview.rows.length !== 1 ? 's' : ''} will be imported. Existing items match by name.
              {csvPreview.guestCount != null && <> Guest count: <strong style={{ color: C.text }}>{csvPreview.guestCount}</strong>.</>}
            </p>
            <div style={{ flex: 1, overflowY: 'auto', backgroundColor: C.bg, borderRadius: 8, padding: 8, marginBottom: 12 }}>
              {csvPreview.rows.map((r, i) => {
                const exists = items.some(it => it.item_name.toLowerCase() === r.name.toLowerCase())
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px', fontSize: 13, color: C.text, gap: 8 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                      {r.name} <span style={{ color: exists ? C.muted : C.green, fontSize: 11, fontWeight: 600 }}>{exists ? '(update)' : '(new)'}</span>
                    </span>
                    <span style={{ fontSize: 12, color: C.secondary, flexShrink: 0 }}><strong style={{ color: C.text, fontSize: 13 }}>{r.quantity}</strong> {r.unit}</span>
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setCsvPreview(null)} disabled={importCsv.isPending} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, color: C.secondary, backgroundColor: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleConfirmImport} disabled={importCsv.isPending} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: importCsv.isPending ? 0.5 : 1 }}>{importCsv.isPending ? 'Importing...' : 'Import'}</button>
            </div>
          </div>
        </div>
      )}
      {pendingRemoval && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 420, width: '100%', backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px 0', fontFamily: "'Playfair Display', serif" }}>Remove missing items?</h3>
            <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 8px 0' }}>These items are not in the new upload:</p>
            <ul style={{ fontSize: 13, color: C.text, margin: '0 0 12px 0', paddingLeft: 20, maxHeight: 200, overflowY: 'auto' }}>
              {pendingRemoval.map(it => <li key={it.id}>{it.item_name}</li>)}
            </ul>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => handleRemoveMissing(false)} disabled={deleteMany.isPending} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, color: C.secondary, backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: 8, cursor: 'pointer' }}>No, keep them</button>
              <button onClick={() => handleRemoveMissing(true)} disabled={deleteMany.isPending} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'white', backgroundColor: C.error, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: deleteMany.isPending ? 0.5 : 1 }}>{deleteMany.isPending ? 'Removing...' : 'Yes, remove'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ==================== Checklist ====================
function PrepChecklist({ collapsed, onToggle }: { collapsed: Record<string, boolean>; onToggle: (k: string) => void }) {
  const { data: tasks = [], isLoading } = useShowerTasks(); const createTask = useCreateShowerTask(); const updateTask = useUpdateShowerTask(); const deleteTask = useDeleteShowerTask(); const swapOrder = useSwapTaskOrder()
  const { data: helpers = [] } = useShowerHelpers()
  const [newTitle, setNewTitle] = useState('')
  const sorted = useMemo(() => [...tasks.filter(t => !t.completed), ...tasks.filter(t => t.completed)], [tasks])
  const handleAdd = async (e: React.FormEvent) => { e.preventDefault(); if (!newTitle.trim()) return; await createTask.mutateAsync(newTitle.trim()); setNewTitle('') }
  const moveTask = (idx: number, dir: -1 | 1) => { const other = idx + dir; if (other < 0 || other >= sorted.length) return; if (sorted[idx].completed !== sorted[other].completed) return; swapOrder.mutate({ idA: sorted[idx].id, orderA: sorted[idx].display_order, idB: sorted[other].id, orderB: sorted[other].display_order }) }
  const helperMap = useMemo(() => new Map(helpers.map(h => [h.id, h])), [helpers])
  if (isLoading) return null
  const isOpen = !collapsed['checklist']
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
      <SectionHeader title="Prep Checklist" sectionKey="checklist" collapsed={collapsed} onToggle={onToggle} />
      {isOpen && <>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: 6, marginBottom: sorted.length > 0 ? 12 : 0 }}><input type="text" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add a task..." style={{ ...inputBase, flex: 1 }} /><button type="submit" disabled={!newTitle.trim()} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: !newTitle.trim() ? 0.5 : 1, flexShrink: 0 }}>Add</button></form>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{sorted.map((task, i) => {
          const helper = task.helper_id ? helperMap.get(task.helper_id) : null
          const upDisabled = i === 0 || sorted[i - 1].completed !== task.completed
          const downDisabled = i === sorted.length - 1 || sorted[i + 1].completed !== task.completed
          const due = task.due_date ? parse(task.due_date, 'yyyy-MM-dd', new Date()) : null
          const overdue = !!due && !task.completed && isBefore(due, startOfToday())
          return (
            <div key={task.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0 }}>
                <button onClick={() => moveTask(i, -1)} disabled={upDisabled} title="Move up" style={{ fontSize: 9, lineHeight: 1, color: upDisabled ? C.border : C.muted, background: 'none', border: 'none', cursor: upDisabled ? 'default' : 'pointer', padding: '1px 2px' }}>▲</button>
                <button onClick={() => moveTask(i, 1)} disabled={downDisabled} title="Move down" style={{ fontSize: 9, lineHeight: 1, color: downDisabled ? C.border : C.muted, background: 'none', border: 'none', cursor: downDisabled ? 'default' : 'pointer', padding: '1px 2px' }}>▼</button>
              </div>
              <input type="checkbox" checked={task.completed} onChange={() => updateTask.mutate({ id: task.id, completed: !task.completed })} style={{ width: 18, height: 18, accentColor: C.accent, cursor: 'pointer', flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: task.completed ? C.muted : C.text, textDecoration: task.completed ? 'line-through' : 'none' }}>{task.title}</span>
              {due && <span style={{ fontSize: 12, fontWeight: 500, color: overdue ? C.error : C.muted, flexShrink: 0 }}>{format(due, 'MMM d')}</span>}
              {helper && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 600, color: helper.color || C.accent, backgroundColor: `${helper.color || C.accent}15`, padding: '1px 6px', borderRadius: 10, flexShrink: 0 }}>
                <span style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: helper.color || C.accent }} />{helper.name}
              </span>}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <input
                  type="date"
                  value={task.due_date || ''}
                  onChange={(e) => updateTask.mutate({ id: task.id, due_date: e.target.value || null })}
                  title={due ? `Due ${format(due, 'MMM d, yyyy')}` : 'Set due date'}
                  style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: `1px solid ${C.border}`, backgroundColor: C.inputBg, color: overdue ? C.error : C.secondary, cursor: 'pointer', width: 110 }}
                />
                <select
                  value={task.helper_id || ''}
                  onChange={(e) => updateTask.mutate({ id: task.id, helper_id: e.target.value || null })}
                  style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: `1px solid ${C.border}`, backgroundColor: C.inputBg, color: C.secondary, cursor: 'pointer', maxWidth: 80 }}
                >
                  <option value="">—</option>
                  {helpers.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
                </select>
                <InlineConfirm label="✕" onConfirm={() => deleteTask.mutate(task.id)} />
              </div>
            </div>
          )
        })}</div>
      </>}
    </div>
  )
}

// ==================== Guest Photos ====================
function GuestPhotosAdmin({ collapsed, onToggle }: { collapsed: Record<string, boolean>; onToggle: (k: string) => void }) {
  const { data: photos = [], isLoading } = useShowerPhotos(); const deletePhoto = useDeleteShowerPhoto()
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null)
  if (isLoading || photos.length === 0) return null
  const isOpen = !collapsed['photos']
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
      <SectionHeader title={`Guest Photos (${photos.length})`} sectionKey="photos" collapsed={collapsed} onToggle={onToggle} />
      {isOpen && <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>{photos.map(p => (
          <div key={p.id} style={{ position: 'relative' }}>
            <button onClick={() => setFullscreenUrl(getStorageUrl(p.storage_path))} style={{ aspectRatio: '1', width: '100%', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, padding: 0, cursor: 'pointer', background: 'none' }}><img src={getStorageUrl(p.storage_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" /></button>
            <button onClick={() => { if (confirm('Delete this photo?')) deletePhoto.mutate({ id: p.id, storage_path: p.storage_path }) }} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            {p.uploaded_by && <div style={{ fontSize: 10, color: C.muted, textAlign: 'center', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.uploaded_by}</div>}
          </div>
        ))}</div>
        {fullscreenUrl && <div onClick={() => setFullscreenUrl(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><img src={fullscreenUrl} alt="" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8 }} /><button style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button></div>}
      </>}
    </div>
  )
}

// ==================== Add Guest Form ====================
function AddGuestForm({ onClose }: { onClose: () => void }) {
  const createGuest = useCreateGuest()
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('')
  const [addr, setAddr] = useState<GuestAddress>({}); const [plusOne, setPlusOne] = useState(false); const [plusOneName, setPlusOneName] = useState(''); const [notes, setNotes] = useState('')
  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); if (!name.trim()) return; await createGuest.mutateAsync({ name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, address: addrHasValue(addr) ? addr : null, plus_one: plusOne, plus_one_name: plusOneName.trim() || null, notes: notes.trim() || null }); onClose() }
  return (
    <form onSubmit={handleSubmit} style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.accent}40`, padding: 16, marginBottom: 12 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 12px 0' }}>New Guest</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name *" required style={inputBase} autoFocus />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputBase} /><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" style={inputBase} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Address</label><AddressFields addr={addr} onChange={setAddr} /></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text, cursor: 'pointer' }}><input type="checkbox" checked={plusOne} onChange={(e) => setPlusOne(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.accent }} /> Plus one</label>
        {plusOne && <input type="text" value={plusOneName} onChange={(e) => setPlusOneName(e.target.value)} placeholder="Guest's name" style={inputBase} />}
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" rows={2} style={{ ...inputBase, resize: 'none' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button type="button" onClick={onClose} style={{ padding: '8px 14px', fontSize: 13, color: C.secondary, backgroundColor: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Cancel</button><button type="submit" disabled={!name.trim() || createGuest.isPending} style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: !name.trim() || createGuest.isPending ? 0.5 : 1 }}>{createGuest.isPending ? 'Adding...' : 'Add Guest'}</button></div>
      </div>
    </form>
  )
}

// ==================== Gift Photo ====================
function GiftPhotoSection({ guest }: { guest: BabyShowerGuest }) {
  const queryClient = useQueryClient(); const fileRef = useRef<HTMLInputElement>(null); const [uploading, setUploading] = useState(false); const [fullscreen, setFullscreen] = useState(false)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { const resized = await resizeImage(file); const path = `gifts/${guest.id}.jpg`; if (guest.gift_photo_path) await supabase.storage.from('kristory-photos').remove([guest.gift_photo_path]); const { error: upErr } = await supabase.storage.from('kristory-photos').upload(path, resized, { contentType: 'image/jpeg', upsert: true }); if (upErr) throw upErr; const { error: dbErr } = await supabase.from('baby_shower_guests').update({ gift_photo_path: path, updated_at: new Date().toISOString() }).eq('id', guest.id); if (dbErr) throw dbErr; queryClient.invalidateQueries({ queryKey: ['shower-guests'] }) } catch (err) { console.error(err); alert('Upload failed.') } finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' } }
  return (<>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{guest.gift_photo_path && <button onClick={() => setFullscreen(true)} style={{ width: 48, height: 48, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, padding: 0, cursor: 'pointer', flexShrink: 0, background: 'none' }}><img src={getStorageUrl(guest.gift_photo_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /></button>}<button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, color: C.accent, backgroundColor: `${C.accent}10`, border: `1px solid ${C.accent}30`, borderRadius: 8, cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}>{uploading ? 'Uploading...' : guest.gift_photo_path ? '📷 Replace' : '📷 Add Photo'}</button><input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: 'none' }} /></div>
    {fullscreen && guest.gift_photo_path && <div onClick={() => setFullscreen(false)} style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><img src={getStorageUrl(guest.gift_photo_path)} alt="" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8 }} /><button style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button></div>}
  </>)
}

// ==================== Guest Detail ====================
function GuestDetail({ guest, onClose }: { guest: BabyShowerGuest; onClose: () => void }) {
  const updateGuest = useUpdateGuest(); const deleteGuest = useDeleteGuest()
  const [name, setName] = useState(guest.name); const [email, setEmail] = useState(guest.email || ''); const [phone, setPhone] = useState(guest.phone || '')
  const [addr, setAddr] = useState<GuestAddress>(guest.address || {})
  const [rsvpStatus, setRsvpStatus] = useState(guest.rsvp_status); const [plusOne, setPlusOne] = useState(guest.plus_one); const [plusOneName, setPlusOneName] = useState(guest.plus_one_name || '')
  const [giftDescription, setGiftDescription] = useState(guest.gift_description || ''); const [dietaryNeeds, setDietaryNeeds] = useState(guest.dietary_needs || ''); const [notes, setNotes] = useState(guest.notes || '')
  const [side, setSide] = useState<'L' | 'B' | null>(guest.side ?? null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleSave = async () => { await updateGuest.mutateAsync({ id: guest.id, name: name.trim(), email: email.trim() || null, phone: phone.trim() || null, address: addrHasValue(addr) ? addr : null, rsvp_status: rsvpStatus, plus_one: plusOne, plus_one_name: plusOneName.trim() || null, gift_description: giftDescription.trim() || null, dietary_needs: dietaryNeeds.trim() || null, notes: notes.trim() || null, side }); onClose() }
  const handleMarkInvited = async () => { const today = new Date().toISOString().slice(0, 10); await updateGuest.mutateAsync({ id: guest.id, invitation_sent: !guest.invitation_sent, invitation_sent_date: !guest.invitation_sent ? today : null }) }
  const handleMarkThankYou = async () => { await updateGuest.mutateAsync({ id: guest.id, thank_you_sent: !guest.thank_you_sent }) }
  const handleDelete = async () => { await deleteGuest.mutateAsync(guest.id); onClose() }

  return (
    <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.accent}40`, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h4 style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0 }}>{guest.name}</h4>
        <button onClick={onClose} style={{ fontSize: 18, color: C.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px' }}>✕</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" style={inputBase} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={inputBase} /><input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" style={inputBase} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Address</label><AddressFields addr={addr} onChange={setAddr} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Side</label><div style={{ display: 'flex', gap: 6 }}>{(['L', 'B'] as const).map(s => <button key={s} type="button" onClick={() => setSide(side === s ? null : s)} style={{ flex: 1, padding: '8px 4px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${side === s ? C.accent : C.border}`, backgroundColor: side === s ? (s === 'L' ? C.sideLeahy : C.sideBernier) : 'transparent', color: side === s ? C.text : C.secondary, cursor: 'pointer' }}>{s} — {SIDE_LABEL[s]}</button>)}</div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}><button onClick={handleMarkInvited} disabled={updateGuest.isPending} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: 'white', backgroundColor: guest.invitation_sent ? C.green : C.muted }}>{guest.invitation_sent ? '✓ Invitation Sent' : 'Mark Invitation Sent'}</button>{guest.invitation_sent && guest.invitation_sent_date && <span style={{ fontSize: 11, color: C.muted }}>{guest.invitation_sent_date}</span>}</div>
        <div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>RSVP Status</label><div style={{ display: 'flex', gap: 6 }}>{(['pending', 'yes', 'no', 'maybe'] as const).map(s => <button key={s} onClick={() => setRsvpStatus(s)} style={{ flex: 1, padding: '8px 4px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${rsvpStatus === s ? C.accent : C.border}`, backgroundColor: rsvpStatus === s ? `${C.accent}15` : 'transparent', color: rsvpStatus === s ? C.accent : C.secondary, cursor: 'pointer', textTransform: 'capitalize' }}>{s}</button>)}</div></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text, cursor: 'pointer' }}><input type="checkbox" checked={plusOne} onChange={(e) => setPlusOne(e.target.checked)} style={{ width: 16, height: 16, accentColor: C.accent }} /> Plus one</label>
        {plusOne && <input type="text" value={plusOneName} onChange={(e) => setPlusOneName(e.target.value)} placeholder="Guest's name" style={inputBase} />}
        <div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Dietary Needs</label><input type="text" value={dietaryNeeds} onChange={(e) => setDietaryNeeds(e.target.value)} placeholder="e.g. Vegetarian" style={inputBase} /></div>
        <div><label style={{ fontSize: 12, fontWeight: 500, color: C.muted, display: 'block', marginBottom: 4 }}>Gift Received</label><input type="text" value={giftDescription} onChange={(e) => setGiftDescription(e.target.value)} placeholder="e.g. Stroller" style={inputBase} /><div style={{ marginTop: 8 }}><GiftPhotoSection guest={guest} /></div></div>
        <button onClick={handleMarkThankYou} disabled={updateGuest.isPending} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', color: 'white', backgroundColor: guest.thank_you_sent ? C.green : C.muted, alignSelf: 'flex-start' }}>{guest.thank_you_sent ? '✓ Thank You Sent' : 'Mark Thank You Sent'}</button>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes..." rows={2} style={{ ...inputBase, resize: 'none' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 4 }}>
          {!showDeleteConfirm ? (
            <button onClick={() => setShowDeleteConfirm(true)} style={{ padding: '8px 14px', fontSize: 12, fontWeight: 500, color: C.error, backgroundColor: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer' }}>Remove guest...</button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
              <p style={{ fontSize: 12, color: C.error, margin: 0 }}>Remove {guest.name} from the guest list? This cannot be undone.</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleDelete} disabled={deleteGuest.isPending} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, color: 'white', backgroundColor: C.error, border: 'none', borderRadius: 6, cursor: 'pointer' }}>Delete</button>
                <button onClick={() => setShowDeleteConfirm(false)} style={{ padding: '6px 12px', fontSize: 12, color: C.secondary, backgroundColor: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          )}
          {!showDeleteConfirm && <button onClick={handleSave} disabled={updateGuest.isPending} style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 8, cursor: 'pointer', opacity: updateGuest.isPending ? 0.5 : 1 }}>{updateGuest.isPending ? 'Saving...' : 'Save'}</button>}
        </div>
      </div>
    </div>
  )
}

// ==================== Guest Card ====================
function StatusIcon({ icon, done, color }: { icon: string; done: boolean; color?: string }) {
  return <span style={{ fontSize: 13, opacity: done ? 1 : 0.25 }} title={done ? 'Done' : 'Not done'}>{icon}{done && <span style={{ fontSize: 9, color: color || C.green, marginLeft: 1 }}>✓</span>}</span>
}

function RsvpIcon({ status }: { status: BabyShowerGuest['rsvp_status'] }) {
  if (status === 'yes') return <span style={{ fontSize: 13 }} title="Coming">📋<span style={{ fontSize: 9, color: C.green, marginLeft: 1 }}>✓</span></span>
  if (status === 'no') return <span style={{ fontSize: 13 }} title="Not coming">📋<span style={{ fontSize: 9, color: C.red, marginLeft: 1 }}>✗</span></span>
  if (status === 'maybe') return <span style={{ fontSize: 13 }} title="Maybe">📋<span style={{ fontSize: 9, color: C.yellow, marginLeft: 1 }}>?</span></span>
  return <span style={{ fontSize: 13, opacity: 0.25 }} title="Pending">📋</span>
}

function GuestCard({ guest, onClick }: { guest: BabyShowerGuest; onClick: () => void }) {
  const hasAddr = !!(guest.address && (guest.address.street || guest.address.city || guest.address.state || guest.address.zip))
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', backgroundColor: sideBg(guest.side), border: `1px solid ${C.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', fontFamily: "'Inter', sans-serif", display: 'block' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{guest.name}{guest.plus_one ? <span style={{ fontSize: 12, fontWeight: 400, color: C.muted, marginLeft: 6 }}>+{guest.plus_one_name || '1'}</span> : null}</span>
        {guest.side && <span title={SIDE_LABEL[guest.side]} style={{ fontSize: 11, fontWeight: 700, color: C.text, backgroundColor: 'rgba(255,255,255,0.6)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '1px 7px', flexShrink: 0, marginLeft: 8 }}>{guest.side}</span>}
      </div>
      {(guest.email || guest.phone) && <div style={{ fontSize: 12, color: C.muted, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{guest.email || guest.phone}</div>}
      {guest.dietary_needs && <div style={{ fontSize: 12, color: C.secondary, marginBottom: 2 }}>🍽 {guest.dietary_needs}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <StatusIcon icon="✉️" done={guest.invitation_sent} />
        <RsvpIcon status={guest.rsvp_status} />
        <StatusIcon icon="📍" done={hasAddr} />
        <StatusIcon icon="🎁" done={!!guest.gift_description} color={C.accent} />
        <StatusIcon icon="💌" done={guest.thank_you_sent} />
      </div>
    </button>
  )
}

// ==================== Print / Export ====================
function printThankYouList(guests: BabyShowerGuest[]) {
  const giftGuests = guests.filter(g => g.gift_description).sort((a, b) => a.name.localeCompare(b.name))
  if (giftGuests.length === 0) { alert('No guests have gifts recorded.'); return }
  const rows = giftGuests.map(g => `<tr><td style="padding:8px 12px;border-bottom:1px solid #ddd;font-weight:500">${g.name}</td><td style="padding:8px 12px;border-bottom:1px solid #ddd">${g.gift_description || ''}</td><td style="padding:8px 12px;border-bottom:1px solid #ddd;font-size:12px">${formatAddr(g.address)}</td><td style="padding:8px 12px;border-bottom:1px solid #ddd;text-align:center;width:50px">☐</td></tr>`).join('')
  const html = `<!DOCTYPE html><html><head><title>Thank You List</title><style>body{font-family:Arial,sans-serif;color:#222;padding:24px}h1{font-size:22px;margin:0 0 4px}p.sub{font-size:13px;color:#888;margin:0 0 20px}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 12px;border-bottom:2px solid #333;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#555}@media print{body{padding:0}}</style></head><body><h1>Thank You List</h1><p class="sub">${giftGuests.length} gift${giftGuests.length !== 1 ? 's' : ''} &middot; ${format(new Date(), 'MMMM d, yyyy')}</p><table><thead><tr><th>Name</th><th>Gift</th><th>Address</th><th>Sent</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
  const w = window.open('', '_blank'); if (!w) { alert('Allow pop-ups to print.'); return }; w.document.write(html); w.document.close(); w.onload = () => w.print()
}

function exportCSV(guests: BabyShowerGuest[]) {
  const headers = ['Name', 'Email', 'Phone', 'Address', 'RSVP', 'Plus One', 'Dietary Needs', 'Gift', 'Thank You Sent', 'Notes']
  const rows = guests.map(g => [g.name, g.email || '', g.phone || '', formatAddr(g.address), g.rsvp_status, g.plus_one ? (g.plus_one_name || 'Yes') : 'No', g.dietary_needs || '', g.gift_description || '', g.thank_you_sent ? 'Yes' : 'No', g.notes || ''])
  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `shower-guests-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click(); URL.revokeObjectURL(url)
}

function exportMintedCSV(guests: BabyShowerGuest[]) {
  const withAddr = guests.filter(g => g.address && (g.address.street || g.address.city || g.address.state || g.address.zip))
  if (withAddr.length === 0) { alert('No guests have an address.'); return }
  const headers = ['First Name', 'Last Name', 'Address 1', 'Address 2', 'City', 'State', 'Zip', 'Country']
  const rows = withAddr.map(g => {
    const trimmed = g.name.trim()
    const sp = trimmed.indexOf(' ')
    const first = sp === -1 ? trimmed : trimmed.slice(0, sp)
    const last = sp === -1 ? '' : trimmed.slice(sp + 1).trim()
    const a = g.address!
    return [first, last, a.street || '', a.apt || '', a.city || '', a.state || '', a.zip || '', 'US']
  })
  const csv = [headers, ...rows].map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'minted-addresses.csv'; a.click(); URL.revokeObjectURL(url)
}

// ==================== Unmatched RSVPs ====================
function UnmatchedRsvpRow({ guest, hostGuests, collapsedRow, onToggle }: { guest: BabyShowerGuest; hostGuests: BabyShowerGuest[]; collapsedRow: boolean; onToggle: () => void }) {
  const mergeRsvp = useMergeGuestRsvp()
  const updateGuest = useUpdateGuest()
  const [merging, setMerging] = useState<string | null>(null)

  const rsvpLabel = guest.rsvp_status === 'yes' ? 'Coming' : guest.rsvp_status === 'maybe' ? 'Maybe' : guest.rsvp_status === 'no' ? "Can't make it" : 'Pending'
  const rsvpColor = guest.rsvp_status === 'yes' ? C.green : guest.rsvp_status === 'maybe' ? C.yellow : guest.rsvp_status === 'no' ? C.error : C.muted

  const handleMerge = async (targetId: string) => {
    setMerging(targetId)
    try { await mergeRsvp.mutateAsync({ sourceId: guest.id, targetId }) }
    finally { setMerging(null) }
  }

  const handleKeepAsNew = async () => {
    await updateGuest.mutateAsync({ id: guest.id, added_by: 'host' })
  }

  return (
    <div style={{ backgroundColor: C.bg, borderRadius: 10, border: `1px solid ${C.babyBorder}`, padding: 12, marginBottom: 8 }}>
      <button onClick={onToggle} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: "'Inter', sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{guest.name}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 2, fontSize: 12, color: C.secondary }}>
              <span style={{ color: rsvpColor, fontWeight: 600 }}>{rsvpLabel}</span>
              {guest.dietary_needs && <span>· 🍽 {guest.dietary_needs}</span>}
              {guest.rsvp_date && <span>· {guest.rsvp_date}</span>}
            </div>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" style={{ transition: 'transform 200ms', transform: collapsedRow ? 'rotate(-90deg)' : 'rotate(0deg)', flexShrink: 0 }}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
        </div>
      </button>

      {!collapsedRow && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
          <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 8px 0' }}>Merge this RSVP into an existing guest, or keep it as a new guest.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto', backgroundColor: C.card, borderRadius: 8, padding: 4 }}>
            {hostGuests.length === 0 ? (
              <p style={{ fontSize: 12, color: C.muted, fontStyle: 'italic', padding: 8, margin: 0 }}>No existing guests to merge into.</p>
            ) : hostGuests.map(h => (
              <button
                key={h.id}
                onClick={() => handleMerge(h.id)}
                disabled={mergeRsvp.isPending}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', fontSize: 13, color: C.text, backgroundColor: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer', textAlign: 'left', opacity: mergeRsvp.isPending && merging !== h.id ? 0.5 : 1, fontFamily: "'Inter', sans-serif" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.bg }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
              >
                <span style={{ fontWeight: 500 }}>{h.name}{h.side && <span style={{ fontSize: 11, color: C.muted, marginLeft: 6 }}>({SIDE_LABEL[h.side]})</span>}</span>
                <span style={{ fontSize: 11, color: C.accent, fontWeight: 600 }}>{merging === h.id ? 'Merging…' : 'Merge →'}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={handleKeepAsNew} disabled={updateGuest.isPending} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, color: C.secondary, backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', opacity: updateGuest.isPending ? 0.5 : 1 }}>{updateGuest.isPending ? 'Saving…' : 'Keep as new guest'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function UnmatchedRsvpsSection({ guests, collapsed, onToggle }: { guests: BabyShowerGuest[]; collapsed: Record<string, boolean>; onToggle: (k: string) => void }) {
  const unmatched = useMemo(() => guests.filter(g => g.added_by === 'guest'), [guests])
  const hostGuests = useMemo(() => guests.filter(g => g.added_by !== 'guest').sort((a, b) => a.name.localeCompare(b.name)), [guests])
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (unmatched.length === 0) return null
  const isOpen = !collapsed['unmatched']

  return (
    <div style={{ backgroundColor: C.baby, borderRadius: 12, border: `1px solid ${C.babyBorder}`, padding: 16, marginBottom: 16 }}>
      <SectionHeader
        title={`Unmatched RSVPs (${unmatched.length})`}
        sectionKey="unmatched"
        collapsed={collapsed}
        onToggle={onToggle}
      />
      {isOpen && <>
        <p style={{ fontSize: 12, color: C.secondary, margin: '0 0 12px 0' }}>
          These RSVPs were submitted by guests and didn't exact-match a name on your list. Merge into an existing guest if it's a duplicate, or keep as a new guest.
        </p>
        {unmatched.map(g => (
          <UnmatchedRsvpRow
            key={g.id}
            guest={g}
            hostGuests={hostGuests}
            collapsedRow={expandedId !== g.id}
            onToggle={() => setExpandedId(expandedId === g.id ? null : g.id)}
          />
        ))}
      </>}
    </div>
  )
}

// ==================== Dashboard ====================
function DashboardContent() {
  const { data: event, isLoading: eventLoading } = useShowerEvent(); const { data: guests = [], isLoading: guestsLoading } = useShowerGuests(); const updateGuest = useUpdateGuest()
  const { collapsed, toggle } = useCollapseState()
  const [filter, setFilter] = useState<Filter>('all'); const [showAddGuest, setShowAddGuest] = useState(false); const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null); const [showBlastScreen, setShowBlastScreen] = useState(false)

  const stats = useMemo(() => {
    const total = guests.length; const invitedCount = guests.filter(g => g.invitation_sent).length
    const yesGuests = guests.filter(g => g.rsvp_status === 'yes'); const yesCount = yesGuests.length; const seatsCount = yesGuests.reduce((n, g) => n + 1 + (g.plus_one ? 1 : 0), 0)
    const maybeCount = guests.filter(g => g.rsvp_status === 'maybe').length; const noCount = guests.filter(g => g.rsvp_status === 'no').length; const pendingCount = guests.filter(g => g.rsvp_status === 'pending').length
    const giftCount = guests.filter(g => g.gift_description).length; const thankYouCount = guests.filter(g => g.thank_you_sent).length; const needThankYou = guests.filter(g => g.gift_description && !g.thank_you_sent).length; const dietaryCount = guests.filter(g => g.dietary_needs).length
    return { total, invitedCount, yesCount, seatsCount, maybeCount, noCount, pendingCount, giftCount, thankYouCount, needThankYou, dietaryCount }
  }, [guests])

  const filteredGuests = useMemo(() => { switch (filter) { case 'invited': return guests.filter(g => g.invitation_sent); case 'not-invited': return guests.filter(g => !g.invitation_sent); case 'coming': return guests.filter(g => g.rsvp_status === 'yes'); case 'maybe': return guests.filter(g => g.rsvp_status === 'maybe'); case 'not-coming': return guests.filter(g => g.rsvp_status === 'no'); case 'pending': return guests.filter(g => g.rsvp_status === 'pending'); case 'has-gift': return guests.filter(g => g.gift_description); case 'need-thank-you': return guests.filter(g => g.gift_description && !g.thank_you_sent); case 'dietary-needs': return guests.filter(g => g.dietary_needs); default: return guests } }, [guests, filter])
  const handleMarkAllInvited = async () => { const u = guests.filter(g => !g.invitation_sent); if (!u.length) return; if (!confirm(`Mark ${u.length} as invited?`)) return; const t = new Date().toISOString().slice(0, 10); for (const g of u) await updateGuest.mutateAsync({ id: g.id, invitation_sent: true, invitation_sent_date: t }) }

  const filters: { key: Filter; label: string }[] = [{ key: 'all', label: `All (${stats.total})` }, { key: 'invited', label: `Invited (${stats.invitedCount})` }, { key: 'not-invited', label: `Not Invited (${stats.total - stats.invitedCount})` }, { key: 'coming', label: `Coming (${stats.yesCount})` }, { key: 'maybe', label: `Maybe (${stats.maybeCount})` }, { key: 'not-coming', label: `No (${stats.noCount})` }, { key: 'pending', label: `Pending (${stats.pendingCount})` }, { key: 'has-gift', label: `Gift (${stats.giftCount})` }, { key: 'need-thank-you', label: `Need TY (${stats.needThankYou})` }, { key: 'dietary-needs', label: `Dietary (${stats.dietaryCount})` }]

  if (showBlastScreen) return <SendBlastScreen guests={guests} event={event ?? null} onBack={() => setShowBlastScreen(false)} />

  const isGuestListOpen = !collapsed['guestlist']

  return (
    <div style={{ minHeight: '100vh', backgroundColor: C.bg, fontFamily: "'Inter', sans-serif" }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 40px' }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 24, color: C.text, margin: '0 0 12px 0' }}>Shower Manager</h1>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8 }}>
            {[{ label: 'Total', value: stats.total }, { label: 'Invited', value: `${stats.invitedCount}/${stats.total}` }, { label: 'Attending', value: stats.seatsCount, color: C.green, sub: stats.seatsCount !== stats.yesCount ? `${stats.yesCount} + ${stats.seatsCount - stats.yesCount} guests` : undefined }, { label: 'Maybe', value: stats.maybeCount, color: C.yellow }, { label: 'Gifts', value: stats.giftCount, color: C.accent }, { label: 'TY Sent', value: `${stats.thankYouCount}/${stats.giftCount}` }].map((stat, i) => (
              <div key={i} style={{ backgroundColor: C.card, borderRadius: 8, padding: '8px 6px', textAlign: 'center', border: `1px solid ${C.border}` }}><div style={{ fontSize: 16, fontWeight: 700, color: stat.color || C.text }}>{stat.value}</div><div style={{ fontSize: 10, fontWeight: 500, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.03em' }}>{stat.label}</div>{stat.sub && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{stat.sub}</div>}</div>
            ))}
          </div>
        </div>

        {eventLoading ? <div style={{ height: 80, borderRadius: 12, backgroundColor: C.card, animation: 'pulse 1.5s infinite', marginBottom: 16 }} /> : event ? <EventSettings event={event} onSendBlast={() => setShowBlastScreen(true)} collapsed={collapsed} onToggle={toggle} /> : null}
        <ScheduleManager collapsed={collapsed} onToggle={toggle} />
        <HelpersSection collapsed={collapsed} onToggle={toggle} />
        <PrepChecklist collapsed={collapsed} onToggle={toggle} />
        <MenuSection collapsed={collapsed} onToggle={toggle} />
        <GuestPhotosAdmin collapsed={collapsed} onToggle={toggle} />

        <UnmatchedRsvpsSection guests={guests} collapsed={collapsed} onToggle={toggle} />

        {/* Guest List */}
        <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 16 }}>
          <SectionHeader title="Guest List" sectionKey="guestlist" collapsed={collapsed} onToggle={toggle} actions={isGuestListOpen ? <div style={{ display: 'flex', gap: 6 }}><button onClick={handleMarkAllInvited} disabled={updateGuest.isPending || !guests.filter(g => !g.invitation_sent).length} style={{ padding: '4px 8px', fontSize: 10, fontWeight: 500, color: C.secondary, backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', opacity: !guests.filter(g => !g.invitation_sent).length ? 0.4 : 1 }}>Mark All Invited</button><button onClick={() => printThankYouList(guests)} disabled={!guests.filter(g => g.gift_description).length} style={{ padding: '4px 8px', fontSize: 10, fontWeight: 500, color: C.secondary, backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', opacity: !guests.filter(g => g.gift_description).length ? 0.4 : 1 }}>Print TY</button><button onClick={() => exportCSV(guests)} disabled={!guests.length} style={{ padding: '4px 8px', fontSize: 10, fontWeight: 500, color: C.secondary, backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', opacity: !guests.length ? 0.4 : 1 }}>CSV</button>{(() => { const n = guests.filter(g => g.address && (g.address.street || g.address.city || g.address.state || g.address.zip)).length; return <button onClick={() => exportMintedCSV(guests)} disabled={!n} title={n ? `${n} guest${n !== 1 ? 's' : ''} with address` : 'No guests have an address'} style={{ padding: '4px 8px', fontSize: 10, fontWeight: 500, color: C.secondary, backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, cursor: 'pointer', opacity: !n ? 0.4 : 1 }}>Export for Minted</button> })()}</div> : undefined} />
          {isGuestListOpen && <>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 12, WebkitOverflowScrolling: 'touch' }}>{filters.map(f => <button key={f.key} onClick={() => setFilter(f.key)} style={{ padding: '6px 12px', fontSize: 12, fontWeight: 500, borderRadius: 20, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', backgroundColor: filter === f.key ? C.accent : C.bg, color: filter === f.key ? 'white' : C.secondary, flexShrink: 0 }}>{f.label}</button>)}</div>
            {showAddGuest ? <AddGuestForm onClose={() => setShowAddGuest(false)} /> : <button onClick={() => setShowAddGuest(true)} style={{ width: '100%', padding: '12px 16px', fontSize: 14, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 10, cursor: 'pointer', marginBottom: 12 }}>+ Add Guest</button>}
            {guestsLoading ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[1, 2, 3].map(i => <div key={i} style={{ height: 72, borderRadius: 10, backgroundColor: C.bg, animation: 'pulse 1.5s infinite' }} />)}</div>
            : filteredGuests.length === 0 ? <div style={{ textAlign: 'center', padding: '40px 0' }}><div style={{ fontSize: 40, marginBottom: 8 }}>📋</div><p style={{ color: C.secondary, fontSize: 14 }}>{!guests.length ? 'No guests yet.' : 'No guests match this filter.'}</p></div>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{filteredGuests.map(g => selectedGuestId === g.id ? <GuestDetail key={g.id} guest={g} onClose={() => setSelectedGuestId(null)} /> : <GuestCard key={g.id} guest={g} onClick={() => setSelectedGuestId(g.id)} />)}</div>}
          </>}
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }`}</style>
    </div>
  )
}

// ==================== Root ====================
export default function ShowerManage() {
  const { data: profile, isLoading } = useBabyProfileManage()
  const [authenticated, setAuthenticated] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true')
  if (isLoading) return <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}><p style={{ color: C.secondary, fontSize: 14 }}>Loading...</p></div>
  if (!profile) return <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif", textAlign: 'center', padding: 24 }}><div><h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 28, color: C.text, margin: '0 0 12px 0' }}>Shower Manager</h1><p style={{ color: C.secondary, fontSize: 15 }}>Not set up yet.</p></div></div>
  if (!authenticated) return <PinGate profile={profile} onSuccess={() => setAuthenticated(true)} />
  return <DashboardContent />
}
