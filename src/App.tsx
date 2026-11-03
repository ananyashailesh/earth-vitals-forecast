import { useEffect, type ReactNode } from 'react'
import { Chart } from './components/Chart'
import { Methods } from './components/Methods'
import { OwnData } from './components/OwnData'
import { Settings, readSettings, writeSettings, type SettingsValue } from './components/Settings'
import { Sidebar } from './components/Sidebar'
import { ForecastTable, Scorecard } from './components/Tables'
import { MODEL_LABEL, runForecast, type ForecastPoint, type Point } from './lib/forecast'
import { useRoute } from './lib/route'
import { DEFAULT_START, VITAL_IDS, display, fmtDate, MONTHS, num, signed, useVitals, type Vital, type VitalId } from './lib/vitals'
import s from './App.module.css'

export default function App() {
  const { vitals, error } = useVitals()
  const { path, params, navigate } = useRoute()
  const id = (VITAL_IDS as readonly string[]).includes(path) ? (path as VitalId) : undefined
  const own = path === 'your-data'

  useEffect(() => {
    if (!id && !own) navigate('co2', undefined, true)
  }, [id, own, navigate])

  const vital = id && vitals?.[id]
  const settings = readSettings(params, vital)
  const setSettings = (next: SettingsValue) => navigate(path, writeSettings(next, vital), true)

  useEffect(() => {
    document.title = vital ? `${vital.name} · Earth Vitals` : own ? 'Your data · Earth Vitals' : 'Earth Vitals'
  }, [vital, own])

  return (
    <div className={s.shell}>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <Sidebar vitals={vitals} active={id} own={own} unit={settings.unit} navigate={navigate} />

      <div className={s.content}>
        {error && (
          <p role="alert" className={s.error}>
            Could not load climate data ({error}). Run <code>npm run data</code> and reload.
          </p>
        )}
        {!vitals && !error && <p className={s.loading}>Loading records…</p>}

        {vitals && (
          <main id="main" tabIndex={-1} className={s.main}>
            {vital ? <VitalView vital={vital} settings={settings} onChange={setSettings} /> : own ? <OwnData settings={settings} onChange={setSettings} example={vitals.co2} /> : null}
          </main>
        )}

        <Methods vitals={vitals} />
      </div>
    </div>
  )
}

function VitalView({ vital, settings, onChange }: { vital: Vital; settings: SettingsValue; onChange: (s: SettingsValue) => void }) {
  const isTemp = vital.id === 'temperature'
  const offsets = isTemp && settings.enso ? settings.offsets : {}
  // a full run (4 models × 6 backtest origins) takes a few ms, so no memoisation
  const result = runForecast(vital.annual, { model: settings.model, startYear: settings.from, horizon: settings.horizon, level: settings.level, offsets })
  const d = display(vital, settings.unit)
  const sp = (p: Point): Point => ({ year: p.year, value: p.value * d.k })
  const sf = (f: ForecastPoint): ForecastPoint => ({ year: f.year, value: f.value * d.k, lo: f.lo * d.k, hi: f.hi * d.k })
  const lm = vital.latestMonthly
  const last = vital.annual.at(-1)!
  const prev = vital.annual.at(-2)!
  const end = result.forecast.at(-1)!
  const yoy = (last.value - prev.value) * d.k
  const change = (end.value - last.value) * d.k
  const score = result.scores[result.model]
  const f = (v: number) => num(v * d.k, d.decimals)

  return (
    <>
      <header className={s.pageHead}>
        <div>
          <p className={s.crumb}>
            Indicators <span aria-hidden>/</span> {vital.short}
          </p>
          <h1>{vital.name}</h1>
          <p className={s.desc}>{vital.description}</p>
        </div>
        <div className={s.headMeta}>
          <span className={s.pill}>
            {vital.annual[0].year}–{last.year} · {vital.annual.length} yrs
          </span>
          <span className={s.pill}>Source updated {fmtDate(vital.lastModified)}</span>
        </div>
      </header>

      <section className={s.kpis} aria-label="Key figures">
        <Kpi label={`Annual mean, ${last.year}`} value={f(last.value)} unit={d.unit} note={<Delta v={yoy} d={d.decimals} suffix={`vs ${prev.year}`} />} />
        <Kpi
          label="Latest monthly"
          value={lm ? f(lm.value) : '—'}
          unit={lm ? d.unit : ''}
          note={lm ? <span className={s.kNote}>{MONTHS[lm.month - 1]} {lm.year}</span> : <span className={s.kNote}>Annual record only</span>}
        />
        <Kpi
          label={`Forecast, ${end.year}`}
          value={f(end.value)}
          unit={d.unit}
          note={
            <span className={s.kNote}>
              <Delta v={change} d={d.decimals} /> · {settings.level}% range {f(end.lo)}–{f(end.hi)}
            </span>
          }
        />
        <Kpi label="Backtest error (MAE)" value={f(score.mae)} unit={d.unit} note={<span className={s.kNote}>{MODEL_LABEL[result.model]}, 2-year ahead</span>} />
      </section>

      <div className={s.grid}>
        <section className="card" aria-labelledby="chart-h">
          <div className="card-head">
            <div>
              <h3 id="chart-h">Observed record and forecast</h3>
              <p>
                Annual values in {d.unit}. Hover or use arrow keys to read values.
              </p>
            </div>
          </div>
          <div className="card-body">
            <Chart
              title={vital.name}
              history={vital.annual.map(sp)}
              trainStart={result.train[0].year}
              fitted={result.fitted.map(sp)}
              forecast={result.forecast.map(sf)}
              unit={d.unit}
              decimals={d.decimals}
              level={settings.level}
            />
          </div>
        </section>
        <Settings value={settings} onChange={onChange} series={vital.annual} temperature={isTemp} defaultFrom={DEFAULT_START[vital.id] ?? vital.annual[0].year} chosen={result.model} />
      </div>

      <div className={s.tables}>
        <ForecastTable result={result} last={last} unit={d.unit} k={d.k} decimals={d.decimals} level={settings.level} />
        <Scorecard result={result} unit={d.unit} k={d.k} decimals={d.decimals} />
      </div>
    </>
  )
}

function Kpi({ label, value, unit, note }: { label: string; value: string; unit: string; note: ReactNode }) {
  return (
    <div className={`card ${s.kpi}`}>
      <p className={s.kLabel}>{label}</p>
      <p className={s.kValue}>
        <span className="num">{value}</span> <small>{unit}</small>
      </p>
      <div>{note}</div>
    </div>
  )
}

function Delta({ v, d, suffix }: { v: number; d: number; suffix?: string }) {
  return (
    <span className={s.kNote}>
      <span className={`num ${s.delta} ${v > 0 ? s.up : s.down}`}>
        {v > 0 ? '↑' : '↓'} {signed(v, d)}
      </span>
      {suffix && <> {suffix}</>}
    </span>
  )
}
