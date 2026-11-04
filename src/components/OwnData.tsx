import { useId, useState } from 'react'
import { MODEL_LABEL, parseSeries, runForecast } from '../lib/forecast'
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
  const unitLabel = unit || 'series units'

  function loadExample() {
    setText(['year,value', ...example.annual.map((p) => `${p.year},${p.value}`)].join('\n'))
    setUnit(example.unit)
  }

  return (
    <article>
      <h2 className={app.h2}>Forecast your own data</h2>
      <p className={app.lede}>
        Paste any annual series and it will be run through the same four models and the same backtest as the climate records. Use one <code>year,value</code> pair per line; headers,{' '}
        <code>#</code> comments and tab or semicolon separators are ignored. At least {MIN_YEARS} years are needed. Nothing leaves your browser.
      </p>

      <div className={s.input}>
        <div className={s.paste}>
          <label htmlFor={`${uid}-csv`} className={s.label}>
            Series
          </label>
          <textarea
            id={`${uid}-csv`}
            className="mono"
            rows={9}
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'year,value\n1990,12.4\n1991,12.9\n…'}
            aria-describedby={`${uid}-status`}
          />
          <p id={`${uid}-status`} className={s.status} role="status">
            {points.length ? `${points.length} years read, ${first}–${last}` : 'No rows read yet'}
            {skipped > 0 && `, ${skipped} line${skipped > 1 ? 's' : ''} skipped`}
            {points.length > 0 && !enough && `. ${MIN_YEARS - points.length} more needed.`}
          </p>
        </div>
        <div className={s.side}>
          <label className={s.label} htmlFor={`${uid}-unit`}>
            Unit label
          </label>
          <input id={`${uid}-unit`} value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. ppm" />
          <button type="button" className={s.button} onClick={loadExample}>
            Load an example: {example.short}, {example.annual[0].year}–{example.annual.at(-1)!.year}
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
          <figure className={app.figure}>
            <figcaption className={app.figHead}>
              <h3>Your series{unit && `, ${unit}`}</h3>
              <p>
                {points.length} annual values, {first}–{last}.
              </p>
            </figcaption>
            <Settings value={{ ...settings, from }} onChange={onChange} series={points} defaultFrom={first!} chosen={result.model} />
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
            <p className={app.source}>
              <b>Forecast:</b> {MODEL_LABEL[result.model]}, {result.params}.
            </p>
          </figure>
          <div className={app.tables}>
            <ForecastTable result={result} last={points.at(-1)!} unit={unitLabel} k={1} decimals={decimals} level={settings.level} />
            <Scorecard result={result} unit={unitLabel} k={1} decimals={decimals} />
          </div>
        </>
      )}
    </article>
  )
}
