import type { SuggestedFix, WeakestLink } from '../lib/analysis'
import { fmt } from './format'

export type FixState = SuggestedFix | 'searching'

type Props = {
  link: WeakestLink
  fix: FixState
  /** Why Apply fix is unavailable right now (e.g. the plan changed since the run), if it is. */
  applyBlockedReason?: string
  applying: boolean
  onApply: () => void
}

const pct = (x: number) => `${Math.round(x * 100)}%`

/** Why the crew dies (top causes) and, below a rule, the one-click fix. One box to save height. */
export function WeakestLinkCallout({ link, fix, applyBlockedReason, applying, onApply }: Props) {
  if (link.status === 'allClear') {
    return (
      <div className="callout is-nominal" role="status">
        <p className="callout-title">● All clear</p>
        <p className="callout-text">{link.sentence}</p>
      </div>
    )
  }

  return (
    <div className="callout is-critical">
      <div role="alert">
        <p className="callout-title">▼ Weakest link</p>
        <p className="callout-text">{link.sentence}</p>
      </div>
      <ol className="cause-list" aria-label="Top causes">
        {link.causes.map((c) => (
          <li key={c.key} className="cause">
            <span className="cause-label">{c.label}</span>
            <span className="cause-bar" aria-hidden="true">
              <span style={{ width: `${Math.max(2, c.share * 100)}%` }} />
            </span>
            <span className="cause-share">{pct(c.share)}</span>
          </li>
        ))}
      </ol>

      <div className="fix-section">
        <p className="callout-title fix-title">Suggested fix</p>
        {fix === 'searching' ? (
          <p className="callout-text muted">Finding a fix… (re-simulating candidates)</p>
        ) : fix.status !== 'fix' ? (
          <p className="callout-text muted">{fix.sentence}</p>
        ) : (
          <>
            <p className="callout-text">{fix.description}</p>
            <div className="fix-row">
              <span className="fix-odds mono">
                {pct(fix.survivalBefore)} → <strong>{pct(fix.survivalAfter)}</strong>
              </span>
              <span className="fix-mass mono">
                {fix.massDeltaKg >= 0 ? '+' : '−'}
                {fmt(Math.abs(fix.massDeltaKg))} kg
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onApply}
                disabled={applying || applyBlockedReason !== undefined}
                title={applyBlockedReason}
              >
                {applying ? 'Applying…' : 'Apply fix'}
              </button>
            </div>
            {applyBlockedReason && <p className="hint">{applyBlockedReason}</p>}
          </>
        )}
      </div>
    </div>
  )
}
