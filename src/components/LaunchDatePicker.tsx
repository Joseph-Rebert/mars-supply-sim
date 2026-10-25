import { useId, useMemo } from 'react'
import { LAUNCH_WINDOW_PAYLOAD_FACTOR_MIN } from '../lib/data'
import {
  clampLaunchDate,
  nearestBestDate,
  shipCostStrip,
  type StripPoint,
} from '../lib/launchDates'
import { flightCapacity } from '../lib/manifest'
import { launchDateRange, launchWindows } from '../lib/transfers'
import type { CargoFlight, IsoDate, LaunchWindow, MissionPlan } from '../lib/types'
import { EChart, type EChartOption } from './EChart'
import { fmt } from './format'
import type { Tone } from './StatTile'
import { cssVar } from './themeColors'

type Props = {
  plan: MissionPlan
  flight: CargoFlight
  onChange: (launchDate: IsoDate) => void
  /** Show the capacity-by-date chart under the readout (default true). */
  showChart?: boolean
}

// Below this payload factor an off-window launch reads red instead of amber.
const CRITICAL_PAYLOAD_FACTOR = 0.4

// Five-point star for best dates (ECharts has no built-in star symbol).
const STAR = 'path://M50,0L61,35L98,35L68,57L79,91L50,70L21,91L32,57L2,35L39,35Z'

function factorTone(payloadFactor: number): Tone {
  if (payloadFactor >= LAUNCH_WINDOW_PAYLOAD_FACTOR_MIN) return 'nominal'
  if (payloadFactor >= CRITICAL_PAYLOAD_FACTOR) return 'caution'
  return 'critical'
}

function stripOption(
  strip: StripPoint[],
  windows: readonly LaunchWindow[],
  selected: IsoDate,
  basePayloadKg: number,
): EChartOption {
  const accent = cssVar('--accent')
  const mono = cssVar('--mono')
  const first = strip[0].date
  const last = strip[strip.length - 1].date
  const inStrip = windows.filter((w) => w.close >= first && w.open <= last)

  return {
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { color: cssVar('--chart-axis'), fontFamily: mono, fontSize: 13 },
    grid: { left: 48, right: 12, top: 14, bottom: 22 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: cssVar('--bg-raised'),
      borderColor: cssVar('--rule-strong'),
      borderRadius: 0,
      textStyle: { color: cssVar('--text'), fontFamily: mono },
      formatter: (params: unknown) => {
        const [p] = params as { value: [string, number] }[]
        const [date, kg] = p.value
        return `${date}<br/>${fmt(kg)} kg · ${Math.round((100 * kg) / basePayloadKg)}%`
      },
    },
    xAxis: {
      type: 'time',
      min: first,
      max: last,
      axisLine: { lineStyle: { color: cssVar('--rule-strong') } },
      axisTick: { show: false },
      splitLine: { show: false },
      axisLabel: { formatter: '{yyyy}-{MM}', hideOverlap: true },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: basePayloadKg,
      interval: basePayloadKg / 2,
      axisLabel: { formatter: (v: number) => `${Math.round((100 * v) / basePayloadKg)}%` },
      splitLine: { lineStyle: { color: cssVar('--chart-grid'), type: 'dashed' } },
    },
    series: [
      {
        type: 'line',
        name: 'Capacity',
        data: strip.map((p) => [p.date, p.payloadFactor * basePayloadKg]),
        symbol: 'none',
        lineStyle: { color: accent, width: 1.5 },
        areaStyle: { color: accent, opacity: 0.08 },
        markArea: {
          silent: true,
          itemStyle: { color: cssVar('--nominal'), opacity: 0.12 },
          data: inStrip.map((w) => [{ xAxis: w.open }, { xAxis: w.close }]),
        },
        markPoint: {
          silent: true,
          symbol: STAR,
          symbolSize: 12,
          itemStyle: { color: cssVar('--nominal') },
          label: { show: false },
          data: inStrip
            .filter((w) => w.bestDate >= first && w.bestDate <= last)
            .map((w) => ({ coord: [w.bestDate, basePayloadKg], symbolOffset: [0, -4] })),
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { show: false },
          lineStyle: { color: cssVar('--text'), type: 'solid', width: 1 },
          data: [{ xAxis: selected }],
        },
      },
    ],
  }
}

/** Launch date for one cargo flight, with what that date costs: transit, arrival and capacity. */
export function LaunchDatePicker({ plan, flight, onChange, showChart = true }: Props) {
  const id = useId()
  const { destination } = plan
  const range = launchDateRange(destination)
  const launchDate = clampLaunchDate(destination, flight.launchDate)
  const basePayloadKg = plan.baseVehiclePayloadKg
  // Memoized on plain values so editing other flights or the setup form doesn't redraw this chart.
  const option = useMemo(
    () =>
      stripOption(
        shipCostStrip(destination, launchDate),
        launchWindows(destination),
        launchDate,
        basePayloadKg,
      ),
    [destination, launchDate, basePayloadKg],
  )

  const cap = flightCapacity(plan, { ...flight, launchDate })
  const { transfer } = cap
  const best = nearestBestDate(destination, launchDate)
  const pct = Math.round(transfer.payloadFactor * 100)
  const tone: Tone = cap.overCapacity ? 'critical' : factorTone(transfer.payloadFactor)

  return (
    <div className="launch-picker">
      <div className="launch-picker-controls">
        <label className="field-label" htmlFor={id}>
          {flight.label}
        </label>
        <input
          id={id}
          className="date-input"
          type="date"
          value={launchDate}
          min={range?.first}
          max={range?.last}
          required
          onChange={(e) => e.target.value && onChange(clampLaunchDate(destination, e.target.value))}
        />
        <button
          type="button"
          className="btn btn-small"
          disabled={best === launchDate}
          onClick={() => onChange(best)}
        >
          ★ Pick the best date
        </button>
      </div>

      <p className={`launch-readout is-${tone}`} aria-live="polite">
        Leaves {launchDate}, arrives {transfer.arrivalDate} ({transfer.transitDays} days) · can
        carry {fmt(cap.capacityKg)} kg ({pct}% of the best date)
        {cap.overCapacity && (
          <>
            {' '}
            · packed {fmt(cap.massKg)} kg, {fmt(cap.massKg - cap.capacityKg)} kg too heavy
          </>
        )}
      </p>

      {showChart && (
        <EChart
          option={option}
          height={96}
          label={`${flight.label}: launch capacity by date, ${pct}% on ${launchDate}`}
        />
      )}
    </div>
  )
}
