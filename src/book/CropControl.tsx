import { useRef, useState, type PointerEvent } from 'react'
import { getStorageUrl } from '../lib/helpers'
import { photoPixels, type BookPhoto } from './model'
import { cropLabel, cropReading, fillShare, shownDpi, visibleRegion, DEFAULT_CROP, DEFAULT_FOCAL, DEFAULT_ZOOM, type CropValue, type Size } from './crop'
import { cropFlag, dpiFlag } from './paginate'
import { FlagChip } from './components'

/**
 * Focal point and fit zoom for one photo in one slot. The whole photo is
 * shown; the part outside the slot is dimmed. Tap or drag to move the focal
 * point; the slider runs from "Whole photo" to fill. Readouts show the DPI at
 * the shown size and how much is cropped.
 */
export function CropControl({
  photo,
  slotIn,
  value,
  onChange,
  maxSize = 320,
}: {
  photo: BookPhoto
  /** The slot's printed size in inches (with bleed). */
  slotIn: Size
  value: CropValue
  onChange: (next: CropValue) => void
  maxSize?: number
}) {
  const [natural, setNatural] = useState<Size | null>(null)
  const px = photoPixels(photo) ?? natural
  const boxRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const aspect = px ? px.w / px.h : 1
  const w = aspect >= 1 ? maxSize : Math.round(maxSize * aspect)

  const setFromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = boxRef.current?.getBoundingClientRect()
    if (!r) return
    const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    onChange({ ...value, focalX: Math.round(fx * 1000) / 1000, focalY: Math.round(fy * 1000) / 1000 })
  }

  const region = px ? visibleRegion(px, slotIn, value.focalX, value.focalY, value.zoom) : null
  const dpi = px ? shownDpi(px, slotIn, value.zoom) : null
  const crop = px ? cropReading(px, slotIn, value.focalX, value.focalY, value.zoom) : null
  const share = px ? fillShare(px, slotIn, value.zoom) : 1
  const flags = [dpi !== null ? dpiFlag(dpi) : null, crop ? cropFlag(crop) : null].filter((f) => !!f)
  const isDefault = value.focalX === DEFAULT_FOCAL && value.focalY === DEFAULT_FOCAL && value.zoom === DEFAULT_ZOOM

  return (
    <div>
      <div
        ref={boxRef}
        className="relative mx-auto select-none touch-none cursor-crosshair rounded overflow-hidden"
        style={{ width: w, maxWidth: '100%', aspectRatio: `${aspect}` }}
        onPointerDown={(e) => {
          dragging.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          setFromPointer(e)
        }}
        onPointerMove={(e) => dragging.current && setFromPointer(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <img
          src={getStorageUrl(photo.storage_path)}
          alt=""
          draggable={false}
          onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'fill' }}
        />
        {region && (
          // Dim everything outside the part that prints.
          <div
            className="absolute pointer-events-none"
            style={{
              left: `${region.x * 100}%`,
              top: `${region.y * 100}%`,
              width: `${region.w * 100}%`,
              height: `${region.h * 100}%`,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
              outline: '2px solid rgba(255,255,255,0.9)',
            }}
          />
        )}
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            left: `calc(${value.focalX * 100}% - 9px)`,
            top: `calc(${value.focalY * 100}% - 9px)`,
            width: 18,
            height: 18,
            border: '2px solid white',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
          }}
        />
      </div>

      <div className="mt-3">
        <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
          <span>Whole photo</span>
          <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
            {value.zoom >= 1 ? 'Fill' : `${Math.round(share * 100)}% of fill`}
          </span>
          <span>Fill</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={value.zoom}
          onChange={(e) => onChange({ ...value, zoom: Number(e.target.value) })}
          className="w-full cursor-pointer"
          style={{ accentColor: 'var(--accent)' }}
          aria-label="Fit zoom"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
        {dpi !== null && <span>{Math.round(dpi)} DPI</span>}
        {crop && <span>{crop.lost > 0.005 ? cropLabel(crop) : 'Nothing cropped'}</span>}
        {!px && <span>Measuring photo size...</span>}
        {flags.map((f) => (
          <FlagChip key={f.kind} flag={f} />
        ))}
        <button
          onClick={() => onChange(DEFAULT_CROP)}
          disabled={isDefault}
          className="ml-auto px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-40 disabled:cursor-default"
          style={{ borderColor: 'var(--border-card)', color: 'var(--text-primary)' }}
        >
          Reset
        </button>
      </div>
    </div>
  )
}
