import { useMemo } from 'react'
import { DAYS_PER_MONTH } from '../lib/plan'
import { runOutShare, runsOutDay, type PipelineRow } from '../lib/supplyChain'
import { RESOURCE_KEYS, type MissionPlan, type ResourceKey, type SimResult } from '../lib/types'
import { EChart, type EChartOption } from './EChart'
import { fmt } from './format'
import { cssVar, RESOURCE_LABELS, RESOURCE_UNITS, resourceColors } from './themeColors'

type Props = {
  /** The plan that produced `result`. */
  plan: MissionPlan
  result: SimResult
  rows: PipelineRow[]
}

const month = (day: number) => day / DAYS_PER_MONTH
const monthOf = (day: number) => Math.floor(month(day)) + 1

/**
 * Every supply the base lives on, one small chart each: how much is left month by month on a typical
 * mission and an unlucky one, with resupply landings and the run-out point marked, and one sentence
 * saying whether it lasts. Same layout and colours in each, so they read as a set.
 */
export function SupplyCharts({ plan, result, rows }: Props) {
  return (
    <div className="sc-supplies">
      <p className="sc-supplies-key" aria-hidden="true">
        <span className="sc-key-line is-typical" /> Typical mission
        <span className="sc-key-line is-unlucky" /> Unlucky mission (the worst 1 in 10)
      </p>
      <div className="sc-supplies-grid">
        {/* Supplies that end missions first, most often first; the rest keep their usual order. */}
        {[...RESOURCE_KEYS]
          .sort((a, b) => runOutShare(result, b) - runOutShare(result, a))
          .map((k) => (
            <SupplyChart key={k} plan={plan} result={result} rows={rows} resource={k} />
          ))}
      </div>
    </div>
  )
}

function SupplyChart({ plan, result, rows, resource }: Props & { resource: ResourceKey }) {
  const out = runsOutDay(result, resource)
  // Counted from the missions that actually ran dry, so it agrees with the problem list even when
  // it's rarer than the 1-in-10 line on the chart shows.
  const share = runOutShare(result, resource)
  const n = Math.max(1, Math.round(share * 100))
  const verdict =
    share > 0
      ? {
          text: `Runs out in ${n} of 100 missions${out === null ? '' : `, by month ${monthOf(out)} when unlucky`}.`,
          tone: share >= 0.1 ? 'critical' : 'caution',
        }
      : out !== null && resource === 'fuel'
        ? { text: `Runs out in month ${monthOf(out)}; the rover is grounded.`, tone: 'caution' }
        : out !== null
          ? { text: `All used up by month ${monthOf(out)} when unlucky.`, tone: 'caution' }
          : { text: 'Lasts the whole mission.', tone: 'nominal' }

  const option = useMemo<EChartOption>(() => {
    const axis = cssVar('--chart-axis')
    const font = { color: axis, fontFamily: cssVar('--sans'), fontSize: 12 }
    const band = result.bands[resource]
    const unit = RESOURCE_UNITS[resource]
    const pts = (values: number[]) => values.map((v, d) => [month(d), v])
    const landings = rows.filter((r) => r.arrivalDay > 0 && r.arrivalDay < plan.durationDays)
    const unlucky = cssVar('--critical')
    const line = (name: string, data: number[][], color: string, width: number) => ({
      name,
      type: 'line' as const,
      data,
      symbol: 'none',
      lineStyle: { color, width },
      itemStyle: { color },
    })
    return {
      animation: false,
      grid: { left: 4, right: 12, top: 18, bottom: 4, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: cssVar('--bg-raised'),
        borderColor: cssVar('--rule-strong'),
        textStyle: { color: cssVar('--text'), fontSize: 13 },
        formatter: (params: { seriesName: string; value: number[] }[]) =>
          [
            `Month ${Math.floor(params[0].value[0]) + 1}`,
            ...params.map((p) => `${p.seriesName}: ${fmt(p.value[1])} ${unit} left`),
          ].join('<br/>'),
      },
      xAxis: {
        type: 'value',
        min: 0,
        max: month(plan.durationDays),
        interval: 6,
        axisLabel: {
          ...font,
          showMaxLabel: false,
          formatter: (m: number) => (m === 0 ? 'Start' : `Mo ${Math.round(m)}`),
        },
        axisLine: { lineStyle: { color: axis } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        splitNumber: 3,
        axisLabel: { ...font, formatter: (v: number) => fmt(v) },
        splitLine: { lineStyle: { color: cssVar('--chart-grid') } },
      },
      series: [
        {
          ...line('Typical mission', pts(band.p50), resourceColors()[resource], 2.5),
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: cssVar('--accent'), type: 'dashed' as const, width: 1 },
            label: { ...font, color: cssVar('--accent'), position: 'insideEndTop' as const },
            data: landings.map((r) => ({
              xAxis: month(r.arrivalDay),
              label: { formatter: r.flight.label },
            })),
          },
        },
        // Rover fuel is the same in every mission, so there's no separate unlucky line to draw.
        resource === 'fuel'
          ? { type: 'line' as const, data: [] }
          : {
              ...line('Unlucky mission', pts(band.p10), unlucky, 1.5),
              markPoint:
                out === null
                  ? undefined
                  : {
                      silent: true,
                      symbol: 'circle',
                      symbolSize: 7,
                      itemStyle: { color: unlucky },
                      label: { show: false },
                      data: [{ coord: [month(out), 0] }],
                    },
            },
      ],
    }
  }, [plan, result, rows, resource, out])

  return (
    <section className="sc-supply" aria-label={RESOURCE_LABELS[resource]}>
      <div className="sc-supply-head">
        <h3 className="sc-supply-name">
          {RESOURCE_LABELS[resource]}{' '}
          <span className="sc-caption">({RESOURCE_UNITS[resource]})</span>
        </h3>
        <span className={`sc-supply-verdict tone-${verdict.tone}`}>{verdict.text}</span>
      </div>
      <EChart
        option={option}
        height={128}
        label={`${RESOURCE_LABELS[resource]} left at the base: ${verdict.text}`}
      />
    </section>
  )
}
