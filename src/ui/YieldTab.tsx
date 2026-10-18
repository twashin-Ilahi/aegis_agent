import { useState } from 'react';
import { chainName } from '../core/types';
import { fmtUsd } from '../core/math';
import { chainFromLlama, decisionApy, describeRec, eligiblePools, FALLBACK_POOLS } from '../core/yield';
import { Badge, Btn, Card, Empty } from './parts';
import { useAsync } from './hooks';
import { useEngine } from './store';

export function YieldTab() {
  const e = useEngine();
  const st = e.state;
  const { busy, error, run } = useAsync();
  const [showAll, setShowAll] = useState(false);
  if (!st.policy || !st.accountAddress) return <Card title="Yield">Set up your account first.</Card>;
  const pools = st.yields?.pools ?? FALLBACK_POOLS;
  const elig = new Set(eligiblePools(pools, st.policy).map((p) => p.pool));
  const recs = e.recommendations();
  const shown = showAll ? recs : recs.filter((r) => r.executable || r.netGainUsd > 0).slice(0, 8);
  const rule = st.rules.yieldRule;

  return (
    <div className="stack">
      <Card
        title="Yield scanner"
        right={
          <div className="row">
            <Badge tone={st.yields?.source === 'live' ? 'ok' : 'warn'} title={st.yields?.error}>
              {st.yields
                ? st.yields.source === 'live'
                  ? 'Live DeFiLlama data'
                  : 'Offline snapshot (illustrative)'
                : 'Offline snapshot (not refreshed)'}
            </Badge>
            <Btn busy={busy === 'scan'} onClick={() => run('scan', () => e.scanYields())}>
              Refresh
            </Btn>
          </div>
        }
      >
        <p className="small muted">
          Stablecoin pools on allowed chains, Aave V3 only, above your minimum TVL. Decisions use base APY (the lower of spot and 30-day
          mean). Reward APY is shown separately because reward tokens are volatile. Before acting, the live rate is re-read on-chain.
        </p>
        <div className="scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Chain</th>
                <th>Project</th>
                <th>Asset</th>
                <th>TVL</th>
                <th>Base APY</th>
                <th>30d mean</th>
                <th>Reward</th>
                <th>Decision APY</th>
                <th>On-chain now</th>
                <th>Used?</th>
              </tr>
            </thead>
            <tbody>
              {pools
                .filter((p) => showAll || ['Arbitrum', 'Optimism', 'Ethereum'].includes(p.chain))
                .slice(0, 40)
                .map((p) => {
                  const id = chainFromLlama(p.chain);
                  const used = elig.has(p.pool);
                  return (
                    <tr key={p.pool + p.symbol + p.project} className={used ? '' : 'dim'}>
                      <td>{p.chain}</td>
                      <td>{p.project}</td>
                      <td>{p.symbol}</td>
                      <td>{fmtUsd(p.tvlUsd).replace(/\.\d+$/, '')}</td>
                      <td>{p.apyBase?.toFixed(2) ?? '–'}%</td>
                      <td>{p.apyMean30d?.toFixed(2) ?? '–'}%</td>
                      <td>{(p.apyReward ?? 0).toFixed(2)}%</td>
                      <td>{used ? `${decisionApy(p).toFixed(2)}%` : '–'}</td>
                      <td>
                        {id && p.symbol === 'USDC' && p.project === 'aave-v3' ? `${e.world.chain(id).usdcSupplyApy.toFixed(2)}%` : '–'}
                      </td>
                      <td>
                        {used ? (
                          <Badge tone="ok">yes</Badge>
                        ) : (
                          <Badge>{p.symbol !== 'USDC' ? 'USDC only' : p.project !== 'aave-v3' ? 'Aave V3 only' : 'filtered'}</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        <label className="check">
          <input type="checkbox" checked={showAll} onChange={(ev) => setShowAll(ev.target.checked)} /> Show all rows, including filtered
          ones
        </label>
        {error && <p className="err">{error}</p>}
      </Card>

      <Card title="Recommendations (net of costs)" right={rule ? <Badge tone="ok">Yield rule active</Badge> : <Badge>No yield rule</Badge>}>
        <p className="small muted">
          net gain = (APY dest − APY src) × amount × horizon/365 − (bridge fee + gas src + gas dest + slippage). A bridge must also beat
          simply supplying on the same chain by your minimum margin. Horizon {st.policy.horizonDays} days · min net gain{' '}
          {fmtUsd(st.policy.minNetGainUsd)} · break-even ≤ {st.policy.maxBreakEvenDays} days.
        </p>
        {shown.length === 0 ? (
          <Empty>No profitable move right now. That is a valid answer: small rate gaps can be erased by fees.</Empty>
        ) : (
          <div className="scroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>APY</th>
                  <th>Gross</th>
                  <th>Costs</th>
                  <th>Net gain</th>
                  <th>Break-even</th>
                  <th>Risks / status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id} className={r.executable ? '' : 'dim'}>
                    <td>
                      <b>{describeRec(r)}</b>
                    </td>
                    <td>
                      {r.apySrc.toFixed(2)}% → {r.apyDest.toFixed(2)}%
                    </td>
                    <td>{fmtUsd(r.gross)}</td>
                    <td>{fmtUsd(r.costs)}</td>
                    <td className={r.netGainUsd > 0 ? 'ok-t' : 'bad-t'}>{fmtUsd(r.netGainUsd)}</td>
                    <td>{Number.isFinite(r.breakEvenDays) ? `${r.breakEvenDays.toFixed(1)} d` : '–'}</td>
                    <td className="small">
                      {r.executable ? <Badge tone="ok">executable</Badge> : <Badge tone="warn">{r.reasonNotExecutable}</Badge>}
                      <ul className="notes">
                        {r.risks.map((x, i) => (
                          <li key={i}>{x}</li>
                        ))}
                      </ul>
                    </td>
                    <td>
                      <Btn kind="primary" disabled={!r.executable} onClick={() => e.startRecommendation(r)}>
                        Do it
                      </Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="small muted">
          Movable amounts exclude the {fmtUsd(st.policy.rescueReserveUsd)} rescue reserve on chains where you have a loan, and are capped at{' '}
          {fmtUsd(st.policy.caps.perAction)} per action.
        </p>
      </Card>

      <Card title="Move history">
        {st.moves.length === 0 ? (
          <Empty>No moves yet.</Empty>
        ) : (
          st.moves
            .slice()
            .reverse()
            .map((m) => (
              <details key={m.id} className="move">
                <summary>
                  {fmtUsd(m.amount)} · {chainName(m.srcChain)} → {chainName(m.dstChain)}{' '}
                  <Badge tone={m.state === 'completed' ? 'ok' : m.state === 'failed' || m.state === 'halted' ? 'bad' : 'info'}>
                    {m.state.replace(/_/g, ' ')}
                  </Badge>
                </summary>
                <ul className="notes">
                  {m.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
                {m.state === 'awaiting_confirmation' && (
                  <Btn
                    kind="primary"
                    onClick={() => {
                      const pr = st.proposals.find((x) => x.status === 'awaiting_confirmation' && x.proposal.meta.moveId === m.id);
                      if (pr) void e.confirmProposal(pr.id);
                    }}
                  >
                    Approve
                  </Btn>
                )}
              </details>
            ))
        )}
      </Card>
    </div>
  );
}
