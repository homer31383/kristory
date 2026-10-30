import { PageFrame, Photo, type LayoutProps } from './parts'
import { scriptDate } from './style'
import { COLOR, FONT, alpha } from '../tokens'

/** FullBleed.dc.html: one hero photo, full page, script date overlay. The caption defaults to the weekday. */
export default function FullBleed({ page }: LayoutProps) {
  return (
    <PageFrame background={COLOR.navyDeep} color={COLOR.cream}>
      <div style={{ position: 'absolute', left: 0, top: 0 }}>
        <Photo photo={page.photos[0]} width={672} height={672} />
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 190, background: `linear-gradient(to bottom, ${alpha(COLOR.navyDeep, 0)}, ${alpha(COLOR.navyDeep, 0.6)})` }} />
      <div style={{ position: 'absolute', left: 48, bottom: 44, display: 'flex', alignItems: 'baseline', gap: 14 }}>
        <span style={{ fontFamily: FONT.script, fontSize: 52, lineHeight: 1, color: COLOR.cream }}>{scriptDate(page.entryDate)}</span>
        <span style={{ fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR.creamSoft }}>
          {page.caption || scriptDate(page.entryDate, 'EEEE')}
        </span>
      </div>
    </PageFrame>
  )
}
