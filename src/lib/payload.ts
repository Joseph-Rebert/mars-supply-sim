import { FALCON_HEAVY_EXPENDABLE_PAYLOAD_KG_BY_C3 } from './data'

/**
 * Launch vehicle payload (kg) at a given C3 (km²/s²), linearly interpolated on the NASA LSP curve.
 * Below the curve's lowest C3 the payload is held flat; above its highest it tapers to 0.
 */
export function payloadKgAtC3(
  c3: number,
  curve: readonly (readonly [number, number])[] = FALCON_HEAVY_EXPENDABLE_PAYLOAD_KG_BY_C3,
): number {
  if (c3 <= curve[0][0]) return curve[0][1]
  for (let i = 1; i < curve.length; i++) {
    const [c3Hi, kgHi] = curve[i]
    if (c3 <= c3Hi) {
      const [c3Lo, kgLo] = curve[i - 1]
      return kgLo + ((kgHi - kgLo) * (c3 - c3Lo)) / (c3Hi - c3Lo)
    }
  }
  // Extend the last segment's slope until it hits zero.
  const [c3A, kgA] = curve[curve.length - 2]
  const [c3B, kgB] = curve[curve.length - 1]
  return Math.max(0, kgB + ((kgB - kgA) * (c3 - c3B)) / (c3B - c3A))
}
