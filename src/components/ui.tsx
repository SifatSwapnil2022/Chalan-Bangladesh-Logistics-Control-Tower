import { useState, type ReactNode } from 'react'
import { downloadCsv } from '../lib/csv'

const PATHS: Record<string, string> = {
  brief: 'M4 5h16M4 10h16M4 15h10M4 20h7',
  overview: 'M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z',
  lanes: 'M5 19c4-9 10-5 14-14M5 19l2-6M5 19l6-1',
  'root-cause': 'M12 4v5M12 9l-6 5M12 9l6 5M6 14v5M18 14v5M12 9v10',
  risk: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  exceptions: 'M5 5h14v14H5zM9 9h6M9 12h6M9 15h3',
  scenario: 'M4 18h4V9H4zM10 18h4V5h-4zM16 18h4v-6h-4z',
  method: 'M6 4h9l3 3v13H6zM9 11h6M9 14h6M9 17h4',
  link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  info: 'M12 8h.01M11 12h1v5h1',
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
      {name === 'info' ? <circle cx="12" cy="12" r="9" /> : null}
    </svg>
  )
}

export function Panel({
  title,
  note,
  actions,
  children,
  className = '',
}: {
  title: string
  note?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {note ? <p className="panel-note">{note}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  )
}

export function ExportButton({ name, rows }: { name: string; rows: () => Record<string, string | number | null>[] }) {
  return (
    <button className="icon-btn" onClick={() => downloadCsv(name, rows())} title="Download as CSV">
      <Icon name="download" size={16} />
      <span>CSV</span>
    </button>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Sparkline({ values, color = 'var(--brand)', width = 120, height = 32 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const span = hi - lo || 1
  const pts = values.map((v, i) => [(i * (width - 4)) / (values.length - 1) + 2, height - 3 - ((v - lo) * (height - 6)) / span])
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2.4} fill={color} />
    </svg>
  )
}

export function Delta({ diff, unit = '', goodWhenUp, fmt = (n: number) => n.toFixed(1), suffix = 'vs previous' }: { diff: number | null; unit?: string; goodWhenUp: boolean; fmt?: (n: number) => string; suffix?: string }) {
  if (diff === null || !isFinite(diff)) return <span className="delta muted">No earlier period to compare</span>
  if (Math.abs(diff) < 0.05) return <span className="delta muted">Flat {suffix}</span>
  const good = diff > 0 === goodWhenUp
  return (
    <span className={`delta ${good ? 'good' : 'bad'}`}>
      {diff > 0 ? '▲' : '▼'} {fmt(Math.abs(diff))}
      {unit} {suffix}
    </span>
  )
}

export function InfoTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="infotip">
      <button className="infotip-btn" aria-label="How this is calculated" aria-expanded={open} onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}>
        <Icon name="info" size={15} />
      </button>
      {open ? <span className="infotip-pop" role="tooltip">{text}</span> : null}
    </span>
  )
}
