// Supply-chain view of a plan, built on the sim: when each flight has to be ordered, how many days of
// supply the base has left, which cargo lands too late, what each launch costs per kg, and what the
// on-site systems are worth in shipping. Indexed by mission day (0 = plan.startDate), like SimResult.

import { missionMonth, type NutritionWarning, type WeakestLink } from './analysis'
import { COMPONENTS, EQUIPMENT, LAUNCH_COST_USD, SHIPPING_OVERHEAD_KG_PER_KG } from './data'
import { addDays, daysBetween } from './dates'
import { fuelStock, fuelUsePerDay } from './fuel'
import { flightCapacity, flightContents, overCapacityFlights, type CargoGroup } from './manifest'
import { dailyRates, installedComponents } from './sim'
import { monthLabel } from './timeline'
import { launchWindows, transferFor } from './transfers'
import {
  COMPONENT_KEYS,
  EQUIPMENT_KEYS,
  RESOURCE_KEYS,
  type CargoFlight,
  type ComponentKey,
  type EquipmentKey,
  type IsoDate,
  type MissionPlan,
  type ResourceKey,
  type SimResult,
} from './types'

/** Default buffer, in days of use, that no stock should drop below. A planning policy, not a constant. */
export const SAFETY_STOCK_DAYS_DEFAULT = 90

/**
 * A flight below this share of its capacity is flagged: a launch costs the same however full it is,
 * so empty room is money spent on nothing.
 */
export const LOW_FILL_SHARE = 0.4

/** Net daily draw on each stock with every system online. Spares: expected failures per day. */
export function netDailyUse(plan: MissionPlan): Record<ResourceKey, number> {
  const r = dailyRates(plan)
  const installed = installedComponents(plan)
  return {
    o2: Math.max(0, r.consumeKg.o2 - r.o2ProducedKg),
    water: Math.max(0, r.consumeKg.water - r.waterRecoveredKg + r.o2WaterCostKg),
    food: Math.max(0, r.consumeKg.food - r.greenhouseFoodKg),
    spares: COMPONENT_KEYS.reduce(
      (sum, c) => sum + (installed[c] ? 1 / COMPONENTS[c].mtbfDays : 0),
      0,
    ),
    fuel: fuelUsePerDay(plan),
  }
}

/** Stocks the base draws down while everything works (O₂ made on site from water has no net draw). */
export function drawnResources(plan: MissionPlan): ResourceKey[] {
  const use = netDailyUse(plan)
  return RESOURCE_KEYS.filter((k) => use[k] > 1e-9)
}

/**
 * Safety stock in the resource's unit. A stock with no net draw (O₂ made on site) still drains while
 * its generator is down, so its buffer is sized on gross use: that's what it covers during a repair.
 */
export function safetyStock(plan: MissionPlan, resource: ResourceKey, days: number): number {
  const net = netDailyUse(plan)[resource]
  if (net > 1e-9) return net * days
  return resource === 'spares' || resource === 'fuel'
    ? 0
    : dailyRates(plan).consumeKg[resource] * days
}

export type PipelineRow = {
  flight: CargoFlight
  orderDay: number
  launchDay: number
  arrivalDay: number
  orderDate: IsoDate
  arrivalDate: IsoDate
  massKg: number
  capacityKg: number
  costUsd: number
}

/** Each flight from order to landing, with its mass, date-adjusted capacity and launch cost. */
export function pipeline(plan: MissionPlan, leadDays: number): PipelineRow[] {
  return plan.flights.map((flight) => {
    const cap = flightCapacity(plan, flight)
    const launchDay = daysBetween(plan.startDate, flight.launchDate)
    return {
      flight,
      orderDay: launchDay - leadDays,
      launchDay,
      arrivalDay: daysBetween(plan.startDate, cap.transfer.arrivalDate),
      orderDate: addDays(flight.launchDate, -leadDays),
      arrivalDate: cap.transfer.arrivalDate,
      massKg: cap.massKg,
      capacityKg: cap.capacityKg,
      costUsd: LAUNCH_COST_USD,
    }
  })
}

export type Cover = { days: number; resource: ResourceKey; day: number }

/** Lowest P10 days of supply across drawn-down stocks over mission days [from, to). */
export function lowestCover(
  plan: MissionPlan,
  result: SimResult,
  from: number,
  to: number,
): Cover | null {
  const use = netDailyUse(plan)
  let best: Cover | null = null
  // Life support only: rover fuel running low never puts the crew at risk.
  for (const k of drawnResources(plan).filter((r) => r !== 'fuel')) {
    const p10 = result.bands[k].p10
    for (let d = Math.max(0, from); d < Math.min(to, p10.length); d++) {
      const days = p10[d] / use[k]
      if (best === null || days < best.days) best = { days, resource: k, day: d }
    }
  }
  return best
}

/** First mission day the unlucky case (P10) is effectively empty (under 1 unit), or null if never. */
export function runsOutDay(result: SimResult, resource: ResourceKey): number | null {
  const day = result.bands[resource].p10.findIndex((v) => v < 1)
  return day < 0 ? null : day
}

/** Share of missions that ended because this supply ran out, 0–1 (spare parts never end one directly). */
export function runOutShare(result: SimResult, resource: ResourceKey): number {
  const n = result.failures.filter((f) => f.kind === 'stockout' && f.resource === resource).length
  return n / result.runs
}

export type OrderSlotStatus = 'initial' | 'ok' | 'thin' | 'late' | 'unplanned' | 'afterEnd'

export type OrderSlot = {
  /** The planned flights' launch date, or the window's best date when nothing is planned. */
  launchDate: IsoDate
  orderBy: IsoDate
  arrivalDate: IsoDate
  arrivalDay: number
  flights: CargoFlight[]
  massKg: number
  capacityKg: number
  /** Lowest P10 days of supply since the previous landing (null for initial stock). */
  coverBefore: Cover | null
  status: OrderSlotStatus
}

/**
 * Every chance to land cargo: each launch window that can land before the mission ends (Mars), or
 * each planned launch date where any date works (Moon). Empty windows are kept on purpose: they are
 * the orders nobody placed.
 */
export function orderSchedule(
  plan: MissionPlan,
  result: SimResult,
  leadDays: number,
  safetyDays: number,
): OrderSlot[] {
  const windows = launchWindows(plan.destination)
  const groups: { launchDate: IsoDate; flights: CargoFlight[] }[] = []
  if (windows.length === 0) {
    const sorted = [...plan.flights].sort((a, b) => a.launchDate.localeCompare(b.launchDate))
    for (const f of sorted) {
      const same = groups.find((g) => g.launchDate === f.launchDate)
      if (same) same.flights.push(f)
      else groups.push({ launchDate: f.launchDate, flights: [f] })
    }
  } else {
    const first = plan.flights.reduce(
      (min, f) => (f.launchDate < min ? f.launchDate : min),
      plan.startDate,
    )
    for (const w of windows) {
      const flights = plan.flights.filter((f) => f.launchDate >= w.open && f.launchDate <= w.close)
      const lands = daysBetween(
        plan.startDate,
        transferFor(plan.destination, w.bestDate).arrivalDate,
      )
      if (flights.length === 0 && (w.close < first || lands >= plan.durationDays)) continue
      groups.push({ launchDate: flights[0]?.launchDate ?? w.bestDate, flights })
    }
  }

  let prevArrival = 0
  return groups.map(({ launchDate, flights }) => {
    const transfer = transferFor(plan.destination, launchDate)
    const arrivalDay = daysBetween(plan.startDate, transfer.arrivalDate)
    const caps = flights.map((f) => flightCapacity(plan, f))
    const capacityKg =
      caps.reduce((s, c) => s + c.capacityKg, 0) ||
      plan.baseVehiclePayloadKg * transfer.payloadFactor
    const coverBefore = arrivalDay > 0 ? lowestCover(plan, result, prevArrival, arrivalDay) : null
    let status: OrderSlotStatus
    if (arrivalDay >= plan.durationDays) status = 'afterEnd'
    else if (flights.length === 0) status = 'unplanned'
    else if (arrivalDay <= 0) status = 'initial'
    else if (coverBefore && coverBefore.days < 1) status = 'late'
    else if (coverBefore && coverBefore.days < safetyDays) status = 'thin'
    else status = 'ok'
    if (flights.length > 0 && arrivalDay > 0) prevArrival = arrivalDay
    return {
      launchDate,
      orderBy: addDays(launchDate, -leadDays),
      arrivalDate: transfer.arrivalDate,
      arrivalDay,
      flights,
      massKg: caps.reduce((s, c) => s + c.massKg, 0),
      capacityKg,
      coverBefore,
      status,
    }
  })
}

/** The last slot that lands at least `bufferDays` before `day`, if any. */
export function lastSlotBefore(
  slots: readonly OrderSlot[],
  day: number,
  bufferDays = 0,
): OrderSlot | undefined {
  return slots.filter((s) => s.arrivalDay <= day - bufferDays).at(-1)
}

export type ExceptionTarget =
  | { tab: 'stock'; resource: ResourceKey }
  /** The Shipments tab; with a launch date, that rocket's card is marked. */
  | { tab: 'orders'; launchDate?: IsoDate }
  | { tab: 'setup' }

export type SupplyException = {
  id: string
  severity: 'critical' | 'warning'
  title: string
  detail: string
  target: ExceptionTarget
}

// A failure cause that ends fewer missions than this is left off the list as noise.
const MIN_CAUSE_SHARE = 0.02
// From this share of missions a cause is critical rather than a warning.
const CRITICAL_CAUSE_SHARE = 0.1

const FAILING_STOCK: Record<ComponentKey, ResourceKey> = {
  waterRecycler: 'water',
  o2Generator: 'o2',
  co2Scrubber: 'spares',
  greenhouse: 'food',
}

/**
 * Everything a planner should look at, worst first: what ends missions (the sim's failure causes),
 * cargo that lands after a stockout or below safety stock, windows nobody ordered for, flights flying
 * mostly empty, and the crew's diet.
 */
export function supplyExceptions(
  link: WeakestLink,
  slots: readonly OrderSlot[],
  rows: readonly PipelineRow[],
  nutrition?: NutritionWarning,
): SupplyException[] {
  const out: SupplyException[] = []
  if (link.status === 'atRisk') {
    for (const c of link.causes) {
      if (c.share < MIN_CAUSE_SHARE) continue
      out.push({
        id: `cause-${c.key}`,
        severity: c.share >= CRITICAL_CAUSE_SHARE ? 'critical' : 'warning',
        title: c.label,
        detail: `${Math.round(c.share * 100)} out of 100 missions · around month ${c.month}`,
        target: c.driver
          ? { tab: 'setup' }
          : {
              tab: 'stock',
              resource: c.resource ?? (c.component ? FAILING_STOCK[c.component] : 'spares'),
            },
      })
    }
  }
  for (const s of slots) {
    const name = s.flights.map((f) => f.label).join(' + ')
    const target = { tab: 'orders', launchDate: s.launchDate } as const
    if (s.status === 'late') {
      out.push({
        id: `late-${s.launchDate}`,
        severity: 'critical',
        title: `${name} arrives too late`,
        detail: `Leaves ${monthLabel(s.launchDate)} · in unlucky missions supplies run out first`,
        target,
      })
    } else if (s.status === 'thin') {
      out.push({
        id: `thin-${s.launchDate}`,
        severity: 'warning',
        title: `${name} arrives cutting it close`,
        detail: `Leaves ${monthLabel(s.launchDate)} · supplies dip below the safety buffer first`,
        target,
      })
    } else if (s.status === 'unplanned') {
      out.push({
        id: `open-${s.launchDate}`,
        severity: 'warning',
        title: `No rocket booked for the ${monthLabel(s.launchDate)} launch window`,
        detail: `Order its cargo by ${monthLabel(s.orderBy)} to use it`,
        target,
      })
    }
  }
  for (const r of rows) {
    const fill = r.massKg / r.capacityKg
    if (fill >= LOW_FILL_SHARE) continue
    out.push({
      id: `fill-${r.flight.id}`,
      severity: 'warning',
      title: `${r.flight.label} is only ${Math.round(fill * 100)}% full`,
      detail: `Paying for a whole rocket · $${Math.round(r.costUsd / r.massKg / 1000)}k per kg sent`,
      target: { tab: 'orders', launchDate: r.flight.launchDate },
    })
  }
  if (nutrition) {
    out.push({
      id: 'nutrition',
      severity: 'warning',
      title: `Crew isn't getting enough vitamin C`,
      detail: `From month ${missionMonth(nutrition.firstShortDay)}${nutrition.fix ? ' · the fix is on the Crew tab' : ''}`,
      target: { tab: 'setup' },
    })
  }
  const rank = { critical: 0, warning: 1 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity])
}

export type EquipmentStatus = 'onTime' | 'late' | 'unpacked'

export type EquipmentDelivery = {
  key: EquipmentKey
  flight?: CargoFlight
  /** Mission day it lands (≤ 0: before the crew), when it's on a rocket. */
  arrivalDay?: number
  arrivalDate?: IsoDate
  status: EquipmentStatus
}

/** Where each equipment item is and whether it lands by its needed-by day. Needs no simulation. */
export function equipmentDeliveries(plan: MissionPlan): EquipmentDelivery[] {
  return EQUIPMENT_KEYS.map((key): EquipmentDelivery => {
    const flight = plan.flights.find((f) => f.equipment?.includes(key))
    if (!flight) return { key, status: 'unpacked' }
    const { arrivalDate } = transferFor(plan.destination, flight.launchDate)
    const arrivalDay = daysBetween(plan.startDate, arrivalDate)
    const status = arrivalDay > EQUIPMENT[key].neededByDay ? 'late' : 'onTime'
    return { key, flight, arrivalDay, arrivalDate, status }
  })
}

/** "before the crew arrives" or "by month 3". */
export function neededByText(key: EquipmentKey): string {
  const day = EQUIPMENT[key].neededByDay
  return day <= 0 ? 'before the crew arrives' : `by month ${missionMonth(day)}`
}

/**
 * Equipment that lands too late or isn't on any rocket. Read straight off the plan being edited, so
 * these show up as soon as an item is moved, before the results are updated.
 */
export function equipmentExceptions(plan: MissionPlan): SupplyException[] {
  return equipmentDeliveries(plan).flatMap((d): SupplyException[] => {
    const { label, neededByDay } = EQUIPMENT[d.key]
    const severity = neededByDay <= 0 ? 'critical' : 'warning'
    if (d.status === 'unpacked') {
      return [
        {
          id: `equipment-unpacked-${d.key}`,
          severity,
          title: `${label} isn't on any rocket`,
          detail: `Needed ${neededByText(d.key)}`,
          target: { tab: 'orders' },
        },
      ]
    }
    if (d.status === 'late' && d.flight && d.arrivalDay !== undefined) {
      return [
        {
          id: `equipment-late-${d.key}`,
          severity,
          title: neededByDay <= 0 ? `${label} arrives after the crew` : `${label} arrives late`,
          detail: `Needed ${neededByText(d.key)} · arrives month ${missionMonth(d.arrivalDay)}`,
          target: { tab: 'orders', launchDate: d.flight.launchDate },
        },
      ]
    }
    return []
  })
}

/** Rover fuel running out: the rover is grounded until more lands. Read off the plan being edited. */
export function fuelExceptions(plan: MissionPlan): SupplyException[] {
  if (fuelUsePerDay(plan) === 0) return []
  const stock = fuelStock(plan)
  const rover = plan.flights.find((f) => f.equipment?.includes('rover'))
  const roverFrom = rover
    ? Math.max(
        0,
        daysBetween(plan.startDate, transferFor(plan.destination, rover.launchDate).arrivalDate),
      )
    : 0
  const out = stock.findIndex((v, d) => d >= roverFrom && v <= 0)
  if (out < 0) return []
  return [
    {
      id: 'fuel-out',
      severity: 'warning',
      title:
        out <= roverFrom
          ? 'No rover fuel at the base'
          : `Rover fuel runs out in month ${missionMonth(out)}`,
      detail: 'The rover is grounded until more fuel lands',
      target: { tab: 'orders' },
    },
  ]
}

/** Rockets packed past what they can carry on their launch date (the plan can't run until fixed). */
export function overweightExceptions(plan: MissionPlan): SupplyException[] {
  return overCapacityFlights(plan).flatMap((c): SupplyException[] => {
    const flight = plan.flights.find((f) => f.id === c.flightId)
    if (!flight) return []
    const overKg = Math.round(c.massKg - c.capacityKg).toLocaleString('en-US')
    return [
      {
        id: `overweight-${c.flightId}`,
        severity: 'critical',
        title: `${flight.label} is too heavy`,
        detail: `${overKg} kg over · take something off or pick another date`,
        target: { tab: 'orders', launchDate: flight.launchDate },
      },
    ]
  })
}

export type SupplyCost = {
  label: string
  group: CargoGroup
  /** How much is sent, in words: "5,400 kg", "15 parts", "1 item". */
  amount: string
  /** Its share of the rockets it rides on, by the room it takes (packaging included). */
  launchUsd: number
  /** What it costs to buy, where there's a public price (equipment); null for supplies. */
  buyUsd: number | null
}

/**
 * What each supply costs the mission. Every rocket's launch price is split across what it carries by
 * the room each thing takes, so the launch shares add up to the full launch bill; equipment adds its
 * purchase price. Supplies have no meaningful purchase price next to launching them, so they show
 * the launch share only. Most expensive first.
 */
export function supplyCosts(plan: MissionPlan): SupplyCost[] {
  const byLabel = new Map<string, SupplyCost & { qty: number }>()
  for (const f of plan.flights) {
    const lines = flightContents(f)
    const packed = lines.reduce((s, l) => s + l.launchKg, 0)
    if (packed <= 0) continue
    for (const l of lines) {
      const share = (LAUNCH_COST_USD * l.launchKg) / packed
      const qty = l.group === 'spares' ? Number.parseInt(l.amount.replace(/,/g, ''), 10) : 0
      const entry = byLabel.get(l.label)
      if (entry) {
        entry.launchUsd += share
        entry.qty += qty
      } else {
        byLabel.set(l.label, {
          label: l.label,
          group: l.group,
          amount: '',
          launchUsd: share,
          buyUsd: null,
          qty,
        })
      }
    }
  }
  const kgOf = (pick: (f: CargoFlight) => number) => plan.flights.reduce((s, f) => s + pick(f), 0)
  const kgText = (kg: number) => `${Math.round(kg).toLocaleString('en-US')} kg`
  const amounts: Record<string, string> = {
    Water: kgText(kgOf((f) => f.consumablesKg.water)),
    Food: kgText(kgOf((f) => f.consumablesKg.food)),
    Oxygen: kgText(kgOf((f) => f.consumablesKg.o2)),
    'Rover fuel': kgText(kgOf((f) => f.fuelKg ?? 0)),
  }
  for (const k of EQUIPMENT_KEYS) amounts[EQUIPMENT[k].label] = kgText(EQUIPMENT[k].massKg)
  return [...byLabel.values()]
    .map(({ qty, ...c }) => {
      const equipment = EQUIPMENT_KEYS.find((k) => EQUIPMENT[k].label === c.label)
      return {
        ...c,
        amount: c.group === 'spares' ? `${qty} parts` : (amounts[c.label] ?? ''),
        buyUsd: equipment ? EQUIPMENT[equipment].priceUsd : null,
      }
    })
    .sort((a, b) => b.launchUsd + (b.buyUsd ?? 0) - (a.launchUsd + (a.buyUsd ?? 0)))
}

export type CostSummary = {
  launches: number
  costUsd: number
  /** Launch mass, containers included. */
  deliveredKg: number
  capacityKg: number
  usdPerKg: number
  usdPerCrewDay: number
}

export function costSummary(plan: MissionPlan, rows: readonly PipelineRow[]): CostSummary {
  const costUsd = rows.reduce((s, r) => s + r.costUsd, 0)
  const deliveredKg = rows.reduce((s, r) => s + r.massKg, 0)
  return {
    launches: rows.length,
    costUsd,
    deliveredKg,
    capacityKg: rows.reduce((s, r) => s + r.capacityKg, 0),
    usdPerKg: deliveredKg > 0 ? costUsd / deliveredKg : 0,
    usdPerCrewDay: costUsd / (plan.crew.length * plan.durationDays),
  }
}

export type MakeVsShip = {
  label: string
  /** Launch mass, with containers, that the system saves over the mission. */
  savedKg: number
  /** Launch mass of the spares the plan carries for it. */
  sparesKg: number
  /** Saved mass as full launches at the base vehicle payload. */
  launchesSaved: number
  usdSaved: number
}

/** What each on-site system is worth in shipping: the cargo you'd fly instead of running it. */
export function makeVsShip(plan: MissionPlan): MakeVsShip[] {
  const r = dailyRates(plan)
  const days = plan.durationDays
  const sparesKg = (c: ComponentKey) =>
    plan.flights.reduce((s, f) => s + f.spares[c] * COMPONENTS[c].spareMassKg, 0)
  const shipped = (kg: number, k: keyof typeof SHIPPING_OVERHEAD_KG_PER_KG) =>
    kg * (1 + SHIPPING_OVERHEAD_KG_PER_KG[k])
  const rows: Omit<MakeVsShip, 'launchesSaved' | 'usdSaved'>[] = [
    {
      label: `Water recycler (reuses ${Math.round(plan.lifeSupport.waterRecoveryRate * 100)}% of water)`,
      savedKg: shipped(r.waterRecoveredKg * days, 'water'),
      sparesKg: sparesKg('waterRecycler'),
    },
  ]
  if (r.o2ProducedKg > 0) {
    rows.push({
      label:
        plan.lifeSupport.o2Source === 'isru'
          ? 'Oxygen maker (uses local resources)'
          : 'Oxygen maker (splits water)',
      // Electrolysis spends recycled water; that water would have to be shipped back in.
      savedKg: shipped(r.o2ProducedKg * days, 'o2') - shipped(r.o2WaterCostKg * days, 'water'),
      sparesKg: sparesKg('o2Generator'),
    })
  }
  if (r.greenhouseFoodKg > 0) {
    rows.push({
      label: `Greenhouse (${plan.lifeSupport.greenhouse.areaM2} m²)`,
      savedKg: shipped(r.greenhouseFoodKg * days, 'food'),
      sparesKg: sparesKg('greenhouse'),
    })
  }
  return rows.map((row) => {
    const launchesSaved = row.savedKg / plan.baseVehiclePayloadKg
    return { ...row, launchesSaved, usdSaved: launchesSaved * LAUNCH_COST_USD }
  })
}
