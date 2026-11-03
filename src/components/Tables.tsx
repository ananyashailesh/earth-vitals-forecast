import { BASE_MODELS, MODELS, MODEL_LABEL, type ForecastResult, type Point } from '../lib/forecast'
import { num, signed } from '../lib/vitals'
import s from './Tables.module.css'

type Common = { result: ForecastResult; unit: string; k: number; decimals: number }

export function Scorecard({ result, unit, k, decimals }: Common) {
  const chosen = result.scores[result.model]
  const f = (v: number) => (Number.isFinite(v) ? num(v * k, decimals) : '—')
  return (
    <section className="card" aria-labelledby="score-h">
      <div className="card-head">
        <div>
          <h3 id="score-h">Model comparison</h3>
          <p>
            Rolling-origin backtest: train to year <i>t</i>, predict <i>t</i> + 2, last {chosen.rows.length} origins. Errors in {unit}.
          </p>
        </div>
      </div>
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col" className={s.n}>
                MAE
              </th>
              <th scope="col" className={s.n}>
                RMSE
              </th>
              <th scope="col" className={s.n}>
                Ensemble weight
              </th>
            </tr>
          </thead>
          <tbody>
            {MODELS.map((id) => {
              const sc = result.scores[id]
              const best = MODELS.every((o) => !(result.scores[o].mae < sc.mae))
              return (
                <tr key={id} className={id === result.model ? s.selected : undefined} aria-current={id === result.model ? 'true' : undefined}>
                  <th scope="row">
                    {MODEL_LABEL[id]}
                    {id === result.model && <span className={`${s.tag} ${s.tagActive}`}>In use</span>}
                    {best && <span className={s.tag}>Lowest MAE</span>}
                  </th>
                  <td className={`mono ${s.n}`}>{f(sc.mae)}</td>
                  <td className={`mono ${s.n}`}>{f(sc.rmse)}</td>
                  <td className={`mono ${s.n}`}>{(BASE_MODELS as string[]).includes(id) ? `${(result.weights[id as keyof typeof result.weights] * 100).toFixed(0)}%` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <details className={s.details}>
        <summary>
          Backtest detail, {MODEL_LABEL[result.model]} ({result.params})
        </summary>
        <div className={s.scroll}>
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">Trained to</th>
                <th scope="col">Target</th>
                <th scope="col" className={s.n}>
                  Predicted
                </th>
                <th scope="col" className={s.n}>
                  Observed
                </th>
                <th scope="col" className={s.n}>
                  Error
                </th>
              </tr>
            </thead>
            <tbody>
              {chosen.rows.map((r) => (
                <tr key={r.origin}>
                  <td className="mono">{r.origin}</td>
                  <td className="mono">{r.target}</td>
                  <td className={`mono ${s.n}`}>{f(r.predicted)}</td>
                  <td className={`mono ${s.n}`}>{f(r.actual)}</td>
                  <td className={`mono ${s.n}`}>{signed((r.predicted - r.actual) * k, decimals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  )
}

export function ForecastTable({ result, unit, k, decimals, last, level }: Common & { last: Point; level: number }) {
  return (
    <section className="card" aria-labelledby="fc-h">
      <div className="card-head">
        <div>
          <h3 id="fc-h">Forecast values</h3>
          <p>
            {MODEL_LABEL[result.model]}, {level}% prediction interval, in {unit}. Change is against {last.year}.
          </p>
        </div>
      </div>
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col" className={s.n}>
                Forecast
              </th>
              <th scope="col" className={s.n}>
                Low
              </th>
              <th scope="col" className={s.n}>
                High
              </th>
              <th scope="col" className={s.n}>
                Change
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className={s.recorded}>
              <td className="mono">{last.year}</td>
              <td className={`mono ${s.n}`}>{num(last.value * k, decimals)}</td>
              <td className={s.n} colSpan={3}>
                last record
              </td>
            </tr>
            {result.forecast.map((f) => (
              <tr key={f.year}>
                <td className="mono">{f.year}</td>
                <td className={`mono ${s.n}`}>{num(f.value * k, decimals)}</td>
                <td className={`mono ${s.n}`}>{num(f.lo * k, decimals)}</td>
                <td className={`mono ${s.n}`}>{num(f.hi * k, decimals)}</td>
                <td className={`mono ${s.n}`}>{signed((f.value - last.value) * k, decimals)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
