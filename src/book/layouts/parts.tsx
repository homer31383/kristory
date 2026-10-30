import { useContext, type CSSProperties, type ReactNode } from 'react'
import { MARK_BOLD, MARK_ITALIC, tokenRuns } from '../text'
import type { AuthorKey } from '../model'
import type { BookPage, PageBlock, PagePhoto } from '../paginate'
import { MeasureContext, TextScaleContext } from './measure'
import { photoUrl, pretty, ruleColor, scriptDate, type Tone } from './style'
import { COLOR, FONT, SHADE, TYPE } from '../tokens'

/**
 * Pieces shared by the page layouts. Every value here is copied from the
 * design files in docs/book-layouts/; do not restyle.
 *
 * data-fit-* attributes let src/book/fit.tsx measure how much text fits:
 *  data-fit-box     the element that must not overflow
 *  data-fit-block   the span holding block n's words
 *  data-fit-dropcap the drop cap letter (first block only)
 */

export const PAGE_PX = 672

export interface LayoutProps {
  page: BookPage
}

export function PageFrame({ background, color, children }: { background: string; color: string; children: ReactNode }) {
  return (
    <div
      style={{
        width: 672,
        height: 672,
        boxSizing: 'border-box',
        position: 'relative',
        overflow: 'hidden',
        background,
        color,
        fontFamily: FONT.body,
      }}
    >
      {children}
    </div>
  )
}

// ── Decorations ──────────────────────────────────────────────────────────────

export function Decor({ children }: { children: ReactNode }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 672 672" width="672" height="672" style={{ position: 'absolute', left: 0, top: 0 }}>
      {children}
    </svg>
  )
}

function transform(x: number, y: number, r: number, s?: number) {
  return `translate(${x} ${y}) rotate(${r})${s !== undefined ? ` scale(${s})` : ''}`
}

/** A sprig. fill mirrors the designs, where some sprigs also set fill. */
export function Sprig({ x, y, r, s, color, fill = false }: { x: number; y: number; r: number; s?: number; color: string; fill?: boolean }) {
  return <use href="#bk-sprig" transform={transform(x, y, r, s)} style={fill ? { color, fill: color } : { color }} />
}

export function Leaf({ x, y, r, s, color }: { x: number; y: number; r: number; s?: number; color: string }) {
  return <use href="#bk-leaf" transform={transform(x, y, r, s)} style={{ color }} />
}

export function Dot({ x, y, color }: { x: number; y: number; color: string }) {
  return <circle cx={x} cy={y} r="2.5" fill={color} />
}

// ── Header ───────────────────────────────────────────────────────────────────

const BADGE: Record<Tone, Record<AuthorKey, string>> = {
  light: { chris: COLOR.chris, krista: COLOR.kristaDeep },
  dark: { chris: COLOR.chrisLight, krista: COLOR.kristaLight },
  mid: { chris: COLOR.chrisLight, krista: COLOR.kristaLight },
}

function badgeStyle(color: string): CSSProperties {
  return {
    width: 22,
    height: 22,
    boxSizing: 'border-box',
    border: `1.5px solid ${color}`,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 12,
    fontWeight: 600,
    color,
  }
}

/** Script date, small-caps weekday and author badges, as on every entry page. */
export function EntryHeader({
  entryDate,
  badges,
  tone,
  marginBottom = 12,
}: {
  entryDate?: string
  badges: AuthorKey[]
  tone: Tone
  marginBottom?: number
}) {
  const light = tone === 'light'
  const initial = (a: AuthorKey) => (a === 'chris' ? 'C' : 'K')
  // As designed, plus two guards for long dates in narrow columns (BandText):
  // the date never breaks, and the weekday wraps below it when there is no room.
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 14, marginBottom }}>
      <h1 style={{ margin: 0, whiteSpace: 'nowrap', fontFamily: FONT.script, fontWeight: 400, fontSize: 58, lineHeight: 1.1, color: light ? COLOR.goldDeep : COLOR.gold }}>
        {scriptDate(entryDate)}
      </h1>
      <span style={{ fontSize: 12, letterSpacing: '0.22em', textTransform: 'uppercase', color: light ? COLOR.slate : COLOR.creamSoft }}>
        {scriptDate(entryDate, 'EEEE')}
      </span>
      {badges.length === 1 ? (
        <span style={{ ...badgeStyle(BADGE[tone][badges[0]]), marginLeft: 'auto', alignSelf: 'center' }}>{initial(badges[0])}</span>
      ) : badges.length > 1 ? (
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignSelf: 'center' }}>
          {badges.map((a) => (
            <span key={a} style={badgeStyle(BADGE[tone][a])}>{initial(a)}</span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ── Text ─────────────────────────────────────────────────────────────────────

/** A block's words as React nodes, with bold and italic kept. */
export function RichRuns({ block, skipFirstChar = false }: { block: PageBlock; skipFirstChar?: boolean }) {
  const runs = tokenRuns(block.tokens)
  if (skipFirstChar && runs[0]) runs[0] = { ...runs[0], t: runs[0].t.slice(1) }
  return (
    <>
      {runs.map((r, i) => {
        let node: ReactNode = r.t
        if (r.m & MARK_ITALIC) node = <em>{node}</em>
        if (r.m & MARK_BOLD) node = <strong>{node}</strong>
        return <span key={i}>{node}</span>
      })}
    </>
  )
}

/**
 * Each author's text with their colored rule. blockStyle lets a layout style
 * the second author differently, as TwoAuthors and SplitDay do.
 */
export function TextBlocks({
  blocks,
  tone,
  firstMargin = 0,
  gap = 16,
  baseStyle,
  blockStyle,
  dropCap = false,
  startIndex = 0,
}: {
  blocks: PageBlock[]
  tone: Tone
  firstMargin?: number
  gap?: number
  baseStyle?: CSSProperties
  blockStyle?: (i: number) => CSSProperties | undefined
  dropCap?: boolean
  startIndex?: number
}) {
  const scale = useContext(TextScaleContext)
  return (
    <>
      {blocks.map((b, i) => {
        const cap = dropCap && i === 0 ? firstChar(b) : ''
        const style: CSSProperties = {
          margin: `${i === 0 ? firstMargin : gap}px 0 0 0`,
          paddingLeft: 14,
          borderLeft: `3px solid ${ruleColor(b.author, tone)}`,
          fontSize: TYPE.bodySize,
          lineHeight: TYPE.bodyLine,
          whiteSpace: 'pre-line',
          ...pretty,
          ...baseStyle,
          ...blockStyle?.(i),
        }
        if (scale < 1) style.fontSize = scaledSize(Number(style.fontSize), scale)
        return (
          <p
            key={b.sectionId + i}
            data-fit-para=""
            style={style}
          >
            {dropCap && i === 0 && (
              <span
                data-fit-dropcap=""
                style={{ float: 'left', fontFamily: FONT.body, fontWeight: 600, fontSize: 56, lineHeight: '46px', padding: '4px 8px 0 0', color: COLOR.gold, fontStyle: 'normal' }}
              >
                {cap}
              </span>
            )}
            <span data-fit-block={startIndex + i}>
              <RichRuns block={b} skipFirstChar={!!cap} />
            </span>
          </p>
        )
      })}
    </>
  )
}

/** A designed size scaled down, never under the floor (or the design, if smaller). */
function scaledSize(size: number, scale: number): number {
  return Math.max(size * scale, Math.min(size, TYPE.bodyMinSize))
}

function firstChar(b: PageBlock): string {
  return b.tokens[0]?.segs[0]?.t[0] ?? ''
}

/** "Ate" rows from tagged items. */
export function Facts({
  facts,
  tone,
  marginTop,
  border,
}: {
  facts: { label: string; value: string }[]
  tone: Tone
  marginTop: number
  border: string
}) {
  if (facts.length === 0) return null
  const labelColor = tone === 'light' ? COLOR.goldLabel : COLOR.gold
  return (
    <div style={{ marginTop, paddingTop: 10, borderTop: `1px solid ${border}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {facts.map((f) => (
        <div key={f.label} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: labelColor, fontWeight: 600 }}>{f.label}</span>
          <span style={{ fontSize: 14 }}>{f.value}</span>
        </div>
      ))}
    </div>
  )
}

/** Page number and chapter: number first on left pages, last on right pages. */
export function Folio({ page, color, align }: { page: BookPage; color: string; align?: 'left' | 'right' | 'center' }) {
  const side = align ?? page.side
  const sep = ' · '
  const text =
    side === 'center'
      ? String(page.number)
      : side === 'left'
        ? `${page.number}${sep}${page.chapter}`
        : `${page.chapter}${sep}${page.number}`
  return (
    <p style={{ margin: 'auto 0 0 0', textAlign: side, fontSize: 12, letterSpacing: '0.12em', color }}>{text}</p>
  )
}

// ── Photos ───────────────────────────────────────────────────────────────────

/** A photo filling its box with object-fit: cover around its focal point. */
export function Photo({
  photo,
  width,
  height,
  style,
}: {
  photo: PagePhoto | undefined
  width: number
  height: number
  style?: CSSProperties
}) {
  const measuring = useContext(MeasureContext)
  if (!photo || measuring) {
    if (photo) return <div style={{ width, height, flexShrink: 0, ...style }} />
    // A slot the entry has no photo for (a layout picked by hand).
    return <div style={{ width, height, background: SHADE.emptySlot, ...style }} />
  }
  return (
    <img
      src={photoUrl(photo.photo)}
      alt=""
      width={width}
      height={height}
      decoding="async"
      style={{
        display: 'block',
        width,
        height,
        objectFit: 'cover',
        objectPosition: `${Math.round(photo.focalX * 100)}% ${Math.round(photo.focalY * 100)}%`,
        ...style,
      }}
    />
  )
}
