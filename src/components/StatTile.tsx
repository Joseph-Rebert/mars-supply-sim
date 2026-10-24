export type Tone = 'nominal' | 'caution' | 'critical'

type Props = {
  label: string
  value: string
  unit?: string
  tone?: Tone
  hero?: boolean
}

export function StatTile({ label, value, unit, tone, hero }: Props) {
  const classes = ['stat-tile', tone && `is-${tone}`, hero && 'is-hero'].filter(Boolean).join(' ')
  return (
    <div className={classes}>
      <span className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
