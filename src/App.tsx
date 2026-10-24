import { useEffect, useMemo, useState } from 'react'
import { CargoManifest } from './components/CargoManifest'
import { CrewRoster } from './components/CrewRoster'
import { fmt } from './components/format'
import { MissionClock } from './components/MissionClock'
import { MissionPicker, type MissionSelection, type SavedMission } from './components/MissionPicker'
import { MissionSetupForm } from './components/MissionSetupForm'
import { Panel } from './components/Panel'
import { PlanComparison } from './components/PlanComparison'
import { PlanMissionWizard } from './components/PlanMissionWizard'
import { ResultsView } from './components/ResultsView'
import { StatsStrip } from './components/StatsStrip'
import { Tabs, type TabDef } from './components/Tabs'
import { panelId, tabId } from './components/tabIds'
import type { FixState } from './components/WeakestLinkCallout'
import { suggestFix, weakestLink, type WeakestLink } from './lib/analysis'
import type { SavedRun } from './lib/compare'
import { runBlockedReason } from './lib/launchDates'
import { presetById, type PresetId } from './lib/presets'
import { DEFAULT_RUN_OPTIONS, runMission } from './lib/sim'
import type { MissionPlan, SimResult } from './lib/types'

// App state: the plan being edited, and the last run (with the plan that produced it, so the
// results never silently describe a different plan). The suggested fix for a run is searched after
// the run is on screen, because it re-simulates several candidate plans (~1 s).

type Run = { plan: MissionPlan; result: SimResult; link: WeakestLink }

function simulate(plan: MissionPlan): Run {
  const result = runMission(plan, DEFAULT_RUN_OPTIONS)
  return { plan, result, link: weakestLink(result) }
}

type TabKey = 'overview' | 'cargo' | 'crew' | 'setup'
const TABS: readonly TabDef<TabKey>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'cargo', label: 'Resupplies & Cargo' },
  { id: 'crew', label: 'Crew' },
  { id: 'setup', label: 'Mission Setup' },
]
const TABS_ID = 'main'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Let the browser paint (spinner, button state) before a long synchronous computation. */
const afterPaint = (work: () => void) => setTimeout(work, 30)

function App() {
  const [plan, setPlan] = useState(() => presetById('draft').plan())
  const [run, setRun] = useState(() => simulate(plan))
  const [tab, setTab] = useState<TabKey>('overview')
  // What the mission dropdown shows; any edit (or an applied fix) makes it 'custom' until saved.
  const [selection, setSelection] = useState<MissionSelection>({ kind: 'preset', id: 'draft' })
  const [missions, setMissions] = useState<SavedMission[]>([])
  // The fix found for a specific run; anything else means that run's search is still going.
  const [fix, setFix] = useState<{ for: Run; state: FixState } | null>(null)
  const [applying, setApplying] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  // Up to two saved runs for side-by-side comparison, kept in memory only.
  const [saved, setSaved] = useState<{ a?: SavedRun; b?: SavedRun }>({})
  // Set when a run throws; the last good run stays on screen under the error.
  const [runError, setRunError] = useState<string | null>(null)
  const blockedReason = useMemo(() => runBlockedReason(plan), [plan])
  const stale = run.plan !== plan

  const saveRun = (slot: 'a' | 'b') =>
    setSaved((s) => ({
      ...s,
      [slot]: { name: slot.toUpperCase(), plan: run.plan, result: run.result },
    }))

  useEffect(() => {
    let cancelled = false
    const timer = afterPaint(() => {
      let state: FixState
      try {
        state = suggestFix(run.plan, run.result)
      } catch (e) {
        state = { status: 'noFix', sentence: `Couldn't search for a fix: ${errorText(e)}` }
      }
      if (!cancelled) setFix({ for: run, state })
    })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [run])

  const fixState: FixState = fix?.for === run ? fix.state : 'searching'

  /** Runs `next` and shows it, or keeps the last run and reports why this one failed. */
  function tryRun(next: MissionPlan) {
    try {
      setRun(simulate(next))
      setRunError(null)
    } catch (e) {
      setRunError(errorText(e))
    }
  }

  // Takes a plan (setup form) or an updater (manifest, crew), like setPlan itself.
  const editPlan = (next: MissionPlan | ((plan: MissionPlan) => MissionPlan)) => {
    setPlan(next)
    setSelection({ kind: 'custom' })
  }

  /** Loads a plan and runs it right away, so the numbers on screen match the selection. */
  const load = (next: MissionPlan, selected: MissionSelection) => {
    setPlan(next)
    tryRun(next)
    setSelection(selected)
  }

  const saveMission = (toSave: MissionPlan): SavedMission => {
    const n = missions.length
    const mission = {
      id: `m${n + 1}`,
      name: `Mission ${String.fromCharCode(65 + (n % 26))}`,
      plan: toSave,
    }
    setMissions((ms) => [...ms, mission])
    return mission
  }

  function applyFix() {
    if (fixState === 'searching' || fixState.status !== 'fix') return
    const fixed = fixState.plan
    const before = run
    setApplying(true)
    afterPaint(() => {
      editPlan(fixed)
      try {
        const after = simulate(fixed)
        setRun(after)
        setRunError(null)
        // The comparison shows the fix right away: the previous run as Before, the fixed one as After.
        setSaved({
          a: { name: 'Before', plan: before.plan, result: before.result },
          b: { name: 'After', plan: after.plan, result: after.result },
        })
      } catch (e) {
        setRunError(errorText(e))
      }
      setApplying(false)
    })
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Ares Supply</h1>
        <MissionPicker
          value={selection}
          saved={missions}
          onPreset={(id: PresetId) => load(presetById(id).plan(), { kind: 'preset', id })}
          onSaved={(id) => {
            const m = missions.find((x) => x.id === id)
            if (m) load(m.plan, { kind: 'saved', id })
          }}
          onNew={() => setWizardOpen(true)}
          onSave={() => setSelection({ kind: 'saved', id: saveMission(plan).id })}
        />
        {stale ? (
          <button
            type="button"
            className="app-status is-caution status-button"
            onClick={() => tryRun(plan)}
            disabled={blockedReason !== undefined}
            title={blockedReason ?? 'Run the edited plan'}
          >
            <span className="status-dot" aria-hidden="true" />
            <span className="app-status-text">Plan changed · Run again</span>
          </button>
        ) : (
          <div className="app-status" role="status">
            <span className="status-dot" aria-hidden="true" />
            <span className="app-status-text">
              {fmt(run.result.runs)} runs · seed {run.result.seed}
            </span>
          </div>
        )}
        <MissionClock />
      </header>

      <Tabs tabs={TABS} active={tab} onChange={setTab} idPrefix={TABS_ID} label="Mission views" />

      <main
        className={stale ? 'tab-panel is-stale' : 'tab-panel'}
        role="tabpanel"
        id={panelId(TABS_ID, tab)}
        aria-labelledby={tabId(TABS_ID, tab)}
      >
        {runError && (
          <p className="run-error" role="alert">
            ▼ Run failed: {runError}. Showing the last successful run.
          </p>
        )}

        {tab === 'overview' && (
          <>
            <ResultsView
              result={run.result}
              plan={run.plan}
              link={run.link}
              fix={fixState}
              applyBlockedReason={
                stale ? 'The plan changed since this run. Run again for a fresh fix.' : undefined
              }
              applying={applying}
              onApplyFix={applyFix}
            />
            <Panel title="Compare plans">
              <div className="comparison-actions">
                <button type="button" className="btn btn-small" onClick={() => saveRun('a')}>
                  Save run as A
                </button>
                <button type="button" className="btn btn-small" onClick={() => saveRun('b')}>
                  Save run as B
                </button>
                <button
                  type="button"
                  className="btn btn-small"
                  disabled={!saved.a && !saved.b}
                  onClick={() => setSaved({})}
                >
                  Clear
                </button>
              </div>
              {saved.a && saved.b ? (
                <PlanComparison a={saved.a} b={saved.b} />
              ) : (
                <p className="hint">
                  {saved.a || saved.b
                    ? `Saved ${saved.a ? 'A' : 'B'}. Run another plan (or pick a mission) and save it as ${saved.a ? 'B' : 'A'}.`
                    : 'Save this run as A, change the plan or mission, run again and save as B.'}
                </p>
              )}
            </Panel>
          </>
        )}

        {tab === 'cargo' && (
          <Panel title="Resupplies & cargo">
            <CargoManifest plan={plan} onChange={editPlan} />
          </Panel>
        )}

        {tab === 'crew' && (
          <Panel title="Crew">
            <CrewRoster plan={plan} onChange={editPlan} result={run.result} resultPlan={run.plan} />
          </Panel>
        )}

        {tab === 'setup' && (
          <Panel title="Mission setup" className="setup-panel">
            <MissionSetupForm
              plan={plan}
              onChange={editPlan}
              onRun={() => tryRun(plan)}
              runBlockedReason={blockedReason}
            />
          </Panel>
        )}
      </main>

      <StatsStrip result={run.result} plan={run.plan} />

      {wizardOpen && (
        <PlanMissionWizard
          open={wizardOpen}
          from={plan}
          onClose={() => setWizardOpen(false)}
          onLoad={(next) => {
            const mission = saveMission(next)
            load(next, { kind: 'saved', id: mission.id })
            setTab('overview')
          }}
        />
      )}
    </div>
  )
}

export default App
