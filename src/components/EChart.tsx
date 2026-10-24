import { useEffect, useRef } from 'react'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// Register only what we use to keep the bundle small. Add modules here as charts need them.
echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  MarkAreaComponent,
  CanvasRenderer,
])

export type EChartOption = echarts.EChartsCoreOption

type Props = {
  option: EChartOption
  height?: number | string
  className?: string
}

// Thin wrapper: one ECharts instance per mount, option updates in place, resizes with its container.
// overflow: hidden lets the container shrink below the canvas's last width so ResizeObserver fires.
export function EChart({ option, height = 320, className }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts | null>(null)

  useEffect(() => {
    if (!el.current) return
    const instance = echarts.init(el.current, undefined, { renderer: 'canvas' })
    chart.current = instance
    const ro = new ResizeObserver(() => instance.resize())
    ro.observe(el.current)
    return () => {
      ro.disconnect()
      instance.dispose()
      chart.current = null
    }
  }, [])

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true })
  }, [option])

  return (
    <div
      ref={el}
      className={className}
      style={{ width: '100%', minWidth: 0, overflow: 'hidden', height }}
    />
  )
}
