import type { CoverData } from './cover'

/** Main.dc.html: the older front cover, option A. Deep indigo with the serif K. */
export default function Main({ cover }: { cover: CoverData }) {
  return (
    <div style={{ width: 672, height: 672, boxSizing: 'border-box', padding: 36, background: '#3A3162', color: '#F7F3EF', fontFamily: 'Lora, Georgia, serif' }}>
      <div style={{ height: '100%', boxSizing: 'border-box', border: '1px solid rgba(247,243,239,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '44px 24px 40px 24px' }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#D6CEF3' }}>Chris &amp; Krista</p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <p style={{ margin: 0, fontFamily: 'Lora, Georgia, serif', fontWeight: 500, fontSize: 270, lineHeight: 0.9, color: '#F7F3EF' }}>K</p>
          <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 46, lineHeight: 1.1, color: '#F7F3EF' }}>The Kristory</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8B7EC8' }} />
            <span style={{ width: 56, height: 1, background: 'rgba(247,243,239,0.6)' }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E88BA8' }} />
          </div>
          <p style={{ margin: 0, fontStyle: 'italic', fontSize: 19, color: '#F7F3EF' }}>{cover.subtitle}</p>
        </div>
      </div>
    </div>
  )
}
