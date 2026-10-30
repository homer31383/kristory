import { useEffect, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { BookPageView } from './layouts'
import { MeasureContext } from './layouts/measure'
import { pageFitBlocks, type BookPage, type FitFn } from './paginate'
import { hashText, runsToHtml, tokenRuns, tokensText } from './text'

/**
 * Measures how much text really fits on a page. The page's own layout
 * component is rendered offscreen (static markup, photos as empty boxes),
 * then words are added or removed in its [data-fit-block] spans until its
 * [data-fit-box] stops overflowing. Static markup keeps this synchronous, so
 * paginate() can call it while a screen renders.
 */

const EMPTY_COVER = { subtitle: '', backQuote: '' }
const cache = new Map<string, number>()
let host: HTMLDivElement | null = null

function getHost(): HTMLDivElement {
  if (host && host.isConnected) return host
  host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-20000px',
    top: '0',
    width: '672px',
    height: '672px',
    visibility: 'hidden',
    pointerEvents: 'none',
  })
  document.body.appendChild(host)
  return host
}

function signature(page: BookPage): string {
  return hashText(
    JSON.stringify({
      // Not the page number, side or chapter: they only change the one-line
      // folio, so a renumbered book still hits the cache.
      l: page.layout,
      p: page.photos.length,
      f: page.facts,
      cap: page.caption ?? null,
      d: !!page.dropCap,
      b: page.badges,
      m: page.milestone?.title ?? null,
      q: page.quiet?.map((h) => [h.entryDate, h.badges]) ?? null,
      t: pageFitBlocks(page).map((x) => [x.author, x.tokens.length, tokensText(x.tokens)]),
    }),
  )
}

export const fitPage: FitFn = (page) => {
  const blocks = pageFitBlocks(page)
  const total = blocks.reduce((n, b) => n + b.tokens.length, 0)
  if (total === 0) return 0
  const key = signature(page)
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const el = getHost()
  el.innerHTML = renderToStaticMarkup(
    <MeasureContext.Provider value={true}>
      <BookPageView page={page} cover={EMPTY_COVER} />
    </MeasureContext.Provider>,
  )
  const box = el.querySelector<HTMLElement>('[data-fit-box]')
  if (!box) return total
  const spans = blocks.map((_, i) => el.querySelector<HTMLElement>(`[data-fit-block="${i}"]`))
  const dropCap = el.querySelector<HTMLElement>('[data-fit-dropcap]')

  const apply = (n: number) => {
    let left = n
    blocks.forEach((b, i) => {
      const span = spans[i]
      if (!span) return
      const para = span.closest<HTMLElement>('[data-fit-para]')
      const t = Math.min(left, b.tokens.length)
      left -= t
      if (para) para.style.display = t === 0 ? 'none' : ''
      let runs = tokenRuns(b.tokens.slice(0, t))
      if (i === 0 && dropCap && runs[0]) {
        dropCap.textContent = runs[0].t[0] ?? ''
        runs = [{ ...runs[0], t: runs[0].t.slice(1) }, ...runs.slice(1)]
      }
      span.innerHTML = runsToHtml(runs)
    })
  }
  const fits = () => box.scrollHeight <= box.clientHeight + 1

  let result = total
  apply(total)
  if (!fits()) {
    let lo = 0
    let hi = total - 1
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      apply(mid)
      if (fits()) lo = mid
      else hi = mid - 1
    }
    result = lo
  }
  el.innerHTML = ''
  cache.set(key, result)
  return result
}

const FONT_FACES = ['400 15px Lora', 'italic 400 15px Lora', '600 15px Lora', '500 15px Lora', '400 58px "Great Vibes"', '700 20px "Playfair Display"']

/** Resolves once the book fonts are loaded (or failed), never rejects. */
export async function loadBookFonts(): Promise<void> {
  try {
    await Promise.all(FONT_FACES.map((f) => document.fonts.load(f)))
    await document.fonts.ready
  } catch {
    // Measuring with fallback fonts is better than not at all.
  }
}

/** The DOM fitter, once the fonts it measures with have loaded; null until then. */
export function useTextFitter(): FitFn | null {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    loadBookFonts().then(() => {
      if (alive) {
        cache.clear()
        setReady(true)
      }
    })
    return () => {
      alive = false
    }
  }, [])
  return ready ? fitPage : null
}
