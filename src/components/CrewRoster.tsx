import { useId, useMemo } from 'react'
import { dailyNeeds, hasFullProfile } from '../lib/crew'
import { crewStatus, type CrewStatus, type CrewTone } from '../lib/crewStatus'
import { DESTINATION_PROFILES } from '../lib/data'
import { CREW_LIMITS, withCrewMemberUpdated } from '../lib/plan'
import type { ActivityLevel, Band, CrewMember, MissionPlan, SimResult } from '../lib/types'
import { EChart, type EChartOption } from './EChart'
import { fmt } from './format'
import { Readout } from './Readout'
import { cssVar } from './themeColors'

type Props = {
  plan: MissionPlan
  onChange: (update: (plan: MissionPlan) => MissionPlan) => void
  /** The last run and the plan that produced it (health is from that run, not the edited plan). */
  result: SimResult
  resultPlan: MissionPlan
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

/** What the last run says about one person. */
type CrewRun = {
  health?: Band
  body?: { boneLossPct: number; muscleLossPct: number }
  status: CrewStatus
  gravityG: number
  destination: string
}

const TONE_VAR: Record<CrewTone, string> = {
  nominal: '--nominal',
  caution: '--caution',
  critical: '--critical',
}

function sparklineOption(health: Band, tone: CrewTone): EChartOption {
  const color = cssVar(TONE_VAR[tone])
  const days = health.p50.map((_, i) => i)
  return {
    backgroundColor: 'transparent',
    animation: false,
    grid: { left: 0, right: 0, top: 2, bottom: 2 },
    xAxis: { type: 'category', data: days, show: false, boundaryGap: false },
    yAxis: { type: 'value', min: 0, max: 100, show: false },
    series: [
      {
        type: 'line',
        data: health.p10,
        stack: 'band',
        symbol: 'none',
        lineStyle: { opacity: 0 },
        silent: true,
      },
      {
        type: 'line',
        data: health.p90.map((v, i) => v - health.p10[i]),
        stack: 'band',
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color, opacity: 0.18 },
        silent: true,
      },
      {
        type: 'line',
        data: health.p50,
        symbol: 'none',
        lineStyle: { color, width: 1.5 },
        silent: true,
      },
    ],
  }
}

function CrewHealth({ run }: { run: CrewRun }) {
  const { health, body, status } = run
  const option = useMemo(
    () => (health ? sparklineOption(health, status.tone) : undefined),
    [health, status.tone],
  )
  if (!health || !body || !option) return null
  const finalScore = health.p50[health.p50.length - 1]
  const estimate =
    `Estimate: no human partial-gravity bone data exists. ISS/Mir microgravity loss rates are ` +
    `scaled by (1 − g); ${run.destination} is ${run.gravityG.toFixed(2)} g.`

  return (
    <div className="crew-health">
      <div className="crew-health-head">
        <span className="field-label">Health</span>
        <span className={`crew-score is-${status.tone}`}>{Math.round(finalScore)}/100</span>
      </div>
      <EChart option={option} height={40} />
      <div className="readouts">
        <Readout label="Bone (hip/spine)" value={`−${body.boneLossPct.toFixed(1)}%`} />
        <Readout label="Muscle" value={`−${body.muscleLossPct.toFixed(1)}%`} />
      </div>
      <p className="crew-estimate">
        <span className="crew-info" role="img" aria-label={estimate} title={estimate}>
          ⓘ
        </span>{' '}
        Bone loss at {run.gravityG.toFixed(2)} g is an estimate
      </p>
      {status.tone !== 'nominal' && (
        <p className={`crew-alert is-${status.tone}`} role="status">
          Too sick to work in {Math.round(status.unfitShare * 100)} out of 100 missions
          {status.driver ? ` · ${status.driver}` : ''}
        </p>
      )}
    </div>
  )
}

function CrewCard({
  member,
  run,
  onEdit,
}: {
  member: CrewMember
  run?: CrewRun
  onEdit: (patch: Partial<Omit<CrewMember, 'id'>>) => void
}) {
  const activityId = useId()
  const sexName = useId()
  const needs = hasFullProfile(member) ? dailyNeeds(member) : null
  const tone = run?.status.tone ?? 'nominal'

  return (
    <article
      className={`crew-card crew-card-${tone}`}
      aria-label={`${member.name}, ${member.role ?? 'crew'}`}
    >
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
          label="Weight"
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

      {run && <CrewHealth run={run} />}
    </article>
  )
}

/**
 * One card per crew member: who they are, their editable body, what they need each day, and (after
 * a run) how their health held up.
 */
export function CrewRoster({ plan, onChange, result, resultPlan }: Props) {
  const { label, gravityG } = DESTINATION_PROFILES[resultPlan.destination]
  const runFor = (id: string): CrewRun | undefined =>
    resultPlan.crew.some((m) => m.id === id)
      ? {
          health: result.crewHealth?.[id],
          body: result.crewBody?.[id],
          status: crewStatus(result, id),
          gravityG,
          destination: label,
        }
      : undefined

  return (
    <div className="crew-roster">
      {plan.crew.map((member) => (
        <CrewCard
          key={member.id}
          member={member}
          run={runFor(member.id)}
          onEdit={(patch) => onChange((p) => withCrewMemberUpdated(p, member.id, patch))}
        />
      ))}
    </div>
  )
}
