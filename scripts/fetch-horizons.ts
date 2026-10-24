// One-off fetch: daily heliocentric Earth and Mars state vectors → src/cache/horizons-earth-mars.json
// Run with `npx tsx scripts/fetch-horizons.ts`. The app imports the JSON; it never calls Horizons.
//
// Source: NASA/JPL Horizons System API, https://ssd.jpl.nasa.gov/api/horizons.api
// (docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html). Ephemerides DE441 (Earth) and mar099 (Mars).
// Query: EPHEM_TYPE=VECTORS, CENTER=500@10 (Sun body center), REF_PLANE=ECLIPTIC, REF_SYSTEM=ICRF
// (ecliptic of J2000.0), VEC_TABLE=2 (position + velocity), OUT_UNITS=KM-S, VEC_CORR=NONE (geometric),
// START_TIME=2026-01-01, STOP_TIME=2042-12-31, STEP_SIZE=1 d. Epochs are 00:00 TDB.

import { writeFileSync } from 'node:fs'

const API_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const OUT_PATH = new URL('../src/cache/horizons-earth-mars.json', import.meta.url)

const BODIES = { earth: '399', mars: '499' } as const

const QUERY = {
  format: 'json',
  OBJ_DATA: 'NO',
  MAKE_EPHEM: 'YES',
  EPHEM_TYPE: 'VECTORS',
  CENTER: '500@10',
  REF_PLANE: 'ECLIPTIC',
  REF_SYSTEM: 'ICRF',
  START_TIME: '2026-01-01',
  STOP_TIME: '2042-12-31',
  STEP_SIZE: '1 d',
  VEC_TABLE: '2',
  VEC_CORR: 'NONE',
  OUT_UNITS: 'KM-S',
  CSV_FORMAT: 'YES',
  VEC_LABELS: 'NO',
}

type Vec3 = [number, number, number]
type State = { r: Vec3; v: Vec3 }

const MONTHS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
}

// Integer km and mm/s keep the file small; both are far below ephemeris accuracy needs for Lambert.
const roundKm = (x: number) => Math.round(x)
const roundKmS = (x: number) => Math.round(x * 1e6) / 1e6

async function fetchStates(command: string): Promise<Map<string, State>> {
  // Horizons wants quoted values ('399'); URLSearchParams handles the encoding.
  const params = new URLSearchParams(
    Object.entries({ ...QUERY, COMMAND: command }).map(([k, v]) => [
      k,
      k === 'format' ? v : `'${v}'`,
    ]),
  )

  const res = await fetch(`${API_URL}?${params}`)
  if (!res.ok) throw new Error(`Horizons HTTP ${res.status} for body ${command}`)
  const body: unknown = await res.json()
  if (typeof body !== 'object' || body === null || !('result' in body)) {
    throw new Error(`Unexpected Horizons response for body ${command}`)
  }
  const result = String(body.result)

  const start = result.indexOf('$$SOE')
  const end = result.indexOf('$$EOE')
  if (start < 0 || end < 0) throw new Error(`No ephemeris block for body ${command}:\n${result}`)

  const states = new Map<string, State>()
  for (const line of result
    .slice(start + 5, end)
    .trim()
    .split('\n')) {
    // JDTDB, "A.D. 2026-Jan-01 00:00:00.0000", X, Y, Z, VX, VY, VZ,
    const cols = line.split(',').map((c) => c.trim())
    const m = /(\d{4})-(\w{3})-(\d{2})/.exec(cols[1])
    if (!m) throw new Error(`Bad date in line: ${line}`)
    const date = `${m[1]}-${MONTHS[m[2]]}-${m[3]}`
    const n = cols.slice(2, 8).map(Number)
    if (n.some((x) => !Number.isFinite(x))) throw new Error(`Bad numbers in line: ${line}`)
    states.set(date, {
      r: [roundKm(n[0]), roundKm(n[1]), roundKm(n[2])],
      v: [roundKmS(n[3]), roundKmS(n[4]), roundKmS(n[5])],
    })
  }
  return states
}

const earth = await fetchStates(BODIES.earth)
const mars = await fetchStates(BODIES.mars)

const days = [...earth.keys()].map((date) => {
  const e = earth.get(date)!
  const m = mars.get(date)
  if (!m) throw new Error(`Mars has no state for ${date}`)
  const distanceKm = Math.round(Math.hypot(m.r[0] - e.r[0], m.r[1] - e.r[1], m.r[2] - e.r[2]))
  return { date, earth: e, mars: m, distanceKm }
})

const header = {
  source: 'NASA/JPL Horizons System API (https://ssd.jpl.nasa.gov/api/horizons.api)',
  fetchedAt: new Date().toISOString(),
  query: { ...QUERY, COMMAND: BODIES },
  frame: 'Heliocentric (Sun body center), ecliptic and mean equinox of J2000.0',
  units: { r: 'km', v: 'km/s', distanceKm: 'km' },
  timeScale: 'TDB, 00:00 each day',
}

// One day per line: readable diffs without Prettier's one-number-per-line blowup.
const json = `{\n"header": ${JSON.stringify(header)},\n"days": [\n${days.map((d) => JSON.stringify(d)).join(',\n')}\n]\n}\n`
writeFileSync(OUT_PATH, json)

let min = days[0]
let max = days[0]
for (const d of days) {
  if (d.distanceKm < min.distanceKm) min = d
  if (d.distanceKm > max.distanceKm) max = d
}
console.log(`Wrote ${days.length} days (${days[0].date} → ${days.at(-1)!.date})`)
console.log(`Min Earth–Mars distance ${(min.distanceKm / 1e6).toFixed(1)} M km on ${min.date}`)
console.log(`Max Earth–Mars distance ${(max.distanceKm / 1e6).toFixed(1)} M km on ${max.date}`)
