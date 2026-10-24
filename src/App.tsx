import { useMemo, useState } from 'react'
import { EChart, type EChartOption } from './components/EChart'
import { Panel } from './components/Panel'
import { StatTile, type Tone } from './components/StatTile'
import { cssVar, RESOURCE_LABELS, resourceColors } from './components/themeColors'
import { fakeResult } from './lib/fake'
import { CONSUMABLE_KEYS, type SimResult } from './lib/types'

// Shell with placeholder content from fakeResult(). The setup form (GEA-15) and the real results
// view (GEA-27) replace the panel contents; the layout and styles stay.

function survivalTone(rate: number): Tone {
  if (rate >= 0.9) return 'nominal'
  if (rate >= 0.7) return 'caution'
  return 'critical'
}

function timelineOption(result: SimResult): EChartOption {
  const colors = resourceColors()
  const axis = cssVar('--chart-axis')
  const grid = cssVar('--chart-grid')
  const days = Array.from({ length: result.durationDays }, (_, i) => i)

  return {
    backgroundColor: 'transparent',
    textStyle: { color: axis, fontFamily: cssVar('--mono'), fontSize: 14 },
    grid: { left: 64, right: 16, top: 24, bottom: 40 },
    tooltip: { trigger: 'axis', valueFormatter: (v: unknown) => `${Math.round(Number(v))} kg` },
    xAxis: {
      type: 'category',
      data: days,
      name: 'day',
      boundaryGap: false,
      axisLine: { lineStyle: { color: grid } },
    },
    yAxis: { type: 'value', name: 'kg', splitLine: { lineStyle: { color: grid } } },
    series: CONSUMABLE_KEYS.flatMap((key) => {
      const { p10, p50, p90 } = result.bands[key]
      const color = colors[key]
      const name = RESOURCE_LABELS[key]
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
          areaStyle: { color, opacity: 0.18 },
          silent: true,
        },
        { type: 'line', name, data: p50, symbol: 'none', lineStyle: { color, width: 2 } },
      ]
    }),
  }
}

function App() {
  const result = useMemo(() => fakeResult(), [])
  const option = useMemo(() => timelineOption(result), [result])
  const [crew, setCrew] = useState(4)

  const pct = Math.round(result.survivalRate * 100)

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          ARES <span className="app-title-accent">SUPPLY</span>
        </h1>
        <p className="app-tagline">Will this crew survive, and what should we change so they do?</p>
        <div className="app-status">
          <span className="status-dot" aria-hidden="true" />
          <span className="app-status-text">PREVIEW · PLACEHOLDER DATA</span>
        </div>
      </header>

      <main className="layout">
        <div className="column">
          <Panel title="Mission setup">
            <div className="field">
              <div className="field-row">
                <label className="field-label" htmlFor="crew">
                  Crew size
                </label>
                <span className="field-value">{crew} people</span>
              </div>
              <input
                id="crew"
                className="slider"
                type="range"
                min={2}
                max={8}
                value={crew}
                onChange={(e) => setCrew(Number(e.target.value))}
              />
            </div>
            <p className="muted">Full setup form arrives with GEA-15.</p>
            <button className="btn btn-primary btn-block" type="button" disabled>
              Run mission
            </button>
          </Panel>
          <Panel title="Cargo manifest">
            <p className="muted">Launch windows and mass budget arrive with GEA-16.</p>
          </Panel>
        </div>

        <div className="column">
          <div className="stat-row">
            <StatTile
              hero
              label="chance the crew survives"
              value={`${pct}`}
              unit="%"
              tone={survivalTone(result.survivalRate)}
            />
          </div>
          <div className="stat-row">
            <StatTile
              label="total launch mass"
              value={Math.round(result.totalLaunchMassKg).toLocaleString('en-US')}
              unit="kg"
            />
            <StatTile label="mission length" value={`${result.durationDays}`} unit="days" />
            <StatTile label="simulated runs" value={result.runs.toLocaleString('en-US')} />
          </div>
          <Panel title="Resource timeline · P10–P90">
            <div className="legend">
              {CONSUMABLE_KEYS.map((key) => (
                <span key={key} className="legend-item">
                  <span className={`swatch swatch-${key}`} aria-hidden="true" />
                  {RESOURCE_LABELS[key]}
                </span>
              ))}
            </div>
            <EChart option={option} height={260} />
          </Panel>
        </div>
      </main>
    </div>
  )
}

export default App
