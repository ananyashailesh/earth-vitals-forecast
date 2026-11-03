import * as d3 from 'd3'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { ForecastPoint, Point } from '../lib/forecast'
import { num, signed } from '../lib/vitals'
import s from './Chart.module.css'

type Props = {
  title: string
  history: Point[]
  trainStart: number
  fitted: Point[]
  forecast: ForecastPoint[]
  unit: string
  decimals: number
  level: number
}

const M = { top: 28, right: 18, bottom: 34, left: 56 }

export function Chart({ title, history: all, trainStart, fitted, forecast, unit, decimals, level }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [cursor, setCursor] = useState<number | null>(null)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(300, e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const height = width < 560 ? 280 : 380
  const last = all[all.length - 1]
  // show the training window plus a quarter of its length as context, so the forecast stays legible
  const x0 = Math.max(all[0].year, trainStart - Math.round((last.year - trainStart) / 4))
  const history = all.filter((p) => p.year >= x0)
  const years = useMemo(() => [...history.map((p) => p.year), ...forecast.map((f) => f.year)], [history, forecast])

  const x = d3
    .scaleLinear()
    .domain([history[0].year, forecast.at(-1)?.year ?? last.year])
    .range([M.left, width - M.right])
  const yVals = [...history.map((p) => p.value), ...fitted.map((p) => p.value), ...forecast.flatMap((f) => [f.lo, f.hi])]
  const y = d3
    .scaleLinear()
    .domain(d3.extent(yVals) as [number, number])
    .nice()
    .range([height - M.bottom, M.top])

  const line = d3
    .line<Point>()
    .x((p) => x(p.year))
    .y((p) => y(p.value))
  const pre = history.filter((p) => p.year <= trainStart)
  const inTrain = history.filter((p) => p.year >= trainStart)
  const fcLine = [last, ...forecast]
  const band = d3
    .area<ForecastPoint>()
    .x((f) => x(f.year))
    .y0((f) => y(f.lo))
    .y1((f) => y(f.hi))
  const bandPts: ForecastPoint[] = [{ ...last, lo: last.value, hi: last.value }, ...forecast]

  const xTicks = x.ticks(width < 560 ? 5 : 10).filter(Number.isInteger)
  const yTicks = y.ticks(height < 400 ? 5 : 7)
  const yFmt = y.tickFormat(height < 400 ? 5 : 7)

  const cy = cursor ?? null
  const obs = cy != null ? history.find((p) => p.year === cy) : undefined
  const fit = cy != null ? fitted.find((p) => p.year === cy) : undefined
  const fc = cy != null ? forecast.find((f) => f.year === cy) : undefined

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const yr = Math.round(x.invert(e.clientX - rect.left))
    setCursor(Math.min(Math.max(yr, years[0]), years[years.length - 1]))
  }

  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    const i = cursor == null ? years.indexOf(last.year) : years.indexOf(cursor)
    const step = { ArrowLeft: -1, ArrowRight: 1, PageDown: -10, PageUp: 10 }[e.key]
    if (step) setCursor(years[Math.min(Math.max(i + step, 0), years.length - 1)])
    else if (e.key === 'Home') setCursor(years[0])
    else if (e.key === 'End') setCursor(years[years.length - 1])
    else if (e.key === 'Escape') setCursor(null)
    else return
    e.preventDefault()
  }

  const fmt = (v: number) => num(v, decimals)
  const tipLeft = cy != null && x(cy) > width * 0.6

  return (
    <figure className={s.figure}>
      <figcaption className={s.legend}>
        <span className={s.key}>
          <i className={s.swObs} aria-hidden /> Observed
        </span>
        <span className={s.key}>
          <i className={s.swFit} aria-hidden /> Fitted trend
        </span>
        <span className={s.key}>
          <i className={s.swFc} aria-hidden /> Forecast, {level}% interval
        </span>
      </figcaption>
      <div ref={wrap} className={s.wrap}>
        <svg
          width={width}
          height={height}
          className={s.svg}
          tabIndex={0}
          role="img"
          aria-label={`${title}: chart of ${history.length} annual observations from ${history[0].year} to ${last.year} and a ${forecast.length}-year forecast. Use arrow keys to read values.`}
          onPointerMove={onMove}
          onPointerLeave={() => setCursor(null)}
          onKeyDown={onKey}
          onBlur={() => setCursor(null)}
        >
          <g className={s.grid}>
            {yTicks.map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x1={M.left} x2={width - M.right} />
                <text x={M.left - 8} dy="0.32em" textAnchor="end">
                  {yFmt(t)}
                </text>
              </g>
            ))}
            <text x={0} y={M.top - 14} className={s.unit}>
              {unit}
            </text>
          </g>
          <g className={s.axis} transform={`translate(0,${height - M.bottom})`}>
            <line x1={M.left} x2={width - M.right} />
            {xTicks.map((t) => (
              <g key={t} transform={`translate(${x(t)},0)`}>
                <line y2={5} />
                <text y={20} textAnchor="middle">
                  {t}
                </text>
              </g>
            ))}
          </g>

          {trainStart > history[0].year && (
            <g className={s.excluded}>
              <rect x={M.left} y={M.top} width={x(trainStart) - M.left} height={height - M.top - M.bottom} />
              <text x={M.left + 6} y={M.top + 12}>
                Excluded from training
              </text>
            </g>
          )}

          <path d={band(bandPts) ?? ''} className={s.band} />
          <path d={line(pre) ?? ''} className={`${s.obs} ${s.obsMuted}`} />
          <path d={line(inTrain) ?? ''} className={s.obs} />
          <path d={line(fitted) ?? ''} className={s.fit} />
          <path d={line(fcLine) ?? ''} className={s.fc} />
          {forecast.map((f) => (
            <circle key={f.year} cx={x(f.year)} cy={y(f.value)} r={4} className={s.fcDot} />
          ))}

          <g className={s.lastRecord} transform={`translate(${x(last.year)},0)`}>
            <line y1={M.top - 6} y2={height - M.bottom} />
            <text y={M.top - 12} textAnchor={x(last.year) > width - 120 ? 'end' : 'start'} dx={x(last.year) > width - 120 ? -4 : 4}>
              {last.year}
            </text>
          </g>

          {cy != null && (
            <g className={s.cursor} transform={`translate(${x(cy)},0)`}>
              <line y1={M.top} y2={height - M.bottom} />
              {obs && <circle cy={y(obs.value)} r={4.5} className={s.dotObs} />}
              {fc && <circle cy={y(fc.value)} r={5} className={s.dotFc} />}
            </g>
          )}
        </svg>
        {cy != null && (
          <div className={s.tip} style={{ left: tipLeft ? undefined : x(cy) + 12, right: tipLeft ? width - x(cy) + 12 : undefined }} aria-hidden>
            <b>{cy}</b>
            {obs && (
              <span>
                observed <em>{fmt(obs.value)}</em>
              </span>
            )}
            {fit && (
              <span>
                trend <em>{fmt(fit.value)}</em>
                {obs && <small> ({signed(obs.value - fit.value, decimals)})</small>}
              </span>
            )}
            {fc && (
              <>
                <span>
                  forecast <em>{fmt(fc.value)}</em>
                </span>
                <span>
                  {level}% <em>{fmt(fc.lo)} – {fmt(fc.hi)}</em>
                </span>
              </>
            )}
            <span className={s.tipUnit}>{unit}</span>
          </div>
        )}
        <p className={s.sr} aria-live="polite">
          {cy != null && [cy, obs && `observed ${fmt(obs.value)}`, fc && `forecast ${fmt(fc.value)}, ${level}% interval ${fmt(fc.lo)} to ${fmt(fc.hi)}`, unit].filter(Boolean).join(', ')}
        </p>
      </div>
    </figure>
  )
}
