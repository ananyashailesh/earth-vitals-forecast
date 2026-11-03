import type { MouseEvent } from 'react'
import { runForecast, type Point } from '../lib/forecast'
import { href } from '../lib/route'
import { DEFAULT_START, VITAL_IDS, display, fmtDate, num, signed, type TempUnit, type Vital, type VitalId } from '../lib/vitals'
import { ThemeToggle } from './ThemeToggle'
import s from './Sidebar.module.css'

type Props = {
  vitals?: Record<VitalId, Vital>
  active?: VitalId
  own: boolean
  unit: TempUnit
  navigate: (path: string) => void
}

const LABEL: Partial<Record<VitalId, string>> = { co2: 'Carbon dioxide', methane: 'Methane', seaice: 'Arctic sea ice' }

export function Sidebar({ vitals, active, own, unit, navigate }: Props) {
  const go = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate(path)
  }
  const fetched = vitals?.co2.fetchedAt

  return (
    <nav className={s.side} aria-label="Indicators">
      <div className={s.brand}>
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
          <rect width="32" height="32" rx="7" fill="var(--obs)" />
          <path d="M7 21 L12 17 L16 19 L21 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 12 L25 9" fill="none" stroke="#fdba74" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 2.5" />
        </svg>
        <span>Earth Vitals</span>
      </div>

      <p className={s.section}>Indicators</p>
      <ul className={s.list}>
        {VITAL_IDS.map((id) => {
          const v = vitals?.[id]
          if (!v) return <li key={id} className={s.skeleton} />
          const r = runForecast(v.annual, { startYear: DEFAULT_START[id], horizon: 2 })
          const last = v.annual.at(-1)!
          const d = display(v, unit)
          const delta = (r.forecast[1].value - last.value) * d.k
          const rising = delta > 0
          return (
            <li key={id}>
              <a href={href(id)} onClick={go(id)} className={s.item} aria-current={active === id ? 'page' : undefined}>
                <span className={s.row}>
                  <span className={s.name}>{LABEL[id] ?? v.short}</span>
                  <Spark points={v.annual.slice(-30)} />
                </span>
                <span className={s.row}>
                  <span className={`num ${s.value}`}>
                    {num(last.value * d.k, d.decimals)} <small>{d.unit}</small>
                  </span>
                  <span className={`num ${s.delta} ${rising ? s.up : s.down}`} title={`Change expected by ${r.forecast[1].year}`}>
                    {rising ? '↑' : '↓'} {signed(delta, d.decimals)}
                  </span>
                </span>
              </a>
            </li>
          )
        })}
      </ul>

      <p className={s.section}>Tools</p>
      <ul className={s.list}>
        <li>
          <a href={href('your-data')} onClick={go('your-data')} className={`${s.item} ${s.tool}`} aria-current={own ? 'page' : undefined}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
              <path d="M3 2.5h6.5L13 6v7.5H3z M9.5 2.5V6H13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
            Forecast your own data
          </a>
        </li>
        <li>
          <a href="#methods" className={`${s.item} ${s.tool}`}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
              <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 7.2v3.6M8 5.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Methods &amp; sources
          </a>
        </li>
      </ul>

      <div className={s.foot}>
        <div className={s.sync}>
          <span className={s.dot} aria-hidden />
          <span>{fetched ? `Synced ${fmtDate(fetched)}` : 'Loading…'}</span>
        </div>
        <ThemeToggle />
      </div>
    </nav>
  )
}

function Spark({ points }: { points: Point[] }) {
  const w = 56
  const h = 18
  const ys = points.map((p) => p.value)
  const min = Math.min(...ys)
  const max = Math.max(...ys)
  const d = points
    .map((p, i) => `${i ? 'L' : 'M'}${((i / (points.length - 1)) * w).toFixed(1)} ${(h - 1 - ((p.value - min) / (max - min || 1)) * (h - 2)).toFixed(1)}`)
    .join(' ')
  return (
    <svg className={s.spark} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={d} />
    </svg>
  )
}
