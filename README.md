# Earth Vitals Forecast

Two-year statistical forecasts of five climate vital signs, built from the latest public records:

| Vital sign | Annual series used | Unit | Source |
|---|---|---|---|
| Carbon dioxide | Mauna Loa annual mean (monthly file used for the latest reading) | ppm | [NOAA GML](https://gml.noaa.gov/ccgg/trends/): [`co2_annmean_mlo.csv`](https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv), [`co2_mm_mlo.csv`](https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv) |
| Global surface temperature | GISTEMP v4 J–D land–ocean anomaly vs 1951–1980 | °C (°F on request) | [NASA GISS](https://data.giss.nasa.gov/gistemp/): [`GLB.Ts+dSST.csv`](https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv) |
| Methane | Mean of 12 global monthly values (complete years only) | ppb | [NOAA GML](https://gml.noaa.gov/ccgg/trends_ch4/): [`ch4_mm_gl.csv`](https://gml.noaa.gov/webdata/ccgg/trends/ch4/ch4_mm_gl.csv) |
| Global mean sea level | Annual mean of ~10-day satellite-altimetry GMSL, seasonal signal and GIA removed | mm | [University of Colorado SLRG](https://sealevel.colorado.edu/data), latest release (2026_rel2 at the time of writing) |
| Arctic sea ice | September mean extent | million km² | [NSIDC Sea Ice Index v4](https://nsidc.org/data/g02135): [`N_09_extent_v4.0.csv`](https://noaadata.apps.nsidc.org/NOAA/G02135/north/monthly/data/N_09_extent_v4.0.csv) |

**About the sea-level source.** The assignment asked for NASA's satellite-altimetry GMSL. NASA's current product, [`NASA_SSH_GMSL_INDICATOR`](https://podaac.jpl.nasa.gov/dataset/NASA_SSH_GMSL_INDICATOR) on PO.DAAC, now requires an Earthdata login, and the [NASA vital-signs page](https://earth.gov/sealevel/vital-signs/sea-level/) links to that protected file. There is no public CSV that an unattended build can download. The app therefore uses the University of Colorado release instead. It is NASA-funded and built from the same TOPEX/Poseidon, Jason-1/2/3 and Sentinel-6 missions. The script finds the newest release on the CU data page, so it keeps working when CU publishes a new one.

## Run it

```sh
npm install
npm run data    # fetch all five records into public/data/*.json
npm test        # Vitest: forecasting library and parsers
npm run dev     # http://localhost:5173/co2
npm run build   # static site in dist/ (also writes 404.html for SPA routes)
```

Routes are `/co2`, `/temperature`, `/methane`, `/sealevel`, `/seaice` and `/your-data`. Settings live in the query string, so a URL like `/temperature?model=holt&from=1980&h=4&band=95&unit=F&enso=1&adj=2026:0.1` reproduces a view exactly.

## Data pipeline

[`scripts/fetch-data.mjs`](scripts/fetch-data.mjs) downloads each file, skips `#` comment lines and header rows, and treats `***` / `-9.99` / `-9999` as missing. It reduces each record to one value per complete calendar year and writes `public/data/<id>.json`. The JSON holds the annual series, the latest monthly reading, the source's HTTP `Last-Modified` date (shown in the UI as "Source updated") and the fetch time.

If one source fails, the script keeps the previously committed JSON for it, so a single server outage does not take the site down. The script exits with an error only if every source fails.

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) runs on every push and every Monday at 06:17 UTC. Each run fetches fresh data, runs the tests, builds the site and deploys it to GitHub Pages. On the weekly run it also commits the refreshed JSON back to the repository.

## Forecasting methods

All of the code is in [`src/lib/forecast.ts`](src/lib/forecast.ts), and the tests are in [`src/lib/forecast.test.ts`](src/lib/forecast.test.ts).

Let *yₜ* be the annual value in year *t*. Only years from the chosen *training start* onwards are used. The default start is the first year of each record, except temperature, which starts in 1970 to model the post-1970 warming trend.

**Linear OLS.** *ŷₜ = a + b·t*, fitted by least squares.

**Quadratic OLS.** *ŷₜ = c₀ + c₁u + c₂u²*, with *u = t − t̄*. Centring the years keeps the 3×3 normal equations well conditioned; they are solved by Gaussian elimination with partial pivoting.

**Holt double exponential smoothing.**
ℓₜ = α·yₜ + (1 − α)(ℓₜ₋₁ + bₜ₋₁), bₜ = β(ℓₜ − ℓₜ₋₁) + (1 − β)bₜ₋₁.
It starts from ℓ₀ = y₀ and b₀ = y₁ − y₀. α and β are grid-searched over {0.1, …, 0.9}², minimising one-step-ahead squared error. The *h*-step forecast is ℓ + h·b.

**Ensemble.** A weighted mean of the three base models, with wᵢ ∝ 1 / MAEᵢ from the backtest below.

**Rolling-origin backtest.** For each of the last 6 origins *t* (from *T*−7 to *T*−2, where *T* is the last year), the model is refitted on years ≤ *t* and predicts *t* + 2. The error at each origin is the prediction minus the observed value. The scorecard reports MAE and RMSE over those six errors. **Auto** mode uses the model with the lowest MAE.

**Prediction intervals.** *ŷ ± z · RMSE · √(h/2)*, with z = 1.2816 (80%) or 1.96 (95%). The RMSE is the chosen model's backtest RMSE at h = 2. The √(h/2) factor scales it to horizons 1–5, assuming errors grow like a random walk.

**El Niño adjustment (temperature only).** A trend model cannot anticipate ENSO, the largest source of year-to-year variation in global temperature. You can therefore add an offset (±0.3 °C) to each forecast year. The offsets default to 0. As a guide, a strong El Niño typically raises the following year by about 0.1–0.2 °C.

**Forecast your own data.** Paste `year,value` lines (headers, comments, and tab or semicolon separators are fine). The same pipeline runs in the browser. It needs at least 12 years so that all six backtest origins exist.

### Limitations

- These are extrapolations of the observed record, not physical projections. For projections under emissions scenarios, see [IPCC AR6 WG1](https://www.ipcc.ch/report/ar6/wg1/).
- The ensemble's own backtest uses weights computed from the base models' backtests on the same window. That is a mild look-ahead, so its score is slightly optimistic. The code notes this with a `shortcut:` comment.
- The √(h/2) interval scaling is a heuristic. It is not derived from each model's error structure.
- The temperature conversion to °F is a ×1.8 scale, because the values are anomalies (no +32).

## Stack

Vite, React 19, TypeScript, CSS Modules and D3 (scales and shapes only; React renders the SVG). There is no UI kit. The layout follows newsroom data pages (Reuters Climate Monitor, Our World in Data): a sentence that states the finding, a controls row above each chart, direct labels on the chart and a source line beneath it. Fonts are Newsreader (headlines), Public Sans (text) and IBM Plex Mono (table figures), from Google Fonts. Light and dark themes follow the system setting, with a manual toggle. The chart can be read with arrow keys and announces values to screen readers, and the layout respects `prefers-reduced-motion`.
