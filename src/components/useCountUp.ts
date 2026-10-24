import { useEffect, useRef, useState } from 'react'

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Animates a number from its previous value to `target` (ease-out), so the audience sees a jump
 * happen. Shows `target` straight away when the viewer prefers reduced motion.
 */
export function useCountUp(target: number, durationMs = 2000): number {
  const [shown, setShown] = useState(target)
  const from = useRef(target)

  useEffect(() => {
    const start = from.current
    from.current = target
    if (start === target || prefersReducedMotion()) return
    const t0 = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const p = Math.min(1, (now - t0) / durationMs)
      setShown(start + (target - start) * (1 - (1 - p) ** 3))
      if (p < 1) frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])

  return prefersReducedMotion() ? target : shown
}
