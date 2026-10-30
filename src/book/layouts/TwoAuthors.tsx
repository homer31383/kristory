import { Decor, EntryHeader, Facts, Folio, Leaf, PageFrame, Photo, Sprig, TextBlocks, type LayoutProps } from './parts'
import { BG, pad } from './style'

/** TwoAuthors.dc.html: pale blue-gray, both authors' text, two photos. */
export default function TwoAuthors({ page }: LayoutProps) {
  return (
    <PageFrame background={BG.pale()} color="#14204A">
      <Decor>
        <Sprig x={640} y={560} r={18} s={0.9} color="#E0504A" fill />
        <Leaf x={630} y={640} r={-40} s={0.8} color="#4FA3A5" />
      </Decor>
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: pad(page.side, 40, 40), display: 'flex', flexDirection: 'column' }}>
        <EntryHeader entryDate={page.entryDate} badges={page.badges} tone="light" />
        <TextBlocks
          blocks={page.blocks}
          tone="light"
          blockStyle={(i) => (i > 0 ? { fontStyle: 'italic', color: '#4A5578' } : undefined)}
        />
        {page.photos.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <Photo photo={page.photos[0]} width={277} height={150} style={{ borderRadius: 2 }} />
            <Photo photo={page.photos[1]} width={277} height={150} style={{ borderRadius: 2 }} />
          </div>
        )}
        <Facts facts={page.facts} tone="light" marginTop={16} border="#B9C4DC" />
        <Folio page={page} color="#4A5578" />
      </div>
    </PageFrame>
  )
}
