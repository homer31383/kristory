import { Decor, EntryHeader, Facts, Folio, PageFrame, Photo, Sprig, TextBlocks, type LayoutProps } from './parts'
import { pad } from './style'

/** PhotoDay.dc.html: white, three photos (one wide, two small), text below. */
export default function PhotoDay({ page }: LayoutProps) {
  return (
    <PageFrame background="#FFFFFF" color="#14204A">
      <Decor>
        <Sprig x={634} y={652} r={14} s={0.8} color="#4FA3A5" fill />
      </Decor>
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: pad(page.side, 40, 40), display: 'flex', flexDirection: 'column' }}>
        <EntryHeader entryDate={page.entryDate} badges={page.badges} tone="light" marginBottom={10} />
        <Photo photo={page.photos[0]} width={564} height={175} style={{ borderRadius: 2 }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
          <Photo photo={page.photos[1]} width={277} height={118} style={{ borderRadius: 2 }} />
          <Photo photo={page.photos[2]} width={277} height={118} style={{ borderRadius: 2 }} />
        </div>
        <TextBlocks blocks={page.blocks} tone="light" firstMargin={18} />
        <Facts facts={page.facts} tone="light" marginTop={14} border="#C9D1E4" />
        <Folio page={page} color="#4A5578" />
      </div>
    </PageFrame>
  )
}
