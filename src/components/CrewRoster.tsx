import { useId } from 'react'
import { dailyNeeds, hasFullProfile } from '../lib/crew'
import { CREW_LIMITS, withCrewMemberUpdated } from '../lib/plan'
import type { ActivityLevel, CrewMember, MissionPlan } from '../lib/types'
import { fmt } from './format'
import { Readout } from './Readout'

type Props = {
  plan: MissionPlan
  onChange: (update: (plan: MissionPlan) => MissionPlan) => void
}

const ACTIVITY_LABEL: Record<ActivityLevel, string> = {
  light: 'Light',
  moderate: 'Moderate',
  heavy: 'Heavy',
}

type NumberField = keyof typeof CREW_LIMITS

function NumberInput(props: {
  label: string
  unit: string
  field: NumberField
  value: number
  onChange: (value: number) => void
}) {
  const id = useId()
  const { min, max, step } = CREW_LIMITS[props.field]
  return (
    <div className="crew-field">
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      <span className="crew-input-wrap">
        <input
          id={id}
          className="crew-input"
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={props.value}
          onChange={(e) => {
            const v = e.target.valueAsNumber
            if (Number.isFinite(v)) props.onChange(v)
          }}
        />
        <span className="crew-unit">{props.unit}</span>
      </span>
    </div>
  )
}

function CrewCard({
  member,
  onEdit,
}: {
  member: CrewMember
  onEdit: (patch: Partial<Omit<CrewMember, 'id'>>) => void
}) {
  const activityId = useId()
  const sexName = useId()
  const needs = hasFullProfile(member) ? dailyNeeds(member) : null

  return (
    <article className="crew-card" aria-label={`${member.name}, ${member.role ?? 'crew'}`}>
      <header className="crew-card-head">
        <h3 className="crew-name">{member.name}</h3>
        {member.role && <p className="crew-role">{member.role}</p>}
      </header>

      <div className="crew-fields">
        <fieldset className="crew-field segmented-field">
          <legend className="field-label">Sex</legend>
          <div className="segmented">
            {(['female', 'male'] as const).map((sex) => (
              <label key={sex} className="segmented-option">
                <input
                  type="radio"
                  name={sexName}
                  value={sex}
                  checked={member.sex === sex}
                  onChange={() => onEdit({ sex })}
                />
                <span>{sex === 'female' ? 'F' : 'M'}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <NumberInput
          label="Age"
          unit="y"
          field="ageYears"
          value={member.ageYears}
          onChange={(ageYears) => onEdit({ ageYears })}
        />
        <NumberInput
          label="Mass"
          unit="kg"
          field="massKg"
          value={member.massKg}
          onChange={(massKg) => onEdit({ massKg })}
        />
        <NumberInput
          label="Height"
          unit="m"
          field="heightM"
          value={member.heightM ?? 1.7}
          onChange={(heightM) => onEdit({ heightM })}
        />
        <div className="crew-field">
          <label className="field-label" htmlFor={activityId}>
            Activity
          </label>
          <select
            id={activityId}
            className="crew-input"
            value={member.activity}
            onChange={(e) => {
              const activity = (Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).find(
                (a) => a === e.target.value,
              )
              if (activity) onEdit({ activity })
            }}
          >
            {(Object.keys(ACTIVITY_LABEL) as ActivityLevel[]).map((a) => (
              <option key={a} value={a}>
                {ACTIVITY_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <NumberInput
          label="Exercise"
          unit="min/d"
          field="exerciseMinPerDay"
          value={member.exerciseMinPerDay}
          onChange={(exerciseMinPerDay) => onEdit({ exerciseMinPerDay })}
        />
      </div>

      {needs ? (
        <div className="readouts crew-needs" aria-label="Daily needs">
          <Readout label="Energy" value={`${fmt(needs.energyKcal)} kcal`} />
          <Readout label="Protein" value={`${fmt(needs.proteinG)} g`} />
          <Readout label="Vitamin C" value={`${fmt(needs.vitaminCMg)} mg`} />
          <Readout label="Vitamin D" value={`${fmt(needs.vitaminDUg)} µg`} />
          <Readout label="Calcium" value={`${fmt(needs.calciumMg)} mg`} />
          <Readout label="Potassium" value={`${fmt(needs.potassiumMg)} mg`} />
        </div>
      ) : (
        <p className="hint">Add a height to compute personal daily needs.</p>
      )}
    </article>
  )
}

/** One card per crew member: who they are, their editable body, and what they need each day. */
export function CrewRoster({ plan, onChange }: Props) {
  return (
    <div className="crew-roster">
      {plan.crew.map((member) => (
        <CrewCard
          key={member.id}
          member={member}
          onEdit={(patch) => onChange((p) => withCrewMemberUpdated(p, member.id, patch))}
        />
      ))}
    </div>
  )
}
