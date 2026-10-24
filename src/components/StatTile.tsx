export type Tone = 'nominal' | 'caution' | 'critical'

type Props = {
  label: string
  value: string
  unit?: string
}

/** One cell in a `.stat-row`: small caps label over a mono value. */
export function StatTile({ label, value, unit }: Props) {
  return (
    <div className="stat-cell">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </span>
    </div>
  )
}
