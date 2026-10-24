import { describe, expect, it } from 'vitest'
import table from '../cache/transfers-mars.json'
import { LAUNCH_WINDOW_PAYLOAD_FACTOR_MIN, MARS_ARRIVAL_VINF_CAP_KM_S } from './data'
import { daysBetween } from './dates'
import { launchDateRange, launchWindows, transferFor } from './transfers'

const windows = launchWindows('mars')
const best = windows.map((w) => transferFor('mars', w.bestDate))

describe('Mars transfer table', () => {
  it('has one row per day with consistent arrival dates', () => {
    const { transfers } = table
    for (let i = 0; i < transfers.length; i++) {
      const t = transfers[i]
      if (i > 0) expect(daysBetween(transfers[i - 1].launchDate, t.launchDate)).toBe(1)
      expect(daysBetween(t.launchDate, t.arrivalDate)).toBe(t.transitDays)
      expect(t.payloadFactor).toBeGreaterThanOrEqual(0)
      expect(t.payloadFactor).toBeLessThanOrEqual(1)
    }
  })

  it('finds windows in the published Earth–Mars opportunity periods', () => {
    // Opportunities recur every ~26 months: late 2026, turn of 2028/29, early 2031, then ~2 months later
    // each cycle (e.g. NASA Mars Exploration Program launch-period announcements).
    const expected: [string, string][] = [
      ['2026-10-01', '2026-12-31'],
      ['2028-11-01', '2029-02-28'],
      ['2030-12-01', '2031-04-30'],
      ['2033-02-01', '2033-06-30'],
      ['2035-04-01', '2035-08-31'],
      ['2037-06-01', '2037-10-31'],
      ['2039-08-01', '2039-11-30'],
      ['2041-09-01', '2041-12-31'],
    ]
    expect(windows).toHaveLength(expected.length)
    windows.forEach((w, i) => {
      expect(w.bestDate >= expected[i][0] && w.bestDate <= expected[i][1]).toBe(true)
      expect(w.open <= w.bestDate && w.bestDate <= w.close).toBe(true)
    })
    for (let i = 1; i < windows.length; i++) {
      // Synodic period 780 d; individual cycles vary with Mars's eccentric orbit.
      expect(daysBetween(windows[i - 1].bestDate, windows[i].bestDate)).toBeGreaterThan(700)
      expect(daysBetween(windows[i - 1].bestDate, windows[i].bestDate)).toBeLessThan(860)
    }
  })

  it('gives best-window transits of 150–300 days and C3 of roughly 8–20 km²/s²', () => {
    for (const t of best) {
      expect(t.payloadFactor).toBe(1)
      expect(t.transitDays).toBeGreaterThanOrEqual(150)
      expect(t.transitDays).toBeLessThanOrEqual(300)
      expect(t.c3).toBeGreaterThan(7)
      expect(t.c3).toBeLessThan(20)
      expect(t.vInfArrival).toBeLessThanOrEqual(MARS_ARRIVAL_VINF_CAP_KM_S)
    }
  })

  it('makes off-window launches steeply more expensive', () => {
    // Halfway between windows Earth and Mars are near conjunction.
    for (let i = 1; i < windows.length; i++) {
      const midDate = table.transfers.find(
        (t) =>
          daysBetween(windows[i - 1].bestDate, t.launchDate) ===
          Math.round(daysBetween(windows[i - 1].bestDate, windows[i].bestDate) / 2),
      )!
      expect(midDate.c3).toBeGreaterThan(50)
      expect(midDate.payloadFactor).toBeLessThan(LAUNCH_WINDOW_PAYLOAD_FACTOR_MIN)
    }
  })
})

describe('transferFor', () => {
  it('reads Mars from the table', () => {
    const w = windows[0]
    const t = transferFor('mars', w.bestDate)
    expect(t.launchDate).toBe(w.bestDate)
    expect(daysBetween(t.launchDate, t.arrivalDate)).toBe(t.transitDays)
  })

  it('throws outside the Mars table range', () => {
    expect(() => transferFor('mars', '2025-12-31')).toThrow(RangeError)
    expect(() => transferFor('mars', '2050-01-01')).toThrow(RangeError)
    expect(launchDateRange('mars')?.first).toBe('2026-01-01')
  })

  it('treats the Moon as constant: ~3 days, full payload, any date, no windows', () => {
    const t = transferFor('moon', '2030-06-15')
    expect(t).toMatchObject({ transitDays: 3, arrivalDate: '2030-06-18', payloadFactor: 1 })
    expect(transferFor('moon', '2099-01-01').payloadFactor).toBe(1)
    expect(launchWindows('moon')).toEqual([])
    expect(launchDateRange('moon')).toBeUndefined()
  })
})
