import { Decor, EntryHeader, Folio, PageFrame, Photo, Sprig, TextBlocks, type LayoutProps } from './parts'
import { BG, pad } from './style'

/** NavyTop.dc.html: navy, one landscape photo bleeding off the top. */
export default function NavyTop({ page }: LayoutProps) {
  return (
    <PageFrame background={BG.navy()} color="#F2E8D5">
      <Decor>
        <Sprig x={630} y={500} r={10} s={0.9} color="#E0504A" />
      </Decor>
      <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Photo photo={page.photos[0]} width={672} height={360} />
        <div data-fit-box="" style={{ boxSizing: 'border-box', flex: 1, minHeight: 0, padding: pad(page.side, 22, 40), display: 'flex', flexDirection: 'column' }}>
          <EntryHeader entryDate={page.entryDate} badges={page.badges} tone="dark" />
          <TextBlocks blocks={page.blocks} tone="dark" baseStyle={{ color: '#F2E8D5' }} />
          <Folio page={page} color="#D5CDBA" />
        </div>
      </div>
    </PageFrame>
  )
}
