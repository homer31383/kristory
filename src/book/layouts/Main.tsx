import type { CoverData } from './cover'
import { COLOR, FONT, alpha } from '../tokens'

/** Main.dc.html: the older front cover, option A. Deep indigo with the serif K. */
export default function Main({ cover }: { cover: CoverData }) {
  return (
    <div style={{ width: 672, height: 672, boxSizing: 'border-box', padding: 36, background: COLOR.plum, color: COLOR.paper, fontFamily: FONT.body }}>
      <div style={{ height: '100%', boxSizing: 'border-box', border: `1px solid ${alpha(COLOR.paper, 0.5)}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', padding: '44px 24px 40px 24px' }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.32em', textTransform: 'uppercase', color: COLOR.lavender }}>Chris &amp; Krista</p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <p style={{ margin: 0, fontFamily: FONT.body, fontWeight: 500, fontSize: 270, lineHeight: 0.9, color: COLOR.paper }}>K</p>
          <h1 style={{ margin: 0, fontFamily: FONT.display, fontWeight: 700, fontSize: 46, lineHeight: 1.1, color: COLOR.paper }}>The Kristory</h1>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR.chrisMid }} />
            <span style={{ width: 56, height: 1, background: alpha(COLOR.paper, 0.6) }} />
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLOR.kristaLight }} />
          </div>
          <p style={{ margin: 0, fontStyle: 'italic', fontSize: 19, color: COLOR.paper }}>{cover.subtitle}</p>
        </div>
      </div>
    </div>
  )
}
