import { useMemo, useState } from 'react'
import { CargoManifest } from './components/CargoManifest'
import { fmt } from './components/format'
import { MissionSetupForm } from './components/MissionSetupForm'
import { Panel } from './components/Panel'
import { ResultsView } from './components/ResultsView'
import { runBlockedReason } from './lib/launchDates'
import { presetById, PRESETS, type PresetId } from './lib/presets'
import { DEFAULT_RUN_OPTIONS, runMission } from './lib/sim'
import type { MissionPlan, SimResult } from './lib/types'

// App state: the plan being edited, and the last run (with the plan that produced it, so the
// results never silently describe a different plan).

type Run = { plan: MissionPlan; result: SimResult }

function simulate(plan: MissionPlan): Run {
  return { plan, result: runMission(plan, DEFAULT_RUN_OPTIONS) }
}

const CUSTOM = 'custom'

function App() {
  const [plan, setPlan] = useState(() => presetById('draft').plan())
  const [run, setRun] = useState(() => simulate(plan))
  // Which demo preset is loaded; any edit makes the plan 'custom'.
  const [presetId, setPresetId] = useState<PresetId | typeof CUSTOM>('draft')
  const blockedReason = useMemo(() => runBlockedReason(plan), [plan])
  const stale = run.plan !== plan

  // Takes a plan (setup form) or an updater (manifest), like setPlan itself.
  const editPlan = (next: MissionPlan | ((plan: MissionPlan) => MissionPlan)) => {
    setPlan(next)
    setPresetId(CUSTOM)
  }

  // One click loads and runs the preset, so the numbers on screen match the slides.
  const loadPreset = (id: PresetId) => {
    const next = presetById(id).plan()
    setPlan(next)
    setRun(simulate(next))
    setPresetId(id)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Ares Supply</h1>
        <p className="app-subtitle">─ Mission survival planner</p>
        <label className="preset-picker">
          <span className="preset-label">Scenario</span>
          <select
            className="preset-select"
            value={presetId}
            title={PRESETS.find((p) => p.id === presetId)?.summary}
            onChange={(e) => {
              const preset = PRESETS.find((p) => p.id === e.target.value)
              if (preset) loadPreset(preset.id)
            }}
          >
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value={CUSTOM} disabled>
              Custom plan
            </option>
          </select>
        </label>
        <div className={stale ? 'app-status is-caution' : 'app-status'} role="status">
          <span className="status-dot" aria-hidden="true" />
          <span className="app-status-text">
            {stale
              ? 'Plan changed · run again'
              : `${fmt(run.result.runs)} runs · seed ${run.result.seed}`}
          </span>
        </div>
      </header>

      <main className="layout">
        <div className="column">
          <Panel title="Mission setup">
            <MissionSetupForm
              plan={plan}
              onChange={editPlan}
              onRun={() => setRun(simulate(plan))}
              runBlockedReason={blockedReason}
            />
          </Panel>
          <Panel title="Cargo manifest">
            <CargoManifest plan={plan} onChange={editPlan} />
          </Panel>
        </div>

        <div className={stale ? 'column is-stale' : 'column'}>
          <ResultsView result={run.result} plan={run.plan} />
        </div>
      </main>
    </div>
  )
}

export default App
