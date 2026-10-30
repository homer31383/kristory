import type { ComponentType } from 'react'
import type { LayoutId } from '../catalog'
import type { BookPage } from '../paginate'
import type { LayoutProps } from './parts'
import type { CoverData } from './cover'
import { PageContext } from './measure'
import { matTone } from '../catalog'
import BandText from './BandText'
import BackCover from './BackCover'
import BackScript from './BackScript'
import Blank from './Blank'
import CoverScript from './CoverScript'
import FullBleed from './FullBleed'
import GridDay from './GridDay'
import Main from './Main'
import MidArch from './MidArch'
import Milestone from './Milestone'
import NavyFrame from './NavyFrame'
import NavyPanel from './NavyPanel'
import NavyTop from './NavyTop'
import NavyTrio from './NavyTrio'
import Opener from './Opener'
import PhotoDay from './PhotoDay'
import SplitDay from './SplitDay'
import TextDay from './TextDay'
import Title from './Title'
import TwoAuthors from './TwoAuthors'
import TwoQuiet from './TwoQuiet'
import WhiteMosaic from './WhiteMosaic'

export { BookDefs } from './BookDefs'
export type { CoverData } from './cover'

/** Interior layouts that render from a page alone. */
const PAGE_COMPONENTS: Partial<Record<LayoutId, ComponentType<LayoutProps>>> = {
  opener: Opener,
  blank: Blank,
  'two-quiet': TwoQuiet,
  'text-day': TextDay,
  'photo-day': PhotoDay,
  'two-authors': TwoAuthors,
  milestone: Milestone,
  'full-bleed': FullBleed,
  'band-text': BandText,
  'grid-day': GridDay,
  'split-day': SplitDay,
  'navy-top': NavyTop,
  'navy-frame': NavyFrame,
  'navy-trio': NavyTrio,
  'mid-arch': MidArch,
  'white-mosaic': WhiteMosaic,
  'navy-panel': NavyPanel,
}

/** One interior page at 672 x 672 px. */
export function BookPageView({ page, cover }: { page: BookPage; cover: CoverData }) {
  if (page.layout === 'title') return <Title subtitle={cover.subtitle} />
  const Component = PAGE_COMPONENTS[page.layout] ?? Blank
  return (
    <PageContext.Provider value={{ textScale: page.textScale ?? 1, mat: matTone(page.layout) }}>
      <Component page={page} />
    </PageContext.Provider>
  )
}

export type CoverStyle = 'a' | 'b'

/** The front or back cover, in option A (Main, BackCover) or B (CoverScript, BackScript). */
export function BookCoverView({ which, style, cover }: { which: 'front' | 'back'; style: CoverStyle; cover: CoverData }) {
  if (style === 'a') return which === 'front' ? <Main cover={cover} /> : <BackCover cover={cover} />
  return which === 'front' ? <CoverScript cover={cover} /> : <BackScript cover={cover} />
}
