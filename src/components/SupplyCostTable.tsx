import { supplyCosts } from '../lib/supplyChain'
import type { MissionPlan } from '../lib/types'
import { fmt } from './format'

const usdM = (usd: number) => `$${fmt(usd / 1e6)}M`
const usdMFine = (usd: number) => `$${(usd / 1e6).toFixed(1)}M`

/**
 * What each supply costs the mission: its share of the rockets it rides on, plus its purchase price
 * where there is one (equipment), most expensive first, with the total.
 */
export function SupplyCostTable({ plan }: { plan: MissionPlan }) {
  const rows = supplyCosts(plan)
  const launch = rows.reduce((s, r) => s + r.launchUsd, 0)
  const buy = rows.reduce((s, r) => s + (r.buyUsd ?? 0), 0)
  return (
    <div className="sc-scroll">
      <table className="sc-table">
        <thead>
          <tr>
            <th>Supply</th>
            <th className="r">Amount</th>
            <th className="r">To launch</th>
            <th className="r">To buy</th>
            <th className="r">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>
                <span className={`sc-swatch is-${r.group}`} aria-hidden="true" /> {r.label}
              </td>
              <td className="num r">{r.amount}</td>
              <td className="num r">{usdMFine(r.launchUsd)}</td>
              <td className="num r">{r.buyUsd === null ? '—' : usdMFine(r.buyUsd)}</td>
              <td className="num r">{usdMFine(r.launchUsd + (r.buyUsd ?? 0))}</td>
            </tr>
          ))}
          <tr className="sc-total">
            <td>Whole mission</td>
            <td />
            <td className="num r">{usdM(launch)}</td>
            <td className="num r">{usdM(buy)}</td>
            <td className="num r">{usdM(launch + buy)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
