// Fetches the five climate records and writes one JSON file per vital sign into public/data.
// Run: node scripts/fetch-data.mjs   (also run weekly by .github/workflows/data.yml)
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const OUT = fileURLToPath(new URL('../public/data/', import.meta.url))

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'earth-vitals-forecast (university assignment)' } })
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`)
  const text = await res.text()
  const lm = res.headers.get('last-modified')
  return { text, lastModified: lm ? new Date(lm).toISOString() : new Date().toISOString() }
}

/** Rows of numeric-ish cells, skipping '#' comments, blank lines and lines that don't start with a digit (headers). */
export function rows(text, sep = /[,\s]+/) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && /^\d/.test(l))
    .map((l) => l.split(sep).map((c) => c.trim()))
}

const num = (s) => {
  const v = Number(s)
  return s !== '' && Number.isFinite(v) ? v : NaN
}

/** Average monthly values into calendar-year means, keeping only years with all 12 months. */
export function annualFromMonthly(monthly) {
  const by = new Map()
  for (const { year, value } of monthly) by.set(year, [...(by.get(year) ?? []), value])
  return [...by].filter(([, v]) => v.length === 12).map(([year, v]) => ({ year, value: round(v.reduce((a, b) => a + b) / 12, 3) }))
}

const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d
const valid = (p) => Number.isFinite(p.year) && Number.isFinite(p.value)

const sources = {
  async co2() {
    const ann = await get('https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_annmean_mlo.csv')
    const mm = await get('https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_mm_mlo.csv')
    // co2_mm_mlo columns: year, month, decimal date, average, deseasonalized, ndays, sdev, unc
    const monthly = rows(mm.text, ',').map((r) => ({ year: num(r[0]), month: num(r[1]), value: num(r[3]) })).filter((p) => valid(p) && p.value > 0)
    const last = monthly.at(-1)
    return {
      name: 'Carbon dioxide',
      short: 'CO₂',
      unit: 'ppm',
      decimals: 2,
      description: 'Annual mean atmospheric CO₂ mole fraction at Mauna Loa Observatory, Hawaiʻi.',
      source: 'NOAA Global Monitoring Laboratory, Mauna Loa',
      sourceUrl: 'https://gml.noaa.gov/ccgg/trends/',
      lastModified: [ann.lastModified, mm.lastModified].sort().at(-1),
      latestMonthly: last && { year: last.year, month: last.month, value: last.value },
      annual: rows(ann.text, ',').map((r) => ({ year: num(r[0]), value: num(r[1]) })).filter(valid),
    }
  },
  async temperature() {
    const g = await get('https://data.giss.nasa.gov/gistemp/tabledata_v4/GLB.Ts+dSST.csv')
    // Year,Jan..Dec,J-D,... ; missing values are '***'
    const r = rows(g.text, ',')
    const monthly = r.flatMap((c) => c.slice(1, 13).map((v, i) => ({ year: num(c[0]), month: i + 1, value: num(v) }))).filter(valid)
    const last = monthly.at(-1)
    return {
      name: 'Global surface temperature',
      short: 'Temperature',
      unit: '°C',
      decimals: 2,
      description: 'Annual (Jan–Dec) global land–ocean temperature anomaly relative to the 1951–1980 mean.',
      source: 'NASA GISS Surface Temperature Analysis (GISTEMP v4)',
      sourceUrl: 'https://data.giss.nasa.gov/gistemp/',
      lastModified: g.lastModified,
      latestMonthly: last,
      annual: r.map((c) => ({ year: num(c[0]), value: num(c[13]) })).filter(valid),
    }
  },
  async methane() {
    const m = await get('https://gml.noaa.gov/webdata/ccgg/trends/ch4/ch4_mm_gl.csv')
    // year, month, decimal, average, average_unc, trend, trend_unc
    const monthly = rows(m.text, ',').map((r) => ({ year: num(r[0]), month: num(r[1]), value: num(r[3]) })).filter((p) => valid(p) && p.value > 0)
    return {
      name: 'Methane',
      short: 'CH₄',
      unit: 'ppb',
      decimals: 1,
      description: 'Annual mean of NOAA globally averaged marine-surface monthly CH₄ (complete years only).',
      source: 'NOAA Global Monitoring Laboratory, global network',
      sourceUrl: 'https://gml.noaa.gov/ccgg/trends_ch4/',
      lastModified: m.lastModified,
      latestMonthly: monthly.at(-1),
      annual: annualFromMonthly(monthly),
    }
  },
  async sealevel() {
    // NASA's own GMSL indicator (PO.DAAC NASA_SSH_GMSL_INDICATOR) now sits behind Earthdata Login, so we use the
    // public University of Colorado altimetry release (TOPEX/Jason/Sentinel-6, NASA-funded). Its URL changes per release.
    const index = await get('https://sealevel.colorado.edu/data')
    const rel = [...index.text.matchAll(/href="\/data\/(\d{4}rel\d+)"/g)].map((m) => m[1]).sort().at(-1)
    const page = await get(`https://sealevel.colorado.edu/data/${rel}`)
    const url = page.text.match(/href="(https:\/\/sealevel\.colorado\.edu\/files\/[^"]+seasons_rmvd\.txt)"/)?.[1]
    if (!url) throw new Error(`no GMSL text file on release page ${rel}`)
    const f = await get(url)
    const samples = rows(f.text).map((r) => ({ t: num(r[0]), value: num(r[1]) })).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.value))
    const by = new Map()
    for (const s of samples) by.set(Math.floor(s.t), [...(by.get(Math.floor(s.t)) ?? []), s])
    // ~10-day samples: treat a year as complete if it has data reaching both January and December
    const annual = [...by]
      .filter(([y, v]) => v[0].t - y < 0.05 && v.at(-1).t - y > 0.95)
      .map(([year, v]) => ({ year, value: round(v.reduce((a, b) => a + b.value, 0) / v.length, 1) }))
    const last = samples.at(-1)
    return {
      name: 'Global mean sea level',
      short: 'Sea level',
      unit: 'mm',
      decimals: 1,
      description: `Annual mean satellite-altimetry GMSL (seasonal signal and GIA removed), relative to the altimetry reference. Release ${rel}.`,
      source: 'University of Colorado Sea Level Research Group (NASA-funded satellite altimetry)',
      sourceUrl: 'https://sealevel.colorado.edu/',
      file: url,
      lastModified: f.lastModified,
      latestMonthly: last && { year: Math.floor(last.t), month: Math.min(12, Math.floor((last.t % 1) * 12) + 1), value: last.value },
      annual,
    }
  },
  async seaice() {
    const s = await get('https://noaadata.apps.nsidc.org/NOAA/G02135/north/monthly/data/N_09_extent_v4.0.csv')
    // year, mo, source_dataset, region, extent, area ; missing = -9999
    const annual = rows(s.text, ',').map((r) => ({ year: num(r[0]), value: num(r[4]) })).filter((p) => valid(p) && p.value > 0)
    return {
      name: 'Arctic sea ice, September',
      short: 'Sea ice',
      unit: 'million km²',
      decimals: 2,
      description: 'Mean Arctic sea ice extent in September, the month of the annual minimum.',
      source: 'NSIDC Sea Ice Index, version 4 (G02135)',
      sourceUrl: 'https://nsidc.org/data/g02135',
      lastModified: s.lastModified,
      annual,
    }
  },
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await mkdir(OUT, { recursive: true })
  const fetchedAt = new Date().toISOString()
  let failed = 0
  for (const [id, load] of Object.entries(sources)) {
    try {
      const data = { id, fetchedAt, ...(await load()) }
      if (data.annual.length < 20) throw new Error(`only ${data.annual.length} annual points parsed`)
      await writeFile(`${OUT}${id}.json`, JSON.stringify(data, null, 1))
      console.log(`${id}: ${data.annual.length} years, ${data.annual[0].year}–${data.annual.at(-1).year}, last value ${data.annual.at(-1).value} ${data.unit}`)
    } catch (e) {
      // keep the previously committed JSON so one flaky server doesn't break the site
      failed++
      console.error(`${id}: FAILED, keeping existing file — ${e.message}`)
    }
  }
  if (failed === Object.keys(sources).length) process.exit(1)
}
