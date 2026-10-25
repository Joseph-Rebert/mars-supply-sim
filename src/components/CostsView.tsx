import { costSummary, makeVsShip, type PipelineRow } from '../lib/supplyChain'
import type { MissionPlan } from '../lib/types'
import { fmt } from './format'
import { Kpi } from './SupplyOverview'

const tonnes = (kg: number) => (kg / 1000).toFixed(1)
const usdM = (usd: number) => `$${fmt(usd / 1e6)}M`

type Props = {
  /** The plan that produced `rows`. */
  plan: MissionPlan
  rows: PipelineRow[]
}

/** The Costs tab: what the plan costs per kg and per crew-day, and what on-site systems save. */
export function CostsView({ plan, rows }: Props) {
  const cost = costSummary(plan, rows)
  const makes = makeVsShip(plan)
  return (
    <div className="sc-tab-body">
      <div className="sc-kpis is-four">
        <Kpi label="Launch cost" value={usdM(cost.costUsd)} note={`${cost.launches} rockets`} />
        <Kpi
          label="Cargo sent"
          value={`${tonnes(cost.deliveredKg)} t`}
          note={`of ${tonnes(cost.capacityKg)} t of room, packaging included`}
        />
        <Kpi label="Cost per kg" value={`$${fmt(cost.usdPerKg)}`} note="Just the rocket" />
        <Kpi
          label="Cost per person per day"
          value={`$${fmt(cost.usdPerCrewDay / 1000)}k`}
          note={`${plan.crew.length} crew · ${plan.durationDays} days`}
        />
      </div>
      <section className="sc-panel" aria-labelledby="sc-make-title">
        <h2 id="sc-make-title" className="sc-h2">
          What the base makes for itself
        </h2>
        <div className="sc-scroll">
          <table className="sc-table">
            <thead>
              <tr>
                <th>Machine</th>
                <th className="r">Supplies it saves sending</th>
                <th className="r">Spare parts sent for it</th>
                <th className="r">Rockets it saves</th>
                <th className="r">Money saved</th>
              </tr>
            </thead>
            <tbody>
              {makes.map((m) => (
                <tr key={m.label}>
                  <td>{m.label}</td>
                  <td className="num r">{tonnes(m.savedKg)} t</td>
                  <td className="num r">{tonnes(m.sparesKg)} t</td>
                  <td className="num r">{m.launchesSaved.toFixed(1)}</td>
                  <td className="num r">{usdM(m.usdSaved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sc-caption">
          Over the {plan.durationDays}-day mission, packaging included, with each rocket carrying up
          to {tonnes(plan.baseVehiclePayloadKg)} t. Spare parts for these machines protect far more
          cargo than they weigh.
        </p>
      </section>
    </div>
  )
}
