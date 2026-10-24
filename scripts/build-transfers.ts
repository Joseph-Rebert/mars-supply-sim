// Offline build: Earth→Mars transfer for every launch date → src/cache/transfers-mars.json
// Run with `npx tsx scripts/build-transfers.ts` after scripts/fetch-horizons.ts.
//
// For each launch date L and time of flight T (120–300 d, 5-d steps), solve Lambert between Earth at L and
// Mars at L + T, keep the lowest-C3 transfer whose arrival v∞ is under the cap, then convert C3 to payload
// with the NASA LSP Falcon Heavy curve. Constants and their sources live in src/lib/data.ts.

import { readFileSync, writeFileSync } from 'node:fs'
import {
  LAUNCH_WINDOW_PAYLOAD_FACTOR_MIN,
  MARS_ARRIVAL_VINF_CAP_KM_S,
  MU_SUN_KM3_PER_S2,
} from '../src/lib/data.ts'
import { addDays, daysBetween } from '../src/lib/dates.ts'
import { solveLambert, type Vec3 } from '../src/lib/lambert.ts'
import { payloadKgAtC3 } from '../src/lib/payload.ts'
import type { LaunchWindow, Transfer } from '../src/lib/types.ts'

const IN_PATH = new URL('../src/cache/horizons-earth-mars.json', import.meta.url)
const OUT_PATH = new URL('../src/cache/transfers-mars.json', import.meta.url)

// Search grid from GEA-39, with the upper end lowered from 400 to 300 days: pure lowest-C3 picks long type-II
// arcs (up to the 400-d edge in 2037) for 0–5% more payload in most cycles (12% in 2039). Cargo that lands
// sooner is worth more to a crew, and published opportunity tables quote ~150–300 d transits.
const TOF_MIN_DAYS = 120
const TOF_MAX_DAYS = 300
const TOF_STEP_DAYS = 5
// Opportunities recur every ~780 days (synodic period); a best date is the minimum C3 within ± half that.
const HALF_SYNODIC_DAYS = 390

type State = { r: Vec3; v: Vec3 }
type Day = { date: string; earth: State; mars: State; distanceKm: number }

const horizons = JSON.parse(readFileSync(IN_PATH, 'utf8')) as { days: Day[] }
const days = horizons.days
const byDate = new Map(days.map((d) => [d.date, d]))
const lastEphemerisDate = days.at(-1)!.date

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const round = (x: number, digits: number) => Math.round(x * 10 ** digits) / 10 ** digits

type Best = Omit<Transfer, 'payloadFactor'>

let overCapDates = 0

/**
 * Lowest-C3 transfer under the arrival v∞ cap. Far from a window no transfer meets the cap; those dates
 * fall back to the lowest C3 overall (for display) but get payload factor 0: the cargo can't be captured.
 */
function bestTransfer(launch: Day): Best | undefined {
  let capped: Best | undefined
  let any: Best | undefined
  for (let tof = TOF_MIN_DAYS; tof <= TOF_MAX_DAYS; tof += TOF_STEP_DAYS) {
    const arrival = byDate.get(addDays(launch.date, tof))
    if (!arrival) break
    const sol = solveLambert(launch.earth.r, arrival.mars.r, tof * 86_400, MU_SUN_KM3_PER_S2)
    if (!sol) continue
    const t: Best = {
      launchDate: launch.date,
      transitDays: tof,
      arrivalDate: arrival.date,
      c3: norm(sub(sol.v1, launch.earth.v)) ** 2,
      vInfArrival: norm(sub(sol.v2, arrival.mars.v)),
      distanceKmAtLaunch: launch.distanceKm,
    }
    if (!any || t.c3 < any.c3) any = t
    if (t.vInfArrival <= MARS_ARRIVAL_VINF_CAP_KM_S && (!capped || t.c3 < capped.c3)) capped = t
  }
  if (!capped && any) overCapDates++
  return capped ?? any
}

// Only launch dates whose whole TOF range fits inside the ephemeris.
const lastLaunchDate = addDays(lastEphemerisDate, -TOF_MAX_DAYS)
const candidates = days.filter((d) => d.date <= lastLaunchDate).map(bestTransfer)
const missing = candidates.findIndex((c) => !c)
if (missing >= 0) throw new Error(`No Lambert solution at all for ${days[missing].date}`)
const best = candidates as Best[]

const deliverable = (b: Best) => b.vInfArrival <= MARS_ARRIVAL_VINF_CAP_KM_S

// Opportunities: interior deliverable dates with the lowest C3 within ± half a synodic period.
const opportunities = best.filter((b, i) => {
  if (i === 0 || i === best.length - 1 || !deliverable(b)) return false
  const lo = Math.max(0, i - HALF_SYNODIC_DAYS)
  const hi = Math.min(best.length - 1, i + HALF_SYNODIC_DAYS)
  for (let j = lo; j <= hi; j++) if (deliverable(best[j]) && best[j].c3 < b.c3) return false
  return true
})

// Payload factor is relative to the best date of the nearest opportunity (its "cycle").
const transfers: Transfer[] = best.map((b) => {
  const opp = opportunities.reduce((a, o) =>
    Math.abs(daysBetween(o.launchDate, b.launchDate)) <
    Math.abs(daysBetween(a.launchDate, b.launchDate))
      ? o
      : a,
  )
  return {
    ...b,
    c3: round(b.c3, 3),
    vInfArrival: round(b.vInfArrival, 3),
    payloadFactor: deliverable(b) ? round(payloadKgAtC3(b.c3) / payloadKgAtC3(opp.c3), 4) : 0,
  }
})

const windows: LaunchWindow[] = []
for (let i = 0; i < transfers.length; i++) {
  if (transfers[i].payloadFactor < LAUNCH_WINDOW_PAYLOAD_FACTOR_MIN) continue
  let j = i
  let bestIdx = i
  while (
    j + 1 < transfers.length &&
    transfers[j + 1].payloadFactor >= LAUNCH_WINDOW_PAYLOAD_FACTOR_MIN
  ) {
    j++
    if (transfers[j].c3 < transfers[bestIdx].c3) bestIdx = j
  }
  windows.push({
    open: transfers[i].launchDate,
    close: transfers[j].launchDate,
    bestDate: transfers[bestIdx].launchDate,
  })
  i = j
}

const header = {
  source:
    'Lambert transfers on NASA/JPL Horizons ephemerides; payload from NASA LSP Falcon Heavy (Expendable) curve',
  builtAt: new Date().toISOString(),
  input: 'src/cache/horizons-earth-mars.json',
  tofDays: { min: TOF_MIN_DAYS, max: TOF_MAX_DAYS, step: TOF_STEP_DAYS },
  arrivalVInfCapKmS: MARS_ARRIVAL_VINF_CAP_KM_S,
  windowPayloadFactorMin: LAUNCH_WINDOW_PAYLOAD_FACTOR_MIN,
  units: { c3: 'km²/s²', vInfArrival: 'km/s', distanceKmAtLaunch: 'km' },
}

// One transfer per line: readable diffs without Prettier's one-number-per-line blowup.
const json = `{\n"header": ${JSON.stringify(header)},\n"windows": ${JSON.stringify(windows)},\n"transfers": [\n${transfers.map((t) => JSON.stringify(t)).join(',\n')}\n]\n}\n`
writeFileSync(OUT_PATH, json)

console.log(
  `Wrote ${transfers.length} launch dates (${transfers[0].launchDate} → ${transfers.at(-1)!.launchDate})`,
)
console.log(`${overCapDates} dates had no transfer under the v∞ cap (fell back to lowest C3)`)
for (const w of windows) {
  const t = transfers.find((x) => x.launchDate === w.bestDate)!
  console.log(
    `Window ${w.open} → ${w.close}  best ${w.bestDate}: C3 ${t.c3.toFixed(1)}, ${t.transitDays} d, ` +
      `v∞ arr ${t.vInfArrival.toFixed(2)} km/s, ${Math.round(payloadKgAtC3(t.c3))} kg`,
  )
}
