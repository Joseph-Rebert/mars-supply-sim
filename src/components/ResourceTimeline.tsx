import { useMemo } from 'react'
import { CONSUMABLE_KEYS, type MissionPlan, type SimResult } from '../lib/types'
import { EChart, type EChartOption } from './EChart'
import { fmt } from './format'
import { cssVar, RESOURCE_LABELS, resourceColors } from './themeColors'

type Props = {
  result: SimResult
  /** The plan that produced `result`, for resupply marker labels. */
  plan: MissionPlan
  height?: number
}

type TooltipParam = { seriesName?: string; value?: unknown; color?: string }

const SPARES_SERIES = 'Spares'

function timelineOption(result: SimResult, plan: MissionPlan): EChartOption {
  const colors = resourceColors()
  const mono = cssVar('--mono')
  const muted = cssVar('--text-muted')
  const rule = cssVar('--rule-strong')
  const days = Array.from({ length: result.durationDays }, (_, i) => i)
  const labelOf = new Map(plan.flights.map((f) => [f.id, f.label]))
  const named = new Set<string>([...CONSUMABLE_KEYS.map((k) => RESOURCE_LABELS[k]), SPARES_SERIES])

  // Zero line plus a vertical marker for every flight that lands mid-mission.
  const markLine = {
    silent: true,
    symbol: 'none',
    animation: false,
    data: [
      { yAxis: 0, lineStyle: { color: rule, type: 'solid', width: 1 }, label: { show: false } },
      ...result.arrivals
        .filter((a) => a.arrivalDay > 0 && a.arrivalDay < result.durationDays)
        .map((a) => ({
          xAxis: a.arrivalDay,
          lineStyle: { color: muted, type: 'dashed', width: 1 },
          label: {
            formatter: `▼ ${labelOf.get(a.flightId) ?? a.flightId} · D${a.arrivalDay}`,
            position: 'end',
            // Text ends at the line so it can't collide with the right axis title.
            align: 'right',
            color: muted,
            fontFamily: mono,
            fontSize: 12,
          },
        })),
    ],
  }

  return {
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { color: cssVar('--chart-axis'), fontFamily: mono, fontSize: 13 },
    grid: { left: 56, right: 48, top: 40, bottom: 32 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: cssVar('--bg-raised'),
      borderColor: rule,
      borderRadius: 0,
      textStyle: { color: cssVar('--text'), fontFamily: mono },
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as TooltipParam[]
        const day = (params[0] as { axisValue?: unknown }).axisValue
        const rows = params
          .filter((p) => p.seriesName && named.has(p.seriesName))
          .map((p) => {
            const unit = p.seriesName === SPARES_SERIES ? '' : ' kg'
            return `<span style="color:${p.color}">■</span> ${p.seriesName} ${fmt(Number(p.value))}${unit}`
          })
        return [`D${day} · median`, ...rows].join('<br/>')
      },
    },
    xAxis: {
      type: 'category',
      data: days,
      boundaryGap: false,
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false },
      axisLabel: { interval: 149, formatter: (d: string) => `D${d}` },
    },
    yAxis: [
      {
        type: 'value',
        name: 'kg',
        nameTextStyle: { color: muted },
        axisLabel: { formatter: (v: number) => fmt(v) },
        splitLine: { lineStyle: { color: cssVar('--chart-grid'), type: 'dashed' } },
      },
      {
        type: 'value',
        name: 'spares',
        nameTextStyle: { color: muted },
        min: 0,
        minInterval: 1,
        splitLine: { show: false },
      },
    ],
    series: [
      ...CONSUMABLE_KEYS.flatMap((key, i) => {
        const { p10, p50, p90 } = result.bands[key]
        const color = colors[key]
        // P10–P90 band: invisible lower bound, then the band height stacked on top.
        return [
          {
            type: 'line',
            name: `_${key}-p10`,
            data: p10,
            stack: key,
            symbol: 'none',
            lineStyle: { opacity: 0 },
            silent: true,
          },
          {
            type: 'line',
            name: `_${key}-band`,
            data: p90.map((v, d) => v - p10[d]),
            stack: key,
            symbol: 'none',
            lineStyle: { opacity: 0 },
            areaStyle: { color, opacity: 0.14 },
            silent: true,
          },
          {
            type: 'line',
            name: RESOURCE_LABELS[key],
            data: p50,
            symbol: 'none',
            lineStyle: { color, width: 1.5 },
            itemStyle: { color },
            ...(i === 0 ? { markLine } : {}),
          },
        ]
      }),
      {
        type: 'line',
        name: SPARES_SERIES,
        yAxisIndex: 1,
        data: result.bands.spares.p50,
        step: 'end',
        symbol: 'none',
        lineStyle: { color: colors.spares, width: 1.5, type: 'dashed' },
        itemStyle: { color: colors.spares },
      },
    ],
  }
}

/** P50 line + P10–P90 band per consumable (kg), median spare count (right axis), resupply markers. */
export function ResourceTimeline({ result, plan, height = 250 }: Props) {
  const option = useMemo(() => timelineOption(result, plan), [result, plan])
  return (
    <>
      <div className="legend">
        {CONSUMABLE_KEYS.map((key) => (
          <span key={key} className="legend-item">
            <span className={`swatch swatch-${key}`} aria-hidden="true" />
            {RESOURCE_LABELS[key]}
          </span>
        ))}
        <span className="legend-item">
          <span className="swatch swatch-spares swatch-dashed" aria-hidden="true" />
          Spares (count)
        </span>
        <span className="legend-item">
          <span className="swatch swatch-marker" aria-hidden="true" />
          Resupply lands
        </span>
      </div>
      <EChart option={option} height={height} />
    </>
  )
}
