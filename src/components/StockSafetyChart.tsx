import { useMemo } from 'react'
import { addDays } from '../lib/dates'
import type { PipelineRow } from '../lib/supplyChain'
import { monthLabel } from '../lib/timeline'
import type { MissionPlan, ResourceKey, SimResult } from '../lib/types'
import { EChart, type EChartOption } from './EChart'
import { fmt } from './format'
import { cssVar, RESOURCE_LABELS, RESOURCE_UNITS, resourceColors } from './themeColors'

type Props = {
  /** The plan that produced `result`. */
  plan: MissionPlan
  result: SimResult
  rows: PipelineRow[]
  resource: ResourceKey
  /** Safety stock in the resource's unit. */
  safety: number
}

// One x-axis label every ~6 months.
const LABEL_EVERY_DAYS = 180

/** One stock over the mission against its safety stock, with landings marked and shortfalls shaded. */
export function StockSafetyChart({ plan, result, rows, resource, safety }: Props) {
  const option = useMemo<EChartOption>(() => {
    const axis = cssVar('--chart-axis')
    const font = { color: axis, fontFamily: cssVar('--mono'), fontSize: 12 }
    const color = resourceColors()[resource]
    const unit = RESOURCE_UNITS[resource]
    const band = result.bands[resource]
    // Runs of days where the bad case is below safety stock.
    const below: [number, number][] = []
    band.p10.forEach((v, d) => {
      if (v >= safety) return
      const last = below.at(-1)
      if (last && last[1] === d - 1) last[1] = d
      else below.push([d, d])
    })
    return {
      animation: false,
      grid: { left: 8, right: 24, top: 28, bottom: 28, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--bg-raised'),
        borderColor: cssVar('--rule-strong'),
        textStyle: { color: cssVar('--text'), fontSize: 13 },
        valueFormatter: (v: number) => `${fmt(v)} ${unit}`,
      },
      xAxis: {
        type: 'category',
        data: band.p50.map((_, d) => d),
        boundaryGap: false,
        axisLabel: {
          ...font,
          interval: LABEL_EVERY_DAYS - 1,
          formatter: (d: string) => monthLabel(addDays(plan.startDate, Number(d))),
        },
        axisLine: { lineStyle: { color: axis } },
      },
      yAxis: {
        type: 'value',
        name: unit,
        nameTextStyle: font,
        axisLabel: { ...font, formatter: (v: number) => fmt(v) },
        splitLine: { lineStyle: { color: cssVar('--chart-grid') } },
      },
      series: [
        {
          name: 'Unlucky mission',
          type: 'line',
          data: band.p10,
          stack: 'band',
          symbol: 'none',
          lineStyle: { color: cssVar('--critical'), width: 1 },
        },
        {
          name: 'P90',
          type: 'line',
          data: band.p90.map((v, d) => v - band.p10[d]),
          stack: 'band',
          symbol: 'none',
          lineStyle: { opacity: 0 },
          areaStyle: { color, opacity: 0.16 },
          tooltip: { show: false },
        },
        {
          name: 'Typical mission',
          type: 'line',
          data: band.p50,
          symbol: 'none',
          lineStyle: { color, width: 2 },
          markLine: {
            silent: true,
            symbol: 'none',
            data: [
              {
                yAxis: safety,
                lineStyle: { color: cssVar('--caution'), type: 'dashed' },
                label: {
                  ...font,
                  color: cssVar('--caution'),
                  position: 'insideStartTop',
                  formatter: 'Safety buffer',
                },
              },
              ...rows
                .filter((r) => r.arrivalDay > 0 && r.arrivalDay < plan.durationDays)
                .map((r) => ({
                  xAxis: r.arrivalDay,
                  lineStyle: { color: cssVar('--accent'), type: 'solid' as const },
                  label: {
                    ...font,
                    color: cssVar('--accent'),
                    formatter: `${r.flight.label} arrives`,
                  },
                })),
            ],
          },
          markArea: {
            silent: true,
            itemStyle: { color: cssVar('--critical'), opacity: 0.1 },
            data: below.map(([a, b]) => [{ xAxis: a }, { xAxis: b }]),
          },
        },
      ],
    }
  }, [plan, result, rows, resource, safety])
  return (
    <EChart
      option={option}
      height={340}
      label={`${RESOURCE_LABELS[resource]} stock over the mission against safety stock`}
    />
  )
}
