type Props = {
  label: string
  value: string
}

/** Console-style row: LABEL ........ VALUE. Wrap several in `.readouts`. */
export function Readout({ label, value }: Props) {
  return (
    <div className="readout">
      <span className="readout-label">{label}</span>
      <span className="readout-leader" aria-hidden="true" />
      <span className="readout-value">{value}</span>
    </div>
  )
}
