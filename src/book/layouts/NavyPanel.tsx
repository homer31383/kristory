import { Folio, PageFrame, Photo, TextBlocks, type LayoutProps } from './parts'
import { pad, scriptDate } from './style'
import { COLOR, FONT, alpha } from '../tokens'

/** NavyPanel.dc.html: one full-bleed hero photo, navy text panel fading up from the bottom. */
export default function NavyPanel({ page }: LayoutProps) {
  return (
    <PageFrame background={COLOR.navyDeep} color={COLOR.cream}>
      <div style={{ position: 'absolute', left: 0, top: 0 }}>
        <Photo photo={page.photos[0]} width={672} height={672} />
      </div>
      <div
        data-fit-box=""
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 300,
          boxSizing: 'border-box',
          padding: pad(page.side, 96, 36),
          background: `linear-gradient(to bottom, ${alpha(COLOR.navyDeep, 0)} 0%, ${alpha(COLOR.navyDeep, 0.86)} 38%, ${alpha(COLOR.navyDeep, 0.94)} 100%)`,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
          <span style={{ fontFamily: FONT.script, fontSize: 50, lineHeight: 1, color: COLOR.gold }}>{scriptDate(page.entryDate)}</span>
          <span style={{ fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR.creamSoft }}>{scriptDate(page.entryDate, 'EEEE')}</span>
        </div>
        <TextBlocks blocks={page.blocks} tone="dark" firstMargin={10} baseStyle={{ lineHeight: 1.55, color: COLOR.cream }} />
        <Folio page={page} color={COLOR.folioDark} />
      </div>
    </PageFrame>
  )
}
