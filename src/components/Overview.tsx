import type { MouseEvent } from 'react'
import { MODEL_LABEL, runForecast, type ForecastPoint, type Point } from '../lib/forecast'
import { href } from '../lib/route'
import { DEFAULT_START, VITAL_IDS, display, num, signed, type TempUnit, type Vital, type VitalId } from '../lib/vitals'
import s from './Overview.module.css'

/** How each record reads inside a sentence. */
export const NOUN: Record<VitalId, string> = {
  co2: 'carbon dioxide',
  temperature: 'global temperature',
  methane: 'methane',
  sealevel: 'sea level',
  seaice: 'September Arctic sea ice',
}

type Props = {
  vitals: Record<VitalId, Vital>
  active?: VitalId
  unit: TempUnit
  navigate: (path: string) => void
}

export function Overview({ vitals, active, unit, navigate }: Props) {
  const rows = VITAL_IDS.map((id) => {
    const v = vitals[id]
    const r = runForecast(v.annual, { startYear: DEFAULT_START[id], horizon: 2 })
    const last = v.annual.at(-1)!
    const f = r.forecast[1]
    const d = display(v, unit)
    const delta = f.value - last.value
    // a move smaller than the interval half-width is not distinguishable from no change
    return { id, v, r, last, f, d, delta, rising: delta > 0, small: Math.abs(delta) < f.hi - f.value }
  })
  const rising = rows.filter((r) => r.rising)
  const falling = rows.filter((r) => !r.rising)

  const go = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate(path)
  }

  return (
    <section className={s.wrap} aria-labelledby="overview-h">
      <h2 id="overview-h">Which parameters rise in the next 2 years?</h2>
      <p className={s.lede}>
        {sentenceCase(count(rising.length))} of five are forecast to rise: <b>{list(rising.map((r) => NOUN[r.id]))}</b>.
        {falling.length > 0 && (
          <>
            {' '}
            {sentenceCase(list(falling.map((r) => NOUN[r.id])))} {falling.length > 1 ? 'are' : 'is'} forecast to fall
            {falling.every((r) => r.small) ? ', but by less than the forecast uncertainty, so effectively level.' : '.'}
          </>
        )}
      </p>

      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Indicator</th>
              <th scope="col" className={s.sparkCol}>
                Last 30 years and forecast
              </th>
              <th scope="col" className={s.n}>
                Latest
              </th>
              <th scope="col" className={s.n}>
                Forecast
              </th>
              <th scope="col" className={`${s.n} ${s.changeCol}`}>
                Change
              </th>
              <th scope="col">Direction</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ id, v, r, last, f, d, delta, rising, small }) => (
              <tr key={id} className={active === id ? s.active : undefined}>
                <th scope="row">
                  <a href={href(id)} onClick={go(id)} aria-current={active === id ? 'page' : undefined}>
                    {v.name}
                  </a>
                  <span className={s.unit}>{d.unit}</span>
                </th>
                <td className={s.sparkCol}>
                  <Spark history={v.annual.slice(-30)} forecast={r.forecast} />
                </td>
                <td className={s.n}>
                  <span className="mono">{num(last.value * d.k, d.decimals)}</span>
                  <span className={s.year}>{last.year}</span>
                </td>
                <td className={s.n}>
                  <span className="mono">{num(f.value * d.k, d.decimals)}</span>
                  <span className={s.year}>{f.year}</span>
                </td>
                <td className={`${s.n} ${s.changeCol} mono`}>{signed(delta * d.k, d.decimals)}</td>
                <td>
                  <span className={`${s.chip} ${rising ? s.up : s.down}`}>
                    <span aria-hidden>{rising ? '▲' : '▼'}</span> {rising ? 'Rising' : 'Falling'}
                  </span>
                  {small && <span className={s.flat}>within uncertainty</span>}
                  <span className="sr">, model {MODEL_LABEL[r.model]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={s.note}>
        Each row uses the model with the lowest backtest error on that record's default training window. Forecasts are two years past the last complete year of data. Select an indicator
        to change the model and settings.
      </p>
    </section>
  )
}

function Spark({ history, forecast }: { history: Point[]; forecast: ForecastPoint[] }) {
  const w = 132
  const h = 30
  const pts = [...history, ...forecast]
  const ys = pts.map((p) => p.value)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const x = (i: number) => 1 + (i / (pts.length - 1)) * (w - 5)
  const y = (v: number) => h - 3 - ((v - min) / (max - min || 1)) * (h - 6)
  const path = (list: Point[], offset: number) => list.map((p, i) => `${i ? 'L' : 'M'}${x(i + offset).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')
  const end = forecast.at(-1)!
  return (
    <svg className={s.spark} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={path(history, 0)} className={s.sObs} />
      <path d={path([history.at(-1)!, ...forecast], history.length - 1)} className={s.sFc} />
      <circle cx={x(pts.length - 1)} cy={y(end.value)} r={2.5} className={s.sDot} />
    </svg>
  )
}

const WORDS = ['None', 'One', 'Two', 'Three', 'Four', 'All five']
const count = (n: number) => WORDS[n] ?? String(n)
const sentenceCase = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
function list(items: string[]) {
  if (items.length < 2) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}
