import type { CoverData } from './cover'
import { balance } from './style'

/** BackCover.dc.html: the older back cover, option A. */
export default function BackCover({ cover }: { cover: CoverData }) {
  return (
    <div style={{ width: 672, height: 672, boxSizing: 'border-box', padding: 36, background: '#3A3162', color: '#F7F3EF', fontFamily: 'Lora, Georgia, serif' }}>
      <div style={{ height: '100%', boxSizing: 'border-box', border: '1px solid rgba(247,243,239,0.5)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '44px 48px' }}>
        <p style={{ margin: 0, fontStyle: 'italic', fontSize: 24, lineHeight: 1.4, textAlign: 'center', color: '#F7F3EF', ...balance }}>{cover.backQuote}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8B7EC8' }} />
          <span style={{ width: 56, height: 1, background: 'rgba(247,243,239,0.6)' }} />
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E88BA8' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <p style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontWeight: 700, fontSize: 20, color: '#F7F3EF' }}>The Kristory</p>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#D6CEF3' }}>Chris &amp; Krista</p>
        </div>
      </div>
    </div>
  )
}
