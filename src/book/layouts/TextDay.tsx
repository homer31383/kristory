import { Decor, EntryHeader, Facts, Folio, Leaf, PageFrame, Photo, Sprig, TextBlocks, type LayoutProps } from './parts'
import { BG, pad } from './style'

/** TextDay.dc.html: navy, text-led, one wide photo, gold drop cap. Also the continuation page (no photo, no drop cap). */
export default function TextDay({ page }: LayoutProps) {
  return (
    <PageFrame background={BG.navy('45% 45%')} color="#F2E8D5">
      <Decor>
        <Sprig x={640} y={120} r={8} s={0.9} color="#E0504A" fill />
        <Leaf x={644} y={196} r={-30} s={0.8} color="#4FA3A5" />
        <Sprig x={642} y={650} r={-10} s={0.8} color="#D4A24C" fill />
      </Decor>
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: pad(page.side, 40, 40), display: 'flex', flexDirection: 'column' }}>
        <EntryHeader entryDate={page.entryDate} badges={page.badges} tone="dark" marginBottom={14} />
        <TextBlocks blocks={page.blocks} tone="dark" dropCap={page.dropCap} />
        {page.photos[0] && <Photo photo={page.photos[0]} width={564} height={190} style={{ marginTop: 20, borderRadius: 2 }} />}
        <Facts facts={page.facts} tone="dark" marginTop={14} border="rgba(242,232,213,0.3)" />
        <Folio page={page} color="#D5CDBA" />
      </div>
    </PageFrame>
  )
}
