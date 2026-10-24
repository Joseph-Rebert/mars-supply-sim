import { useMemo, useState } from 'react'
import { fmt } from './components/format'
import { LaunchDatePicker } from './components/LaunchDatePicker'
import { MissionSetupForm } from './components/MissionSetupForm'
import { Panel } from './components/Panel'
import { ResultsView } from './components/ResultsView'
import { fakePlan } from './lib/fake'
import { runBlockedReason, withFlightLaunchDate } from './lib/launchDates'
import { DEFAULT_RUN_OPTIONS, runMission } from './lib/sim'
import type { MissionPlan, SimResult } from './lib/types'

// App state: the plan being edited, and the last run (with the plan that produced it, so the
// results never silently describe a different plan). Manifest line items + mass bar are GEA-16.

type Run = { plan: MissionPlan; result: SimResult }

function simulate(plan: MissionPlan): Run {
  return { plan, result: runMission(plan, DEFAULT_RUN_OPTIONS) }
}

function App() {
  const [plan, setPlan] = useState(fakePlan)
  const [run, setRun] = useState(() => simulate(plan))
  const blockedReason = useMemo(() => runBlockedReason(plan), [plan])
  const stale = run.plan !== plan

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Ares Supply</h1>
        <p className="app-subtitle">─ Mission survival planner</p>
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
              onChange={setPlan}
              onRun={() => setRun(simulate(plan))}
              runBlockedReason={blockedReason}
            />
          </Panel>
          <Panel title="Cargo manifest">
            {plan.flights.map((f) => (
              <LaunchDatePicker
                key={f.id}
                plan={plan}
                flight={f}
                onChange={(date) => setPlan((p) => withFlightLaunchDate(p, f.id, date))}
              />
            ))}
            <p className="note">Line items and the mass budget bar arrive with GEA-16.</p>
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
