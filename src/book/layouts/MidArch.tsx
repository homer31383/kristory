import { Decor, Folio, Leaf, PageFrame, Photo, Sprig, type LayoutProps } from './parts'
import { BG, balance, scriptDate } from './style'
import { COLOR, FONT } from '../tokens'

/** MidArch.dc.html: mid blue, one arch-cropped portrait, script pull quote. */
export default function MidArch({ page }: LayoutProps) {
  const sep = ' · '
  return (
    <PageFrame background={BG.mid} color={COLOR.ivory}>
      <Decor>
        <Sprig x={62} y={600} r={-14} s={1} color={COLOR.ivory} />
        <Leaf x={618} y={160} r={34} color={COLOR.coralPale} />
      </Decor>
      <div style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '52px 60px 40px 60px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div style={{ position: 'relative', width: 250, height: 330 }}>
          <div style={{ position: 'absolute', left: -8, top: -8, width: 266, height: 346, boxSizing: 'border-box', border: `1.5px solid ${COLOR.gold}`, borderRadius: '133px 133px 4px 4px' }} />
          <Photo photo={page.photos[0]} width={250} height={330} style={{ borderRadius: '125px 125px 2px 2px', position: 'relative' }} />
        </div>
        <p style={{ margin: '34px 0 0 0', fontFamily: FONT.script, fontSize: 40, lineHeight: 1.2, textAlign: 'center', color: COLOR.ivory, ...balance }}>
          {page.quote}
        </p>
        <p style={{ margin: '12px 0 0 0', fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR.goldPale, fontWeight: 600 }}>
          {scriptDate(page.entryDate)}{sep}{page.chapter}
        </p>
        <Folio page={page} color={COLOR.folioMid} align="center" />
      </div>
    </PageFrame>
  )
}
