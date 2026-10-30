import { Decor, Leaf, PageFrame, Sprig } from './parts'

/** Title.dc.html: white title page with the script wordmark. */
export default function Title({ subtitle }: { subtitle: string }) {
  return (
    <PageFrame background="#FFFFFF" color="#14204A">
      <Decor>
        <Sprig x={92} y={150} r={-24} s={1.2} color="#E0504A" fill />
        <Leaf x={140} y={226} r={58} color="#4FA3A5" />
        <Sprig x={580} y={560} r={28} s={1.2} color="#4FA3A5" fill />
        <Leaf x={532} y={616} r={-44} color="#D4A24C" />
      </Decor>
      <div style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '110px 60px 56px 60px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ margin: 0, fontFamily: "'Great Vibes', cursive", fontSize: 46, lineHeight: 1, color: '#14204A' }}>The</p>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'baseline', fontFamily: "'Great Vibes', cursive", fontWeight: 400, lineHeight: 1 }}>
          <span style={{ fontSize: 190, color: '#9A6F1E', marginRight: 4 }}>K</span>
          <span style={{ fontSize: 104, color: '#14204A' }}>ristory</span>
        </h1>
        <svg aria-hidden="true" viewBox="0 0 340 20" width="260" height="16" style={{ marginTop: -2 }}>
          <path d="M2 12 C 60 2, 120 20, 180 9 S 296 4, 338 11" stroke="#9A6F1E" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        <p style={{ margin: '18px 0 0 0', fontStyle: 'italic', fontSize: 19, color: '#4A5578' }}>{subtitle}</p>
        <p style={{ margin: 'auto 0 0 0', fontSize: 12, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#14204A' }}>Chris &amp; Krista</p>
      </div>
    </PageFrame>
  )
}
