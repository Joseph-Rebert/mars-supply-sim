import { useMemo, useState } from 'react'
import { EChart, type EChartOption } from './components/EChart'
import { MissionSetupForm } from './components/MissionSetupForm'
import { Panel } from './components/Panel'
import { Readout } from './components/Readout'
import { StatTile, type Tone } from './components/StatTile'
import { cssVar, RESOURCE_LABELS, resourceColors } from './components/themeColors'
import { fakePlan, fakeResult } from './lib/fake'
import { CONSUMABLE_KEYS, type SimResult } from './lib/types'

// App state is one MissionPlan edited by the setup form. Results are placeholders from fakeResult()
// until the runner (GEA-22) and results view (GEA-27) land; the manifest editor is GEA-16.

const TONE_LABEL: Record<Tone, string> = {
  nominal: '● Nominal',
  caution: '▲ Caution',
  critical: '▼ Critical',
}

function survivalTone(rate: number): Tone {
  if (rate >= 0.9) return 'nominal'
  if (rate >= 0.7) return 'caution'
  return 'critical'
}

/** Console-style thousands separator: 10 550. */
function fmt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

function timelineOption(result: SimResult): EChartOption {
  const colors = resourceColors()
  const axis = cssVar('--chart-axis')
  const grid = cssVar('--chart-grid')
  const mono = cssVar('--mono')
  const days = Array.from({ length: result.durationDays }, (_, i) => i)

  return {
    backgroundColor: 'transparent',
    animation: false,
    textStyle: { color: axis, fontFamily: mono, fontSize: 13 },
    grid: { left: 56, right: 24, top: 16, bottom: 32 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: cssVar('--bg-raised'),
      borderColor: cssVar('--rule-strong'),
      borderRadius: 0,
      textStyle: { color: cssVar('--text'), fontFamily: mono },
      valueFormatter: (v: unknown) => `${fmt(Number(v))} kg`,
    },
    xAxis: {
      type: 'category',
      data: days,
      boundaryGap: false,
      axisLine: { lineStyle: { color: cssVar('--rule-strong') } },
      axisTick: { show: false },
      axisLabel: { interval: 149, formatter: (d: string) => `D${d}` },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => fmt(v) },
      splitLine: { lineStyle: { color: grid, type: 'dashed' } },
    },
    series: CONSUMABLE_KEYS.flatMap((key) => {
      const { p10, p50, p90 } = result.bands[key]
      const color = colors[key]
      // P10–P90 band: invisible lower bound, then the band height stacked on top.
      return [
        {
          type: 'line',
          data: p10,
          stack: key,
          symbol: 'none',
          lineStyle: { opacity: 0 },
          silent: true,
        },
        {
          type: 'line',
          data: p90.map((v, i) => v - p10[i]),
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
        },
      ]
    }),
  }
}

function App() {
  const [plan, setPlan] = useState(fakePlan)
  // Placeholder results stay fixed until the real runner (GEA-22) and results view (GEA-27) land.
  const result = useMemo(() => fakeResult(), [])
  const option = useMemo(() => timelineOption(result), [result])

  const tone = survivalTone(result.survivalRate)

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">Ares Supply</h1>
        <p className="app-subtitle">─ Mission survival planner</p>
        <div className="app-status">
          <span className="status-dot" aria-hidden="true" />
          <span className="app-status-text">Preview · placeholder results</span>
        </div>
      </header>

      <main className="layout">
        <div className="column">
          <Panel title="Mission setup">
            <MissionSetupForm plan={plan} onChange={setPlan} />
          </Panel>
          <Panel title="Cargo manifest">
            <div className="readouts">
              {plan.flights.map((f) => (
                <Readout key={f.id} label={f.label} value={f.launchDate} />
              ))}
            </div>
            <p className="note">Launch windows and mass budget arrive with GEA-16.</p>
          </Panel>
        </div>

        <div className="column">
          <Panel title="Probability of crew survival">
            <div className="verdict">
              <div className="verdict-row">
                <span className={`verdict-value is-${tone}`}>
                  {(result.survivalRate * 100).toFixed(1)}
                  <span className="verdict-unit">%</span>
                </span>
                <span className={`status-tag is-${tone}`}>{TONE_LABEL[tone]}</span>
              </div>
            </div>
            <div className="stat-row">
              <StatTile label="Launch mass" value={fmt(result.totalLaunchMassKg)} unit="kg" />
              <StatTile label="Duration" value={`${result.durationDays}`} unit="d" />
              <StatTile label="Runs" value={fmt(result.runs)} />
            </div>
          </Panel>
          <Panel title="Resource timeline · P10–P90">
            <div className="legend">
              {CONSUMABLE_KEYS.map((key) => (
                <span key={key} className="legend-item">
                  <span className={`swatch swatch-${key}`} aria-hidden="true" />
                  {RESOURCE_LABELS[key]}
                </span>
              ))}
            </div>
            <EChart option={option} height={250} />
          </Panel>
        </div>
      </main>
    </div>
  )
}

export default App
