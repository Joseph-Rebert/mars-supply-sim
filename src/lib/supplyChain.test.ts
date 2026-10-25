import { describe, expect, it } from 'vitest'
import { weakestLink } from './analysis'
import { LAUNCH_COST_USD } from './data'
import { presetById } from './presets'
import { DEFAULT_RUN_OPTIONS, runMission } from './sim'
import { FUEL_KG_PER_ROVER_DAY } from './data'
import { fuelStock, fuelUsePerDay } from './fuel'
import { equipmentMassKg, flightContents, flightMassKg, withEquipmentOn } from './manifest'
import {
  costSummary,
  drawnResources,
  equipmentDeliveries,
  equipmentExceptions,
  fuelExceptions,
  overweightExceptions,
  runOutShare,
  supplyCosts,
  runsOutDay,
  lastSlotBefore,
  makeVsShip,
  netDailyUse,
  orderSchedule,
  pipeline,
  safetyStock,
  supplyExceptions,
} from './supplyChain'

const LEAD = 548
const draft = presetById('draft').plan()
const draftResult = runMission(draft, DEFAULT_RUN_OPTIONS)

describe('netDailyUse (draft: 4 crew, 93% water recovery, O₂ by electrolysis, no greenhouse)', () => {
  const use = netDailyUse(draft)

  it('nets water as use − recovered + water split for O₂', () => {
    // 4 × 4.48 = 17.92 kg used; 93% back = 16.6656; O₂ 4 × 0.895 = 3.58 kg × 18.015/15.999 = 4.0311 kg.
    expect(use.water).toBeCloseTo(17.92 - 16.6656 + 3.58 * (18.015 / 15.999), 3)
  })

  it('has no net O₂ draw when the generator makes all of it', () => {
    expect(use.o2).toBe(0)
    expect(drawnResources(draft)).not.toContain('o2')
  })

  it('expects spare-part use at the summed failure rate of installed hardware', () => {
    // Recycler, O₂ generator and CO₂ scrubber; no greenhouse.
    expect(use.spares).toBeCloseTo(1 / 154.8 + 1 / 444.3 + 1 / 987.4, 6)
  })
})

describe('safetyStock', () => {
  it('is days × net draw for a drawn-down stock', () => {
    expect(safetyStock(draft, 'water', 90)).toBeCloseTo(netDailyUse(draft).water * 90, 6)
  })

  it('is days × gross use for O₂, which only drains while its generator is down', () => {
    expect(safetyStock(draft, 'o2', 90)).toBeCloseTo(3.58 * 90, 6)
  })
})

describe('pipeline', () => {
  it('orders each flight one lead time before launch', () => {
    const rows = pipeline(draft, LEAD)
    for (const r of rows) expect(r.launchDay - r.orderDay).toBe(LEAD)
    expect(rows[0].orderDate).toBe('2027-06-12') // 2028-12-11 − 548 days
  })
})

describe('orderSchedule (draft)', () => {
  const slots = orderSchedule(draft, draftResult, LEAD, 90)

  it('groups both landers into the Dec 2028 window as initial stock', () => {
    expect(slots[0].flights.map((f) => f.id)).toEqual(['f1', 'f2'])
    expect(slots[0].status).toBe('initial')
  })

  it('flags the Jan 2031 resupply as landing after the bad case has run dry', () => {
    const resupply = slots.find((s) => s.flights.some((f) => f.id === 'f3'))!
    expect(resupply.status).toBe('late')
    expect(resupply.coverBefore!.resource).toBe('water')
  })

  it('names the Dec 2028 window as the last cargo that lands before the month-22 failure', () => {
    expect(lastSlotBefore(slots, 650)?.launchDate).toBe('2028-12-11')
  })
})

describe('supplyExceptions', () => {
  it('puts the draft water failure first and flags the late, underfilled resupply', () => {
    const rows = pipeline(draft, LEAD)
    const slots = orderSchedule(draft, draftResult, LEAD, 90)
    const list = supplyExceptions(weakestLink(draftResult), slots, rows)
    expect(list[0]).toMatchObject({
      severity: 'critical',
      target: { tab: 'stock', resource: 'water' },
    })
    expect(list.map((e) => e.id)).toEqual(expect.arrayContaining(['late-2031-01-25', 'fill-f3']))
    // Critical before warning.
    const firstWarning = list.findIndex((e) => e.severity === 'warning')
    expect(list.slice(firstWarning).every((e) => e.severity === 'warning')).toBe(true)
  })
})

describe('costSummary', () => {
  it('prices the draft at three launches over 4 crew × 900 days', () => {
    const cost = costSummary(draft, pipeline(draft, LEAD))
    expect(cost.costUsd).toBe(3 * LAUNCH_COST_USD)
    expect(cost.usdPerCrewDay).toBeCloseTo((3 * 178e6) / 3600, 6)
  })
})

describe('makeVsShip', () => {
  it('values the recycler as the recovered water it saves shipping, containers included', () => {
    const [recycler] = makeVsShip(draft)
    // 16.6656 kg/day × 900 days × 1.10 (water bags) = 16,498.9 kg; ÷ 12,600 kg per launch.
    expect(recycler.savedKg).toBeCloseTo(16.6656 * 900 * 1.1, 1)
    expect(recycler.launchesSaved).toBeCloseTo((16.6656 * 900 * 1.1) / 12_600, 4)
  })
})

describe('equipment', () => {
  it('weighs on its rocket: habitat + reactor add 2,951.5 kg to Cargo lander 1', () => {
    const f1 = draft.flights[0]
    expect(equipmentMassKg(f1)).toBeCloseTo(1413 + 10_000 / 6.5, 6)
    expect(flightMassKg(f1) - flightMassKg({ ...f1, equipment: [] })).toBeCloseTo(
      equipmentMassKg(f1),
      6,
    )
  })

  it('lands everything on time in the draft plan', () => {
    const d = equipmentDeliveries(draft)
    expect(d.map((x) => [x.key, x.flight?.id, x.status])).toEqual([
      ['habitat', 'f1', 'onTime'],
      ['power', 'f1', 'onTime'],
      ['rover', 'f2', 'onTime'],
    ])
    expect(equipmentExceptions(draft)).toEqual([])
  })

  it('moves an item to one rocket only', () => {
    const moved = withEquipmentOn(draft, 'habitat', 'f3')
    expect(moved.flights.map((f) => f.equipment)).toEqual([['power'], ['rover'], ['habitat']])
    expect(draft.flights[0].equipment).toEqual(['habitat', 'power']) // input untouched
  })

  it('flags the habitat arriving after the crew as critical', () => {
    // Resupply 1 lands on day 811, long after the crew (day 0).
    const late = withEquipmentOn(draft, 'habitat', 'f3')
    expect(equipmentExceptions(late)).toEqual([
      expect.objectContaining({
        id: 'equipment-late-habitat',
        severity: 'critical',
        title: 'Habitat module arrives after the crew',
        target: { tab: 'orders', launchDate: '2031-01-25' },
      }),
    ])
  })

  it('flags an unpacked rover as a warning with its deadline', () => {
    const unpacked = withEquipmentOn(draft, 'rover', null)
    expect(equipmentExceptions(unpacked)).toEqual([
      expect.objectContaining({
        id: 'equipment-unpacked-rover',
        severity: 'warning',
        title: "Rover isn't on any rocket",
        detail: 'Needed by month 3',
      }),
    ])
  })
})

describe('overweightExceptions', () => {
  it('is empty when every rocket fits', () => {
    expect(overweightExceptions(draft)).toEqual([])
  })

  it('flags a rocket packed past its launch-date limit', () => {
    const heavy = {
      ...draft,
      flights: draft.flights.map((f) =>
        f.id === 'f2' ? { ...f, consumablesKg: { ...f.consumablesKg, water: 6000 } } : f,
      ),
    }
    expect(overweightExceptions(heavy)).toEqual([
      expect.objectContaining({
        id: 'overweight-f2',
        severity: 'critical',
        title: 'Cargo lander 2 is too heavy',
      }),
    ])
  })
})

describe('flightContents', () => {
  it('lists Cargo lander 1 in plain amounts, supplies by room taken, then equipment', () => {
    const lines = flightContents(draft.flights[0])
    expect(lines.map((l) => [l.label, l.amount])).toEqual([
      ['Water', '4,700 kg'], // 5,170 kg of room with bags
      ['Rover fuel', '800 kg'], // 1,960 kg with tanks
      ['Oxygen', '600 kg'], // 1,470 kg with tanks
      ['Spare parts', '11 parts'],
      ['Habitat module', '1,413 kg'],
      ['Power plant (10 kW reactor)', '1,538 kg'],
    ])
    expect(lines[3].detail).toBe(
      '5 for the water recycler, 3 for the oxygen maker, 3 for the air filter',
    )
    // Every kilogram on the rocket is in exactly one line.
    const room = lines.reduce((s, l) => s + l.launchKg, 0)
    expect(room).toBeCloseTo(flightMassKg(draft.flights[0]), 6)
  })
})

describe('runOutShare and runsOutDay (draft)', () => {
  it('agree with the weakest link: water ends 385 of 1,000 missions, dry by month 20 when unlucky', () => {
    const link = weakestLink(draftResult)
    if (link.status !== 'atRisk') throw new Error('expected atRisk')
    expect(runOutShare(draftResult, 'water')).toBe(0.385)
    expect(runOutShare(draftResult, 'water')).toBe(link.top.share)
    const day = runsOutDay(draftResult, 'water')!
    expect(Math.floor(day / 30.4375) + 1).toBe(20)
  })

  it('never ends a mission on spare parts directly, and food lasts', () => {
    expect(runOutShare(draftResult, 'spares')).toBe(0)
    expect(runsOutDay(draftResult, 'food')).toBeNull()
  })
})

describe('rover fuel', () => {
  it('burns about 2.06 kg a day: 10 kW × 2 h a week from methane at 50 MJ/kg, 4 kg O₂ each, 50% cell', () => {
    // (10 × 2 / 7) kWh ÷ (50 / 5 / 3.6 × 0.5) kWh per kg = 2.857 ÷ 1.389 = 2.057.
    expect(FUEL_KG_PER_ROVER_DAY).toBeCloseTo(2.057, 3)
    expect(fuelUsePerDay(draft)).toBe(FUEL_KG_PER_ROVER_DAY)
    expect(fuelUsePerDay(withEquipmentOn(draft, 'rover', null))).toBe(0)
  })

  it('lasts the draft mission: 2,000 kg landed, about 1,850 kg burned over 900 days', () => {
    const stock = fuelStock(draft)
    expect(stock[0]).toBeCloseTo(2000 - FUEL_KG_PER_ROVER_DAY, 6)
    expect(stock.at(-1)).toBeCloseTo(2000 - 900 * FUEL_KG_PER_ROVER_DAY, 6)
    expect(fuelExceptions(draft)).toEqual([])
  })

  it('grounds the rover when the fuel runs out, as a warning', () => {
    const short = {
      ...draft,
      flights: draft.flights.map((f) => (f.id === 'f2' ? { ...f, fuelKg: 0 } : f)),
    }
    // 800 kg ÷ 2.057 kg a day = day 389, month 13.
    expect(fuelExceptions(short)).toEqual([
      expect.objectContaining({ severity: 'warning', title: 'Rover fuel runs out in month 13' }),
    ])
  })
})

describe('supplyCosts', () => {
  it('splits every launch across its cargo, so launch shares add up to the full launch bill', () => {
    const costs = supplyCosts(draft)
    const launch = costs.reduce((s, c) => s + c.launchUsd, 0)
    expect(launch).toBeCloseTo(3 * LAUNCH_COST_USD, 0)
  })

  it('adds a purchase price for equipment only: $17.8M + $20M + $9.5M', () => {
    const costs = supplyCosts(draft)
    const buy = costs.reduce((s, c) => s + (c.buyUsd ?? 0), 0)
    expect(buy).toBeCloseTo(17.8e6 + 20e6 + 9.5e6, 0)
    expect(costs.find((c) => c.label === 'Water')?.buyUsd).toBeNull()
    expect(costs.find((c) => c.label === 'Spare parts')?.amount).toBe('15 parts')
    expect(costs.find((c) => c.label === 'Water')?.amount).toBe('5,400 kg')
  })
})
