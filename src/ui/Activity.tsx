import { Fragment, useState } from 'react';
import { chainName } from '../core/types';
import { fmtHf, fmtUsd } from '../core/math';
import { selectorName } from '../core/contracts';
import { Badge, Btn, Card, Empty, Stat } from './parts';
import { fmtTime, short, useEngine } from './store';

const TONE = { success: 'ok', denied: 'warn', failed: 'bad', rejected_onchain: 'bad' } as const;

export function Activity() {
  const e = useEngine();
  const st = e.state;
  const [filter, setFilter] = useState<'all' | 'success' | 'denied' | 'failed' | 'rejected_onchain'>('all');
  const [src, setSrc] = useState<'all' | 'sentinel' | 'executor' | 'intent' | 'scanner'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const rows = st.actions
    .slice()
    .reverse()
    .filter((a) => (filter === 'all' || a.status === filter) && (src === 'all' || a.source === src));

  const exportJson = () => {
    const blob = new Blob(
      [JSON.stringify({ actions: st.actions, proposals: st.proposals, intents: st.intents, snapshots: st.snapshots }, null, 2)],
      { type: 'application/json' },
    );
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'aegis-activity.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const done = st.actions.filter((a) => a.status === 'success');
  const denied = st.actions.filter((a) => a.status === 'denied').length;
  const failed = st.actions.filter((a) => a.status === 'failed' || a.status === 'rejected_onchain').length;
  const moved = done.reduce((s, a) => s + a.valueUsd, 0);
  return (
    <div className="stack" data-tour="activity-feed">
      <div className="stats">
        <Stat icon="activity" label="Executed" value={done.length} sub={`${fmtUsd(moved)} total value`} />
        <Stat icon="shield" label="Rescues" value={done.filter((a) => a.rescue).length} sub="Sentinel actions that completed" tone="ok" />
        <Stat
          icon="stop"
          label="Blocked by policy"
          value={denied}
          sub="Denied before anything was signed"
          tone={denied ? 'warn' : undefined}
        />
        <Stat icon="pulse" label="Failed" value={failed} sub="Reverted, rejected on-chain or errored" tone={failed ? 'bad' : undefined} />
      </div>
      <Card
        title="Activity log"
        right={
          <div className="row wrap">
            <select value={filter} onChange={(ev) => setFilter(ev.target.value as typeof filter)} aria-label="Status filter">
              <option value="all">All outcomes</option>
              <option value="success">Executed</option>
              <option value="denied">Denied by policy</option>
              <option value="failed">Failed</option>
              <option value="rejected_onchain">Rejected on-chain</option>
            </select>
            <select value={src} onChange={(ev) => setSrc(ev.target.value as typeof src)} aria-label="Source filter">
              <option value="all">All sources</option>
              <option value="sentinel">Risk Sentinel</option>
              <option value="executor">Executor</option>
              <option value="intent">Your goals</option>
              <option value="scanner">Scanner</option>
            </select>
            <Btn onClick={exportJson}>Export JSON</Btn>
          </div>
        }
      >
        <p className="small muted">
          Every proposal, policy decision and transaction, with the reason in plain language. Click a row to see exactly which rules ran.
        </p>
        {rows.length === 0 ? (
          <Empty>No activity yet.</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Action</th>
                  <th>Chain</th>
                  <th>Value</th>
                  <th>Outcome</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 150).map((a) => {
                  const pr = st.proposals.find((p) => p.id === a.proposalId);
                  const isOpen = open === a.id;
                  return (
                    <Fragment key={a.id}>
                      <tr className="click" onClick={() => setOpen(isOpen ? null : a.id)}>
                        <td>{fmtTime(a.time)}</td>
                        <td>{a.source}</td>
                        <td>
                          {a.kind}
                          {a.rescue && <Badge tone="info">rescue</Badge>}
                        </td>
                        <td>{chainName(a.chainId)}</td>
                        <td>{fmtUsd(a.valueUsd)}</td>
                        <td>
                          <Badge tone={TONE[a.status]}>{a.status.replace('_', ' ')}</Badge>
                        </td>
                        <td className="small">
                          {a.status === 'success'
                            ? a.summary
                            : a.status === 'denied'
                              ? `${a.ruleId}: ${a.reason}`
                              : `${a.error ?? a.reason}`}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7}>
                            <div className="detail">
                              <div>
                                <h4>Proposal ({a.source})</h4>
                                <p className="small">{a.summary}</p>
                                {pr && (
                                  <dl className="kv small">
                                    <dt>Function</dt>
                                    <dd>{selectorName(pr.proposal.selector)}</dd>
                                    <dt>Target</dt>
                                    <dd>
                                      <code>{short(pr.proposal.target, 8)}</code>
                                    </dd>
                                    <dt>Params</dt>
                                    <dd>
                                      <code>{JSON.stringify(pr.proposal.params)}</code>
                                    </dd>
                                  </dl>
                                )}
                                {a.txHash && (
                                  <p className="small">
                                    tx <code>{short(a.txHash, 10)}</code> · gas {fmtUsd(a.gasUsd ?? 0)}
                                    {a.retries ? ` · ${a.retries} retries` : ''}
                                    {a.hfBefore !== undefined &&
                                      a.hfAfter !== undefined &&
                                      a.hfBefore !== a.hfAfter &&
                                      ` · health factor ${fmtHf(a.hfBefore)} → ${fmtHf(a.hfAfter)}`}
                                  </p>
                                )}
                                {a.error && <p className="err small">{a.error}</p>}
                              </div>
                              <div>
                                <h4>Policy decision: {pr?.decision?.result ?? a.status}</h4>
                                <ul className="checks">
                                  {pr?.decision?.checks.map((c, i) => (
                                    <li key={i} className={c.pass ? 'pass' : 'fail'}>
                                      <b>{c.ruleId}</b> {c.detail}
                                    </li>
                                  ))}
                                </ul>
                                {pr?.decision?.sim && (
                                  <p className="small muted">
                                    Simulation: value {fmtUsd(pr.decision.sim.valueUsd)}, health factor {fmtHf(pr.decision.sim.hfBefore)} →{' '}
                                    {fmtHf(pr.decision.sim.hfAfter)}, outflows{' '}
                                    {pr.decision.sim.outflows.length
                                      ? pr.decision.sim.outflows
                                          .map((o) => `${o.amount.toFixed(2)} ${o.token} → ${short(o.to, 4)}`)
                                          .join('; ')
                                      : 'none to third parties'}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
