import { useMemo } from 'react'
import { EChart, type EChartOption } from './components/EChart'
import { mulberry32 } from './lib/rng'

// Placeholder shell proving the pipeline (React + ECharts + theme + deploy) works.
// Replaced by the real layout in GEA-10 / GEA-27.
function smokeTestOption(): EChartOption {
  const rng = mulberry32(7)
  const days = Array.from({ length: 120 }, (_, i) => i)
  const p50 = days.map((d) => 100 - d * 0.6 + (rng() - 0.5) * 4)
  const p10 = p50.map((v, i) => v - 4 - i * 0.12)
  const p90 = p50.map((v, i) => v + 4 + i * 0.12)

  return {
    backgroundColor: 'transparent',
    textStyle: { color: '#8b98a9', fontFamily: 'ui-monospace, monospace' },
    grid: { left: 48, right: 16, top: 24, bottom: 32 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: days, name: 'day', boundaryGap: false },
    yAxis: { type: 'value', name: 'water (kg)', splitLine: { lineStyle: { color: '#263040' } } },
    series: [
      // P10–P90 band: invisible lower bound, then the band height stacked on top
      { type: 'line', data: p10, stack: 'band', lineStyle: { opacity: 0 }, symbol: 'none' },
      {
        type: 'line',
        data: p90.map((v, i) => v - p10[i]),
        stack: 'band',
        lineStyle: { opacity: 0 },
        areaStyle: { color: '#39c5cf', opacity: 0.2 },
        symbol: 'none',
      },
      { type: 'line', data: p50, symbol: 'none', lineStyle: { color: '#39c5cf', width: 2 } },
    ],
  }
}

function App() {
  const option = useMemo(() => smokeTestOption(), [])

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 24, display: 'grid', gap: 16 }}>
      <header>
        <h1 className="mono">ARES SUPPLY</h1>
        <p className="muted">
          Will this crew survive — and what should we change so they do? (scaffold, GEA-5)
        </p>
      </header>
      <section className="panel">
        <h2 style={{ fontSize: 14 }} className="muted mono">
          CHART SMOKE TEST — fake data
        </h2>
        <EChart option={option} />
      </section>
    </main>
  )
}

export default App
