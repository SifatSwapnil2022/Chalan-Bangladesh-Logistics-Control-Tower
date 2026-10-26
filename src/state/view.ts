// The whole view (page + filters + selections) lives in the URL hash, so any view can be
// bookmarked or sent to a colleague, and the browser's back button works like in a BI tool.
import { useSyncExternalStore } from 'react'
import type { Mode, Segment } from '../data/network'

export type PageId = 'brief' | 'overview' | 'lanes' | 'root-cause' | 'risk' | 'exceptions' | 'scenario' | 'lane' | 'method'
export type Period = '30d' | '90d' | '12m' | '18m'

export interface View {
  page: PageId
  period: Period
  mode: Mode | 'all'
  segment: Segment | 'all'
  carrier: string | null
  lane: string | null
  /** scenario levers, packed as "30-40-50-8" (percentages) */
  lv: string | null
}

export const DEFAULT_VIEW: View = { page: 'brief', period: '90d', mode: 'all', segment: 'all', carrier: null, lane: null, lv: null }
const PAGES: PageId[] = ['brief', 'overview', 'lanes', 'root-cause', 'risk', 'exceptions', 'scenario', 'lane', 'method']
const PERIODS: Period[] = ['30d', '90d', '12m', '18m']

export function parse(hash: string): View {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?')
  const q = new URLSearchParams(query)
  const page = (PAGES.includes(path as PageId) ? path : 'brief') as PageId
  const period = (PERIODS.includes(q.get('period') as Period) ? q.get('period') : DEFAULT_VIEW.period) as Period
  const mode = (['road', 'sea', 'air'].includes(q.get('mode') ?? '') ? q.get('mode') : 'all') as View['mode']
  const segment = (q.get('segment') ?? 'all') as View['segment']
  return { page, period, mode, segment, carrier: q.get('carrier'), lane: q.get('lane'), lv: q.get('lv') }
}

export function toHash(v: View) {
  const q = new URLSearchParams()
  if (v.period !== DEFAULT_VIEW.period) q.set('period', v.period)
  if (v.mode !== 'all') q.set('mode', v.mode)
  if (v.segment !== 'all') q.set('segment', v.segment)
  if (v.carrier) q.set('carrier', v.carrier)
  if (v.lane) q.set('lane', v.lane)
  if (v.lv && v.page === 'scenario') q.set('lv', v.lv)
  const s = q.toString()
  return `#/${v.page}${s ? `?${s}` : ''}`
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useView(): [View, (patch: Partial<View>) => void] {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash)
  const view = parse(hash)
  const set = (patch: Partial<View>) => {
    const next = toHash({ ...view, ...patch })
    if (next !== window.location.hash) window.location.hash = next
  }
  return [view, set]
}

export const href = (v: View, patch: Partial<View>) => toHash({ ...v, ...patch })
