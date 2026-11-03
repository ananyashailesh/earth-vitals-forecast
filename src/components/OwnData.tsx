import { useId, useState } from 'react'
import { parseSeries, runForecast } from '../lib/forecast'
import type { Vital } from '../lib/vitals'
import { Chart } from './Chart'
import { Settings, type SettingsValue } from './Settings'
import { ForecastTable, Scorecard } from './Tables'
import app from '../App.module.css'
import s from './OwnData.module.css'

const MIN_YEARS = 12

export function OwnData({ settings, onChange, example }: { settings: SettingsValue; onChange: (v: SettingsValue) => void; example: Vital }) {
  const uid = useId()
  const [text, setText] = useState('')
  const [unit, setUnit] = useState('')
  const { points, skipped } = parseSeries(text)
  const first = points[0]?.year
  const last = points.at(-1)?.year
  const enough = points.length >= MIN_YEARS
  const from = enough && settings.from != null ? Math.min(Math.max(settings.from, first!), last! - 10) : first
  const result = enough ? runForecast(points, { model: settings.model, startYear: from, horizon: settings.horizon, level: settings.level }) : undefined
  const decimals = Math.min(4, Math.max(0, ...points.map((p) => String(p.value).split('.')[1]?.length ?? 0)))

  function loadExample() {
    setText(['year,value', ...example.annual.map((p) => `${p.year},${p.value}`)].join('\n'))
    setUnit(example.unit)
  }

  return (
    <>
      <header className={app.pageHead}>
        <div>
          <p className={app.crumb}>
            Tools <span aria-hidden>/</span> Your data
          </p>
          <h1>Forecast your own data</h1>
          <p className={app.desc}>
            Paste one <code>year,value</code> pair per line. Headers, <code>#</code> comments and tab or semicolon separators are ignored. At least {MIN_YEARS} years are needed for a
            six-origin backtest. Nothing leaves your browser.
          </p>
        </div>
      </header>
      <div className={`card ${s.input}`}>
        <div className={s.paste}>
          <label htmlFor={`${uid}-csv`} className={s.label}>
            Series
          </label>
          <textarea
            id={`${uid}-csv`}
            className="mono"
            rows={10}
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'year,value\n1990,12.4\n1991,12.9\n…'}
            aria-describedby={`${uid}-status`}
          />
          <p id={`${uid}-status`} className={s.status} role="status">
            {points.length ? `${points.length} years parsed, ${first}–${last}` : 'No rows parsed yet'}
            {skipped > 0 && `, ${skipped} line${skipped > 1 ? 's' : ''} skipped`}
            {points.length > 0 && !enough && ` — need ${MIN_YEARS - points.length} more`}
          </p>
        </div>
        <div className={s.side}>
          <label className={s.label} htmlFor={`${uid}-unit`}>
            Unit label
          </label>
          <input id={`${uid}-unit`} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. ppm" />
          <button type="button" className={s.button} onClick={loadExample}>
            Load example: {example.short}, {example.annual[0].year}–{example.annual.at(-1)!.year}
          </button>
          {text && (
            <button type="button" className={s.ghost} onClick={() => setText('')}>
              Clear
            </button>
          )}
        </div>
      </div>

      {result && (
        <>
          <div className={app.grid}>
            <section className="card" aria-label="Chart">
              <div className="card-body">
            <Chart
              title="Your series"
              history={points}
              trainStart={result.train[0].year}
              fitted={result.fitted}
              forecast={result.forecast}
              unit={unit}
              decimals={decimals}
              level={settings.level}
            />
              </div>
            </section>
            <Settings value={{ ...settings, from }} onChange={onChange} series={points} defaultFrom={first!} chosen={result.model} />
          </div>
          <div className={app.tables}>
            <Scorecard result={result} unit={unit || 'series units'} k={1} decimals={decimals} />
            <ForecastTable result={result} last={points.at(-1)!} unit={unit || 'series units'} k={1} decimals={decimals} level={settings.level} />
          </div>
        </>
      )}
    </>
  )
}
