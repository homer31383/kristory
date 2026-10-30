import { Decor, EntryHeader, Folio, Leaf, PageFrame, Photo, TextBlocks, type LayoutProps } from './parts'
import { COLOR } from '../tokens'

/** WhiteMosaic.dc.html: white, four photos in a 2 x 2 grid, one line about the day. */
export default function WhiteMosaic({ page }: LayoutProps) {
  return (
    <PageFrame background={COLOR.white} color={COLOR.ink}>
      <Decor>
        <Leaf x={636} y={640} r={28} s={0.8} color={COLOR.teal} />
      </Decor>
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '40px 48px 40px 48px', display: 'flex', flexDirection: 'column' }}>
        <EntryHeader entryDate={page.entryDate} badges={page.badges} tone="light" />
        <div style={{ display: 'grid', gridTemplateColumns: '283px 283px', gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <Photo key={i} photo={page.photos[i]} width={283} height={215} style={{ borderRadius: 2 }} />
          ))}
        </div>
        <TextBlocks
          blocks={page.blocks}
          tone="light"
          firstMargin={18}
          baseStyle={{ fontSize: 14, fontStyle: 'italic', color: COLOR.slate }}
        />
        <Folio page={page} color={COLOR.slate} />
      </div>
    </PageFrame>
  )
}
