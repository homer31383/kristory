import type { CoverData } from './cover'
import { Decor, Dot, Leaf, PageFrame, Sprig } from './parts'
import { BG, photoUrl } from './style'

/**
 * CoverScript.dc.html: cover option B, front. Navy, flowing script, a faint
 * photo behind, gold K with a sketched outline (filters bk-sk1, bk-sk2).
 */
export default function CoverScript({ cover }: { cover: CoverData }) {
  const photo = cover.frontPhoto
  return (
    <PageFrame background={BG.navy('50% 47%', '72% 64%')} color="#F2E8D5">
      {photo && (
        <img
          src={photoUrl(photo.photo)}
          alt=""
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 672,
            height: 672,
            objectFit: 'cover',
            objectPosition: `${Math.round(photo.focalX * 100)}% ${Math.round(photo.focalY * 100)}%`,
            filter: 'grayscale(1) brightness(0.62) contrast(1.15)',
            mixBlendMode: 'luminosity',
            opacity: 0.15,
          }}
        />
      )}
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: 672, height: 672, background: 'radial-gradient(ellipse 58% 50% at 50% 48%, rgba(11,18,53,0.62) 0%, rgba(11,18,53,0.28) 62%, rgba(11,18,53,0) 100%)' }} />
      <Decor>
        <Sprig x={96} y={168} r={-25} s={1.3} color="#E0504A" fill />
        <Leaf x={150} y={250} r={60} color="#4FA3A5" />
        <Sprig x={566} y={150} r={30} s={1.1} color="#F2E8D5" fill />
        <Leaf x={596} y={250} r={-40} s={1.2} color="#E0504A" />
        <Sprig x={336} y={100} r={-6} s={0.9} color="#D4A24C" fill />
        <Sprig x={84} y={500} r={22} s={1.2} color="#4FA3A5" fill />
        <Leaf x={132} y={586} r={-50} color="#D4A24C" />
        <Sprig x={588} y={520} r={-30} s={1.3} color="#E0504A" fill />
        <Leaf x={540} y={600} r={40} s={1.1} color="#F2E8D5" />
        <Sprig x={220} y={620} r={-14} s={0.8} color="#F2E8D5" fill />
        <Leaf x={430} y={616} r={160} color="#4FA3A5" />
        <Dot x={190} y={120} color="#4FA3A5" />
        <Dot x={480} y={96} color="#E0504A" />
        <Dot x={616} y={372} color="#F2E8D5" />
        <Dot x={52} y={340} color="#D4A24C" />
        <Dot x={360} y={640} color="#E0504A" />
      </Decor>
      <div style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '120px 60px 52px 60px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <p style={{ margin: 0, fontFamily: "'Great Vibes', cursive", fontSize: 56, lineHeight: 1, color: '#F2E8D5' }}>The</p>
        <h1 style={{ margin: 0, display: 'flex', alignItems: 'baseline', fontFamily: "'Great Vibes', cursive", fontWeight: 400, lineHeight: 1 }}>
          <span style={{ position: 'relative', display: 'inline-block', fontSize: 230, color: '#D4A24C', marginRight: 4 }}>
            K
            <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, color: 'transparent', WebkitTextStroke: '1.5px #FFFFFF', filter: 'url(#bk-sk1)' }}>K</span>
            <span aria-hidden="true" style={{ position: 'absolute', left: 2, top: 1, color: 'transparent', WebkitTextStroke: '0.8px rgba(255,255,255,0.75)', filter: 'url(#bk-sk2)' }}>K</span>
          </span>
          <span style={{ fontSize: 118, color: '#F2E8D5' }}>ristory</span>
        </h1>
        <svg aria-hidden="true" viewBox="0 0 340 20" width="300" height="18" style={{ marginTop: -4 }}>
          <path d="M2 12 C 60 2, 120 20, 180 9 S 296 4, 338 11" stroke="#D4A24C" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        <p style={{ margin: '20px 0 0 0', fontFamily: "'Great Vibes', cursive", fontSize: 42, lineHeight: 1, color: '#D4A24C' }}>{cover.subtitle}</p>
        <p style={{ margin: 'auto 0 0 0', fontSize: 12, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#F2E8D5' }}>Chris &amp; Krista</p>
      </div>
    </PageFrame>
  )
}
