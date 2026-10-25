import type { NutritionWarning } from '../lib/analysis'

type Props = {
  warning: NutritionWarning
  /** Why the fix can't be applied right now (e.g. the plan changed since the run), if so. */
  applyBlockedReason?: string
  applying: boolean
  onApply: () => void
}

/** A diet problem that won't end the mission but will wear the crew down, with its one-click fix. */
export function NutritionNote({ warning, applyBlockedReason, applying, onApply }: Props) {
  return (
    <div className="callout is-caution" role="status">
      <p className="callout-title">▲ Vitamin C</p>
      <p className="callout-text">{warning.sentence}</p>
      {warning.fix && (
        <div className="fix-row">
          <p className="callout-text">{warning.fix.description}</p>
          <button
            type="button"
            className="btn btn-small"
            onClick={onApply}
            disabled={applying || applyBlockedReason !== undefined}
            title={applyBlockedReason}
          >
            {applying ? 'Applying…' : 'Add tablets'}
          </button>
        </div>
      )}
    </div>
  )
}
