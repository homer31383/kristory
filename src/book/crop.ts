/**
 * How a photo sits in its slot, from the focal point and the fit zoom.
 *
 * zoom runs from 1 (fill the slot, object-fit: cover, the default) to 0 (the
 * whole photo shows, object-fit: contain). In between the scale moves
 * geometrically from cover to contain, so each step of the slider feels the
 * same. zoom is stored per photo on book_items.photo_ids and does not depend
 * on the slot, so it survives a layout change.
 *
 * On an axis where the photo is larger than the slot, the focal point works
 * like object-position: the point at focal fraction f of the photo lands at
 * fraction f of the slot, so it always stays visible. On an axis where the
 * photo is smaller than the slot it is centered and the rest is mat.
 */

export interface Size {
  w: number
  h: number
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export const DEFAULT_FOCAL = 0.5
export const DEFAULT_ZOOM = 1

export function clampZoom(z: number | null | undefined): number {
  if (z === null || z === undefined || Number.isNaN(z)) return DEFAULT_ZOOM
  return Math.min(1, Math.max(0, z))
}

/** Photo scale (slot units per photo pixel) for a zoom. */
export function photoScale(photo: Size, slot: Size, zoom: number): number {
  const cover = Math.max(slot.w / photo.w, slot.h / photo.h)
  const contain = Math.min(slot.w / photo.w, slot.h / photo.h)
  const z = clampZoom(zoom)
  return contain * Math.pow(cover / contain, z)
}

/** Shown size as a share of the fill size: 1 at fill, lower when zoomed out. */
export function fillShare(photo: Size, slot: Size, zoom: number): number {
  const cover = Math.max(slot.w / photo.w, slot.h / photo.h)
  return photoScale(photo, slot, zoom) / cover
}

function place(drawn: number, slot: number, focal: number): number {
  return drawn > slot ? (slot - drawn) * focal : (slot - drawn) / 2
}

/** Where the photo is drawn, in slot units (it may extend past the slot). */
export function photoBox(photo: Size, slot: Size, focalX: number, focalY: number, zoom: number): Box {
  const s = photoScale(photo, slot, zoom)
  const w = photo.w * s
  const h = photo.h * s
  return { x: place(w, slot.w, focalX), y: place(h, slot.h, focalY), w, h }
}

/** The part of the photo that shows, as fractions of the photo (0 to 1). */
export function visibleRegion(photo: Size, slot: Size, focalX: number, focalY: number, zoom: number): Box {
  const b = photoBox(photo, slot, focalX, focalY, zoom)
  const x0 = Math.max(0, -b.x) / b.w
  const y0 = Math.max(0, -b.y) / b.h
  const x1 = Math.min(b.w, slot.w - b.x) / b.w
  const y1 = Math.min(b.h, slot.h - b.y) / b.h
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * Effective DPI at the shown size. slotIn is the slot in inches (with bleed);
 * zooming out shrinks the photo, so DPI rises.
 */
export function shownDpi(px: Size, slotIn: Size, zoom: number): number {
  const inchesPerPixel = photoScale(px, slotIn, zoom)
  return 1 / inchesPerPixel
}

export type CropSide = 'top' | 'bottom' | 'left' | 'right'

export interface CropReading {
  /** Share of the photo's area that does not show, 0 to 1. */
  lost: number
  /** Sides that lose more than a sliver, by the focal point. */
  sides: CropSide[]
}

/** How much of the photo the slot cuts off, and where, at this zoom and focal point. */
export function cropReading(photo: Size, slot: Size, focalX: number, focalY: number, zoom: number): CropReading {
  const v = visibleRegion(photo, slot, focalX, focalY, zoom)
  const sides: CropSide[] = []
  const sliver = 0.04
  if (v.y > sliver) sides.push('top')
  if (1 - (v.y + v.h) > sliver) sides.push('bottom')
  if (v.x > sliver) sides.push('left')
  if (1 - (v.x + v.w) > sliver) sides.push('right')
  return { lost: Math.max(0, 1 - v.w * v.h), sides }
}

/** Soft flag when more than this share of a photo is cut off; hard above the second. */
export const CROP_SOFT = 0.4
export const CROP_HARD = 0.65

export function cropLabel(r: CropReading): string {
  const pct = `${Math.round(r.lost * 100)}% cropped`
  if (r.sides.length === 0) return pct
  const names = r.sides.length === 2 ? r.sides.join(' and ') : r.sides.join(', ')
  return `${pct} (${names})`
}

export interface CropValue {
  focalX: number
  focalY: number
  zoom: number
}

export const DEFAULT_CROP: CropValue = { focalX: DEFAULT_FOCAL, focalY: DEFAULT_FOCAL, zoom: DEFAULT_ZOOM }

/** A book slot's crop value from a stored slot. */
export function cropOf(slot: { focal_x?: number; focal_y?: number; zoom?: number } | undefined): CropValue {
  return {
    focalX: slot?.focal_x ?? DEFAULT_FOCAL,
    focalY: slot?.focal_y ?? DEFAULT_FOCAL,
    zoom: slot?.zoom ?? DEFAULT_ZOOM,
  }
}
