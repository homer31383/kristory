import { Decor, Folio, Leaf, PageFrame, Photo, Sprig, TextBlocks, type LayoutProps } from './parts'
import { BG, pad, scriptDate } from './style'
import { COLOR, FONT, SHADE } from '../tokens'

/** Milestone.dc.html: mid blue, one framed photo, the entry as its caption, chapter folio. */
export default function Milestone({ page }: LayoutProps) {
  return (
    <PageFrame background={BG.mid} color={COLOR.ivory}>
      <Decor>
        <Sprig x={636} y={150} r={12} s={1} color={COLOR.ivory} fill />
        <Leaf x={640} y={224} r={-34} s={0.9} color={COLOR.coralPale} />
        <Sprig x={40} y={640} r={-14} s={0.9} color={COLOR.goldLeaf} fill />
      </Decor>
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: pad(page.side, 44, 40), display: 'flex', flexDirection: 'column' }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase', color: COLOR.goldPale, fontWeight: 600 }}>Milestone</p>
        <h1 style={{ margin: 0, fontFamily: FONT.script, fontWeight: 400, fontSize: 60, lineHeight: 1.15, color: COLOR.ivory }}>
          {page.milestone?.title ?? ''}
        </h1>
        <p style={{ margin: '0 0 20px 0', fontStyle: 'italic', fontSize: 17, color: COLOR.folioMid }}>{scriptDate(page.entryDate, 'MMMM d, yyyy')}</p>
        <div style={{ width: 564, boxSizing: 'border-box', background: COLOR.white, padding: 12, boxShadow: `0 10px 28px ${SHADE.shadowSoft}` }}>
          <Photo photo={page.photos[0]} width={540} height={290} />
        </div>
        <TextBlocks blocks={page.blocks} tone="mid" firstMargin={22} baseStyle={{ fontStyle: 'italic', color: COLOR.ivory }} />
        <Folio page={page} color={COLOR.folioMid} />
      </div>
    </PageFrame>
  )
}
