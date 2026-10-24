import { useEffect, useState } from 'react'

const pad = (n: number) => String(n).padStart(2, '0')

/** Mission-control style UTC clock for the header, ticking once a second. */
export function MissionClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const time = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`
  return (
    // Not a live region: a screen reader announcing every second would drown everything else.
    <time className="mission-clock" dateTime={now.toISOString()} aria-label={`UTC time ${time}`}>
      <span className="mission-clock-zone">UTC</span> {time}
    </time>
  )
}
