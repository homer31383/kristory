import { Decor, EntryHeader, Folio, Leaf, PageFrame, Photo, Sprig, TextBlocks, type LayoutProps } from './parts'
import { BG, pad } from './style'
import { COLOR, SHADE } from '../tokens'

/** NavyFrame.dc.html: navy, one framed portrait with a caption. */
export default function NavyFrame({ page }: LayoutProps) {
  return (
    <PageFrame background={BG.navy()} color={COLOR.cream}>
      <Decor>
        <Sprig x={566} y={616} r={-12} s={0.9} color={COLOR.teal} />
        <Leaf x={618} y={620} r={24} color={COLOR.gold} />
      </Decor>
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: pad(page.side, 40, 40), display: 'flex', flexDirection: 'column' }}>
        <EntryHeader entryDate={page.entryDate} badges={page.badges} tone="dark" />
        <div style={{ display: 'flex', gap: 30, marginTop: 8 }}>
          <div style={{ background: COLOR.ivory, padding: 8, boxShadow: `0 12px 30px ${SHADE.shadowDeep}`, alignSelf: 'flex-start' }}>
            <Photo photo={page.photos[0]} width={284} height={420} />
          </div>
          <div style={{ flex: 1, paddingTop: 6 }}>
            {page.caption && (
              <p style={{ margin: '0 0 12px 0', fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: COLOR.gold, fontWeight: 600 }}>{page.caption}</p>
            )}
            <TextBlocks blocks={page.blocks} tone="dark" baseStyle={{ color: COLOR.cream, fontStyle: 'italic' }} />
          </div>
        </div>
        <Folio page={page} color={COLOR.folioDark} />
      </div>
    </PageFrame>
  )
}
