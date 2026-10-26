import { useMemo, type ReactNode } from 'react'
import { Delta, InfoTip, Sparkline } from '../components/ui'
import { NOW } from '../data/generate'
import { periodLabel, slice, stats, windows } from '../data/metrics'
import { ALL } from '../data/store'
import { dateLabel } from '../lib/format'
import type { View } from '../state/view'

export const AS_OF = `${dateLabel(NOW)}, 10:00 Dhaka time`

/** Everything a filtered page needs: the slice, both time windows and their stats. */
export function useSlice(v: View, opts: { ignoreLane?: boolean } = {}) {
  const lane = opts.ignoreLane ? null : v.lane
  return useMemo(() => {
    const sliced = slice(ALL, { mode: v.mode, segment: v.segment, carrier: v.carrier, lane })
    const w = windows(sliced, v.period)
    return { sliced, ...w, now: stats(w.current), prev: stats(w.previous) }
  }, [v.mode, v.segment, v.carrier, lane, v.period])
}

export function PageHead({ title, children, aside }: { title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {children ? <div className="page-sub">{children}</div> : null}
      </div>
      {aside ? <div className="page-aside">{aside}</div> : null}
    </header>
  )
}

export function scopeText(v: View) {
  return `Delivered in the last ${periodLabel(v.period)} to ${AS_OF}`
}

export function Kpi({
  label,
  value,
  tip,
  delta,
  spark,
  sparkColor,
  foot,
  tone,
}: {
  label: string
  value: ReactNode
  tip?: string
  delta?: { diff: number | null; unit?: string; goodWhenUp: boolean; fmt?: (n: number) => string }
  spark?: number[]
  sparkColor?: string
  foot?: ReactNode
  tone?: 'ok' | 'warn' | 'bad'
}) {
  return (
    <div className={`kpi${tone ? ` tone-${tone}` : ''}`}>
      <p className="kpi-label">
        {label}
        {tip ? <InfoTip text={tip} /> : null}
      </p>
      <div className="kpi-row">
        <p className="kpi-value">{value}</p>
        {spark ? <Sparkline values={spark} color={sparkColor} width={84} height={30} /> : null}
      </div>
      {delta ? <Delta {...delta} /> : null}
      {foot ? <p className="kpi-note">{foot}</p> : null}
    </div>
  )
}

export const pctChange = (now: number, prev: number) => (prev ? (100 * (now - prev)) / prev : null)
