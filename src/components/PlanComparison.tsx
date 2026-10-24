import { useMemo, useState } from 'react'
import { comparePlans, type Delta, type SavedRun } from '../lib/compare'
import { DESTINATION_PROFILES } from '../lib/data'
import { RESOURCE_KEYS, type ResourceKey } from '../lib/types'
import { EChart, type EChartOption } from './EChart'
import { fmt } from './format'
import { cssVar, RESOURCE_LABELS, resourceColors } from './themeColors'

type Props = {
  a: SavedRun
  b: SavedRun
}

const TONE_CLASS: Record<Delta['tone'], string> = {
  better: 'is-nominal',
  worse: 'is-critical',
  same: 'muted',
}

/** "▲ +36.0 pts", "▼ −12 kg", "= same". The arrow follows the sign; the color says better/worse. */
function deltaText(d: Delta, unit: 'pts' | 'kg'): string {
  if (d.tone === 'same') return '= same'
  const arrow = d.delta > 0 ? '▲' : '▼'
  const sign = d.delta > 0 ? '+' : '−'
  const size = Math.abs(d.delta)
  return `${arrow} ${sign}${unit === 'pts' ? size.toFixed(1) : fmt(size)} ${unit}`
}

function Row({ label, d, unit }: { label: string; d: Delta; unit: 'pts' | 'kg' }) {
  const value = (v: number) => (unit === 'pts' ? `${v.toFixed(1)}%` : `${fmt(v)} kg`)
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{value(d.a)}</td>
      <td>{value(d.b)}</td>
      <td className={TONE_CLASS[d.tone]}>{deltaText(d, unit)}</td>
    </tr>
  )
}

function overlayOption(a: SavedRun, b: SavedRun, key: ResourceKey): EChartOption {
  const color = resourceColors()[key]
  const mono = cssVar('--mono')
  const days = Math.max(a.result.durationDays, b.result.durationDays)
  const unit = key === 'spares' ? '' : ' kg'
  // Each run: an invisible P10 line with the P10–P90 band stacked on it, then its median.
  const series = (run: SavedRun, dashed: boolean, opacity: number) => {
    const { p10, p50, p90 } = run.result.bands[key]
    const stack = `${run.name}-${key}`
    return [
      { type: 'line', data: p10, stack, symbol: 'none', lineStyle: { opacity: 0 }, silent: true },
      {
        type: 'line',
        data: p90.map((v, i) => v - p10[i]),
        stack,
        symbol: 'none',
        lineStyle: { opacity: 0 },
        areaStyle: { color, opacity },
        silent: true,
      },
      {
        type: 'line',
        name: run.name,
        data: p50,
        symbol: 'none',
        lineStyle: { color, width: 1.5, type: dashed ? 'dashed' : 'solid' },
      },
    ]
  }

  return {
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { color: cssVar('--chart-axis'), fontFamily: mono, fontSize: 12 },
    grid: { left: 56, right: 16, top: 28, bottom: 28 },
    legend: {
      top: 0,
      right: 0,
      textStyle: { color: cssVar('--text-muted'), fontFamily: mono },
      data: [a.name, b.name],
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: cssVar('--bg-raised'),
      borderColor: cssVar('--rule-strong'),
      borderRadius: 0,
      textStyle: { color: cssVar('--text'), fontFamily: mono },
      valueFormatter: (v: unknown) => `${fmt(Number(v))}${unit}`,
    },
    xAxis: {
      type: 'category',
      data: Array.from({ length: days }, (_, i) => i),
      boundaryGap: false,
      axisLine: { lineStyle: { color: cssVar('--rule-strong') } },
      axisTick: { show: false },
      axisLabel: { interval: 149, formatter: (d: string) => `D${d}` },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => fmt(v) },
      splitLine: { lineStyle: { color: cssVar('--chart-grid'), type: 'dashed' } },
    },
    series: [...series(a, true, 0.08), ...series(b, false, 0.16)],
  }
}

/** Two saved runs side by side: the numbers, the differences, and one resource overlaid. */
export function PlanComparison({ a, b }: Props) {
  const [resource, setResource] = useState<ResourceKey>('water')
  const c = useMemo(() => comparePlans(a, b), [a, b])
  const option = useMemo(() => overlayOption(a, b, resource), [a, b, resource])
  const where = (run: SavedRun) => DESTINATION_PROFILES[run.plan.destination].label

  return (
    <div className="comparison">
      <table className="comparison-table">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">
              {a.name}
              <span className="muted"> · {where(a)}</span>
            </th>
            <th scope="col">
              {b.name}
              <span className="muted"> · {where(b)}</span>
            </th>
            <th scope="col">Change</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Survival" d={c.survivalPts} unit="pts" />
          <Row label="Launch mass" d={c.totalMassKg} unit="kg" />
          {RESOURCE_KEYS.map((k) => (
            <Row key={k} label={`· ${RESOURCE_LABELS[k]}`} d={c.massKg[k]} unit="kg" />
          ))}
        </tbody>
      </table>

      <dl className="comparison-links">
        <dt>{a.name}</dt>
        <dd>{c.weakestLink.a}</dd>
        <dt>{b.name}</dt>
        <dd>{c.weakestLink.b}</dd>
      </dl>

      <div className="segmented" role="radiogroup" aria-label="Resource to overlay">
        {RESOURCE_KEYS.map((k) => (
          <label key={k} className="segmented-option">
            <input
              type="radio"
              name="comparison-resource"
              value={k}
              checked={resource === k}
              onChange={() => setResource(k)}
            />
            <span>{RESOURCE_LABELS[k]}</span>
          </label>
        ))}
      </div>
      <EChart option={option} height={220} />
    </div>
  )
}
