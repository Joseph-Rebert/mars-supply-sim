import type { Tone } from './StatTile'

/** Console-style thousands separator with a thin space: 10 550. */
export function fmt(n: number): string {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Survival thresholds from GEA-27: red below 70%, amber 70–90%, green from 90%. */
export function survivalTone(rate: number): Tone {
  if (rate >= 0.9) return 'nominal'
  if (rate >= 0.7) return 'caution'
  return 'critical'
}

export const TONE_LABEL: Record<Tone, string> = {
  nominal: '● Nominal',
  caution: '▲ Caution',
  critical: '▼ Critical',
}
