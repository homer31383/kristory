import type { CoverData } from './cover'
import { Decor, Dot, Leaf, PageFrame, Sprig } from './parts'
import { BG, balance, photoUrl } from './style'
import { COLOR, FONT, alpha } from '../tokens'

/** BackScript.dc.html: cover option B, back. The quote's last two words are set in gold script. */
export default function BackScript({ cover }: { cover: CoverData }) {
  const photo = cover.backPhoto
  const words = cover.backQuote.trim().split(/\s+/)
  const tail = words.length > 2 ? words.slice(-2).join(' ') : ''
  const head = tail ? words.slice(0, -2).join(' ') + ' ' : cover.backQuote
  return (
    <PageFrame background={BG.navy('50% 47%', '72% 64%')} color={COLOR.cream}>
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
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: 672, height: 672, background: `radial-gradient(ellipse 58% 50% at 50% 48%, ${alpha(COLOR.navyDeep, 0.62)} 0%, ${alpha(COLOR.navyDeep, 0.28)} 62%, ${alpha(COLOR.navyDeep, 0)} 100%)` }} />
      <Decor>
        <Sprig x={110} y={150} r={20} s={1.2} color={COLOR.teal} fill />
        <Leaf x={70} y={230} r={-50} color={COLOR.coral} />
        <Sprig x={570} y={160} r={-28} s={1.3} color={COLOR.coral} fill />
        <Leaf x={600} y={250} r={40} s={1.1} color={COLOR.cream} />
        <Sprig x={96} y={560} r={-18} s={1.1} color={COLOR.cream} fill />
        <Leaf x={160} y={620} r={55} color={COLOR.gold} />
        <Sprig x={576} y={570} r={26} s={1.2} color={COLOR.gold} fill />
        <Leaf x={520} y={620} r={-45} s={1.1} color={COLOR.teal} />
        <Dot x={200} y={96} color={COLOR.coral} />
        <Dot x={470} y={104} color={COLOR.cream} />
        <Dot x={48} y={400} color={COLOR.teal} />
        <Dot x={624} y={420} color={COLOR.gold} />
      </Decor>
      <div style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '150px 84px 56px 84px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between' }}>
        <p style={{ margin: 0, fontStyle: 'italic', fontSize: 24, lineHeight: 1.45, textAlign: 'center', color: COLOR.cream, ...balance }}>
          {head}
          {tail && (
            <span style={{ fontFamily: FONT.script, fontStyle: 'normal', fontSize: 40, lineHeight: 1, color: COLOR.gold }}>{tail}</span>
          )}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <p style={{ margin: 0, fontFamily: FONT.script, fontSize: 44, lineHeight: 1, color: COLOR.gold }}>The Kristory</p>
          <p style={{ margin: 0, fontSize: 12, letterSpacing: '0.32em', textTransform: 'uppercase', color: COLOR.cream }}>Chris &amp; Krista</p>
        </div>
      </div>
    </PageFrame>
  )
}
