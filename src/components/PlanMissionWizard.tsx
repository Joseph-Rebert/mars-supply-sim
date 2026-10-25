import { useEffect, useMemo, useRef, useState } from 'react'
import { DESTINATION_PROFILES, LAUNCH_COST_USD } from '../lib/data'
import { daysBetween } from '../lib/dates'
import { flightMassKg } from '../lib/manifest'
import {
  earliestStartDate,
  optimizeMission,
  type MissionSpec,
  type OptimizedPlan,
  type OptimizeProgress,
} from '../lib/optimize'
import { CREW_MAX, CREW_MIN, daysToMonths, monthsToDays, withCrewSize } from '../lib/plan'
import type { Destination, MissionPlan, O2Source } from '../lib/types'
import { fmt } from './format'
import { Segmented, Slider } from './MissionSetupForm'
import { Readout } from './Readout'
import { StatTile } from './StatTile'

type Props = {
  open: boolean
  /** The planner's current plan: the wizard starts from its crew, dates and life support. */
  from: MissionPlan
  onClose: () => void
  onLoad: (plan: MissionPlan) => void
}

const STEPS = ['Crew', 'Destination', 'Life support', 'Goal', 'Plan'] as const
const TARGET_PCT = { min: 80, max: 99 }
const DURATION_MONTHS = { min: 6, max: 36 }

type RunState =
  | { status: 'idle' }
  | { status: 'running'; progress: OptimizeProgress | null }
  | { status: 'done'; result: OptimizedPlan }
  | { status: 'error'; message: string }

/** Overall % across phases: search 0–35, trim 35–90, verify 90–100. */
function overallPct(p: OptimizeProgress | null): number {
  if (!p) return 0
  const frac = p.total > 0 ? p.done / p.total : 0
  const [from, to] = p.phase === 'search' ? [0, 35] : p.phase === 'trim' ? [35, 90] : [90, 100]
  return from + (to - from) * frac
}

const PHASE_TEXT: Record<OptimizeProgress['phase'], string> = {
  search: 'Trying cargo plans, cheapest first',
  trim: 'Cutting extra cargo while the crew still makes it',
  verify: 'Double-checking with 1,000 simulated missions',
}

const usd = (n: number) => `$${fmt(n / 1e6)}M`

function specFrom(plan: MissionPlan): MissionSpec {
  return {
    name: 'New mission',
    destination: plan.destination,
    startDate: plan.startDate,
    durationDays: plan.durationDays,
    crew: plan.crew,
    lifeSupport: plan.lifeSupport,
    targetSurvival: 0.95,
  }
}

/** Step-by-step mission questions, then the cheapest plan that reaches the target survival. */
export function PlanMissionWizard({ open, from, onClose, onLoad }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState(0)
  const [spec, setSpec] = useState(() => specFrom(from))
  const [run, setRun] = useState<RunState>({ status: 'idle' })

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // Run the optimizer in short time slices so the progress bar repaints between them.
  useEffect(() => {
    if (run.status !== 'running') return
    let cancelled = false
    let timer = 0
    const it = optimizeMission(spec)
    const tick = () => {
      if (cancelled) return
      const t0 = performance.now()
      let last: OptimizeProgress | null = null
      try {
        while (performance.now() - t0 < 40) {
          const s = it.next()
          if (s.done) {
            setRun({ status: 'done', result: s.value })
            return
          }
          last = s.value
        }
      } catch (e) {
        setRun({ status: 'error', message: e instanceof Error ? e.message : String(e) })
        return
      }
      setRun({ status: 'running', progress: last })
      timer = window.setTimeout(tick, 0)
    }
    timer = window.setTimeout(tick, 30)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // Restart only when a new run begins, not on every progress update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.status === 'running'])

  const earliest = useMemo(() => earliestStartDate(spec.destination), [spec.destination])
  const startProblem =
    daysBetween(earliest, spec.startDate) < 0
      ? `The first ${DESTINATION_PROFILES[spec.destination].label} cargo can land on ${earliest}; start on or after it.`
      : undefined

  const update = (patch: Partial<MissionSpec>) => {
    setSpec((s) => ({ ...s, ...patch }))
    if (run.status !== 'running') setRun({ status: 'idle' })
  }
  const setLifeSupport = (patch: Partial<MissionSpec['lifeSupport']>) =>
    update({ lifeSupport: { ...spec.lifeSupport, ...patch } })

  const close = () => {
    setRun({ status: 'idle' })
    onClose()
  }

  const months = daysToMonths(spec.durationDays)
  const canBuild = startProblem === undefined

  return (
    <dialog
      ref={dialog}
      className="wizard"
      aria-label="Plan a new mission"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <header className="wizard-header">
        <h2 className="section-title">Plan new mission</h2>
        <ol className="wizard-steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
              <button type="button" onClick={() => setStep(i)} disabled={i === 4 && !canBuild}>
                {i + 1}. {s}
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-small" onClick={close} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="wizard-body">
        {step === 0 && (
          <div className="wizard-step">
            <Slider
              label="How many are going?"
              display={`${spec.crew.length} crew`}
              value={spec.crew.length}
              min={CREW_MIN}
              max={CREW_MAX}
              onChange={(n) => update({ crew: withCrewSize({ ...from, crew: spec.crew }, n).crew })}
            />
          </div>
        )}

        {step === 1 && (
          <div className="wizard-step">
            <Segmented<Destination>
              legend="Where to?"
              name="wiz-destination"
              value={spec.destination}
              options={[
                { value: 'mars', label: 'Mars' },
                { value: 'moon', label: 'Moon' },
              ]}
              onChange={(destination) => update({ destination })}
            />
            <div className="field">
              <label className="field-label" htmlFor="wiz-start">
                Crew arrives (day 0)
              </label>
              <input
                id="wiz-start"
                className="wiz-input mono"
                type="date"
                min={earliest}
                value={spec.startDate}
                onChange={(e) => e.target.value && update({ startDate: e.target.value })}
              />
              {startProblem && <p className="hint is-critical">{startProblem}</p>}
            </div>
            <Slider
              label="How long?"
              display={`${months} mo · ${spec.durationDays} d`}
              value={months}
              min={DURATION_MONTHS.min}
              max={DURATION_MONTHS.max}
              onChange={(m) => update({ durationDays: monthsToDays(m) })}
            />
          </div>
        )}

        {step === 2 && (
          <div className="wizard-step">
            <Slider
              label="Water recovery"
              display={`${Math.round(spec.lifeSupport.waterRecoveryRate * 100)} %`}
              value={Math.round(spec.lifeSupport.waterRecoveryRate * 100)}
              min={70}
              max={98}
              hint="The space station recycles 98% (since 2023)"
              onChange={(pct) => setLifeSupport({ waterRecoveryRate: pct / 100 })}
            />
            <Segmented<O2Source>
              legend="Where oxygen comes from"
              name="wiz-o2"
              value={spec.lifeSupport.o2Source}
              options={[
                { value: 'electrolysis', label: 'Made from water' },
                { value: 'isru', label: 'Made on site' },
                { value: 'tanks', label: 'Shipped in tanks' },
              ]}
              onChange={(o2Source) => setLifeSupport({ o2Source })}
            />
            <label className="switch-row">
              <span className="field-label">Greenhouse</span>
              <input
                className="switch"
                type="checkbox"
                checked={spec.lifeSupport.greenhouse.enabled}
                onChange={(e) =>
                  setLifeSupport({
                    greenhouse: { ...spec.lifeSupport.greenhouse, enabled: e.target.checked },
                  })
                }
              />
            </label>
            <Slider
              label="Growing area"
              display={`${spec.lifeSupport.greenhouse.areaM2} m²`}
              value={spec.lifeSupport.greenhouse.areaM2}
              min={0}
              max={200}
              step={5}
              disabled={!spec.lifeSupport.greenhouse.enabled}
              onChange={(areaM2) =>
                setLifeSupport({ greenhouse: { ...spec.lifeSupport.greenhouse, areaM2 } })
              }
            />
          </div>
        )}

        {step === 3 && (
          <div className="wizard-step">
            <Slider
              label="Target chance of survival"
              display={`${Math.round(spec.targetSurvival * 100)} %`}
              value={Math.round(spec.targetSurvival * 100)}
              min={TARGET_PCT.min}
              max={TARGET_PCT.max}
              hint="The planner finds the fewest launches, then the least mass, that reach it."
              onChange={(pct) => update({ targetSurvival: pct / 100 })}
            />
            <div className="readouts">
              <Readout label="Crew" value={`${spec.crew.length}`} />
              <Readout label="Destination" value={DESTINATION_PROFILES[spec.destination].label} />
              <Readout label="Crew arrives" value={spec.startDate} />
              <Readout label="Duration" value={`${months} mo · ${spec.durationDays} d`} />
              <Readout
                label="Life support"
                value={`${Math.round(spec.lifeSupport.waterRecoveryRate * 100)} % · ${spec.lifeSupport.o2Source}${
                  spec.lifeSupport.greenhouse.enabled
                    ? ` · ${spec.lifeSupport.greenhouse.areaM2} m²`
                    : ''
                }`}
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="wizard-step">
            {run.status === 'idle' && (
              <p className="callout-text">
                Ready to build the cheapest plan for {Math.round(spec.targetSurvival * 100)}%
                survival.
              </p>
            )}
            {run.status === 'running' && (
              <div className="wizard-progress" role="status" aria-live="polite">
                <p className="field-label">
                  {run.progress ? PHASE_TEXT[run.progress.phase] : 'Starting'}…
                </p>
                <div className="progress-bar">
                  <span style={{ width: `${overallPct(run.progress)}%` }} />
                </div>
              </div>
            )}
            {run.status === 'error' && <p className="hint is-critical">{run.message}</p>}
            {run.status === 'done' && (
              <div className="wizard-result">
                <p className={`callout-text ${run.result.reachedTarget ? '' : 'is-critical'}`}>
                  {run.result.reachedTarget
                    ? `Cheapest plan found: the crew makes it in ${(run.result.survivalRate * 100).toFixed(1)}% of missions (goal: ${Math.round(spec.targetSurvival * 100)}%).`
                    : run.result.notes[0]}
                </p>
                <div className="stat-row">
                  <StatTile label="Rockets" value={`${run.result.launches}`} />
                  <StatTile
                    label="Weight to launch"
                    value={fmt(run.result.launchMassKg)}
                    unit="kg"
                  />
                  <StatTile label="Launch cost" value={usd(run.result.costUsd)} />
                </div>
                <div className="readouts">
                  {run.result.plan.flights.map((f) => (
                    <Readout
                      key={f.id}
                      label={f.label}
                      value={`${f.launchDate} · ${fmt(flightMassKg(f))} kg`}
                    />
                  ))}
                </div>
                {run.result.notes.map((n) => (
                  <p key={n} className="hint">
                    {n}
                  </p>
                ))}
                <p className="hint">
                  Cost: {usd(LAUNCH_COST_USD)} per Falcon Heavy launch (NASA, Europa Clipper
                  contract, 2021).
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="wizard-footer">
        <button
          type="button"
          className="btn"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || run.status === 'running'}
        >
          Back
        </button>
        {step < 3 && (
          <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>
            Next
          </button>
        )}
        {(step === 3 || (step === 4 && run.status !== 'done')) && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canBuild || run.status === 'running'}
            onClick={() => {
              setStep(4)
              setRun({ status: 'running', progress: null })
            }}
          >
            {run.status === 'running' ? 'Planning…' : 'Build cheapest plan'}
          </button>
        )}
        {step === 4 && run.status === 'done' && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onLoad(run.result.plan)
              close()
            }}
          >
            Load into planner
          </button>
        )}
      </footer>
    </dialog>
  )
}
