import { getStorageUrl } from '../lib/helpers'
import { BookPageView, type CoverData } from './layouts'
import { PAGE_PX } from './layouts/parts'
import { PhotoSourceContext } from './layouts/measure'
import { photoBox, type CropValue, type Size } from './crop'
import { MAT, type MatTone } from './tokens'
import { photoPixels, type BookPhoto } from './model'
import type { BookPage } from './paginate'

/**
 * A finished page (the 672 px layout) scaled to `size` px with a CSS
 * transform, loading the display copies of the photos. The screen needs one
 * <BookDefs /> mounted for the watercolor filters.
 */
export function ScaledPage({ page, cover, size }: { page: BookPage; cover: CoverData; size: number }) {
  const scale = size / PAGE_PX
  return (
    <div style={{ width: size, height: size, overflow: 'hidden', flexShrink: 0, boxShadow: '0 1px 6px rgba(0,0,0,0.22)' }}>
      <div style={{ width: PAGE_PX, height: PAGE_PX, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
        <PhotoSourceContext.Provider value="screen">
          <BookPageView page={page} cover={cover} />
        </PhotoSourceContext.Provider>
      </div>
    </div>
  )
}

/** One photo in the shape of its slot, cropped as it prints (on its mat below fill). */
export function SlotThumb({
  photo,
  slotIn,
  crop,
  mat,
  width,
}: {
  photo: BookPhoto
  slotIn: Size
  crop: CropValue
  mat: MatTone
  width: number
}) {
  const height = Math.round((width * slotIn.h) / slotIn.w)
  const px = photoPixels(photo)
  const box = px ? photoBox(px, { w: width, h: height }, crop.focalX, crop.focalY, crop.zoom) : null
  return (
    <div className="relative overflow-hidden flex-shrink-0" style={{ width, height, background: MAT[mat].color }}>
      <img
        src={getStorageUrl(photo.storage_path)}
        alt=""
        loading="lazy"
        draggable={false}
        style={
          box
            ? { position: 'absolute', left: box.x, top: box.y, width: box.w, height: box.h, maxWidth: 'none' }
            : { width: '100%', height: '100%', objectFit: 'cover' }
        }
      />
    </div>
  )
}
