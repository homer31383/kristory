import { useEffect, useState } from 'react'
import { loadBookFonts } from './fit'

/**
 * True once the book fonts have loaded and every image under the sheets has
 * finished (loaded or failed). `deps` restarts the wait when the pages change.
 */
export function usePrintReady(enabled: boolean, deps: unknown): { ready: boolean; failed: number } {
  const [state, setState] = useState({ ready: false, failed: 0 })
  useEffect(() => {
    if (!enabled) return
    let alive = true
    setState({ ready: false, failed: 0 })
    ;(async () => {
      await loadBookFonts()
      // Let React commit the sheets before collecting their images.
      await new Promise((r) => requestAnimationFrame(() => r(null)))
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.book-sheet img'))
      let failed = 0
      await Promise.all(
        imgs.map(
          (img) =>
            new Promise<void>((resolve) => {
              const done = () => {
                if (img.naturalWidth === 0) failed++
                resolve()
              }
              if (img.complete) done()
              else {
                img.addEventListener('load', done, { once: true })
                img.addEventListener('error', done, { once: true })
              }
            }),
        ),
      )
      await document.fonts.ready
      if (alive) setState({ ready: true, failed })
    })()
    return () => {
      alive = false
    }
  }, [enabled, deps])
  return state
}
