import { useEffect, useRef } from 'react'
import type { BabylistPerson } from '../types'

interface Props {
  pickedBy: { person: BabylistPerson; pickId: string }[]
  remotePickIds: Set<string>
  removingPickIds: Set<string>
  clearRemote: (id: string) => void
}

export default function PickBadges({
  pickedBy,
  remotePickIds,
  removingPickIds,
  clearRemote,
}: Props) {
  if (pickedBy.length === 0) return null
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 10,
        right: 10,
        display: 'flex',
        gap: 4,
      }}
    >
      {pickedBy.map(({ person, pickId }) => (
        <Badge
          key={pickId}
          name={person.name}
          color={person.color ?? 'var(--terracotta)'}
          isRemoteIn={remotePickIds.has(pickId)}
          isRemoteOut={removingPickIds.has(pickId)}
          onAnimationEnd={() => clearRemote(pickId)}
        />
      ))}
    </div>
  )
}

function Badge({
  name,
  color,
  isRemoteIn,
  isRemoteOut,
  onAnimationEnd,
}: {
  name: string
  color: string
  isRemoteIn: boolean
  isRemoteOut: boolean
  onAnimationEnd: () => void
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!isRemoteIn) return
    const el = ref.current
    if (!el) return
    const handler = () => onAnimationEnd()
    el.addEventListener('animationend', handler, { once: true })
    return () => el.removeEventListener('animationend', handler)
  }, [isRemoteIn, onAnimationEnd])

  const cls = isRemoteOut ? 'badge-remote-out' : isRemoteIn ? 'badge-remote-in' : ''

  return (
    <span
      ref={ref}
      className={cls}
      title={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: color,
        color: 'var(--cream)',
        fontFamily: 'Manrope',
        fontSize: 11,
        fontWeight: 700,
        border: '2px solid var(--cream)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }}
    >
      {(name[0] || '?').toUpperCase()}
    </span>
  )
}
