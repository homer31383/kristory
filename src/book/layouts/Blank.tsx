import { PageFrame } from './parts'

/** A blank page, added for side rules and an even page count. Not in the design files. */
export default function Blank() {
  return <PageFrame background="#FFFFFF" color="#14204A">{null}</PageFrame>
}
