import type { MouseEvent } from 'react'
import { MODEL_LABEL, runForecast } from '../lib/forecast'
import { href } from '../lib/route'
import { DEFAULT_START, VITAL_IDS, display, num, signed, type TempUnit, type Vital, type VitalId } from '../lib/vitals'
import s from './Summary.module.css'

type Props = {
  vitals: Record<VitalId, Vital>
  active?: VitalId
  own: boolean
  unit: TempUnit
  navigate: (path: string) => void
}

export function Summary({ vitals, active, own, unit, navigate }: Props) {
  const go = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate(path)
  }

  return (
    <section className={s.strip} aria-labelledby="rise-h">
      <div className={s.head}>
        <h2 id="rise-h">Which parameters rise in the next 2 years?</h2>
        <p>Auto-selected model on each record's default training window; select a row to open its chart.</p>
      </div>
      <ul className={s.list}>
        {VITAL_IDS.map((id) => {
          const v = vitals[id]
          const r = runForecast(v.annual, { startYear: DEFAULT_START[id], horizon: 2 })
          const last = v.annual.at(-1)!
          const f = r.forecast[1]
          const d = display(v, unit)
          const delta = (f.value - last.value) * d.k
          const rising = delta > 0
          return (
            <li key={id}>
              <a href={href(id)} onClick={go(id)} className={s.item} aria-current={active === id ? 'page' : undefined}>
                <span className={s.name}>{v.short}</span>
                <span className={s.unit}>{d.unit}</span>
                <span className={`${s.reading} ${s.rNow}`}>
                  <span className={s.lbl}>{last.year} record</span>
                  <span className={`mono ${s.now}`}>{num(last.value * d.k, d.decimals)}</span>
                </span>
                <span className={`${s.reading} ${s.rFc}`}>
                  <span className={s.lbl}>{f.year} forecast</span>
                  <span className="mono">{num(f.value * d.k, d.decimals)}</span>
                </span>
                <span className={`${s.chip} ${rising ? s.up : s.down}`}>
                  <span aria-hidden>{rising ? '▲' : '▼'}</span> {rising ? 'Rising' : 'Falling'}
                  <span className="mono"> {signed(delta, d.decimals)}</span>
                </span>
                <span className={s.model}>{MODEL_LABEL[r.model]}</span>
              </a>
            </li>
          )
        })}
        <li>
          <a href={href('your-data')} onClick={go('your-data')} className={`${s.item} ${s.ownItem}`} aria-current={own ? 'page' : undefined}>
            <span className={s.name}>Your data</span>
            <span className={s.unit}>paste year,value</span>
            <span className={s.ownText}>Run the same four models and backtest on any annual series.</span>
          </a>
        </li>
      </ul>
    </section>
  )
}
