import { describe, expect, it } from 'vitest'
import { backtest, ensembleWeights, fitHolt, fitLinear, fitQuadratic, parseSeries, runForecast, type Point } from './forecast'
// @ts-expect-error plain JS build script
import { annualFromMonthly, rows } from '../../scripts/fetch-data.mjs'

const series = (f: (x: number) => number, from = 1980, to = 2020): Point[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ year: from + i, value: f(from + i) }))

describe('fits', () => {
  it('linear OLS recovers an exact line', () => {
    const fit = fitLinear(series((x) => 2 * x - 3900))
    expect(fit.predict(2030)).toBeCloseTo(160, 8)
  })

  it('quadratic OLS recovers an exact parabola on calendar years', () => {
    const f = (x: number) => 0.01 * (x - 2000) ** 2 + 0.5 * (x - 2000) + 300
    expect(fitQuadratic(series(f)).predict(2025)).toBeCloseTo(f(2025), 6)
  })

  it('Holt extrapolates a straight line exactly', () => {
    const fit = fitHolt(series((x) => 1.5 * x))
    expect(fit.predict(2022)).toBeCloseTo(1.5 * 2022, 6)
    expect(fit.fitted).toHaveLength(41)
  })
})

describe('backtest', () => {
  it('uses the last 6 origins, h = 2, with zero error on a line', () => {
    const s = backtest(series((x) => 3 * x), 'linear')
    expect(s.rows.map((r) => r.origin)).toEqual([2013, 2014, 2015, 2016, 2017, 2018])
    expect(s.rows.every((r) => r.target === r.origin + 2)).toBe(true)
    expect(s.mae).toBeCloseTo(0, 8)
    expect(s.rmse).toBeCloseTo(0, 8)
  })

  it('computes MAE and RMSE from known errors', () => {
    // flat history then one jump: linear fit on flat data predicts 0, actual 6 at the final target only
    const pts = series(() => 0)
    pts[pts.length - 1].value = 6
    const s = backtest(pts, 'linear')
    expect(s.mae).toBeCloseTo(1, 8)
    expect(s.rmse).toBeCloseTo(Math.sqrt(36 / 6), 8)
  })
})

describe('runForecast', () => {
  const quad = series((x) => 0.02 * (x - 1980) ** 2 + 300)

  it('auto mode picks the lowest-MAE model', () => {
    const r = runForecast(quad)
    const best = Math.min(...Object.values(r.scores).map((s) => s.mae))
    expect(r.scores[r.model].mae).toBe(best)
    expect(['quadratic', 'ensemble']).toContain(r.model)
  })

  it('ensemble weights are 1/MAE normalised', () => {
    const r = runForecast(quad, { model: 'ensemble' })
    const sum = Object.values(r.weights).reduce((a, b) => a + b, 0)
    expect(sum).toBeCloseTo(1, 10)
    const w = ensembleWeights({ linear: { mae: 1, rmse: 1, rows: [] }, quadratic: { mae: 2, rmse: 2, rows: [] }, holt: { mae: 4, rmse: 4, rows: [] } })
    expect(w.linear / w.quadratic).toBeCloseTo(2)
    expect(w.quadratic / w.holt).toBeCloseTo(2)
  })

  it('interval half-width is z · RMSE · sqrt(h/2)', () => {
    const noisy = series((x) => x + (x % 2 ? 1 : -1))
    const r = runForecast(noisy, { model: 'linear', horizon: 4, level: 95 })
    const rmse = r.scores.linear.rmse
    r.forecast.forEach((f, i) => expect((f.hi - f.lo) / 2).toBeCloseTo(1.96 * rmse * Math.sqrt((i + 1) / 2), 8))
    const r80 = runForecast(noisy, { model: 'linear', horizon: 2, level: 80 })
    expect((r80.forecast[1].hi - r80.forecast[1].lo) / 2).toBeCloseTo(1.2816 * rmse, 8)
  })

  it('respects start year, horizon and additive offsets', () => {
    const r = runForecast(series((x) => x), { model: 'linear', startYear: 2000, horizon: 3, offsets: { 2022: 0.5 } })
    expect(r.train[0].year).toBe(2000)
    expect(r.forecast.map((f) => f.year)).toEqual([2021, 2022, 2023])
    expect(r.forecast[1].value).toBeCloseTo(2022.5, 8)
  })

  it('rejects too-short series', () => {
    expect(() => runForecast(series((x) => x, 2000, 2001))).toThrow()
  })
})

describe('parsing', () => {
  it('parseSeries handles headers, comments, separators and duplicates', () => {
    const { points, skipped } = parseSeries('year,value\n# note\n2001,1.5\n2000;1\n2002\t2\n2001,1.7\nbad,row\n20x1,4\n')
    expect(points).toEqual([
      { year: 2000, value: 1 },
      { year: 2001, value: 1.7 },
      { year: 2002, value: 2 },
    ])
    expect(skipped).toBe(1)
  })

  it('fetch script skips comment and header lines and keeps complete years only', () => {
    expect(rows('# c\nyear,mean\n2020,1\n\n2021,2', ',')).toEqual([
      ['2020', '1'],
      ['2021', '2'],
    ])
    const monthly = [...Array(12)].map((_, i) => ({ year: 2020, month: i + 1, value: i })).concat([{ year: 2021, month: 1, value: 5 }])
    expect(annualFromMonthly(monthly)).toEqual([{ year: 2020, value: 5.5 }])
  })
})
