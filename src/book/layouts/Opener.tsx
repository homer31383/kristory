import { getStorageUrl } from '../../lib/helpers'
import { dateRangeLabel } from './cover'
import { Decor, Dot, Leaf, PageFrame, Photo, Sprig, type LayoutProps } from './parts'
import { BG } from './style'
import { COLOR, FONT } from '../tokens'

/** Opener.dc.html: navy trip chapter opener, always on a right-hand page. */
export default function Opener({ page }: LayoutProps) {
  const trip = page.trip
  const title = trip?.title ?? page.chapter
  // The design sets "Greenport" (9 letters) at 118 px across the page; longer names step down to fit.
  const size = title.length <= 9 ? 118 : Math.max(56, Math.round((118 * 9) / title.length))
  return (
    <PageFrame background={BG.navy('50% 45%', '72% 64%')} color={COLOR.cream}>
      <Decor>
        <Sprig x={560} y={112} r={28} s={1.2} color={COLOR.coral} fill />
        <Leaf x={610} y={190} r={-36} color={COLOR.teal} />
        <Sprig x={68} y={636} r={-20} s={1.1} color={COLOR.cream} fill />
        <Leaf x={130} y={640} r={54} color={COLOR.gold} />
        <Dot x={500} y={96} color={COLOR.cream} />
        <Dot x={620} y={620} color={COLOR.coral} />
      </Decor>
      <div style={{ position: 'relative', height: '100%', boxSizing: 'border-box', padding: '52px 52px 52px 52px', display: 'flex', flexDirection: 'column' }}>
        <p style={{ margin: '0 0 6px 0', fontSize: 12, letterSpacing: '0.3em', textTransform: 'uppercase', color: COLOR.gold, fontWeight: 600 }}>A trip</p>
        <h1 style={{ margin: 0, fontFamily: FONT.script, fontWeight: 400, fontSize: size, lineHeight: 1.05, color: COLOR.cream }}>{title}</h1>
        <p style={{ margin: '0 0 26px 0', fontStyle: 'italic', fontSize: 19, color: COLOR.creamSoft }}>
          {trip ? dateRangeLabel(trip.start_date, trip.end_date) : ''}
        </p>
        {page.photos[0] ? (
          <Photo photo={page.photos[0]} width={568} height={340} style={{ borderRadius: 2 }} />
        ) : trip?.cover_photo_path ? (
          <img src={getStorageUrl(trip.cover_photo_path)} alt="" width={568} height={340} style={{ display: 'block', width: 568, height: 340, objectFit: 'cover', borderRadius: 2 }} />
        ) : null}
      </div>
    </PageFrame>
  )
}
