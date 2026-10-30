import { PageFrame } from './parts'
import { COLOR } from '../tokens'

/** A blank page, added for side rules and an even page count. Not in the design files. */
export default function Blank() {
  return <PageFrame background={COLOR.white} color={COLOR.ink}>{null}</PageFrame>
}
