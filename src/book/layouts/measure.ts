import { createContext } from 'react'

/**
 * True while src/book/fit.ts renders a page offscreen to measure its text.
 * Photos then render as empty boxes of the same size, so measuring never
 * downloads an image.
 */
export const MeasureContext = createContext(false)
