import { Decor, EntryHeader, Folio, Leaf, PageFrame, Photo, TextBlocks, type LayoutProps } from './parts'

/** GridDay.dc.html: white, one large photo and two small. */
export default function GridDay({ page }: LayoutProps) {
  return (
    <PageFrame background="#FFFFFF" color="#14204A">
      <Decor>
        <Leaf x={630} y={636} r={30} s={0.8} color="#4FA3A5" />
      </Decor>
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '40px 48px 40px 48px', display: 'flex', flexDirection: 'column' }}>
        <EntryHeader entryDate={page.entryDate} badges={page.badges} tone="light" />
        <div style={{ display: 'flex', gap: 10 }}>
          <Photo photo={page.photos[0]} width={330} height={300} style={{ borderRadius: 2 }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Photo photo={page.photos[1]} width={236} height={145} style={{ borderRadius: 2 }} />
            <Photo photo={page.photos[2]} width={236} height={145} style={{ borderRadius: 2 }} />
          </div>
        </div>
        <TextBlocks blocks={page.blocks} tone="light" firstMargin={20} />
        <Folio page={page} color="#4A5578" />
      </div>
    </PageFrame>
  )
}
