import { Decor, EntryHeader, Folio, PageFrame, Photo, Sprig, TextBlocks, type LayoutProps } from './parts'

/** BandText.dc.html: white with pale bands, two portrait photos bleeding off the right edge. */
export default function BandText({ page }: LayoutProps) {
  return (
    <PageFrame background="#FFFFFF" color="#14204A">
      <Decor>
        <Sprig x={412} y={640} r={-8} s={0.8} color="#E0504A" />
      </Decor>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 48, height: 672, background: '#E6EBF5' }} />
      <div style={{ position: 'absolute', left: 48, top: 0, width: 24, height: 250, background: '#CBD5E8' }} />
      <div style={{ position: 'absolute', left: 72, top: 0, width: 12, height: 250, background: '#E6EBF5' }} />
      <div data-fit-box="" style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '40px 0 40px 108px', width: 410, display: 'flex', flexDirection: 'column' }}>
        <EntryHeader entryDate={page.entryDate} badges={page.badges} tone="light" />
        <TextBlocks blocks={page.blocks} tone="light" />
        <Folio page={page} color="#4A5578" />
      </div>
      <div style={{ position: 'absolute', left: 440, top: 48 }}>
        <Photo photo={page.photos[0]} width={232} height={268} style={{ borderRadius: '2px 0 0 2px' }} />
      </div>
      <div style={{ position: 'absolute', left: 440, top: 328 }}>
        <Photo photo={page.photos[1]} width={232} height={296} style={{ borderRadius: '2px 0 0 2px' }} />
      </div>
    </PageFrame>
  )
}
