import type { MissionPlan } from '../lib/types'
import type { PresetId } from '../lib/presets'
import { PRESETS } from '../lib/presets'

export type SavedMission = { id: string; name: string; plan: MissionPlan }

/** What the dropdown shows: a preset, a saved mission, or an edited plan not saved yet. */
export type MissionSelection =
  { kind: 'preset'; id: PresetId } | { kind: 'saved'; id: string } | { kind: 'custom' }

type Props = {
  value: MissionSelection
  saved: readonly SavedMission[]
  onPreset: (id: PresetId) => void
  onSaved: (id: string) => void
  onNew: () => void
  /** Saves the current plan as a new mission. */
  onSave: () => void
}

const NEW = 'new'
const CUSTOM = 'custom'
const encode = (v: MissionSelection) => (v.kind === 'custom' ? CUSTOM : `${v.kind}:${v.id}`)

/** Header mission switcher: presets, saved missions, and "New mission…" (opens the wizard). */
export function MissionPicker({ value, saved, onPreset, onSaved, onNew, onSave }: Props) {
  return (
    <div className="mission-picker">
      <label className="preset-picker">
        <span className="preset-label">Mission</span>
        <select
          className="preset-select"
          value={encode(value)}
          title={
            value.kind === 'preset' ? PRESETS.find((p) => p.id === value.id)?.summary : undefined
          }
          onChange={(e) => {
            const v = e.target.value
            if (v === NEW) return onNew()
            const [kind, id] = v.split(':')
            if (kind === 'preset') onPreset(id as PresetId)
            if (kind === 'saved') onSaved(id)
          }}
        >
          <optgroup label="Demo scenarios">
            {PRESETS.map((p) => (
              <option key={p.id} value={`preset:${p.id}`}>
                {p.label}
              </option>
            ))}
          </optgroup>
          {saved.length > 0 && (
            <optgroup label="Your missions">
              {saved.map((m) => (
                <option key={m.id} value={`saved:${m.id}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          )}
          <option value={CUSTOM} disabled>
            Unsaved changes
          </option>
          <option value={NEW}>＋ New mission…</option>
        </select>
      </label>
      <button
        type="button"
        className="btn btn-small"
        onClick={onSave}
        disabled={value.kind !== 'custom'}
        title={value.kind === 'custom' ? 'Save this plan as a mission' : 'No unsaved changes'}
      >
        Save
      </button>
    </div>
  )
}
