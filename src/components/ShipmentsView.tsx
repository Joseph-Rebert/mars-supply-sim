import { useEffect, useRef, useState } from 'react'
import { missionMonth } from '../lib/analysis'
import { EQUIPMENT } from '../lib/data'
import { addDays, daysBetween } from '../lib/dates'
import { clampLaunchDate, withFlightLaunchDate } from '../lib/launchDates'
import {
  flightCapacity,
  flightContents,
  withEquipmentOn,
  withFlightAdded,
  withFlightRemoved,
  withFlightUpdated,
  type CargoGroup,
  type CargoLine,
} from '../lib/manifest'
import type { OrderSlot, OrderSlotStatus } from '../lib/supplyChain'
import { monthLabel } from '../lib/timeline'
import { CONSUMABLE_KEYS, EQUIPMENT_KEYS, type CargoFlight, type MissionPlan } from '../lib/types'
import { FlightItems, MassBar } from './CargoManifest'
import { LaunchDatePicker } from './LaunchDatePicker'

/** What the arrival means, after the date: one plain sentence per status. */
const ARRIVAL_NOTE: Partial<Record<OrderSlotStatus, { text: string; tone: string }>> = {
  ok: { text: 'In time.', tone: 'nominal' },
  thin: { text: 'Cutting it close: supplies dip below the safety buffer first.', tone: 'caution' },
  late: {
    text: 'Too late: in unlucky missions, supplies run out before it lands.',
    tone: 'critical',
  },
}

const GROUP_LABEL: Record<CargoGroup, string> = {
  water: 'Water',
  food: 'Food',
  o2: 'Oxygen',
  spares: 'Spare parts',
  fuel: 'Rover fuel',
  equipment: 'Equipment',
}

/** "Power plant (10 kW reactor)" → "power plant (10 kW reactor)": only the first letter drops. */
const lowerFirst = (s: string) => s[0].toLowerCase() + s.slice(1)
/** ["a", "b", "c"] → "a, b and c". */
const listText = (xs: string[]) =>
  xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`

const kg = (n: number) => `${Math.round(n).toLocaleString('en-US')} kg`
const tonnes = (n: number) => `${(n / 1000).toFixed(1)} t`

type Props = {
  /** The plan being edited: contents, weights and dates follow edits at once. */
  plan: MissionPlan
  /** The last run's order slots: in-time verdicts (which need the sim) and unused launch windows. */
  runSlots: OrderSlot[]
  leadDays: number
  /** Launch date of the rocket to mark (from a problem on the overview), if any. */
  highlight: string | null
  onChange: (update: (plan: MissionPlan) => MissionPlan) => void
}

/** "f4" when the plan has f1–f3: the id withFlightAdded gives the next rocket. */
function nextFlightId(flights: readonly CargoFlight[]): string {
  const n = flights.reduce((max, f) => Math.max(max, Number(f.id.replace(/\D/g, '')) || 0), 0)
  return `f${n + 1}`
}

/**
 * What's being shipped, as a manifest: one card per rocket listing exactly what's on it, a bar showing
 * what takes up the room, and one sentence on when it lands and whether that's in time.
 */
export function ShipmentsView({ plan, runSlots, leadDays, highlight, onChange }: Props) {
  const [open, setOpen] = useState<string | null>(null)

  const flights = [...plan.flights].sort((a, b) => a.launchDate.localeCompare(b.launchDate))
  const openWindows = runSlots.filter((s) => s.flights.length === 0)
  const book = (launchDate: string) => {
    const id = nextFlightId(plan.flights)
    onChange((p) => withFlightLaunchDate(withFlightAdded(p), id, launchDate))
    setOpen(id)
  }
  const unpacked = EQUIPMENT_KEYS.filter((k) => !plan.flights.some((f) => f.equipment?.includes(k)))

  return (
    <div className="sc-ship">
      <TotalLine plan={plan} />
      <div className="sc-ship-cards">
        {flights.map((f) => (
          <RocketCard
            key={f.id}
            plan={plan}
            flight={f}
            status={
              runSlots.find((s) =>
                s.flights.some((x) => x.id === f.id && x.launchDate === f.launchDate),
              )?.status
            }
            leadDays={leadDays}
            open={open === f.id}
            onToggle={() => setOpen(open === f.id ? null : f.id)}
            onChange={onChange}
            onRemoved={() => setOpen(null)}
            marked={highlight === f.launchDate}
          />
        ))}
        {openWindows.map((s) => (
          <article key={s.launchDate} className="sc-rocket is-empty">
            <h3 className="sc-rocket-name">Free launch slot</h3>
            <p className="sc-muted">
              A rocket could leave in {monthLabel(s.launchDate)} and land in month{' '}
              {missionMonth(s.arrivalDay)}. Nothing is booked on it yet; cargo would need ordering
              by {monthLabel(s.orderBy)}.
            </p>
            <button type="button" className="sc-link" onClick={() => book(s.launchDate)}>
              Book a rocket for this slot
            </button>
          </article>
        ))}
      </div>
      <div className="sc-ship-foot">
        <button
          type="button"
          className="sc-btn"
          onClick={() => {
            setOpen(nextFlightId(plan.flights))
            onChange(withFlightAdded)
          }}
        >
          + Add rocket
        </button>
        {unpacked.length > 0 && (
          <p className="sc-muted tone-caution">
            Not on any rocket yet: {unpacked.map((k) => EQUIPMENT[k].label).join(', ')}.
          </p>
        )}
      </div>
    </div>
  )
}

/** One sentence totalling everything being sent, in amounts the crew gets. */
function TotalLine({ plan }: { plan: MissionPlan }) {
  const total = (pick: (f: CargoFlight) => number) => plan.flights.reduce((s, f) => s + pick(f), 0)
  const supplies = CONSUMABLE_KEYS.map((r) => ({ r, kg: total((f) => f.consumablesKg[r]) }))
    .filter((x) => x.kg > 0)
    .sort((a, b) => b.kg - a.kg)
    .map((x) => `${kg(x.kg)} of ${GROUP_LABEL[x.r].toLowerCase()}`)
  const fuel = total((f) => f.fuelKg ?? 0)
  if (fuel > 0) supplies.push(`${kg(fuel)} of rover fuel`)
  const parts = total((f) => Object.values(f.spares).reduce((a, b) => a + b, 0))
  const equipment = EQUIPMENT_KEYS.filter((k) => plan.flights.some((f) => f.equipment?.includes(k)))
  const items = [
    ...supplies,
    parts > 0 ? `${parts} spare parts` : '',
    equipment.length ? `the ${listText(equipment.map((k) => lowerFirst(EQUIPMENT[k].label)))}` : '',
  ].filter(Boolean)
  const last = items.pop()
  return (
    <p className="sc-ship-total">
      {plan.flights.length} rockets send {items.join(', ')}
      {items.length ? ' and ' : ''}
      {last}.
    </p>
  )
}

function RocketCard(props: {
  plan: MissionPlan
  flight: CargoFlight
  status?: OrderSlotStatus
  leadDays: number
  open: boolean
  onToggle: () => void
  onChange: (update: (plan: MissionPlan) => MissionPlan) => void
  onRemoved: () => void
  /** Highlighted because a problem on the overview pointed here. */
  marked: boolean
}) {
  const { plan, flight, status, leadDays, marked } = props
  const card = useRef<HTMLElement>(null)
  useEffect(() => {
    if (marked) card.current?.scrollIntoView({ block: 'center' })
  }, [marked])
  const launchDate = clampLaunchDate(plan.destination, flight.launchDate)
  const cap = flightCapacity(plan, { ...flight, launchDate })
  const arrivalDay = daysBetween(plan.startDate, cap.transfer.arrivalDate)
  const lines = flightContents(flight)
  const note = cap.overCapacity
    ? {
        text: `Too heavy: ${kg(cap.massKg - cap.capacityKg)} more than it can carry on this date.`,
        tone: 'critical',
      }
    : status
      ? ARRIVAL_NOTE[status]
      : undefined
  return (
    <article
      ref={card}
      className={props.marked ? 'sc-rocket is-marked' : 'sc-rocket'}
      aria-label={flight.label}
    >
      <div className="sc-rocket-head">
        <h3 className="sc-rocket-name">{flight.label}</h3>
        <span className="sc-rocket-full num">
          {Math.round((cap.massKg / cap.capacityKg) * 100)}% full · {tonnes(cap.massKg)} of{' '}
          {tonnes(cap.capacityKg)}
        </span>
      </div>
      <p className="sc-rocket-when">
        Leaves {monthLabel(launchDate)}, lands {monthLabel(cap.transfer.arrivalDate)}
        {arrivalDay <= 0
          ? ', before the crew arrives.'
          : ` (month ${missionMonth(arrivalDay)} of the mission).`}{' '}
        {note && <span className={`tone-${note.tone} sc-rocket-note`}>{note.text}</span>}
      </p>

      <RoomBar lines={lines} capacityKg={cap.capacityKg} label={flight.label} />

      {lines.length === 0 ? (
        <p className="sc-muted">Nothing packed yet.</p>
      ) : (
        <ul className="sc-manifest">
          {lines.map((l) => (
            <li key={l.label}>
              <span className={`sc-swatch is-${l.group}`} aria-hidden="true" />
              <span className="sc-manifest-label">
                {l.label}
                {l.detail && <span className="sc-caption"> ({l.detail})</span>}
              </span>
              <span className="num sc-manifest-amount">{l.amount}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="sc-rocket-foot">
        <span className="sc-caption">
          Order the cargo by {monthLabel(addDays(launchDate, -leadDays))}
        </span>
        <button
          type="button"
          className="sc-link"
          aria-expanded={props.open}
          onClick={props.onToggle}
        >
          {props.open ? 'Done' : 'Change cargo'}
        </button>
      </div>

      {props.open && (
        <RocketEditor
          plan={plan}
          flight={flight}
          onChange={props.onChange}
          onRemoved={props.onRemoved}
        />
      )}
    </article>
  )
}

/** How the rocket's room is used: one segment per manifest line, empty space left plain. */
function RoomBar({
  lines,
  capacityKg,
  label,
}: {
  lines: CargoLine[]
  capacityKg: number
  label: string
}) {
  return (
    <div className="sc-room" role="img" aria-label={`${label}: how its room is used`}>
      {lines.map((l) => (
        <span
          key={l.label}
          className={`sc-room-seg is-${l.group}`}
          style={{ width: `${Math.min(100, (l.launchKg / capacityKg) * 100)}%` }}
          title={`${l.label}: ${kg(l.launchKg)} with packaging`}
        />
      ))}
    </div>
  )
}

/** One rocket's cargo: its date, supplies and spare parts, equipment, and how full it is. */
function RocketEditor(props: {
  plan: MissionPlan
  flight: CargoFlight
  onChange: (update: (plan: MissionPlan) => MissionPlan) => void
  onRemoved: () => void
}) {
  const { plan, flight, onChange } = props
  const launchDate = clampLaunchDate(plan.destination, flight.launchDate)
  return (
    <div className="sc-editor">
      <LaunchDatePicker
        plan={plan}
        flight={flight}
        showChart={false}
        onChange={(date) => onChange((p) => withFlightLaunchDate(p, flight.id, date))}
      />
      <div className="sc-editor-cols">
        <FlightItems
          flight={flight}
          onChange={(update) => onChange((p) => withFlightUpdated(p, flight.id, update))}
        />
        <fieldset className="sc-equipment">
          <legend>Equipment</legend>
          {EQUIPMENT_KEYS.map((k) => {
            const here = flight.equipment?.includes(k) ?? false
            const elsewhere = plan.flights.find(
              (f) => f.id !== flight.id && f.equipment?.includes(k),
            )
            return (
              <label key={k} className="sc-check">
                <input
                  type="checkbox"
                  checked={here}
                  onChange={(e) =>
                    onChange((p) => withEquipmentOn(p, k, e.target.checked ? flight.id : null))
                  }
                />
                <span>
                  {EQUIPMENT[k].label}{' '}
                  <span className="sc-caption">
                    {kg(EQUIPMENT[k].massKg)}
                    {elsewhere && !here ? ` · now on ${elsewhere.label}` : ''}
                  </span>
                </span>
              </label>
            )
          })}
        </fieldset>
      </div>
      <div className="sc-editor-foot">
        <MassBar cap={flightCapacity(plan, { ...flight, launchDate })} label={flight.label} />
        {plan.flights.length > 1 && (
          <button
            type="button"
            className="sc-link"
            onClick={() => {
              props.onRemoved()
              onChange((p) => withFlightRemoved(p, flight.id))
            }}
          >
            Remove this rocket
          </button>
        )}
      </div>
    </div>
  )
}
