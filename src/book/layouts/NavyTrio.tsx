import { Decor, EntryHeader, Folio, PageFrame, Photo, Sprig, TextBlocks, type LayoutProps } from './parts'
import { BG } from './style'
import { COLOR } from '../tokens'

/** NavyTrio.dc.html: navy, three tall portrait photos, the middle one dropped 28 px. */
export default function NavyTrio({ page }: LayoutProps) {
  return (
    <PageFrame background={BG.navy()} color={COLOR.cream}>
      <Decor>
        <Sprig x={636} y={632} r={14} s={0.8} color={COLOR.gold} />
      </Decor>
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '40px 48px 40px 48px', display: 'flex', flexDirection: 'column' }}>
        <EntryHeader entryDate={page.entryDate} badges={page.badges} tone="dark" />
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Photo photo={page.photos[0]} width={184} height={340} style={{ borderRadius: 2 }} />
          <div style={{ marginTop: 28 }}>
            <Photo photo={page.photos[1]} width={184} height={340} style={{ borderRadius: 2 }} />
          </div>
          <Photo photo={page.photos[2]} width={184} height={340} style={{ borderRadius: 2 }} />
        </div>
        {page.blocks.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <TextBlocks blocks={page.blocks} tone="dark" baseStyle={{ color: COLOR.cream }} />
          </div>
        )}
        <Folio page={page} color={COLOR.folioDark} />
      </div>
    </PageFrame>
  )
}
