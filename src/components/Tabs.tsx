import { useRef, type KeyboardEvent } from 'react'
import { panelId, tabId } from './tabIds'

export type TabDef<T extends string> = { id: T; label: string }

type Props<T extends string> = {
  tabs: readonly TabDef<T>[]
  active: T
  onChange: (id: T) => void
  /** Prefix for tab / panel ids, so panels can point back with aria-labelledby. */
  idPrefix: string
  label: string
}

/** WAI-ARIA tablist: one tab in the tab order, arrow keys / Home / End move and activate. */
export function Tabs<T extends string>({ tabs, active, onChange, idPrefix, label }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = tabs.length - 1
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % tabs.length
        : e.key === 'ArrowLeft'
          ? (index - 1 + tabs.length) % tabs.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : -1
    if (next < 0) return
    e.preventDefault()
    onChange(tabs[next].id)
    refs.current[next]?.focus()
  }

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          type="button"
          role="tab"
          id={tabId(idPrefix, t.id)}
          aria-selected={t.id === active}
          aria-controls={panelId(idPrefix, t.id)}
          tabIndex={t.id === active ? 0 : -1}
          className={t.id === active ? 'tab is-active' : 'tab'}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
