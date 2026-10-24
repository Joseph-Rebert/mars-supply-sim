import { describe, expect, it } from 'vitest'
import horizons from './horizons-earth-mars.json'

const { days } = horizons
const DAY_MS = 86_400_000

describe('horizons-earth-mars.json', () => {
  it('covers every day from 2026-01-01 to 2042-12-31', () => {
    expect(days[0].date).toBe('2026-01-01')
    expect(days.at(-1)!.date).toBe('2042-12-31')
    for (let i = 1; i < days.length; i++) {
      expect(Date.parse(days[i].date) - Date.parse(days[i - 1].date)).toBe(DAY_MS)
    }
  })

  it('keeps Earth and Mars on their orbits', () => {
    // Source: NASA Planetary Fact Sheet, https://nssdc.gsfc.nasa.gov/planetary/factsheet/
    // Earth perihelion/aphelion 147.1/152.1 M km; Mars 206.6/249.3 M km.
    for (const d of days) {
      const rEarth = Math.hypot(...d.earth.r) / 1e6
      const rMars = Math.hypot(...d.mars.r) / 1e6
      expect(rEarth).toBeGreaterThan(147.0)
      expect(rEarth).toBeLessThan(152.2)
      expect(rMars).toBeGreaterThan(206.5)
      expect(rMars).toBeLessThan(249.4)
    }
  })

  it('has close approaches of roughly 55–100 M km and a maximum near 400 M km', () => {
    const km = days.map((d) => d.distanceKm)
    const minima = km.filter((x, i) => i > 0 && i < km.length - 1 && x < km[i - 1] && x < km[i + 1])

    // A close approach every ~26 months: 2027, 2029, 2031, 2033, 2035, 2037, 2040, 2042.
    expect(minima.length).toBeGreaterThanOrEqual(7)
    for (const m of minima) {
      // 2027 is an aphelic opposition at ~101 M km, hence the small margin above 100.
      expect(m / 1e6).toBeGreaterThan(55)
      expect(m / 1e6).toBeLessThan(102)
    }
    expect(Math.max(...km) / 1e6).toBeGreaterThan(390)
    expect(Math.max(...km) / 1e6).toBeLessThan(402)
  })
})
