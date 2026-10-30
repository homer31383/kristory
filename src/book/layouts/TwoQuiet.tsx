import { Decor, EntryHeader, Folio, PageFrame, Sprig, TextBlocks, type LayoutProps } from './parts'
import { BG, pad } from './style'

/**
 * Two short days on one page. Not in the design files: derived from
 * TextDay.dc.html (same background, header, text and folio), with the two
 * days split by TextDay's own thin rule.
 */
export default function TwoQuiet({ page }: LayoutProps) {
  const halves = page.quiet ?? []
  const starts = halves.map((_, k) => halves.slice(0, k).reduce((n, q) => n + q.blocks.length, 0))
  return (
    <PageFrame background={BG.navy('45% 45%')} color="#F2E8D5">
      <Decor>
        <Sprig x={642} y={650} r={-10} s={0.8} color="#D4A24C" fill />
      </Decor>
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: pad(page.side, 40, 40), display: 'flex', flexDirection: 'column' }}>
        {halves.map((q, k) => (
          <div key={q.itemId} style={k > 0 ? { marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(242,232,213,0.3)' } : undefined}>
            <EntryHeader entryDate={q.entryDate} badges={q.badges} tone="dark" marginBottom={14} />
            <TextBlocks blocks={q.blocks} tone="dark" startIndex={starts[k]} />
          </div>
        ))}
        <Folio page={page} color="#D5CDBA" />
      </div>
    </PageFrame>
  )
}
