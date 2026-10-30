import { createContext } from 'react'

/**
 * True while src/book/fit.ts renders a page offscreen to measure its text.
 * Photos then render as empty boxes of the same size, so measuring never
 * downloads an image.
 */
export const MeasureContext = createContext(false)

/**
 * The page's body type scale (BookPage.textScale), read by TextBlocks. Set
 * by BookPageView so every layout gets it without passing it down.
 */
export const TextScaleContext = createContext(1)
