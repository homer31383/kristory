import { useEffect, useRef } from 'react'
import type { BabylistPerson } from '../types'

interface Props {
  pickedBy: { person: BabylistPerson; pickId: string; transferred: boolean }[]
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
      {pickedBy.map(({ person, pickId, transferred }) => (
        <Badge
          key={pickId}
          name={person.name}
          color={person.color ?? 'var(--terracotta)'}
          transferred={transferred}
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
  transferred,
  isRemoteIn,
  isRemoteOut,
  onAnimationEnd,
}: {
  name: string
  color: string
  transferred: boolean
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
      title={transferred ? `${name} · On Babylist` : name}
      style={{
        position: 'relative',
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
      {transferred && (
        <span
          aria-label="On Babylist"
          style={{
            position: 'absolute',
            bottom: -3,
            right: -3,
            width: 11,
            height: 11,
            borderRadius: '50%',
            background: 'var(--moss)',
            border: '2px solid var(--cream)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="6"
            height="6"
            viewBox="0 0 12 12"
            fill="none"
            stroke="var(--cream)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="2 6.5 5 9.5 10 3.5" />
          </svg>
        </span>
      )}
    </span>
  )
}
