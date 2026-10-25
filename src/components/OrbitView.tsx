import { useEffect, useMemo, useRef, useState } from 'react'
import { AU_KM, C_KM_S } from '../lib/data'
import { addDays, daysBetween } from '../lib/dates'
import type { Vec3 } from '../lib/lambert'
import { dateSpan, ephemeris, orbitPaths, transferArc } from '../lib/orbit'
import type { PipelineRow } from '../lib/supplyChain'
import { monthLabel } from '../lib/timeline'
import type { MissionPlan } from '../lib/types'
import { fmt } from './format'
import { cssVar } from './themeColors'

// Mars aphelion is 1.666 AU; leave room outside it for labels.
const VIEW_RADIUS_KM = 1.82 * AU_KM
const PLAY_DAYS_PER_SECOND = 45
const ORBITS = orbitPaths()

type Props = {
  /** The plan that produced `rows`. */
  plan: MissionPlan
  rows: PipelineRow[]
}

type Box = { x: number; y: number; w: number; h: number }

/** Top-down view of the Sun, Earth, Mars and each cargo flight's real transfer, with a date scrubber. */
export function OrbitView({ plan, rows }: Props) {
  const arcs = useMemo(
    () =>
      rows.flatMap((row) => {
        const arc = transferArc(row.flight.launchDate, row.arrivalDate)
        return arc ? [{ row, arc }] : []
      }),
    [rows],
  )
  const span = useMemo(() => {
    const first = rows.reduce(
      (m, r) => (r.flight.launchDate < m ? r.flight.launchDate : m),
      plan.startDate,
    )
    return dateSpan(addDays(first, -30), addDays(plan.startDate, plan.durationDays))
  }, [plan, rows])

  // Open mid-way through the first flight so the picture shows cargo on its way.
  const initialDay = useMemo(() => {
    const first = arcs[0]?.arc
    if (!first) return 0
    return Math.max(
      0,
      daysBetween(span.first, first.launchDate) + Math.round(first.transitDays / 2),
    )
  }, [arcs, span])
  // A different plan remounts this view (App keys it by the flights), so state starts fresh there.
  const [day, setDay] = useState(initialDay)
  const [playRequested, setPlaying] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const playing = playRequested && day < span.days

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const elapsed = (now - last) / 1000
      last = now
      setDay((d) => Math.min(span.days, d + elapsed * PLAY_DAYS_PER_SECOND))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, span.days])

  const whole = Math.floor(day)
  const date = addDays(span.first, whole)
  const eph = ephemeris(date)
  const missionDay = daysBetween(plan.startDate, date)

  const canvas = useRef<HTMLCanvasElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(520)
  useEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([e]) =>
      setSize(Math.min(600, Math.max(260, e.contentRect.width))),
    )
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx || !eph) return
    const dpr = window.devicePixelRatio || 1
    el.width = size * dpr
    el.height = size * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size, size)
    const c = size / 2
    const k = c / VIEW_RADIUS_KM
    const px = (r: Vec3): [number, number] => [c + r[0] * k, c - r[1] * k]
    const color = {
      grid: cssVar('--chart-grid'),
      rule: cssVar('--rule-strong'),
      muted: cssVar('--text-muted'),
      accent: cssVar('--accent'),
      sun: cssVar('--sun'),
      earth: cssVar('--planet-earth'),
      mars: cssVar('--planet-mars'),
      landed: cssVar('--nominal'),
    }
    const mono = cssVar('--mono')

    const path = (pts: Vec3[], close = false) => {
      ctx.beginPath()
      pts.forEach((p, i) => (i === 0 ? ctx.moveTo(...px(p)) : ctx.lineTo(...px(p))))
      if (close) ctx.closePath()
    }
    const dotAt = (r: Vec3, radius: number, fill: string) => {
      ctx.beginPath()
      ctx.arc(...px(r), radius, 0, Math.PI * 2)
      ctx.fillStyle = fill
      ctx.fill()
    }
    // Each label tries a few spots around its point and takes the first that misses those drawn.
    const taken: Box[] = []
    const label = (r: Vec3, text: string, fill: string) => {
      const [x, y] = px(r)
      ctx.font = `12px ${mono}`
      const w = ctx.measureText(text).width
      const h = 14
      const at = (dx: number, dy: number): Box => ({
        x: Math.min(Math.max(4, x + dx), size - w - 4),
        y: Math.min(Math.max(4, y + dy - h + 3), size - h - 4),
        w,
        h,
      })
      const free = (b: Box) =>
        taken.every((t) => b.x + b.w < t.x || t.x + t.w < b.x || b.y + b.h < t.y || t.y + t.h < b.y)
      // Right then left of the point, rows moving outward from it; crowded spots (two ships
      // beside Earth) fall through to rows further out instead of overlapping.
      const rows = [-8, 18, -24, 34, -40, 50, -56, 66]
      const spots = rows.flatMap((dy) => [
        [10, dy],
        [-w - 10, dy],
      ])
      const pick = spots.map(([dx, dy]) => at(dx, dy)).find(free) ?? at(10, -8)
      taken.push(pick)
      ctx.fillStyle = fill
      ctx.fillText(text, pick.x, pick.y + h - 3)
    }

    ctx.strokeStyle = color.grid
    ctx.lineWidth = 1
    for (const au of [1, 1.5]) {
      ctx.beginPath()
      ctx.arc(c, c, au * AU_KM * k, 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.font = `11px ${mono}`
    ctx.fillStyle = color.muted

    ctx.lineWidth = 1.5
    ctx.globalAlpha = 0.45
    ctx.strokeStyle = color.earth
    path(ORBITS.earth, true)
    ctx.stroke()
    ctx.strokeStyle = color.mars
    path(ORBITS.mars, true)
    ctx.stroke()
    ctx.globalAlpha = 1

    // Paths: dashed ahead of the cargo, amber where it has flown, green once it has landed.
    const ships: { p: Vec3; text: string; dim: boolean }[] = []
    for (const { row, arc } of arcs) {
      const since = daysBetween(arc.launchDate, date) + (day - whole)
      const dim = focus !== null && focus !== row.flight.id
      ctx.globalAlpha = dim ? 0.2 : 1
      ctx.setLineDash([4, 5])
      ctx.strokeStyle = color.rule
      ctx.lineWidth = 1.5
      path(arc.points)
      ctx.stroke()
      ctx.setLineDash([])
      if (since > 0) {
        const done = Math.min(1, since / arc.transitDays)
        const n = Math.max(2, Math.round(done * (arc.points.length - 1)) + 1)
        ctx.strokeStyle = since >= arc.transitDays ? color.landed : color.accent
        ctx.lineWidth = 2.5
        path(arc.points.slice(0, n))
        ctx.stroke()
      }
      if (since > 0 && since < arc.transitDays) {
        ships.push({ p: arc.positionAt(since), text: row.flight.label, dim })
      }
      ctx.globalAlpha = 1
    }

    ctx.setLineDash([2, 4])
    ctx.strokeStyle = color.muted
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(...px(eph.earth.r))
    ctx.lineTo(...px(eph.mars.r))
    ctx.stroke()
    ctx.setLineDash([])

    dotAt([0, 0, 0], 8, color.sun)
    dotAt(eph.earth.r, 6, color.earth)
    dotAt(eph.mars.r, 6, color.mars)
    label(eph.earth.r, 'Earth', color.earth)
    label(eph.mars.r, 'Mars', color.mars)
    for (const s of ships) {
      ctx.globalAlpha = s.dim ? 0.2 : 1
      dotAt(s.p, 5, color.accent)
      label(s.p, s.text, color.accent)
      ctx.globalAlpha = 1
    }
  }, [arcs, date, day, whole, eph, size, focus])

  if (arcs.length === 0) {
    return <p className="sc-muted">No flight in this plan falls inside the cached ephemeris.</p>
  }

  const status = (row: PipelineRow) => {
    if (missionDay < row.orderDay) return { text: 'Not ordered yet', tone: '' }
    if (missionDay < row.launchDay) return { text: 'Being built', tone: '' }
    if (missionDay < row.arrivalDay) {
      const total = row.arrivalDay - row.launchDay
      return {
        text: `Flying · day ${fmt(missionDay - row.launchDay)} of ${fmt(total)}`,
        tone: 'is-transit',
      }
    }
    return { text: `Arrived ${monthLabel(row.arrivalDate)}`, tone: 'is-landed' }
  }
  const distanceKm = eph?.distanceKm ?? 0

  return (
    <div className="orbit">
      <div className="orbit-canvas" ref={box}>
        <canvas
          ref={canvas}
          style={{ width: size, height: size }}
          role="img"
          aria-label={`Earth, Mars and cargo transfer paths on ${date}`}
        />
      </div>
      <div className="orbit-side">
        <div className="orbit-date">
          <span className="num orbit-date-value">{date}</span>
          <span className="sc-muted">
            {missionDay < 0
              ? `Crew lands in ${fmt(-missionDay)} days`
              : `Crew on Mars · day ${fmt(missionDay)} of ${fmt(plan.durationDays)}`}
          </span>
          <span className="sc-muted num">
            Earth to Mars: {fmt(distanceKm / 1e6)} million km · messages take{' '}
            {Math.round(distanceKm / C_KM_S / 60)} min
          </span>
        </div>
        <div className="orbit-controls">
          <button
            type="button"
            className="sc-btn is-primary"
            onClick={() => {
              if (day >= span.days) setDay(0)
              setPlaying(!playing)
            }}
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <input
            id="orbit-date"
            type="range"
            min={0}
            max={span.days}
            step={1}
            value={whole}
            aria-label="Date"
            onChange={(e) => {
              setPlaying(false)
              setDay(Number(e.target.value))
            }}
          />
        </div>
        <ul className="orbit-flights">
          {arcs.map(({ row }) => {
            const s = status(row)
            return (
              <li key={row.flight.id}>
                <button
                  type="button"
                  className={focus === row.flight.id ? 'orbit-flight is-focus' : 'orbit-flight'}
                  onMouseEnter={() => setFocus(row.flight.id)}
                  onMouseLeave={() => setFocus(null)}
                  onFocus={() => setFocus(row.flight.id)}
                  onBlur={() => setFocus(null)}
                  onClick={() => {
                    setPlaying(false)
                    setDay(daysBetween(span.first, row.flight.launchDate))
                  }}
                  title="Jump to launch"
                >
                  <span className="orbit-flight-name">{row.flight.label}</span>
                  <span className="sc-caption num">
                    {monthLabel(row.flight.launchDate)} → {monthLabel(row.arrivalDate)} ·{' '}
                    {row.arrivalDay - row.launchDay} days
                  </span>
                  <span className={`orbit-status ${s.tone}`}>{s.text}</span>
                </button>
              </li>
            )
          })}
        </ul>
        <p className="sc-caption">
          Planet positions are NASA's real data, and each rocket follows its actual path to Mars.
          Click a rocket to jump to the day it leaves.
        </p>
      </div>
    </div>
  )
}
