// Shared SVG defs for every book page, ported from the design files in
// docs/book-layouts/ (identical in each of them). Generated from
// CoverScript.dc.html; ids are prefixed with bk- so they cannot collide with
// the rest of the app. sk3 is defined in the design but never used, so it is
// left out.
//
// Mount <BookDefs /> once per document that shows book pages. It is a 0 x 0
// svg, not display: none, because Chrome does not render filters or symbols
// from a display: none svg.

export function BookDefs() {
  return (
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}>
      <defs>
        <filter id="bk-wc" x="-30%" y="-30%" width="160%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.11" numOctaves="3" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5" result="d"/><feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="3" result="m"/><feColorMatrix in="m" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.6 -0.15" result="ma"/><feComposite in="d" in2="ma" operator="in"/></filter>
        <filter id="bk-ink" x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="0.52"/><feFuncG type="linear" slope="0.52"/><feFuncB type="linear" slope="0.52"/></feComponentTransfer></filter>
        <filter id="bk-sk1" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.025" numOctaves="2" seed="5" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="5"/></filter>
        <filter id="bk-sk2" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="11" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter>
        <g id="bk-sprig" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 -12 C 9 -15 15 -25 15 -35 C 7 -31 2 -21 0 -12 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.6" transform="translate(1.4 1.2)" filter="url(#bk-wc)"/>
        <path d="M0 -25 C -9 -28 -15 -38 -15 -48 C -7 -44 -2 -34 0 -25 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.6" transform="translate(1.4 1.2)" filter="url(#bk-wc)"/>
        <path d="M0 -63 C 7 -53 7 -43 0 -34 C -6 -43 -7 -53 -1 -63 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.6" transform="translate(1.4 1.2)" filter="url(#bk-wc)"/>
        <g filter="url(#bk-ink)">
        <path d="M-0.5 0 Q2.6 -30 -1 -64 Q4 -30 0.7 0 Z" fill="currentColor" stroke="none"/>
        <path d="M1.2 -1 Q4.5 -30 1 -62" strokeWidth="0.35" opacity="0.5"/>
        <path d="M0 -12 C 9 -15 15 -25 15 -35 C 7 -31 2 -21 0 -12 Z M0.8 -11.5 C 9.8 -14.5 15.8 -24.5 15.8 -34.5 C 7.8 -30.5 2.8 -20.5 0.8 -11.5 Z" fill="currentColor" fillRule="evenodd" stroke="none"/><path d="M0 -12 C 9 -15 15 -25 15 -35 C 7 -31 2 -21 0 -12 Z" strokeWidth="0.45"/>
        <path d="M0 -25 C -9 -28 -15 -38 -15 -48 C -7 -44 -2 -34 0 -25 Z M0.8 -24.5 C -8.2 -27.5 -14.2 -37.5 -14.2 -47.5 C -6.2 -43.5 -1.2 -33.5 0.8 -24.5 Z" fill="currentColor" fillRule="evenodd" stroke="none"/><path d="M0 -25 C -9 -28 -15 -38 -15 -48 C -7 -44 -2 -34 0 -25 Z" strokeWidth="0.45"/>
        <path d="M0 -63 C 7 -53 7 -43 0 -34 C -6 -43 -7 -53 -1 -63 Z M0.8 -62.5 C 7.8 -52.5 7.8 -42.5 0.8 -33.5 C -5.2 -42.5 -6.2 -52.5 -0.2 -62.5 Z" fill="currentColor" fillRule="evenodd" stroke="none"/><path d="M0 -63 C 7 -53 7 -43 0 -34 C -6 -43 -7 -53 -1 -63 Z" strokeWidth="0.45"/>
        <path d="M1 -13 Q9 -23 14 -34 M-1 -26 Q-9 -37 -14 -47 M0 -59 L0 -38" strokeWidth="0.4"/>
        </g>
        </g>
        <g id="bk-leaf" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 0 C 10 -12 10 -31 1 -47 C -9 -31 -10 -12 0 0 Z" fill="currentColor" fillOpacity="0.5" stroke="currentColor" strokeOpacity="0.4" strokeWidth="2.6" transform="translate(1.4 1.2)" filter="url(#bk-wc)"/>
        <g filter="url(#bk-ink)">
        <path d="M0 0 C 10 -12 10 -31 1 -47 C -9 -31 -10 -12 0 0 Z M0.8 0.5 C 10.8 -11.5 10.8 -30.5 1.8 -46.5 C -8.2 -30.5 -9.2 -11.5 0.8 0.5 Z" fill="currentColor" fillRule="evenodd" stroke="none"/><path d="M0 0 C 10 -12 10 -31 1 -47 C -9 -31 -10 -12 0 0 Z" strokeWidth="0.45"/>
        <path d="M-0.3 -1 Q2.2 -24 1 -46 Q3.4 -24 0.6 -1 Z" fill="currentColor" stroke="none"/>
        <path d="M1 -14 L7 -20 M1 -25 L8 -31 M1 -17 L-6 -24 M1 -29 L-6 -36" strokeWidth="0.4"/>
        </g>
        </g>
      </defs>
    </svg>
  )
}
