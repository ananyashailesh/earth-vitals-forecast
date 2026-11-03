import { VITAL_IDS, fmtDate, type Vital, type VitalId } from '../lib/vitals'
import s from './Methods.module.css'

const FILES: Record<VitalId, { label: string; url: string }[]> = {
  co2: [
    { label: 'co2_annmean_mlo.csv', url: 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv' },
    { label: 'co2_mm_mlo.csv', url: 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv' },
  ],
  temperature: [{ label: 'GLB.Ts+dSST.csv', url: 'https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv' }],
  methane: [{ label: 'ch4_mm_gl.csv', url: 'https://gml.noaa.gov/webdata/ccgg/trends/ch4/ch4_mm_gl.csv' }],
  sealevel: [{ label: 'CU GMSL release index', url: 'https://sealevel.colorado.edu/data' }],
  seaice: [{ label: 'N_09_extent_v4.0.csv', url: 'https://noaadata.apps.nsidc.org/NOAA/G02135/north/monthly/data/N_09_extent_v4.0.csv' }],
}

export function Methods({ vitals }: { vitals?: Record<VitalId, Vital> }) {
  return (
    <footer className={s.wrap} id="methods">
      <section className={`card ${s.col}`} aria-labelledby="methods-h">
        <h2 id="methods-h">Methods</h2>
        <p>Every record is reduced to one value per calendar year, and only complete years are used. Four models are fitted to the years from the chosen training start onwards.</p>
        <dl className={s.defs}>
          <dt>Linear OLS</dt>
          <dd>
            Least-squares straight line, <span className="mono">ŷ = a + b·t</span>.
          </dd>
          <dt>Quadratic OLS</dt>
          <dd>
            Least-squares parabola on centred years, <span className="mono">ŷ = c₀ + c₁u + c₂u²</span> with <span className="mono">u = t − t̄</span>, which captures acceleration.
          </dd>
          <dt>Holt double exponential smoothing</dt>
          <dd>
            Level and trend updated each year. <span className="mono">α</span> and <span className="mono">β</span> are chosen from a 0.1–0.9 grid by minimising one-step-ahead squared error.
            An <i>h</i>-step forecast is <span className="mono">ℓ + h·b</span>.
          </dd>
          <dt>Ensemble</dt>
          <dd>
            Weighted mean of the three, with weights proportional to <span className="mono">1 / MAE</span> from the backtest.
          </dd>
        </dl>
        <p>
          <b>Backtest.</b> For each of the last six origins <i>t</i>, a model is trained on years ≤ <i>t</i> and predicts <i>t</i> + 2. The table reports mean absolute error and root-mean-square error
          for these six predictions. <i>Auto</i> picks the model with the lowest MAE.
        </p>
        <p>
          <b>Prediction interval.</b> <span className="mono">ŷ ± z · RMSE · √(h/2)</span>, with <span className="mono">z = 1.2816</span> (80%) or <span className="mono">1.96</span> (95%). The
          backtest RMSE is measured at <i>h</i> = 2, and the √(h/2) factor scales it to other horizons as a random-walk-style approximation.
        </p>
        <p>
          <b>El Niño adjustment.</b> For temperature, you can add an offset to each forecast year. ENSO is the largest source of year-to-year variation in global temperature, and a trend model
          cannot anticipate it. The offsets default to zero.
        </p>
        <p className={s.caveat}>
          These are statistical extrapolations of the observed record, not physical climate projections. For scenario-based projections, see the{' '}
          <a href="https://www.ipcc.ch/report/ar6/wg1/">IPCC AR6 Working Group I report</a>.
        </p>
      </section>

      <section className={`card ${s.col}`} aria-labelledby="sources-h">
        <h2 id="sources-h">Sources</h2>
        <ul className={s.sources}>
          {VITAL_IDS.map((id) => {
            const v = vitals?.[id]
            return (
              <li key={id}>
                <h3>{v?.name ?? id}</h3>
                <p>
                  <a href={v?.sourceUrl}>{v?.source}</a>
                </p>
                <p className={s.files}>
                  {FILES[id].map((f) => (
                    <a key={f.url} href={f.url} className="mono">
                      {f.label}
                    </a>
                  ))}
                  {v?.file && (
                    <a href={v.file} className="mono">
                      {v.file.split('/').pop()}
                    </a>
                  )}
                </p>
                {v && (
                  <p className={s.stamp}>
                    Source updated <span className="mono">{fmtDate(v.lastModified)}</span>, fetched <span className="mono">{fmtDate(v.fetchedAt)}</span>
                  </p>
                )}
              </li>
            )
          })}
        </ul>
        <p className={s.note}>
          NASA's own GMSL indicator (<a href="https://podaac.jpl.nasa.gov/dataset/NASA_SSH_GMSL_INDICATOR">PO.DAAC NASA_SSH_GMSL_INDICATOR</a>) now requires an Earthdata login, so the
          sea level record uses the public{' '}
          <a href="https://sealevel.colorado.edu/">University of Colorado</a> release, which is built from the same TOPEX/Poseidon, Jason and Sentinel-6 altimetry. A GitHub Action refreshes all
          files weekly.
        </p>
      </section>
    </footer>
  )
}
