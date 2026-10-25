import { useEffect, useMemo, useState } from 'react'
import { NOW, generate } from './data/generate'
import { PERIODS, type Filters, type Period } from './data/metrics'
import { SEGMENTS, type Mode, type Segment } from './data/network'
import { dateLabel } from './lib/format'
import { About } from './pages/About'
import { Overview } from './pages/Overview'

const PAGES = [
  { id: 'overview', label: 'Overview' },
  { id: 'about', label: 'About' },
] as const
type PageId = (typeof PAGES)[number]['id']

const pageFromHash = (): PageId => {
  const h = window.location.hash.replace('#', '')
  return (PAGES.find((p) => p.id === h)?.id ?? 'overview') as PageId
}

export default function App() {
  const all = useMemo(generate, [])
  const [page, setPage] = useState<PageId>(pageFromHash)
  const [filters, setFilters] = useState<Filters>({ period: '30d', mode: 'all', segment: 'all' })

  useEffect(() => {
    const on = () => setPage(pageFromHash())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="wordmark">Chalan</span>
          <span className="wordmark-bn" lang="bn">
            চালান
          </span>
          <span className="tagline">Logistics control tower for Bangladesh</span>
        </div>
        <nav className="tabs" aria-label="Pages">
          {PAGES.map((p) => (
            <a key={p.id} href={`#${p.id}`} aria-current={page === p.id ? 'page' : undefined}>
              {p.label}
            </a>
          ))}
        </nav>
        <p className="asof">Data as of {dateLabel(NOW)}, 10:00</p>
      </header>

      {page !== 'about' ? (
        <div className="filters" role="group" aria-label="Filters">
          <div className="seg" role="radiogroup" aria-label="Period">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                role="radio"
                aria-checked={filters.period === p.id}
                onClick={() => setFilters((f) => ({ ...f, period: p.id as Period }))}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="seg" role="radiogroup" aria-label="Mode">
            {(['all', 'road', 'sea', 'air'] as const).map((m) => (
              <button key={m} role="radio" aria-checked={filters.mode === m} onClick={() => setFilters((f) => ({ ...f, mode: m as Mode | 'all' }))}>
                {m === 'all' ? 'All modes' : m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <label className="select">
            <span>Customer</span>
            <select value={filters.segment} onChange={(e) => setFilters((f) => ({ ...f, segment: e.target.value as Segment | 'all' }))}>
              <option value="all">All segments</option>
              {SEGMENTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <main>{page === 'about' ? <About /> : <Overview all={all} filters={filters} />}</main>

      <footer className="foot">
        <p>© 2026 Md Sifatullah Sheikh. Synthetic data for demonstration.</p>
      </footer>
    </>
  )
}
