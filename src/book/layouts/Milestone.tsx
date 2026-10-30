import { Decor, Folio, Leaf, PageFrame, Photo, Sprig, TextBlocks, type LayoutProps } from './parts'
import { BG, pad, scriptDate } from './style'

/** Milestone.dc.html: mid blue, one framed photo, the entry as its caption, chapter folio. */
export default function Milestone({ page }: LayoutProps) {
  return (
    <PageFrame background={BG.mid} color="#F7F2E6">
      <Decor>
        <Sprig x={636} y={150} r={12} s={1} color="#F7F2E6" fill />
        <Leaf x={640} y={224} r={-34} s={0.9} color="#F0A89E" />
        <Sprig x={40} y={640} r={-14} s={0.9} color="#E8C27A" fill />
      </Decor>
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: pad(page.side, 44, 40), display: 'flex', flexDirection: 'column' }}>
        <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase', color: '#F0CF8E', fontWeight: 600 }}>Milestone</p>
        <h1 style={{ margin: 0, fontFamily: "'Great Vibes', cursive", fontWeight: 400, fontSize: 60, lineHeight: 1.15, color: '#F7F2E6' }}>
          {page.milestone?.title ?? ''}
        </h1>
        <p style={{ margin: '0 0 20px 0', fontStyle: 'italic', fontSize: 17, color: '#E9E2D2' }}>{scriptDate(page.entryDate, 'MMMM d, yyyy')}</p>
        <div style={{ width: 564, boxSizing: 'border-box', background: '#FFFFFF', padding: 12, boxShadow: '0 10px 28px rgba(5,10,40,0.45)' }}>
          <Photo photo={page.photos[0]} width={540} height={290} />
        </div>
        <TextBlocks blocks={page.blocks} tone="mid" firstMargin={22} baseStyle={{ fontStyle: 'italic', color: '#F7F2E6' }} />
        <Folio page={page} color="#E9E2D2" />
      </div>
    </PageFrame>
  )
}
