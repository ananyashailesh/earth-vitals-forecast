import { useEffect, type MouseEvent } from 'react'
import { Chart } from './components/Chart'
import { Methods } from './components/Methods'
import { NOUN, Overview } from './components/Overview'
import { OwnData } from './components/OwnData'
import { Settings, readSettings, writeSettings, type SettingsValue } from './components/Settings'
import { ForecastTable, Scorecard } from './components/Tables'
import { ThemeToggle } from './components/ThemeToggle'
import { MODEL_LABEL, runForecast, type ForecastPoint, type Point } from './lib/forecast'
import { href, useRoute } from './lib/route'
import { DEFAULT_START, VITAL_IDS, display, fmtDate, MONTHS, num, signed, useVitals, type Vital, type VitalId } from './lib/vitals'
import s from './App.module.css'

const TAB: Record<VitalId, string> = { co2: 'CO₂', temperature: 'Temperature', methane: 'Methane', sealevel: 'Sea level', seaice: 'Sea ice' }

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

  const go = (p: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    navigate(p)
  }
  const updated = vitals && Object.values(vitals).map((v) => v.lastModified).sort().at(-1)

  return (
    <div className={s.page}>
      <a href="#main" className={s.skip}>
        Skip to chart
      </a>
      <header className={s.masthead}>
        <div className={s.topline}>
          <span className={s.kicker}>Climate data dashboard</span>
          <ThemeToggle className={s.theme} />
        </div>
        <h1>Earth Vitals Forecast</h1>
        <p className={s.dek}>Where five of the planet's vital signs are heading over the next two years, forecast from public NOAA, NASA, NSIDC and University of Colorado records.</p>
        <p className={s.dateline}>
          Updates weekly
          {updated && (
            <>
              {' '}
              · Newest source file <time dateTime={updated}>{fmtDate(updated)}</time>
            </>
          )}
          {vitals && (
            <>
              {' '}
              · Fetched <time dateTime={vitals.co2.fetchedAt}>{fmtDate(vitals.co2.fetchedAt)}</time>
            </>
          )}
        </p>
      </header>

      {error && (
        <p role="alert" className={s.error}>
          Could not load climate data ({error}). Run <code>npm run data</code> and reload.
        </p>
      )}
      {!vitals && !error && <p className={s.loading}>Loading records…</p>}

      {vitals && (
        <>
          <Overview vitals={vitals} active={id} unit={settings.unit} navigate={navigate} />

          <nav className={s.tabs} aria-label="Indicators">
            <ul>
              {VITAL_IDS.map((v) => (
                <li key={v}>
                  <a href={href(v)} onClick={go(v)} aria-current={id === v ? 'page' : undefined}>
                    {TAB[v]}
                  </a>
                </li>
              ))}
              <li className={s.tabGap}>
                <a href={href('your-data')} onClick={go('your-data')} aria-current={own ? 'page' : undefined}>
                  Your data
                </a>
              </li>
              <li>
                <a href="#methods">Methods</a>
              </li>
            </ul>
          </nav>

          <main id="main" tabIndex={-1} className={s.main}>
            {vital ? <VitalView vital={vital} settings={settings} onChange={setSettings} /> : own ? <OwnData settings={settings} onChange={setSettings} example={vitals.co2} /> : null}
          </main>
        </>
      )}

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
  const f = (v: number) => num(v * d.k, d.decimals)
  const last = vital.annual.at(-1)!
  const end = result.forecast.at(-1)!
  const lm = vital.latestMonthly
  const why = settings.model === 'auto' ? ', which had the lowest backtest error,' : ''

  return (
    <article>
      <h2 className={s.h2}>{vital.name}</h2>
      <p className={s.lede}>
        The {vital.annual.length}-year record put {NOUN[vital.id]} at{' '}
        <b className={s.obsNum}>
          {f(last.value)} {d.unit}
        </b>{' '}
        in {last.year}. The {SHORT_MODEL[result.model]} model{why} forecasts{' '}
        <b className={s.fcNum}>
          {f(end.value)} {d.unit}
        </b>{' '}
        for {end.year}, a change of {signed((end.value - last.value) * d.k, d.decimals)} {d.unit}. Judging by how far its past forecasts missed, there is {settings.level === 80 ? 'an' : 'a'} {settings.level}% chance the
        value lands between {f(end.lo)} and {f(end.hi)} {d.unit}.
      </p>

      <figure className={s.figure}>
        <figcaption className={s.figHead}>
          <h3>
            {vital.name}, {d.unit}
          </h3>
          <p>{vital.description}</p>
        </figcaption>
        <Settings value={settings} onChange={onChange} series={vital.annual} temperature={isTemp} defaultFrom={DEFAULT_START[vital.id] ?? vital.annual[0].year} chosen={result.model} />
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
        <p className={s.source}>
          <b>Source:</b> <a href={vital.sourceUrl}>{vital.source}</a>, file updated {fmtDate(vital.lastModified)}.
          {lm && (
            <>
              {' '}
              Latest monthly reading {f(lm.value)} {d.unit} ({MONTHS[lm.month - 1]} {lm.year}).
            </>
          )}{' '}
          <b>Forecast:</b> {MODEL_LABEL[result.model]}, {result.params}. <a href={`${import.meta.env.BASE_URL}data/${vital.id}.json`}>Download the data (JSON)</a>
        </p>
      </figure>

      <div className={s.tables}>
        <ForecastTable result={result} last={last} unit={d.unit} k={d.k} decimals={d.decimals} level={settings.level} />
        <Scorecard result={result} unit={d.unit} k={d.k} decimals={d.decimals} />
      </div>
    </article>
  )
}

const SHORT_MODEL = { linear: 'linear trend', quadratic: 'quadratic trend', holt: 'Holt smoothing', ensemble: 'ensemble' } as const
