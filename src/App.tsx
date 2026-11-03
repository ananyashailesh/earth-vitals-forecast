import { useEffect } from 'react'
import { Chart } from './components/Chart'
import { Methods } from './components/Methods'
import { OwnData } from './components/OwnData'
import { Settings, readSettings, writeSettings, type SettingsValue } from './components/Settings'
import { Summary } from './components/Summary'
import { ForecastTable, Scorecard } from './components/Tables'
import { ThemeToggle } from './components/ThemeToggle'
import { runForecast, type ForecastPoint, type Point } from './lib/forecast'
import { useRoute } from './lib/route'
import { DEFAULT_START, VITAL_IDS, display, fmtDate, MONTHS, num, useVitals, type Vital, type VitalId } from './lib/vitals'
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
    document.title = vital ? `${vital.name} · Earth Vitals Forecast` : own ? 'Your data · Earth Vitals Forecast' : 'Earth Vitals Forecast'
  }, [vital, own])

  const updated = vitals && Object.values(vitals).map((v) => v.lastModified).sort().at(-1)

  return (
    <div className={s.page}>
      <a href="#main" className={s.skip}>
        Skip to chart
      </a>
      <header className={s.masthead}>
        <div className={s.brand}>
          <h1>Earth Vitals Forecast</h1>
          <p>Five planetary measurements, their recorded history, and what simple statistical models expect next.</p>
        </div>
        <dl className={s.status}>
          <div>
            <dt>Newest source file</dt>
            <dd className="mono">{updated ? fmtDate(updated) : '—'}</dd>
          </div>
          <div>
            <dt>Records fetched</dt>
            <dd className="mono">{vitals ? fmtDate(vitals.co2.fetchedAt) : '—'}</dd>
          </div>
          <div className={s.themeCell}>
            <ThemeToggle />
          </div>
        </dl>
      </header>

      {error && (
        <p role="alert" className={s.error}>
          Could not load climate data ({error}). Run <code>npm run data</code> and reload.
        </p>
      )}

      {vitals && (
        <>
          <Summary vitals={vitals} active={id} navigate={navigate} own={own} unit={settings.unit} />
          <main id="main" tabIndex={-1} className={s.main}>
            {vital ? <VitalView vital={vital} settings={settings} onChange={setSettings} /> : own ? <OwnData settings={settings} onChange={setSettings} example={vitals.co2} /> : null}
          </main>
        </>
      )}
      {!vitals && !error && <p className={s.loading}>Loading records…</p>}

      <Methods vitals={vitals} />
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

  return (
    <>
      <div className={s.viewHead}>
        <div>
          <p className={s.kicker}>
            {vital.short} · {d.unit}
          </p>
          <h2>{vital.name}</h2>
          <p className={s.desc}>{vital.description}</p>
        </div>
        <dl className={s.meta}>
          <div>
            <dt>Record</dt>
            <dd className="mono">
              {vital.annual[0].year}–{vital.annual.at(-1)!.year}, {vital.annual.length} yr
            </dd>
          </div>
          {lm && (
            <div>
              <dt>Latest monthly</dt>
              <dd className="mono">
                {num(lm.value * d.k, vital.decimals)} {d.unit}, {MONTHS[lm.month - 1]} {lm.year}
              </dd>
            </div>
          )}
          <div>
            <dt>Source updated</dt>
            <dd className="mono">{fmtDate(vital.lastModified)}</dd>
          </div>
        </dl>
      </div>
      <div className={s.instrument}>
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
        <Settings value={settings} onChange={onChange} series={vital.annual} temperature={isTemp} defaultFrom={DEFAULT_START[vital.id] ?? vital.annual[0].year} chosen={result.model} />
      </div>
      <div className={s.tables}>
        <Scorecard result={result} unit={d.unit} k={d.k} decimals={d.decimals} />
        <ForecastTable result={result} last={vital.annual.at(-1)!} unit={d.unit} k={d.k} decimals={d.decimals} level={settings.level} />
      </div>
    </>
  )
}
