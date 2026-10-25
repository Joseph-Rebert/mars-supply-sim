import { useCallback, useEffect, useMemo, useState } from 'react'
import { AssumptionsDrawer } from './components/AssumptionsDrawer'
import { CrewRoster } from './components/CrewRoster'
import { fmt } from './components/format'
import { MissionSetupForm } from './components/MissionSetupForm'
import { MissionPicker, type MissionSelection, type SavedMission } from './components/MissionPicker'
import { OrbitView } from './components/OrbitView'
import { PlanMissionWizard } from './components/PlanMissionWizard'
import { ShipmentsView } from './components/ShipmentsView'
import { StatsStrip } from './components/StatsStrip'
import { SupplyCostTable } from './components/SupplyCostTable'
import { SupplyOverview } from './components/SupplyOverview'
import { panelId, tabId } from './components/tabIds'
import { Tabs, type TabDef } from './components/Tabs'
import type { FixState } from './components/WeakestLinkCallout'
import { weakestLink, type SuggestedFix, type WeakestLink } from './lib/analysis'
import { ORDER_LEAD_TIME_DAYS } from './lib/data'
import { runBlockedReason } from './lib/launchDates'
import { withBaseCargo } from './lib/manifest'
import { presetById, type PresetId } from './lib/presets'
import { DEFAULT_RUN_OPTIONS, runMission } from './lib/sim'
import {
  equipmentExceptions,
  fuelExceptions,
  orderSchedule,
  overweightExceptions,
  pipeline,
  SAFETY_STOCK_DAYS_DEFAULT,
  supplyExceptions,
  type ExceptionTarget,
} from './lib/supplyChain'
import { launchWindows, transferFor } from './lib/transfers'
import type { MissionPlan, ResourceKey, SimResult } from './lib/types'

// Overview leads with the verdict, the trip, and the supplies over time; cargo, crew and setup each
// get a tab, and the key numbers sit in a strip along the bottom. A new mission comes from the wizard.
// App state: the plan being edited, and the last run (with the plan that produced it, so the results
// never silently describe a different plan). The best fix is searched in a worker after each run.

type Run = { plan: MissionPlan; result: SimResult; link: WeakestLink }

function simulate(plan: MissionPlan): Run {
  const result = runMission(plan, DEFAULT_RUN_OPTIONS)
  return { plan, result, link: weakestLink(result) }
}

/** Survival and weight before and after the last applied fix, for one line under the overview. */
type FixedFrom = { before: number; after: number; addedKg: number }

type TabKey = 'overview' | 'cargo' | 'crew' | 'setup'
const TABS: readonly TabDef<TabKey>[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'cargo', label: 'Resupplies & Cargo' },
  { id: 'crew', label: 'Crew' },
  { id: 'setup', label: 'Mission Setup' },
]
const TABS_ID = 'main'

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const pctFine = (x: number) =>
  x > 0.99 && x < 1 ? `${(x * 100).toFixed(1)}%` : `${Math.round(x * 100)}%`

/** Let the browser paint (spinner, button state) before a long synchronous computation. */
const afterPaint = (work: () => void) => setTimeout(work, 30)

function App() {
  const [plan, setPlan] = useState(() => presetById('draft').plan())
  const [run, setRun] = useState(() => simulate(plan))
  // What the mission dropdown shows; any edit (or an applied fix) makes it 'custom' until saved.
  const [tab, setTab] = useState<TabKey>('overview')
  const [selection, setSelection] = useState<MissionSelection>({ kind: 'preset', id: 'draft' })
  const [missions, setMissions] = useState<SavedMission[]>([])
  // The fix found for a specific run; anything else means that run's search is still going.
  const [fix, setFix] = useState<{ for: Run; state: FixState } | null>(null)
  const [applying, setApplying] = useState(false)
  const [fixedFrom, setFixedFrom] = useState<FixedFrom | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  // Set when a run throws; the last good run stays on screen under the error.
  const [runError, setRunError] = useState<string | null>(null)
  // Supply-chain assumptions (Settings drawer) and the rocket a problem pointed at.
  const [leadDays, setLeadDays] = useState(ORDER_LEAD_TIME_DAYS)
  const [safetyDays, setSafetyDays] = useState(SAFETY_STOCK_DAYS_DEFAULT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [markedRocket, setMarkedRocket] = useState<string | null>(null)
  const blockedReason = useMemo(() => runBlockedReason(plan), [plan])
  const stale = run.plan !== plan

  // The best fix re-simulates dozens of candidate plans (several seconds), so it runs in a worker and
  // the page stays usable. A newer run terminates the search for the old one.
  useEffect(() => {
    const worker = new Worker(new URL('./workers/bestFix.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (e: MessageEvent<SuggestedFix>) => {
      setFix({ for: run, state: e.data })
      worker.terminate()
    }
    worker.onerror = (e) => {
      setFix({
        for: run,
        state: { status: 'noFix', sentence: `Couldn't look for a fix: ${e.message}` },
      })
      worker.terminate()
    }
    worker.postMessage({ plan: run.plan, result: run.result })
    return () => worker.terminate()
  }, [run])

  const fixState: FixState = fix?.for === run ? fix.state : 'searching'

  const supply = useMemo(() => {
    const { plan: p, result: r, link } = run
    const rows = pipeline(p, leadDays)
    const slots = orderSchedule(p, r, leadDays, safetyDays).filter((s) => s.status !== 'afterEnd')
    return {
      rows,
      slots,
      exceptions: supplyExceptions(link, slots, rows),
      hasWindows: launchWindows(p.destination).length > 0,
      transitDays: transferFor(p.destination, p.startDate).transitDays,
    }
  }, [run, leadDays, safetyDays])

  // Overweight rockets, equipment and fuel problems come off the plan being edited: no rerun needed to
  // see them, and an overweight plan can't be rerun until it's fixed. Worst first, then the run's own.
  const exceptions = useMemo(() => {
    const now = [
      ...overweightExceptions(plan),
      ...equipmentExceptions(plan),
      ...fuelExceptions(plan),
    ]
    const rank = { critical: 0, warning: 1 }
    return [...now, ...supply.exceptions].sort((a, b) => rank[a.severity] - rank[b.severity])
  }, [plan, supply.exceptions])
  const linked = supply.exceptions.find((e) => e.target.tab === 'stock')?.target
  const linkedResource: ResourceKey = linked?.tab === 'stock' ? linked.resource : 'water'

  // A problem jumps to where it shows: its rocket in the shipments list, or the supply charts.
  const goTo = (target: ExceptionTarget) => {
    if (target.tab === 'orders') setMarkedRocket(target.launchDate ?? null)
    if (target.tab === 'setup') setWizardOpen(true)
    const id = target.tab === 'orders' ? 'shipments' : target.tab === 'stock' ? 'supplies' : null
    if (!id) return
    setTab(id === 'shipments' ? 'cargo' : 'overview')
    // Wait for the tab to render before scrolling to it.
    afterPaint(() =>
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    )
  }
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  /** Runs `next` and shows it, or keeps the last run and reports why this one failed. */
  function tryRun(next: MissionPlan) {
    try {
      setRun(simulate(next))
      setRunError(null)
    } catch (e) {
      setRunError(errorText(e))
    }
  }

  // Takes a plan or an updater (cargo edits), like setPlan itself.
  const editPlan = (next: MissionPlan | ((plan: MissionPlan) => MissionPlan)) => {
    setPlan(next)
    setSelection({ kind: 'custom' })
  }

  /** Loads a plan and runs it right away, so the numbers on screen match the selection. */
  const load = (next: MissionPlan, selected: MissionSelection) => {
    setPlan(next)
    tryRun(next)
    setSelection(selected)
    setMarkedRocket(null)
    setFixedFrom(null)
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

  // Apply the best fix, rerun, and note before → after.
  function applyFix() {
    if (fixState === 'searching' || fixState.status !== 'fix') return
    const fixed = fixState.plan
    const before = run.result.survivalRate
    const addedKg = fixState.massDeltaKg
    setApplying(true)
    afterPaint(() => {
      editPlan(fixed)
      try {
        const after = simulate(fixed)
        setRun(after)
        setRunError(null)
        setFixedFrom({ before, after: after.result.survivalRate, addedKg })
      } catch (e) {
        setRunError(errorText(e))
      }
      setApplying(false)
    })
  }

  const applyBlockedReason = stale
    ? 'You changed the plan. Update the results to get a fresh fix.'
    : undefined

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
            title={blockedReason ?? 'Update the results for your changes'}
          >
            <span className="status-dot" aria-hidden="true" />
            <span className="app-status-text">Plan changed · Update results</span>
          </button>
        ) : (
          // Keeps the buttons pinned right when there's nothing to update.
          <span className="app-status" aria-hidden="true" />
        )}
        <button
          type="button"
          className="sc-btn is-primary"
          aria-haspopup="dialog"
          onClick={() => setWizardOpen(true)}
        >
          Set up mission
        </button>
        <button
          type="button"
          className="sc-btn"
          aria-haspopup="dialog"
          onClick={() => setSettingsOpen(true)}
        >
          Settings
        </button>
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
            ▼ Something went wrong: {runError}. Showing the last results that worked.
          </p>
        )}

        {tab === 'overview' && (
          <>
            <SupplyOverview
              plan={run.plan}
              result={run.result}
              link={run.link}
              fix={fixState}
              applyBlockedReason={applyBlockedReason}
              applying={applying}
              onApplyFix={applyFix}
              rows={supply.rows}
              exceptions={exceptions}
              onException={goTo}
              resource={linkedResource}
              trip={
                <section id="trip" className="sc-trip" aria-labelledby="trip-title">
                  <h2 id="trip-title" className="sc-h2">
                    The trip
                  </h2>
                  {supply.hasWindows ? (
                    <OrbitView
                      key={`${run.plan.startDate}|${run.plan.flights.map((f) => f.launchDate).join()}`}
                      plan={run.plan}
                      rows={supply.rows}
                    />
                  ) : (
                    <p className="sc-muted">
                      Rockets reach the Moon in {supply.transitDays} days and can leave any day, so
                      there's no long trip to show.
                    </p>
                  )}
                </section>
              }
            />
            {fixedFrom && (
              <p className="sc-fixed">
                Fix applied: survival {pctFine(fixedFrom.before)} → {pctFine(fixedFrom.after)}
                {fixedFrom.addedKg > 0 ? `, ${fmt(fixedFrom.addedKg)} kg more cargo` : ''}.
              </p>
            )}
          </>
        )}

        {tab === 'cargo' && (
          <>
            <section id="shipments" className="sc-page-section" aria-labelledby="shipments-title">
              <h2 id="shipments-title" className="sc-h2">
                What's being shipped
              </h2>
              <ShipmentsView
                plan={plan}
                runSlots={supply.slots}
                leadDays={leadDays}
                highlight={markedRocket}
                onChange={editPlan}
              />
            </section>

            <section className="sc-page-section">
              <details className="sc-more" open>
                <summary>What it costs</summary>
                <p className="sc-muted">
                  Each rocket costs $178M however full it is, so its price is split across what it
                  carries by the room each thing takes. Equipment adds what it costs to buy.
                </p>
                <SupplyCostTable plan={plan} />
              </details>
            </section>
          </>
        )}

        {tab === 'crew' && (
          <section className="sc-page-section">
            <CrewRoster plan={plan} onChange={editPlan} result={run.result} resultPlan={run.plan} />
          </section>
        )}

        {tab === 'setup' && (
          <section className="sc-page-section setup-panel">
            <MissionSetupForm
              plan={plan}
              onChange={editPlan}
              onRun={() => tryRun(plan)}
              runBlockedReason={blockedReason}
            />
          </section>
        )}
      </main>

      <StatsStrip result={run.result} plan={run.plan} />

      {wizardOpen && (
        <PlanMissionWizard
          open={wizardOpen}
          from={plan}
          onClose={() => setWizardOpen(false)}
          onLoad={(next) => {
            // The wizard packs life support; the base's equipment and rover fuel go on top.
            const full = withBaseCargo(next)
            const mission = saveMission(full)
            load(full, { kind: 'saved', id: mission.id })
          }}
        />
      )}

      {settingsOpen && (
        <AssumptionsDrawer
          plan={run.plan}
          leadDays={leadDays}
          safetyDays={safetyDays}
          onLead={setLeadDays}
          onSafety={setSafetyDays}
          onClose={closeSettings}
        />
      )}
    </div>
  )
}

export default App
