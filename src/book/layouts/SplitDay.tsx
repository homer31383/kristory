import { Decor, EntryHeader, Folio, PageFrame, Photo, Sprig, TextBlocks, type LayoutProps } from './parts'
import { BG } from './style'
import { COLOR } from '../tokens'

/** SplitDay.dc.html: one tall portrait photo bleeding off the left, pale text panel. */
export default function SplitDay({ page }: LayoutProps) {
  return (
    <PageFrame background={BG.pale('60% 45%')} color={COLOR.ink}>
      <Decor>
        <Sprig x={640} y={560} r={14} s={0.85} color={COLOR.gold} />
      </Decor>
      <div style={{ position: 'absolute', left: 0, top: 0 }}>
        <Photo photo={page.photos[0]} width={300} height={672} />
      </div>
      <div style={{ position: 'absolute', left: 300, top: 0, width: 20, height: 672, background: COLOR.band }} />
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '40px 48px 40px 352px', display: 'flex', flexDirection: 'column' }}>
        <EntryHeader entryDate={page.entryDate} badges={page.badges} tone="light" />
        <TextBlocks
          blocks={page.blocks}
          tone="light"
          blockStyle={(i) => (i > 0 ? { fontStyle: 'italic', color: COLOR.slate } : undefined)}
        />
        <Folio page={page} color={COLOR.slate} />
      </div>
    </PageFrame>
  )
}
