import { useMemo } from 'react'
import { closestApproach, timelineOverlays, transferOnDay } from '../lib/timeline'
import { CONSUMABLE_KEYS, type MissionPlan, type SimResult } from '../lib/types'
import { EChart, type EChartOption } from './EChart'
import { fmt } from './format'
import { cssVar, RESOURCE_LABELS, resourceColors } from './themeColors'

/** A span of mission days to call out, e.g. the weakest link's failure month (GEA-34). */
export type TimelineHighlight = { startDay: number; endDay: number; label: string }

type Props = {
  result: SimResult
  /** The plan that produced `result`, for resupply marker labels. */
  plan: MissionPlan
  highlight?: TimelineHighlight
  height?: number
}

type TooltipParam = { seriesName?: string; value?: unknown; color?: string }

const SPARES_SERIES = 'Spares'
const DISTANCE_SERIES = 'Earth–Mars'
/** Height of the distance strip under the resource chart, px. */
const STRIP_H = 44

function timelineOption(
  result: SimResult,
  plan: MissionPlan,
  highlight?: TimelineHighlight,
): EChartOption {
  const colors = resourceColors()
  const mono = cssVar('--mono')
  const muted = cssVar('--text-muted')
  const rule = cssVar('--rule-strong')
  const days = Array.from({ length: result.durationDays }, (_, i) => i)
  const labelOf = new Map(plan.flights.map((f) => [f.id, f.label]))
  const named = new Set<string>([...CONSUMABLE_KEYS.map((k) => RESOURCE_LABELS[k]), SPARES_SERIES])
  const accent = cssVar('--accent')
  const critical = cssVar('--critical')
  const overlays = timelineOverlays(plan)
  const distance = overlays.distanceMkm
  const closest = distance ? closestApproach(distance) : null

  // Launch windows: shaded on both grids so they line up; labelled once, on the resource chart.
  const windowArea = (labelled: boolean) => ({
    silent: true,
    itemStyle: { color: accent, opacity: 0.08 },
    label: labelled
      ? { show: true, position: 'insideTop', color: accent, fontFamily: mono, fontSize: 13 }
      : { show: false },
    data: [
      ...overlays.windows.map((w) => [{ xAxis: w.startDay, name: w.label }, { xAxis: w.endDay }]),
      // The weakest link's failure month, in the critical color, labelled at the bottom.
      ...(labelled && highlight
        ? [
            [
              {
                xAxis: highlight.startDay,
                name: highlight.label,
                itemStyle: { color: critical, opacity: 0.16 },
                label: { position: 'insideBottomLeft', color: critical },
              },
              { xAxis: highlight.endDay },
            ],
          ]
        : []),
    ],
  })

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
            fontSize: 13,
          },
        })),
    ],
  }

  return {
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { color: cssVar('--chart-axis'), fontFamily: mono, fontSize: 14 },
    // With a distance strip: resource grid on top, a thin strip below sharing the day axis.
    grid: distance
      ? [
          { left: 56, right: 48, top: 40, bottom: STRIP_H + 62 },
          { left: 56, right: 48, height: STRIP_H, bottom: 30 },
        ]
      : [{ left: 56, right: 48, top: 40, bottom: 32 }],
    axisPointer: { link: [{ xAxisIndex: 'all' }] },
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
        const d = Number(day)
        if (distance && distance[d] !== null)
          rows.push(`${DISTANCE_SERIES} ${fmt(distance[d]!)} M km`)
        const transfer = transferOnDay(plan, d)
        if (transfer && transfer.payloadFactor > 0) {
          rows.push(
            `Launch today → ${transfer.transitDays} d transit · ${Math.round(transfer.payloadFactor * 100)}% payload`,
          )
        }
        return [`D${d} · median`, ...rows].join('<br/>')
      },
    },
    xAxis: [
      {
        type: 'category',
        data: days,
        boundaryGap: false,
        axisLine: { lineStyle: { color: rule } },
        axisTick: { show: false },
        axisLabel: { interval: 149, formatter: (d: string) => `D${d}` },
      },
      ...(distance
        ? [
            {
              type: 'category',
              gridIndex: 1,
              data: days,
              boundaryGap: false,
              axisLine: { lineStyle: { color: rule } },
              axisTick: { show: false },
              axisLabel: { show: false },
            },
          ]
        : []),
    ],
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
      ...(distance
        ? [
            {
              type: 'value',
              gridIndex: 1,
              name: 'M km',
              nameLocation: 'middle',
              nameGap: 40,
              nameTextStyle: { color: muted },
              min: 0,
              max: 'dataMax',
              splitNumber: 1,
              axisLabel: { formatter: (v: number) => fmt(v), fontSize: 13, showMaxLabel: false },
              splitLine: { show: false },
            },
          ]
        : []),
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
            ...(i === 0 ? { markLine, markArea: windowArea(true) } : {}),
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
      ...(distance
        ? [
            {
              type: 'line',
              name: DISTANCE_SERIES,
              xAxisIndex: 1,
              yAxisIndex: 2,
              data: distance,
              symbol: 'none',
              lineStyle: { color: muted, width: 1.5 },
              itemStyle: { color: muted },
              markArea: windowArea(false),
              markPoint: closest
                ? {
                    silent: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    itemStyle: { color: muted },
                    label: {
                      position: 'bottom',
                      formatter: `Closest · ${Math.round(closest.mkm)} M km`,
                      color: muted,
                      fontFamily: mono,
                      fontSize: 13,
                    },
                    data: [{ coord: [closest.day, closest.mkm] }],
                  }
                : undefined,
              // Launch → landing for each mid-mission flight, drawn along the distance curve.
              markLine: {
                silent: true,
                symbol: ['circle', 'arrow'],
                symbolSize: [5, 9],
                lineStyle: { color: accent, width: 1.5, type: 'solid' },
                label: { show: false },
                data: overlays.transits
                  .filter((t) => t.launchDay >= 0 && distance[t.launchDay] !== null)
                  .map((t) => [
                    { coord: [t.launchDay, distance[t.launchDay]] },
                    { coord: [t.arrivalDay, distance[t.arrivalDay]] },
                  ]),
              },
            },
          ]
        : []),
    ],
  }
}

/**
 * P50 line + P10–P90 band per consumable (kg), median spare count (right axis), resupply markers,
 * launch-window bands, and (Mars) an Earth–Mars distance strip with launch → landing arrows.
 */
export function ResourceTimeline({ result, plan, highlight, height = 270 }: Props) {
  const option = useMemo(() => timelineOption(result, plan, highlight), [result, plan, highlight])
  const overlays = useMemo(() => timelineOverlays(plan), [plan])
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
          Spares
        </span>
        <span className="legend-item">
          <span className="swatch swatch-marker" aria-hidden="true" />
          Landing
        </span>
        {overlays.windows.length > 0 && (
          <span className="legend-item">
            <span className="swatch swatch-window" aria-hidden="true" />
            Window
          </span>
        )}
        {overlays.distanceMkm && (
          <span className="legend-item">
            <span className="swatch swatch-distance" aria-hidden="true" />
            Distance
          </span>
        )}
      </div>
      <EChart
        option={option}
        height={height}
        label={`Median O₂, water, food and spares stock over ${result.durationDays} days, with P10–P90 bands across ${fmt(result.runs)} runs${highlight ? "; the weakest link's failure month is shaded" : ''}`}
      />
    </>
  )
}
