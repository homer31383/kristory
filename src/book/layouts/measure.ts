import { createContext } from 'react'
import type { MatTone } from '../tokens'

/**
 * True while src/book/fit.tsx renders a page offscreen to measure its text.
 * Photos then render as empty boxes of the same size, so measuring never
 * downloads an image.
 */
export const MeasureContext = createContext(false)

/**
 * What a page passes down to its parts without props, set by BookPageView:
 *  textScale  the body type scale (BookPage.textScale), read by TextBlocks
 *  mat        the mat a zoomed-out photo sits on (from the layout's tone)
 */
export const PageContext = createContext<{ textScale: number; mat: MatTone }>({ textScale: 1, mat: 'light' })

/**
 * Which file a photo loads: 'print' (the 3000 px print copy when there is
 * one) for the print route, 'screen' (the 1600 px display copy) for the
 * editor, crops and preview screens, which only need it on screen.
 */
export type PhotoSource = 'print' | 'screen'
export const PhotoSourceContext = createContext<PhotoSource>('print')
