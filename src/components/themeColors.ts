import { RESOURCE_KEYS, type ResourceKey } from '../lib/types'

// Charts can't use CSS variables directly, so they read the theme tokens at render time.

export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export function resourceColors(): Record<ResourceKey, string> {
  const colors = {} as Record<ResourceKey, string>
  for (const key of RESOURCE_KEYS) colors[key] = cssVar(`--res-${key}`)
  return colors
}

export const RESOURCE_UNITS: Record<ResourceKey, string> = {
  o2: 'kg',
  water: 'kg',
  food: 'kg',
  spares: 'parts',
  fuel: 'kg',
}

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  o2: 'Oxygen',
  water: 'Water',
  food: 'Food',
  spares: 'Spare parts',
  fuel: 'Rover fuel',
}
