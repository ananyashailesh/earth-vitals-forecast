import { useEffect, useState } from 'react'
import type { Point } from './forecast'

export const VITAL_IDS = ['co2', 'temperature', 'methane', 'sealevel', 'seaice'] as const
export type VitalId = (typeof VITAL_IDS)[number]

export type Vital = {
  id: VitalId
  name: string
  short: string
  unit: string
  decimals: number
  description: string
  source: string
  sourceUrl: string
  file?: string
  fetchedAt: string
  lastModified: string
  latestMonthly?: { year: number; month: number; value: number }
  annual: Point[]
}

/** Default training window: full record, except temperature where the post-1970 warming regime is the relevant trend. */
export const DEFAULT_START: Partial<Record<VitalId, number>> = { temperature: 1970 }

const BASE = import.meta.env.BASE_URL

export function useVitals() {
  const [state, setState] = useState<{ vitals?: Record<VitalId, Vital>; error?: string }>({})
  useEffect(() => {
    Promise.all(VITAL_IDS.map((id) => fetch(`${BASE}data/${id}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${id}.json: HTTP ${r.status}`))))))
      .then((list: Vital[]) => setState({ vitals: Object.fromEntries(list.map((v) => [v.id, v])) as Record<VitalId, Vital> }))
      .catch((e: Error) => setState({ error: e.message }))
  }, [])
  return state
}

export type TempUnit = 'C' | 'F'

/** Temperature values are anomalies, so °C → °F is a pure ×1.8 scale (no +32). */
export function display(v: Vital | undefined, unit: TempUnit) {
  const isF = v?.id === 'temperature' && unit === 'F'
  return {
    k: isF ? 1.8 : 1,
    unit: isF ? '°F' : (v?.unit ?? ''),
    decimals: v?.decimals ?? 2,
  }
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export function signed(v: number, d: number) {
  const s = v.toFixed(d)
  return v > 0 ? `+${s}` : s.replace('-', '−')
}

export const num = (v: number, d: number) => v.toFixed(d).replace('-', '−')
