import { useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parse, differenceInDays, differenceInWeeks } from 'date-fns'
import { supabase } from '../lib/supabase'
import { resizeImage, getStorageUrl } from '../lib/helpers'
import { useShowerEvent, usePublicShowerGuests, useRsvpGuest, useShowerPhotos } from '../hooks/useBabyShower'
import type { BabyProfile, BabyShowerEvent, BabyShowerGuest, BabyShowerPhoto } from '../types'

const C = {
  bg: '#EDE6DE', card: '#F7F3EF', border: '#DDD5CB', text: '#2C2522',
  secondary: '#8C8078', muted: '#B5ADA5', accent: '#6B5CA5',
  baby: '#FFF8E7', babyBorder: '#F0C987', error: '#E5534B',
  inputBg: '#F7F3EF', green: '#4CAF50', yellow: '#F59E0B',
} as const

const MAPS_URL = (addr: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`

function useBabyProfilePublic() {
  return useQuery({
    queryKey: ['family-feed-profile'],
    queryFn: async () => {
      const { data, error } = await supabase.from('baby_profile').select('*').maybeSingle()
      if (error) throw error
      return data as BabyProfile | null
    },
  })
}

function EventCountdown({ eventDate }: { eventDate: string }) {
  const d = parse(eventDate, 'yyyy-MM-dd', new Date())
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const totalDays = differenceInDays(d, today)
  if (totalDays < 0) return <p style={{ fontSize: 15, fontWeight: 600, color: C.accent, margin: '4px 0 0', textAlign: 'center' }}>Thanks for celebrating with us! 🎉</p>
  const weeks = differenceInWeeks(d, today); const days = totalDays - weeks * 7
  const text = totalDays === 0 ? "Today's the day! 🎈" : weeks > 0 ? `${weeks} week${weeks !== 1 ? 's' : ''}, ${days} day${days !== 1 ? 's' : ''} away!` : `${totalDays} day${totalDays !== 1 ? 's' : ''} away!`
  return <p style={{ fontSize: 15, fontWeight: 600, color: C.accent, margin: '4px 0 0', textAlign: 'center' }}>{text}</p>
}

function downloadICS(event: BabyShowerEvent) {
  const d = event.event_date || ''; const dateStr = d.replace(/-/g, '')
  const dtStart = `${dateStr}T140000`; const dtEnd = `${dateStr}T160000`
  const location = [event.location_name, event.location_address].filter(Boolean).join(', ')
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kristory//BabyShower//EN', 'BEGIN:VEVENT', `DTSTART:${dtStart}`, `DTEND:${dtEnd}`, 'SUMMARY:Baby Shower', location ? `LOCATION:${location}` : '', event.description ? `DESCRIPTION:${event.description.replace(/\n/g, '\\n')}` : '', 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' }); const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = 'baby-shower.ics'; a.click(); URL.revokeObjectURL(url)
}

// -- RSVP Form --
function RsvpForm({ onSuccess }: { onSuccess: (status: string) => void }) {
  const rsvp = useRsvpGuest()
  const [name, setName] = useState('')
  const [status, setStatus] = useState<'yes' | 'no' | 'maybe' | null>(null)
  const [dietaryNeeds, setDietaryNeeds] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim() || !status) return
    await rsvp.mutateAsync({
      name: name.trim(),
      rsvp_status: status,
      dietary_needs: dietaryNeeds.trim() || null,
    })
    onSuccess(status)
  }

  const rsvpOptions = [
    { value: 'yes' as const, label: 'Coming! 🎉', color: C.green },
    { value: 'maybe' as const, label: 'Maybe 🤔', color: C.yellow },
    { value: 'no' as const, label: "Can't make it 😢", color: C.error },
  ]
  const inputStyle: React.CSSProperties = { width: '100%', padding: '12px 14px', fontSize: 15, border: `1px solid ${C.border}`, borderRadius: 10, backgroundColor: C.inputBg, color: C.text, outline: 'none', boxSizing: 'border-box' }

  return (
    <form onSubmit={handleSubmit}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 20, color: C.text, margin: '0 0 16px 0' }}>Let us know you're coming!</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label style={{ fontSize: 13, fontWeight: 500, color: C.secondary, display: 'block', marginBottom: 4 }}>Name *</label><input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required style={inputStyle} /></div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 500, color: C.secondary, display: 'block', marginBottom: 8 }}>Will you be there?</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {rsvpOptions.map((opt) => (
              <button key={opt.value} type="button" onClick={() => setStatus(opt.value)} style={{ flex: 1, padding: '14px 8px', fontSize: 14, fontWeight: 600, borderRadius: 12, border: `2px solid ${status === opt.value ? opt.color : C.border}`, backgroundColor: status === opt.value ? `${opt.color}15` : C.card, color: status === opt.value ? opt.color : C.secondary, cursor: 'pointer', transition: 'all 150ms ease', fontFamily: "'Inter', sans-serif" }}>{opt.label}</button>
            ))}
          </div>
        </div>
        {(status === 'yes' || status === 'maybe') && (
          <div><label style={{ fontSize: 13, fontWeight: 500, color: C.secondary, display: 'block', marginBottom: 4 }}>Any dietary needs? (optional)</label><input type="text" value={dietaryNeeds} onChange={(e) => setDietaryNeeds(e.target.value)} placeholder="e.g. Vegetarian, nut allergy, gluten-free" style={inputStyle} /></div>
        )}
        <button type="submit" disabled={!name.trim() || !status || rsvp.isPending} style={{ width: '100%', padding: '16px 24px', fontSize: 16, fontWeight: 600, color: 'white', backgroundColor: C.accent, border: 'none', borderRadius: 12, cursor: 'pointer', opacity: !name.trim() || !status || rsvp.isPending ? 0.5 : 1, marginTop: 4 }}>{rsvp.isPending ? 'Submitting...' : 'Submit RSVP'}</button>
      </div>
    </form>
  )
}

function PublicGuestList({ guests }: { guests: Pick<BabyShowerGuest, 'name' | 'rsvp_status' | 'plus_one' | 'plus_one_name'>[] }) {
  const coming = guests.filter(g => g.rsvp_status === 'yes'); const maybe = guests.filter(g => g.rsvp_status === 'maybe'); const pending = guests.filter(g => g.rsvp_status === 'pending')
  const comingCount = coming.reduce((n, g) => n + 1 + (g.plus_one ? 1 : 0), 0)
  const Group = ({ label, color, items }: { label: string; color: string; items: typeof coming }) => {
    const bgMap: Record<string, string> = { [C.green]: '#E8F5E9', [C.yellow]: '#FFF8E1', [C.muted]: '#F5F5F5' }; const fgMap: Record<string, string> = { [C.green]: '#2E7D32', [C.yellow]: '#F57F17', [C.muted]: C.muted }
    return (<div style={{ marginBottom: 16 }}><div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color, marginBottom: 8 }}>{label}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{items.map((g, i) => <span key={i} style={{ display: 'inline-block', padding: '6px 12px', fontSize: 13, borderRadius: 20, backgroundColor: bgMap[color] || '#F5F5F5', color: fgMap[color] || C.muted, fontWeight: 500 }}>{g.name}{g.plus_one && g.plus_one_name ? ` + ${g.plus_one_name}` : g.plus_one ? ' +1' : ''}</span>)}</div></div>)
  }
  return (
    <div>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 20, color: C.text, margin: '0 0 8px 0' }}>Guest List</h2>
      <p style={{ fontSize: 13, color: C.secondary, margin: '0 0 16px 0' }}>{comingCount} coming{maybe.length > 0 ? `, ${maybe.length} maybe` : ''}{pending.length > 0 ? `, ${pending.length} pending` : ''}</p>
      {coming.length > 0 && <Group label="Coming 🎉" color={C.green} items={coming} />}
      {maybe.length > 0 && <Group label="Maybe 🤔" color={C.yellow} items={maybe} />}
      {pending.length > 0 && <Group label="Pending" color={C.muted} items={pending} />}
      {coming.length === 0 && maybe.length === 0 && pending.length === 0 && <div style={{ textAlign: 'center', padding: '32px 0' }}><div style={{ fontSize: 40, marginBottom: 8 }}>🎈</div><p style={{ color: C.secondary, fontSize: 14 }}>Be the first to RSVP!</p></div>}
    </div>
  )
}

function PhotoSection({ photos }: { photos: BabyShowerPhoto[] }) {
  const queryClient = useQueryClient(); const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false); const [uploadedBy, setUploadedBy] = useState(''); const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null)
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files || files.length === 0) return; setUploading(true)
    try { for (const file of Array.from(files)) { const resized = await resizeImage(file); const path = `shower-photos/${crypto.randomUUID()}.jpg`; const { error: upErr } = await supabase.storage.from('kristory-photos').upload(path, resized, { contentType: 'image/jpeg' }); if (upErr) throw upErr; const { error: dbErr } = await supabase.from('baby_shower_photos').insert({ storage_path: path, uploaded_by: uploadedBy.trim() || null }); if (dbErr) throw dbErr }; queryClient.invalidateQueries({ queryKey: ['shower-photos'] }); setUploadedBy('') }
    catch (err) { console.error('Photo upload failed:', err); alert('Upload failed.') }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = '' }
  }
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 20, color: C.text, margin: '0 0 16px 0' }}>Share Your Photos 📸</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <input type="text" value={uploadedBy} onChange={(e) => setUploadedBy(e.target.value)} placeholder="Your name (optional)" style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.border}`, borderRadius: 8, backgroundColor: C.inputBg, color: C.text, outline: 'none', boxSizing: 'border-box' }} />
        <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ width: '100%', padding: '12px 16px', fontSize: 14, fontWeight: 600, color: C.accent, backgroundColor: `${C.accent}10`, border: `1px solid ${C.accent}30`, borderRadius: 10, cursor: 'pointer', opacity: uploading ? 0.5 : 1 }}>{uploading ? 'Uploading...' : '📷 Select Photos'}</button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} style={{ display: 'none' }} />
      </div>
      {photos.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>{photos.map((p) => <button key={p.id} onClick={() => setFullscreenUrl(getStorageUrl(p.storage_path))} style={{ aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, padding: 0, cursor: 'pointer', background: 'none' }}><img src={getStorageUrl(p.storage_path)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} loading="lazy" /></button>)}</div>}
      {fullscreenUrl && <div onClick={() => setFullscreenUrl(null)} style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><img src={fullscreenUrl} alt="" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain', borderRadius: 8 }} /><button style={{ position: 'absolute', top: 16, right: 16, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button></div>}
    </div>
  )
}

function ShowerContent({ profile }: { profile: BabyProfile }) {
  const { data: event, isLoading: eventLoading } = useShowerEvent()
  const { data: guests = [], isLoading: guestsLoading } = usePublicShowerGuests(true)
  const { data: photos = [] } = useShowerPhotos()
  const [rsvpDone, setRsvpDone] = useState<string | null>(null)
  const babyName = profile.name && profile.name !== 'Baby' ? profile.name : null

  // Cache-bust with event.updated_at — both storage paths are stable, so without
  // a query param the browser keeps serving the previous image after replacement.
  const bgUrl = event?.hero_image_path
    ? `${getStorageUrl(event.hero_image_path)}?t=${encodeURIComponent(event.updated_at)}`
    : null
  const tileUrl = event?.bg_tile_path
    ? `${getStorageUrl(event.bg_tile_path)}?t=${encodeURIComponent(event.updated_at)}`
    : null
  const bgPosition = event?.hero_focal_point || '50% 50%'
  const bgZoom = event?.background_zoom ?? 1.0
  const bgOpacity = event?.background_opacity ?? 0.85
  const fillColor = event?.bg_fill_color || C.bg
  const tileCount = event?.bg_tile_count ?? 5
  const featherEdges = event?.bg_feather_edges ?? true

  // Inline style for the bg image inside the photo wrapper. Wrapper has
  // overflow:hidden so a transform: scale() at zoom >= 100% clips correctly.
  const photoStyle: React.CSSProperties = {
    backgroundImage: `url(${bgUrl})`,
    backgroundPosition: bgPosition,
    backgroundRepeat: 'no-repeat',
    backgroundColor: fillColor, // shown around the image when zoom < 100%
    ...(bgZoom < 1
      ? { backgroundSize: `${Math.round(bgZoom * 100)}% auto` }
      : { backgroundSize: 'cover', transform: `scale(${bgZoom})`, transformOrigin: bgPosition }
    ),
  }

  // Shared background style for the full-page base layer AND the content area.
  // The tile size is in viewport units (vw) and the attachment is fixed, so both
  // layers paint the tile at the same pixel size from the same viewport origin —
  // tiles in the content area line up perfectly with tiles visible through the
  // photo panel's faded edges (no seams at the boundary).
  const tilePctPerTile = 100 / Math.max(1, tileCount)
  const contentBgStyle: React.CSSProperties = {
    backgroundColor: fillColor,
    ...(tileUrl ? {
      backgroundImage: `url(${tileUrl})`,
      backgroundRepeat: 'repeat',
      backgroundSize: `${tilePctPerTile}vw auto`,
      backgroundAttachment: 'fixed',
      backgroundPosition: '0 0',
    } : {}),
  }

  // Subtle overlay applied only to the photo (not the whole page). The opacity
  // setting is scaled down by 0.3 so the result is a very gentle cream tint
  // rather than the heavy full-page overlay the old layout used.
  const photoOverlayAlpha = bgOpacity * 0.3

  return (
    <div style={{ minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

        /* Full-page base layer (tile/fill). Sits behind everything — the photo's
           faded edges on desktop reveal this layer so the image blends into the
           same texture on all sides. */
        .shower-base {
          position: fixed; inset: 0; z-index: 0;
        }

        /* Photo region — fixed so it doesn't scroll with the content (gives the
           "subtle parallax" / "photo stays put while content scrolls" effect on
           mobile, and a fixed side panel on desktop). The inner .shower-photo is
           position:absolute so its transform: scale() at zoom >= 100% is clipped
           by the wrapper's overflow:hidden instead of bleeding into content. */
        .shower-photo-wrapper { overflow: hidden; }
        .shower-photo {
          position: absolute;
          inset: 0;
          background-repeat: no-repeat;
        }
        .shower-photo-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        @media (max-width: 767px) {
          .shower-photo-wrapper {
            position: fixed; top: 0; left: 0; right: 0;
            height: 45vh; z-index: 1;
          }
          /* Mobile feather (toggle-controlled): bottom-only fade into content. */
          .shower-photo--feather {
            mask-image: linear-gradient(to bottom, black 0%, black 65%, transparent 100%);
            -webkit-mask-image: linear-gradient(to bottom, black 0%, black 65%, transparent 100%);
          }
          .shower-content { width: 100%; }
          .shower-content--with-photo { margin-top: 45vh; }
          .shower-content-inner { max-width: 540px; }
        }

        @media (min-width: 768px) {
          .shower-photo-wrapper {
            position: fixed; top: 0; right: 0;
            width: 40%; height: 100vh; z-index: 1;
          }
          /* Desktop: always fade all four edges so the panel blends into the
             surrounding tile/fill. Applied to the base class regardless of the
             feather toggle — this is the default desktop look. The fade ramps
             from fully transparent at 0% to opaque at 25% on each side, giving
             a clearly visible vignette on all four edges. */
          .shower-photo {
            mask-image:
              linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%),
              linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%);
            -webkit-mask-image:
              linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%),
              linear-gradient(to bottom, transparent 0%, black 25%, black 75%, transparent 100%);
            mask-composite: intersect;
            -webkit-mask-composite: source-in;
          }
          .shower-content { width: 100%; }
          .shower-content--with-photo { width: 60%; }
          .shower-content-inner { max-width: 640px; }
        }

        .shower-content {
          position: relative;
          z-index: 2;
          min-height: 100vh;
        }
      `}</style>

      {/* Full-page base layer — same fill/tile as the content area, sitting beneath
          the photo so the photo's faded edges blend into the same texture. */}
      <div className="shower-base" style={contentBgStyle} />

      {/* Photo: hero at the top on mobile (45vh, fixed), side panel on the right
          on desktop (40% × 100vh, fixed). Both stay locked while content scrolls. */}
      {bgUrl && (
        <div className="shower-photo-wrapper">
          <div className={`shower-photo${featherEdges ? ' shower-photo--feather' : ''}`} style={photoStyle} />
          {photoOverlayAlpha > 0 && (
            <div className="shower-photo-overlay" style={{ backgroundColor: `rgba(237, 230, 222, ${photoOverlayAlpha})` }} />
          )}
        </div>
      )}

      {/* Content area: solid bg (fill color + optional tile). Title/countdown
          live at the top of the content area, not overlaid on the photo. */}
      <div className={`shower-content${bgUrl ? ' shower-content--with-photo' : ''}`} style={contentBgStyle}>
        <div className="shower-content-inner" style={{ margin: '0 auto', padding: '28px 16px 40px', position: 'relative' }}>
          {/* Admin gear icon */}
          <a href="/shower/m" style={{ position: 'absolute', top: 28, right: 16, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3, zIndex: 2 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
        </a>

        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🎉</div>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 28, color: C.text, margin: '0 0 4px 0' }}>Baby Shower</h1>
          {babyName && <p style={{ fontSize: 15, color: C.secondary, margin: 0 }}>for {babyName}</p>}
          {!eventLoading && event?.event_date && <EventCountdown eventDate={event.event_date} />}
        </div>

        {eventLoading ? <div style={{ height: 120, borderRadius: 12, backgroundColor: C.card, animation: 'pulse 1.5s infinite', marginBottom: 20 }} /> : event && (event.event_date || event.location_name || event.description) ? (
          <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            {event.event_date && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.muted, marginBottom: 4 }}>When</div><div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{format(parse(event.event_date, 'yyyy-MM-dd', new Date()), 'EEEE, MMMM d, yyyy')}{event.event_time ? ` at ${event.event_time}` : ''}</div></div>}
            {event.location_name && <div style={{ marginBottom: 12 }}><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.muted, marginBottom: 4 }}>Where</div><div style={{ fontSize: 15, fontWeight: 500, color: C.text }}>{event.location_name}</div>{event.location_address && <a href={MAPS_URL(event.location_address)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: C.accent, textDecoration: 'none' }}>{event.location_address} →</a>}</div>}
            {event.description && <div style={{ marginBottom: event.registry_links?.length > 0 ? 12 : 0 }}><div style={{ fontSize: 14, lineHeight: 1.6, color: C.secondary, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: event.description }} /></div>}
            {event.registry_links && event.registry_links.length > 0 && <div><div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.muted, marginBottom: 8 }}>Registry</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{event.registry_links.map((link, i) => <a key={i} href={link.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', fontSize: 13, fontWeight: 600, color: C.accent, backgroundColor: `${C.accent}10`, borderRadius: 10, textDecoration: 'none', border: `1px solid ${C.accent}30` }}>🎁 {link.name}</a>)}</div></div>}
            {event.event_date && <button onClick={() => downloadICS(event)} style={{ marginTop: 12, width: '100%', padding: '12px 16px', fontSize: 14, fontWeight: 600, color: C.accent, backgroundColor: `${C.accent}10`, border: `1px solid ${C.accent}30`, borderRadius: 10, cursor: 'pointer' }}>Add to Calendar 📅</button>}
          </div>
        ) : null}

        <div style={{ backgroundColor: C.baby, borderRadius: 12, border: `1px solid ${C.babyBorder}`, padding: 20, marginBottom: 20 }}>
          {rsvpDone ? (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>{rsvpDone === 'yes' ? '🎉' : rsvpDone === 'maybe' ? '🤔' : '💛'}</div>
              <h3 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 22, color: C.text, margin: '0 0 8px 0' }}>Thank you!</h3>
              <p style={{ fontSize: 14, color: C.secondary, margin: '0 0 16px 0' }}>Your RSVP has been recorded.</p>
              <button onClick={() => setRsvpDone(null)} style={{ padding: '10px 20px', fontSize: 13, fontWeight: 500, color: C.accent, backgroundColor: 'transparent', border: `1px solid ${C.accent}`, borderRadius: 10, cursor: 'pointer' }}>Update my RSVP</button>
            </div>
          ) : <RsvpForm onSuccess={(s) => setRsvpDone(s)} />}
        </div>

        <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, marginBottom: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          {guestsLoading ? <div style={{ textAlign: 'center', padding: 24 }}><p style={{ color: C.secondary, fontSize: 14 }}>Loading...</p></div> : <PublicGuestList guests={guests} />}
        </div>

        <PhotoSection photos={photos} />

        <div style={{ textAlign: 'center' }}><a href="/family" style={{ fontSize: 14, fontWeight: 500, color: C.accent, textDecoration: 'none' }}>Visit The Babory for baby updates →</a></div>
        </div>
      </div>
    </div>
  )
}

export default function BabyShower() {
  const { data: profile, isLoading } = useBabyProfilePublic()
  if (isLoading) return <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif" }}><p style={{ color: C.secondary, fontSize: 14 }}>Loading...</p></div>
  if (!profile) return <div style={{ minHeight: '100vh', backgroundColor: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Inter', sans-serif", textAlign: 'center', padding: 24 }}><div><h1 style={{ fontFamily: "'Playfair Display', serif", fontWeight: 700, fontSize: 28, color: C.text, margin: '0 0 12px 0' }}>Baby Shower</h1><p style={{ color: C.secondary, fontSize: 15 }}>Not set up yet.</p></div></div>
  return <ShowerContent profile={profile} />
}
