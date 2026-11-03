import { useId } from 'react'
import { MODEL_LABEL, type Level, type ModelChoice, type ModelId, type Point } from '../lib/forecast'
import { DEFAULT_START, signed, type TempUnit, type Vital } from '../lib/vitals'
import s from './Settings.module.css'

export type SettingsValue = {
  model: ModelChoice
  from?: number
  horizon: number
  level: Level
  unit: TempUnit
  enso: boolean
  /** El Niño / La Niña offsets in °C keyed by forecast year */
  offsets: Record<number, number>
}

const CHOICES: ModelChoice[] = ['auto', 'linear', 'quadratic', 'holt', 'ensemble']
const MIN_TRAIN = 10

export function readSettings(p: URLSearchParams, vital?: Vital): SettingsValue {
  const model = CHOICES.includes(p.get('model') as ModelChoice) ? (p.get('model') as ModelChoice) : 'auto'
  const h = Number(p.get('h'))
  const fromParam = p.get('from') ? Number(p.get('from')) : undefined
  let from = Number.isInteger(fromParam) ? fromParam : vital && DEFAULT_START[vital.id]
  if (vital && from != null) from = Math.min(Math.max(from, vital.annual[0].year), vital.annual.at(-1)!.year - MIN_TRAIN)
  const offsets: Record<number, number> = {}
  for (const pair of (p.get('adj') ?? '').split(',')) {
    const [y, v] = pair.split(':').map(Number)
    if (Number.isInteger(y) && Number.isFinite(v)) offsets[y] = Math.max(-1, Math.min(1, v))
  }
  return {
    model,
    from,
    horizon: Number.isInteger(h) && h >= 1 && h <= 5 ? h : 2,
    level: p.get('band') === '95' ? 95 : 80,
    unit: p.get('unit') === 'F' ? 'F' : 'C',
    enso: p.get('enso') === '1',
    offsets,
  }
}

/** Only non-default settings go into the URL, so the plain route stays short. */
export function writeSettings(v: SettingsValue, vital?: Vital): URLSearchParams {
  const p = new URLSearchParams()
  if (v.model !== 'auto') p.set('model', v.model)
  const defFrom = vital ? (DEFAULT_START[vital.id] ?? vital.annual[0].year) : undefined
  if (v.from != null && v.from !== defFrom) p.set('from', String(v.from))
  if (v.horizon !== 2) p.set('h', String(v.horizon))
  if (v.level !== 80) p.set('band', String(v.level))
  if (v.unit !== 'C') p.set('unit', v.unit)
  if (v.enso) p.set('enso', '1')
  const adj = Object.entries(v.offsets).filter(([, x]) => x !== 0)
  if (adj.length) p.set('adj', adj.map(([y, x]) => `${y}:${+x.toFixed(3)}`).join(','))
  return p
}

type Props = {
  value: SettingsValue
  onChange: (v: SettingsValue) => void
  series: Point[]
  temperature?: boolean
  defaultFrom: number
  chosen: ModelId
}

export function Settings({ value, onChange, series, temperature, defaultFrom, chosen }: Props) {
  const uid = useId()
  const set = (patch: Partial<SettingsValue>) => onChange({ ...value, ...patch })
  const first = series[0].year
  const last = series.at(-1)!.year
  const k = value.unit === 'F' ? 1.8 : 1
  const unit = value.unit === 'F' ? '°F' : '°C'
  const years = Array.from({ length: value.horizon }, (_, i) => last + i + 1)

  return (
    <aside className="card" aria-labelledby={`${uid}-title`}>
      <div className="card-head">
        <div>
          <h3 id={`${uid}-title`}>Model configuration</h3>
          <p>Changes are saved in the URL.</p>
        </div>
      </div>
      <div className={s.panel}>

      <label className={s.field}>
        <span className={s.label}>Model</span>
        <select value={value.model} onChange={(e) => set({ model: e.target.value as ModelChoice })}>
          {CHOICES.map((c) => (
            <option key={c} value={c}>
              {MODEL_LABEL[c]}
            </option>
          ))}
        </select>
        {value.model === 'auto' && <span className={s.note}>Selected: {MODEL_LABEL[chosen]}</span>}
      </label>

      <div className={s.field}>
        <label className={s.label} htmlFor={`${uid}-from`}>
          Training starts <output className="mono">{value.from ?? defaultFrom}</output>
        </label>
        <input
          id={`${uid}-from`}
          type="range"
          min={first}
          max={last - MIN_TRAIN}
          step={1}
          value={value.from ?? defaultFrom}
          onChange={(e) => set({ from: Number(e.target.value) })}
        />
        <span className={s.note}>
          {first}–{last - MIN_TRAIN}, at least {MIN_TRAIN} years kept.{' '}
          {(value.from ?? defaultFrom) !== defaultFrom && (
            <button type="button" className={s.reset} onClick={() => set({ from: defaultFrom })}>
              Reset to {defaultFrom}
            </button>
          )}
        </span>
      </div>

      <fieldset className={s.field}>
        <legend className={s.label}>Horizon, years</legend>
        <div className={s.seg}>
          {[1, 2, 3, 4, 5].map((h) => (
            <label key={h}>
              <input type="radio" name={`${uid}-h`} checked={value.horizon === h} onChange={() => set({ horizon: h })} />
              <span className="mono">{h}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={s.field}>
        <legend className={s.label}>Prediction interval</legend>
        <div className={s.seg}>
          {([80, 95] as Level[]).map((l) => (
            <label key={l}>
              <input type="radio" name={`${uid}-band`} checked={value.level === l} onChange={() => set({ level: l })} />
              <span className="mono">{l}%</span>
            </label>
          ))}
        </div>
      </fieldset>

      {temperature && (
        <>
          <fieldset className={s.field}>
            <legend className={s.label}>Temperature unit</legend>
            <div className={s.seg}>
              {(['C', 'F'] as TempUnit[]).map((u) => (
                <label key={u}>
                  <input type="radio" name={`${uid}-unit`} checked={value.unit === u} onChange={() => set({ unit: u })} />
                  <span className="mono">°{u}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={s.field}>
            <label className={s.check}>
              <input type="checkbox" checked={value.enso} onChange={(e) => set({ enso: e.target.checked })} />
              <span>El Niño / La Niña adjustment</span>
            </label>
            {value.enso && (
              <div className={s.offsets}>
                <p className={s.note}>
                  Added to each forecast year. A strong El Niño typically lifts the following year by roughly +0.1 to +0.2 °C; La Niña lowers it by a similar amount.
                </p>
                {years.map((y) => (
                  <label key={y} className={s.offset}>
                    <span className="mono">{y}</span>
                    <input
                      type="range"
                      min={-0.3}
                      max={0.3}
                      step={0.01}
                      value={value.offsets[y] ?? 0}
                      onChange={(e) => set({ offsets: { ...value.offsets, [y]: Number(e.target.value) } })}
                      aria-label={`El Niño offset for ${y}`}
                      aria-valuetext={`${signed((value.offsets[y] ?? 0) * k, 2)} ${unit}`}
                    />
                    <output className="mono">
                      {signed((value.offsets[y] ?? 0) * k, 2)} {unit}
                    </output>
                  </label>
                ))}
              </div>
            )}
          </div>
        </>
      )}
      </div>
    </aside>
  )
}
