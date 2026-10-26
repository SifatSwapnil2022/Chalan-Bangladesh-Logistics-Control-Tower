import { useEffect, useState } from 'react'
import { laneName } from './components/DecompTree'
import { Icon, Segmented } from './components/ui'
import { PERIODS } from './data/metrics'
import { CARRIERS, MODE_LABEL, SEGMENTS, type Mode } from './data/network'
import { Brief } from './pages/Brief'
import { Exceptions } from './pages/Exceptions'
import { LaneDetail } from './pages/LaneDetail'
import { Lanes } from './pages/Lanes'
import { Method } from './pages/Method'
import { Overview } from './pages/Overview'
import { Risk } from './pages/Risk'
import { RootCause } from './pages/RootCause'
import { Scenario } from './pages/Scenario'
import { AS_OF } from './pages/common'
import { DEFAULT_VIEW, href, useView, type PageId, type View } from './state/view'

const NAV: { group: string; items: { id: PageId; label: string }[] }[] = [
  { group: '', items: [{ id: 'brief', label: 'Brief' }] },
  {
    group: 'Monitor',
    items: [
      { id: 'overview', label: 'Overview' },
      { id: 'exceptions', label: 'Exceptions' },
    ],
  },
  {
    group: 'Analyse',
    items: [
      { id: 'lanes', label: 'Lanes and carriers' },
      { id: 'root-cause', label: 'Root cause' },
      { id: 'risk', label: 'Delay risk' },
    ],
  },
  { group: 'Plan', items: [{ id: 'scenario', label: 'Scenario planner' }] },
  { group: 'About', items: [{ id: 'method', label: 'Method' }] },
]

const FILTERED: PageId[] = ['overview', 'exceptions', 'lanes', 'root-cause', 'lane']
const TITLES: Record<PageId, string> = {
  brief: 'Brief',
  overview: 'Overview',
  exceptions: 'Exceptions',
  lanes: 'Lanes and carriers',
  'root-cause': 'Root cause',
  risk: 'Delay risk',
  scenario: 'Scenario planner',
  lane: 'Lane details',
  method: 'Method',
}

function FilterBar({ view, set }: { view: View; set: (p: Partial<View>) => void }) {
  const [copied, setCopied] = useState(false)
  const carriers = CARRIERS.filter((c) => view.mode === 'all' || c.mode === view.mode)
  const chips: { label: string; clear: Partial<View> }[] = []
  if (view.lane && view.page !== 'lane') chips.push({ label: `Lane: ${laneName(view.lane)}`, clear: { lane: null } })
  if (view.carrier) chips.push({ label: `Carrier: ${CARRIERS.find((c) => c.id === view.carrier)?.name ?? view.carrier}`, clear: { carrier: null } })
  const dirty = view.mode !== 'all' || view.segment !== 'all' || view.carrier || (view.lane && view.page !== 'lane') || view.period !== DEFAULT_VIEW.period

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked; the address bar has the same link */
    }
  }

  return (
    <div className="filters" role="region" aria-label="Filters">
      <Segmented label="Period" value={view.period} onChange={(period) => set({ period })} options={PERIODS.map((p) => ({ id: p.id, label: p.label }))} />
      <label className="select">
        <span>Mode</span>
        <select value={view.mode} onChange={(e) => set({ mode: e.target.value as View['mode'], carrier: null })}>
          <option value="all">All</option>
          {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </label>
      <label className="select">
        <span>Segment</span>
        <select value={view.segment} onChange={(e) => set({ segment: e.target.value as View['segment'] })}>
          <option value="all">All</option>
          {SEGMENTS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="select">
        <span>Carrier</span>
        <select value={view.carrier ?? ''} onChange={(e) => set({ carrier: e.target.value || null })}>
          <option value="">All</option>
          {carriers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {chips.map((c) => (
        <button key={c.label} className="chip" onClick={() => set(c.clear)} title="Remove this filter">
          {c.label}
          <Icon name="close" size={13} />
        </button>
      ))}
      <span className="filters-end">
        {dirty ? (
          <button className="link-btn" onClick={() => set({ mode: 'all', segment: 'all', carrier: null, lane: view.page === 'lane' ? view.lane : null, period: DEFAULT_VIEW.period })}>
            Reset
          </button>
        ) : null}
        <button className="icon-btn" onClick={copy} title="Copy a link to exactly this view">
          <Icon name="link" size={16} />
          <span>{copied ? 'Copied' : 'Copy link'}</span>
        </button>
      </span>
    </div>
  )
}

export default function App() {
  const [view, set] = useView()

  useEffect(() => {
    document.title = view.page === 'brief' ? 'Chalan · Freight control tower for Bangladesh' : `${view.page === 'lane' && view.lane ? laneName(view.lane) : TITLES[view.page]} · Chalan`
  }, [view.page, view.lane])

  // a new page starts at the top, as it would in a multi-page app
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view.page])

  const page = (() => {
    switch (view.page) {
      case 'brief':
        return <Brief set={set} />
      case 'overview':
        return <Overview view={view} set={set} />
      case 'lanes':
        return <Lanes view={view} set={set} />
      case 'root-cause':
        return <RootCause view={view} />
      case 'risk':
        return <Risk />
      case 'exceptions':
        return <Exceptions view={view} set={set} />
      case 'scenario':
        return <Scenario view={view} set={set} />
      case 'lane':
        return <LaneDetail view={view} set={set} />
      case 'method':
        return <Method />
    }
  })()

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <aside className="side">
        <a className="brand" href={href(view, { page: 'brief' })}>
          <span className="wordmark">Chalan</span>
          <span className="wordmark-bn" lang="bn">
            চালান
          </span>
        </a>
        <p className="brand-sub">Freight control tower, Bangladesh</p>
        <nav aria-label="Pages">
          {NAV.map((g) => (
            <div key={g.group || 'top'} className="nav-group">
              {g.group ? <p className="nav-title">{g.group}</p> : null}
              {g.items.map((i) => (
                <a key={i.id} href={href(view, { page: i.id })} className={`nav-item${view.page === i.id || (view.page === 'lane' && i.id === 'lanes') ? ' on' : ''}`} aria-current={view.page === i.id ? 'page' : undefined}>
                  <Icon name={i.id} />
                  <span>{i.label}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <p>
            Simulated data for a fictional company.
            <br />
            Cut-off {AS_OF}.
          </p>
          <p>
            <a href="https://github.com/SifatSwapnil2022/chalan-bangladesh-logistics-control-tower">Source on GitHub</a>
          </p>
        </div>
      </aside>

      <div className="main-col">
        {FILTERED.includes(view.page) ? <FilterBar view={view} set={set} /> : null}
        <main id="main" className={view.page === 'brief' ? 'main main-brief' : 'main'}>
          {page}
        </main>
        <footer className="foot">
          Built by Md Sifatullah Sheikh. Simulated data; carriers and Northgate Distribution are fictional. <a href="#/method">Method and limits</a>.
        </footer>
      </div>
    </div>
  )
}
