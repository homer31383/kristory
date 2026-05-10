import type { BabylistPerson, Pick } from '../types'
import { fmtUSD } from '../lib/money'
import { usePresence } from '../data/usePresence'

interface Props {
  registryId: string
  myPersonId: string | null
  totals: { allBudget: number; allMid: number; allPremium: number; itemCount: number }
  picks: Pick[]
  people: BabylistPerson[]
  pickCost: (pick: Pick) => number
}

export default function Dashboard({
  registryId,
  myPersonId,
  totals,
  picks,
  people,
  pickCost,
}: Props) {
  const myPicks = picks.filter((p) => p.person_id === myPersonId)
  const myTotal = myPicks.reduce((sum, p) => sum + pickCost(p), 0)

  const presence = usePresence(registryId, myPersonId)

  const perPerson = people.map((person) => {
    const pp = picks.filter((p) => p.person_id === person.id)
    const total = pp.reduce((s, p) => s + pickCost(p), 0)
    const isActive = presence.has(person.id)
    const isMe = person.id === myPersonId
    return { person, pickCount: pp.length, total, isActive, isMe }
  })

  return (
    <section
      style={{
        padding: '32px 0',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 24,
        borderBottom: '1px solid var(--line)',
      }}
    >
      <Stat label="If All Budget" value={fmtUSD(totals.allBudget)} sub={`${totals.itemCount} items`} />
      <Stat label="If All Mid" value={fmtUSD(totals.allMid)} sub={`${totals.itemCount} items`} />
      <Stat label="If All Premium" value={fmtUSD(totals.allPremium)} sub={`${totals.itemCount} items`} />
      <Stat label="Your Picks" value={fmtUSD(myTotal)} sub={`${myPicks.length} picks`} accent />

      {perPerson.length > 1 && (
        <div
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            justifyContent: 'center',
            gap: 20,
            flexWrap: 'wrap',
            paddingTop: 8,
            borderTop: '1px dashed var(--line-faint)',
          }}
        >
          {perPerson.map(({ person, pickCount, total, isActive, isMe }) => (
            <div key={person.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                title={isActive ? 'Active now' : 'Not active'}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: person.color ?? 'var(--terracotta)',
                  color: 'var(--cream)',
                  fontFamily: 'Manrope',
                  fontSize: 12,
                  fontWeight: 700,
                  position: 'relative',
                }}
              >
                {(person.name[0] || '?').toUpperCase()}
                {isActive && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: '#3aa56b',
                      border: '2px solid var(--cream)',
                    }}
                  />
                )}
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span
                  style={{
                    fontFamily: 'Manrope',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  {person.name}
                  {isMe ? ' (you)' : ''}
                </span>
                <span
                  style={{
                    fontFamily: 'Fraunces',
                    fontStyle: 'italic',
                    color: 'var(--ink-soft)',
                    fontSize: 12,
                  }}
                >
                  {pickCount} picks · {fmtUSD(total)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub: string
  accent?: boolean
}) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--ink-faint)',
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: 'Fraunces',
          fontWeight: 400,
          fontSize: 34,
          color: accent ? 'var(--terracotta)' : 'var(--ink)',
          letterSpacing: '-0.01em',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--ink-faint)',
          marginTop: 4,
          fontStyle: 'italic',
          fontFamily: 'Fraunces',
        }}
      >
        {sub}
      </div>
    </div>
  )
}
