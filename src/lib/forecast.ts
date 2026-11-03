export type Point = { year: number; value: number }
export type BaseModelId = 'linear' | 'quadratic' | 'holt'
export type ModelId = BaseModelId | 'ensemble'
export type ModelChoice = ModelId | 'auto'
export type Level = 80 | 95

export const BASE_MODELS: BaseModelId[] = ['linear', 'quadratic', 'holt']
export const MODELS: ModelId[] = [...BASE_MODELS, 'ensemble']
export const MODEL_LABEL: Record<ModelChoice, string> = {
  auto: 'Auto (lowest MAE)',
  linear: 'Linear OLS',
  quadratic: 'Quadratic OLS',
  holt: 'Holt double exponential',
  ensemble: 'Ensemble (1/MAE weighted)',
}
const Z: Record<Level, number> = { 80: 1.2816, 95: 1.96 }

export type Fit = {
  predict: (year: number) => number
  /** in-sample fitted values, one per training point (Holt: one-step-ahead) */
  fitted: number[]
  params: string
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length

export function fitLinear(pts: Point[]): Fit {
  const mx = mean(pts.map((p) => p.year))
  const my = mean(pts.map((p) => p.value))
  let sxy = 0
  let sxx = 0
  for (const p of pts) {
    sxy += (p.year - mx) * (p.value - my)
    sxx += (p.year - mx) ** 2
  }
  const b = sxx ? sxy / sxx : 0
  const predict = (x: number) => my + b * (x - mx)
  return { predict, fitted: pts.map((p) => predict(p.year)), params: `slope ${fmt(b)}/yr` }
}

export function fitQuadratic(pts: Point[]): Fit {
  if (pts.length < 3) return fitLinear(pts)
  // centre x so x² stays well-conditioned for calendar years
  const mx = mean(pts.map((p) => p.year))
  const s = [0, 0, 0, 0, 0]
  const t = [0, 0, 0]
  for (const p of pts) {
    const u = p.year - mx
    for (let k = 0; k <= 4; k++) s[k] += u ** k
    for (let k = 0; k <= 2; k++) t[k] += u ** k * p.value
  }
  const [c0, c1, c2] = solve3(
    [
      [s[0], s[1], s[2]],
      [s[1], s[2], s[3]],
      [s[2], s[3], s[4]],
    ],
    t,
  )
  const predict = (x: number) => c0 + c1 * (x - mx) + c2 * (x - mx) ** 2
  return { predict, fitted: pts.map((p) => predict(p.year)), params: `curvature ${fmt(c2)}/yr²` }
}

/** Gaussian elimination with partial pivoting for the 3×3 normal equations. */
function solve3(A: number[][], b: number[]): number[] {
  const m = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < 3; c++) {
    let p = c
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r
    ;[m[c], m[p]] = [m[p], m[c]]
    if (Math.abs(m[c][c]) < 1e-12) return [b[0] / (A[0][0] || 1), 0, 0]
    for (let r = 0; r < 3; r++) {
      if (r === c) continue
      const f = m[r][c] / m[c][c]
      for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]
    }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]]
}

function holtRun(y: number[], alpha: number, beta: number) {
  let level = y[0]
  let trend = y.length > 1 ? y[1] - y[0] : 0
  const fitted = [y[0]]
  let sse = 0
  for (let i = 1; i < y.length; i++) {
    const f = level + trend
    fitted.push(f)
    sse += (y[i] - f) ** 2
    const prev = level
    level = alpha * y[i] + (1 - alpha) * (level + trend)
    trend = beta * (level - prev) + (1 - beta) * trend
  }
  return { level, trend, fitted, sse }
}

/** Holt's linear (double) exponential smoothing; alpha and beta grid-searched on one-step-ahead SSE. */
export function fitHolt(pts: Point[]): Fit {
  const y = pts.map((p) => p.value)
  let best = { alpha: 0.5, beta: 0.5, ...holtRun(y, 0.5, 0.5) }
  for (let a = 1; a <= 9; a++)
    for (let b = 1; b <= 9; b++) {
      const r = holtRun(y, a / 10, b / 10)
      if (r.sse < best.sse) best = { alpha: a / 10, beta: b / 10, ...r }
    }
  const last = pts[pts.length - 1].year
  return {
    predict: (x: number) => best.level + (x - last) * best.trend,
    fitted: best.fitted,
    params: `α ${best.alpha.toFixed(1)}, β ${best.beta.toFixed(1)}`,
  }
}

const FITTERS: Record<BaseModelId, (p: Point[]) => Fit> = { linear: fitLinear, quadratic: fitQuadratic, holt: fitHolt }

export function fitEnsemble(pts: Point[], weights: Record<BaseModelId, number>): Fit {
  const fits = BASE_MODELS.map((id) => [weights[id], FITTERS[id](pts)] as const)
  const blend = (f: (fit: Fit) => number) => fits.reduce((s, [w, fit]) => s + w * f(fit), 0)
  return {
    predict: (x) => blend((fit) => fit.predict(x)),
    fitted: pts.map((_, i) => blend((fit) => fit.fitted[i])),
    params: BASE_MODELS.map((id) => `${id} ${(weights[id] * 100).toFixed(0)}%`).join(', '),
  }
}

export function fitModel(id: ModelId, pts: Point[], weights?: Record<BaseModelId, number>): Fit {
  return id === 'ensemble' ? fitEnsemble(pts, weights ?? equalWeights()) : FITTERS[id](pts)
}

const equalWeights = () => Object.fromEntries(BASE_MODELS.map((id) => [id, 1 / BASE_MODELS.length])) as Record<BaseModelId, number>

export type BacktestRow = { origin: number; target: number; actual: number; predicted: number }
export type Score = { mae: number; rmse: number; rows: BacktestRow[] }

/** Rolling-origin backtest: for each of the last `origins` origins t, train on years ≤ t and predict t + h. */
export function backtest(pts: Point[], id: ModelId, opts: { origins?: number; h?: number; weights?: Record<BaseModelId, number> } = {}): Score {
  const { origins = 6, h = 2, weights } = opts
  const last = pts[pts.length - 1]?.year ?? 0
  const rows: BacktestRow[] = []
  for (let k = origins - 1; k >= 0; k--) {
    const origin = last - h - k
    const train = pts.filter((p) => p.year <= origin)
    const actual = pts.find((p) => p.year === origin + h)
    if (train.length < 4 || !actual) continue
    rows.push({ origin, target: origin + h, actual: actual.value, predicted: fitModel(id, train, weights).predict(origin + h) })
  }
  const err = rows.map((r) => r.predicted - r.actual)
  return {
    rows,
    mae: err.length ? mean(err.map(Math.abs)) : NaN,
    rmse: err.length ? Math.sqrt(mean(err.map((e) => e * e))) : NaN,
  }
}

/** Ensemble weights ∝ 1 / backtest MAE of each base model. */
export function ensembleWeights(scores: Record<BaseModelId, Score>): Record<BaseModelId, number> {
  const inv = BASE_MODELS.map((id) => 1 / Math.max(scores[id].mae, 1e-9))
  if (inv.some((v) => !Number.isFinite(v))) return equalWeights()
  const total = inv.reduce((a, b) => a + b, 0)
  return Object.fromEntries(BASE_MODELS.map((id, i) => [id, inv[i] / total])) as Record<BaseModelId, number>
}

export type ForecastPoint = { year: number; value: number; lo: number; hi: number }
export type ForecastResult = {
  model: ModelId
  params: string
  scores: Record<ModelId, Score>
  weights: Record<BaseModelId, number>
  fitted: Point[]
  forecast: ForecastPoint[]
  train: Point[]
}

export type ForecastOptions = {
  model?: ModelChoice
  startYear?: number
  horizon?: number
  level?: Level
  /** additive offsets by forecast year, e.g. El Niño adjustment in °C */
  offsets?: Record<number, number>
}

export function runForecast(all: Point[], opts: ForecastOptions = {}): ForecastResult {
  const { model = 'auto', startYear = -Infinity, horizon = 2, level = 80, offsets = {} } = opts
  const train = all.filter((p) => p.year >= startYear).sort((a, b) => a.year - b.year)
  if (train.length < 3) throw new Error('Need at least 3 years of data to forecast.')
  const base = Object.fromEntries(BASE_MODELS.map((id) => [id, backtest(train, id)])) as Record<BaseModelId, Score>
  const weights = ensembleWeights(base)
  // shortcut: ensemble backtest reuses weights from the full-window base backtests (mild look-ahead); nest per origin if it matters
  const scores = { ...base, ensemble: backtest(train, 'ensemble', { weights }) }
  const chosen: ModelId = model === 'auto' ? pickBest(scores) : model
  const fit = fitModel(chosen, train, weights)
  const rmse = scores[chosen].rmse
  const last = train[train.length - 1].year
  const forecast = Array.from({ length: horizon }, (_, i) => {
    const year = last + i + 1
    const value = fit.predict(year) + (offsets[year] ?? 0)
    const half = Number.isFinite(rmse) ? Z[level] * rmse * Math.sqrt((i + 1) / 2) : 0
    return { year, value, lo: value - half, hi: value + half }
  })
  return {
    model: chosen,
    params: fit.params,
    scores,
    weights,
    train,
    fitted: train.map((p, i) => ({ year: p.year, value: fit.fitted[i] })),
    forecast,
  }
}

export function pickBest(scores: Record<ModelId, Score>): ModelId {
  return MODELS.filter((id) => Number.isFinite(scores[id].mae)).sort((a, b) => scores[a].mae - scores[b].mae)[0] ?? 'linear'
}

/** Parse pasted "year,value" text; tolerates headers, comments, tabs/semicolons and duplicate years (last wins). */
export function parseSeries(text: string): { points: Point[]; skipped: number } {
  const map = new Map<number, number>()
  let skipped = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [y, v] = line.split(/[,;\t]|\s+/).filter(Boolean).map(Number)
    if (Number.isInteger(y) && Number.isFinite(v)) map.set(y, v)
    else if (/\d/.test(line)) skipped++ // a header line like "year,value" is not an error
  }
  return { points: [...map].map(([year, value]) => ({ year, value })).sort((a, b) => a.year - b.year), skipped }
}

function fmt(v: number) {
  return Math.abs(v) >= 0.01 || v === 0 ? v.toFixed(3) : v.toExponential(2)
}
