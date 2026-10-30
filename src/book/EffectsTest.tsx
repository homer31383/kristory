import { useMemo, type CSSProperties, type ReactNode } from 'react'
import { PageFrame } from './layouts/parts'

/**
 * A test sheet for the print route (?test=effects). Each cell isolates one
 * effect the layouts depend on, so a PDF proof shows which ones survive
 * Chrome's PDF output and which get flattened to pixels or dropped.
 */

/** A colorful test photo drawn on a canvas: gradient, grid and a circle. */
function useTestImage(): string {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1200
    c.height = 800
    const g = c.getContext('2d')
    if (!g) return ''
    const grad = g.createLinearGradient(0, 0, 1200, 800)
    grad.addColorStop(0, '#E0504A')
    grad.addColorStop(0.5, '#D4A24C')
    grad.addColorStop(1, '#4FA3A5')
    g.fillStyle = grad
    g.fillRect(0, 0, 1200, 800)
    g.strokeStyle = 'rgba(255,255,255,0.55)'
    g.lineWidth = 4
    for (let x = 0; x <= 1200; x += 100) {
      g.beginPath()
      g.moveTo(x, 0)
      g.lineTo(x, 800)
      g.stroke()
    }
    for (let y = 0; y <= 800; y += 100) {
      g.beginPath()
      g.moveTo(0, y)
      g.lineTo(1200, y)
      g.stroke()
    }
    g.fillStyle = '#14204A'
    g.beginPath()
    g.arc(900, 400, 160, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#FFFFFF'
    g.font = 'bold 120px sans-serif'
    g.fillText('R', 860, 445)
    return c.toDataURL('image/jpeg', 0.9)
  }, [])
}

function Cell({ label, children, dark = false }: { label: string; children: ReactNode; dark?: boolean }) {
  return (
    <div style={{ position: 'relative', border: '1px solid #DDE4F1', background: dark ? '#14204A' : '#FFFFFF', overflow: 'hidden' }}>
      <svg viewBox="0 0 200 150" width="100%" height="138" style={{ display: 'block' }} aria-hidden="true">
        {children}
      </svg>
      <p style={{ position: 'absolute', left: 6, bottom: 4, margin: 0, fontSize: 10, color: dark ? '#F2E8D5' : '#14204A', fontFamily: 'Inter, sans-serif' }}>{label}</p>
    </div>
  )
}

function HtmlCell({ label, children, dark = false, style }: { label: string; children: ReactNode; dark?: boolean; style?: CSSProperties }) {
  return (
    <div style={{ position: 'relative', height: 140, border: '1px solid #DDE4F1', background: dark ? '#14204A' : '#FFFFFF', overflow: 'hidden', ...style }}>
      {children}
      <p style={{ position: 'absolute', left: 6, bottom: 4, margin: 0, fontSize: 10, color: dark ? '#F2E8D5' : '#14204A', fontFamily: 'Inter, sans-serif' }}>{label}</p>
    </div>
  )
}

export function EffectsTest() {
  const img = useTestImage()
  return (
    <PageFrame background="#FFFFFF" color="#14204A">
      <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <Cell label="1 wc: feTurbulence + feDisplacementMap">
          <rect x="40" y="25" width="120" height="90" fill="#E0504A" filter="url(#bk-wc)" />
        </Cell>
        <Cell label="2 ink: feComponentTransfer">
          <rect x="40" y="25" width="120" height="90" fill="#4FA3A5" filter="url(#bk-ink)" />
        </Cell>
        <Cell label="3 full sprig (wc + ink)">
          <use href="#bk-sprig" transform="translate(100 95) scale(2.2)" style={{ color: '#E0504A', fill: '#E0504A' }} />
        </Cell>
        <Cell label="4 sk1 on an svg path">
          <circle cx="100" cy="70" r="45" fill="none" stroke="#14204A" strokeWidth="2" filter="url(#bk-sk1)" />
        </Cell>
        <HtmlCell label="5 text stroke alone" dark>
          <span style={{ position: 'absolute', left: 60, top: -10, fontFamily: "'Great Vibes', cursive", fontSize: 130, color: 'transparent', WebkitTextStroke: '1.5px #FFFFFF' }}>K</span>
        </HtmlCell>
        <HtmlCell label="6 text stroke + sk1 (cover K)" dark>
          <span style={{ position: 'absolute', left: 60, top: -10, fontFamily: "'Great Vibes', cursive", fontSize: 130, color: '#D4A24C' }}>
            K
            <span style={{ position: 'absolute', left: 0, top: 0, color: 'transparent', WebkitTextStroke: '1.5px #FFFFFF', filter: 'url(#bk-sk1)' }}>K</span>
          </span>
        </HtmlCell>
        <HtmlCell label="7 object-fit cover, position 80% 50%">
          {img && <img src={img} alt="" style={{ display: 'block', width: '100%', height: 140, objectFit: 'cover', objectPosition: '80% 50%' }} />}
        </HtmlCell>
        <HtmlCell label="8 mix-blend luminosity + css filter" dark>
          {img && (
            <img
              src={img}
              alt=""
              style={{ display: 'block', width: '100%', height: 140, objectFit: 'cover', filter: 'grayscale(1) brightness(0.62) contrast(1.15)', mixBlendMode: 'luminosity', opacity: 0.6 }}
            />
          )}
        </HtmlCell>
        <HtmlCell label="9 mix-blend multiply, no filter">
          <div style={{ position: 'absolute', inset: 20, background: '#4FA3A5' }} />
          <div style={{ position: 'absolute', left: 60, top: 40, width: 100, height: 80, background: '#E0504A', mixBlendMode: 'multiply' }} />
        </HtmlCell>
        <HtmlCell label="10 radial gradient (navy page)" style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 45%, #22376E 0%, #172751 36%, #0E173B 68%, #070C26 100%)' }} dark>
          <span />
        </HtmlCell>
        <HtmlCell label="11 Lora italic + Great Vibes">
          <p style={{ margin: '14px 10px', fontFamily: 'Lora, serif', fontStyle: 'italic', fontSize: 15 }}>The ferry left at noon.</p>
          <p style={{ margin: '0 10px', fontFamily: "'Great Vibes', cursive", fontSize: 40, color: '#9A6F1E' }}>July 16</p>
        </HtmlCell>
        <HtmlCell label="12 css filter only (grayscale)">
          {img && <img src={img} alt="" style={{ display: 'block', width: '100%', height: 140, objectFit: 'cover', filter: 'grayscale(1)' }} />}
        </HtmlCell>
      </div>
      <p style={{ position: 'absolute', left: 20, bottom: 14, margin: 0, fontSize: 11, color: '#4A5578', fontFamily: 'Inter, sans-serif' }}>
        Effects test. Compare each cell with the same cell on screen.
      </p>
    </PageFrame>
  )
}
