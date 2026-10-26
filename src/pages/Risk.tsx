import { useMemo, useState } from 'react'
import { BarList, CalibrationChart, CostCurve, RocChart } from '../components/charts'
import { Panel } from '../components/ui'
import { MODEL } from '../data/store'
import { int, pct } from '../lib/format'
import { PageHead } from './common'

const { score, late } = MODEL.test as { score: number[]; late: number[] }

function confusion(t: number) {
  let tp = 0
  let fp = 0
  let fn = 0
  let tn = 0
  for (let i = 0; i < score.length; i++) {
    const flag = score[i] >= t
    if (late[i]) flag ? tp++ : fn++
    else flag ? fp++ : tn++
  }
  return { tp, fp, fn, tn }
}

export function Risk() {
  const [t, setT] = useState(MODEL.threshold)
  const c = useMemo(() => confusion(t), [t])
  const curve = useMemo(() => {
    const out: { t: number; cost: number }[] = []
    for (let x = 0.05; x <= 0.601; x += 0.01) {
      const k = confusion(x)
      out.push({ t: +x.toFixed(2), cost: MODEL.costs.missed_delay * k.fn + MODEL.costs.false_alarm * k.fp })
    }
    return out
  }, [])
  const best = curve.reduce((a, b) => (b.cost < a.cost ? b : a))
  const n = score.length
  const lateN = c.tp + c.fn
  const precision = c.tp / Math.max(1, c.tp + c.fp)
  const recall = c.tp / Math.max(1, lateN)
  const flagged = (c.tp + c.fp) / n
  const cost = MODEL.costs.missed_delay * c.fn + MODEL.costs.false_alarm * c.fp
  const noModel = MODEL.costs.missed_delay * lateN
  const chosen = MODEL.results[MODEL.chosen as keyof typeof MODEL.results]
  const rows = Object.entries(MODEL.results) as [string, (typeof MODEL.results)['Logistic regression']][]

  return (
    <>
      <PageHead title="Delay risk at dispatch">
        {MODEL.question} Trained on shipments up to {MODEL.split.train.to}, tested on the {int(MODEL.split.test.rows)} delivered between {MODEL.split.test.from} and {MODEL.split.test.to}, which it never saw. The filters in the bar above do not apply here.
      </PageHead>

      <div className="callout">
        <p>
          <b>How good is it?</b> Moderately. The area under the ROC curve is {chosen.roc_auc.toFixed(2)}, where 0.5 is a coin toss. That is enough to sort a morning call list so the riskiest loads get checked first. It is not enough to tell a customer their load will be late.
        </p>
      </div>

      <div className="grid-risk">
        <Panel title="Pick a threshold" note="Shipments scored at or above it go on the call list. Drag to see what changes.">
          <div className="threshold">
            <label htmlFor="thr">
              Flag when the chance of delay is at least <b>{Math.round(t * 100)}%</b>
            </label>
            <input id="thr" type="range" min={0.05} max={0.6} step={0.01} value={t} onChange={(e) => setT(+e.target.value)} />
            <div className="threshold-marks">
              <button className="link-btn" onClick={() => setT(MODEL.threshold)}>
                Reset to {Math.round(MODEL.threshold * 100)}% (chosen on validation data)
              </button>
            </div>
          </div>

          <div className="confusion" role="table" aria-label="Confusion matrix on the test months">
            <span />
            <span className="cm-head">Turned out late</span>
            <span className="cm-head">Arrived on time</span>
            <span className="cm-side">Flagged</span>
            <span className="cm good">
              <b>{int(c.tp)}</b>delays caught
            </span>
            <span className="cm warn">
              <b>{int(c.fp)}</b>needless calls
            </span>
            <span className="cm-side">Not flagged</span>
            <span className="cm bad">
              <b>{int(c.fn)}</b>delays missed
            </span>
            <span className="cm">
              <b>{int(c.tn)}</b>left alone, fine
            </span>
          </div>

          <dl className="facts">
            <div>
              <dt>Delays caught</dt>
              <dd>{pct(recall * 100, 0)}</dd>
            </div>
            <div>
              <dt>Flagged loads that were late</dt>
              <dd>{pct(precision * 100, 0)}</dd>
            </div>
            <div>
              <dt>Share of loads flagged</dt>
              <dd>{pct(flagged * 100, 0)}</dd>
            </div>
          </dl>
          <p className="panel-foot">
            In plain terms: out of every 10 late loads it warns about {Math.round(recall * 10)}. Out of every 10 loads it warns about, {Math.round(precision * 10)} are really late. For comparison, {pct((100 * lateN) / n, 0)} of all loads in these months were late.
          </p>
        </Panel>

        <Panel title="Cost of the mistakes" note={`A missed delay is counted as ${MODEL.costs.missed_delay} times as costly as a needless call: an unhappy customer and a penalty against ten minutes on the phone.`}>
          <CostCurve curve={curve} current={t} best={best.t} />
          <dl className="facts">
            <div>
              <dt>At this threshold</dt>
              <dd>{int(cost)} units</dd>
            </div>
            <div>
              <dt>With no model</dt>
              <dd>{int(noModel)} units</dd>
            </div>
            <div>
              <dt>Saving</dt>
              <dd>{pct((100 * (noModel - cost)) / noModel, 0)}</dd>
            </div>
          </dl>
          <p className="panel-foot">
            The lowest point on the test months is {Math.round(best.t * 100)}%. The live threshold was fixed on March and April data before the test months were looked at, so it is a little off the best one here. That gap is normal and is the honest number to report.
          </p>
        </Panel>
      </div>

      <div className="grid-3">
        <Panel title="ROC curve" note="Every threshold at once. The dot is the one above.">
          <RocChart roc={MODEL.roc} auc={chosen.roc_auc} point={{ fpr: c.fp / Math.max(1, c.fp + c.tn), tpr: recall }} />
        </Panel>
        <Panel title="Are the percentages honest?" note="Shipments grouped by predicted risk. On the diagonal means a 30% score really is late about 30% of the time.">
          <CalibrationChart bins={MODEL.calibration} />
        </Panel>
        <Panel title="What the model leans on" note="Drop in PR-AUC on the test months when the field is shuffled. Bigger means the model needs it more.">
          <BarList items={MODEL.importance.filter((i) => i.drop > 0.0005).map((i) => ({ key: i.feature, label: i.feature, value: i.drop, display: i.drop.toFixed(3) }))} />
        </Panel>
      </div>

      <Panel title="Models compared on the test months" note={`Logistic regression was picked on validation PR-AUC (${MODEL.validation_pr_auc['Logistic regression']} against ${MODEL.validation_pr_auc['Gradient boosting']}), not on these numbers. It is also the one a planner can have explained to them.`}>
        <div className="table-wrap">
          <table className="table static">
            <thead>
              <tr>
                <th>Model</th>
                <th className="num">ROC-AUC</th>
                <th className="num">PR-AUC</th>
                <th className="num">Brier</th>
                <th className="num">Caught</th>
                <th className="num">Precision</th>
                <th className="num hide-sm">Flagged</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, r]) => (
                <tr key={name} className={name === MODEL.chosen ? 'selected' : ''}>
                  <td>
                    <b>{name}</b>
                    {name === MODEL.chosen ? <span className="tag">in use</span> : null}
                  </td>
                  <td className="num">{r.roc_auc.toFixed(3)}</td>
                  <td className="num">{r.pr_auc.toFixed(3)}</td>
                  <td className="num">{r.brier.toFixed(3)}</td>
                  <td className="num">{pct(r.recall * 100, 0)}</td>
                  <td className="num">{r.precision ? pct(r.precision * 100, 0) : '–'}</td>
                  <td className="num hide-sm">{pct(r.flagged_share * 100, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-foot">
          "No model" is what happens today: nothing is flagged, every delay is found out when the truck does not arrive. Its PR-AUC equals the late rate. Full report: <a href="https://github.com/SifatSwapnil2022/chalan-bangladesh-logistics-control-tower/blob/main/analytics/reports/MODEL_REPORT.md">MODEL_REPORT.md</a>.
        </p>
      </Panel>
    </>
  )
}
