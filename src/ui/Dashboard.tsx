import { BENCH } from '../core/engine';
import { fmtHf, fmtUsd } from '../core/math';
import { CHAIN_IDS, chainName } from '../core/types';
import { isInFlight } from '../core/executor';
import { Badge, Btn, Card, Empty, Gauge, Icon, Meter, Spark, Stat } from './parts';
import { headroom } from '../core/policy';
import { setupDemo } from '../core/scenarios';
import { fmtTime, useEngine } from './store';

export function Dashboard({ go, onOpenTour }: { go: (tab: string) => void; onOpenTour?: () => void }) {
  const e = useEngine();
  const st = e.state;
  if (!st.accountAddress || !st.policy) {
    return (
      <div className="stack">
        <section className="hero" data-tour="dashboard-hero">
          <div>
            <Badge tone="info">Hackathon Topic F · autonomous risk management</Badge>
            <h2>Your DeFi yield and loan safety, on autopilot, within limits you set.</h2>
            <p>
              Tell the agent what you want in plain English. It finds the best stablecoin yield across Arbitrum, Optimism and Ethereum, and
              watches your Aave loan around the clock. It never holds your main key, and every action passes a deterministic policy check
              first.
            </p>
            <div className="row">
              <Btn kind="primary" onClick={() => setupDemo(e)}>
                Launch the demo (one click)
              </Btn>
              <Btn onClick={() => go('account')}>Set up manually</Btn>
              {onOpenTour && (
                <Btn kind="ghost" onClick={onOpenTour}>
                  <Icon name="sparkles" size={13} /> Take a tour
                </Btn>
              )}
            </div>
            <p className="small muted">
              The demo creates a wallet, smart accounts, a loan, and a scoped session key on a simulated fork. No real funds.
            </p>
          </div>
          <ol className="steps">
            <li>
              <b>Understand</b>
              <span>Plain-English goals become validated, structured intents.</span>
            </li>
            <li>
              <b>Find</b>
              <span>A yield scanner ranks opportunities after bridge, gas and slippage costs.</span>
            </li>
            <li>
              <b>Move</b>
              <span>Deposits, withdrawals and cross-chain moves, each policy-checked and simulated.</span>
            </li>
            <li>
              <b>Protect</b>
              <span>The Risk Sentinel rescues positions before liquidation.</span>
            </li>
          </ol>
        </section>
        <div className="features">
          <div className="feature">
            <Icon name="key" size={20} />
            <b>Bounded session key</b>
            <span>Allowlisted contracts and functions, spending caps and expiry, enforced by the account itself.</span>
          </div>
          <div className="feature">
            <Icon name="shield" size={20} />
            <b>Policy engine</b>
            <span>Ordinary code, no AI and no randomness. Fails closed on any doubt.</span>
          </div>
          <div className="feature">
            <Icon name="stop" size={20} />
            <b>You stay in control</b>
            <span>Pause or revoke at any time. Every action is logged with a plain-language reason.</span>
          </div>
        </div>
      </div>
    );
  }
  const p = st.policy;
  const acct = st.accountAddress;
  const w = e.world;
  const rows = CHAIN_IDS.map((id) => {
    const d = w.accountData(id, acct);
    const b = w.balance(id, acct);
    const pos = w.position(id, acct);
    const ch = w.chain(id);
    return { id, d, b, pos, ch, gas: ch.gasReserveUsd[acct.toLowerCase()] ?? 0 };
  });
  const loans = rows.filter((r) => r.d.debtUsd > 0.01 || r.pos.collateralWeth > 0);
  const bench = w.accountData(42161, BENCH);
  const benchActive = w.position(42161, BENCH).collateralWeth > 0;
  const snaps = st.snapshots.filter((s) => s.chainId === 42161).slice(-80);
  const totalIdle = rows.reduce((s, r) => s + r.b.USDC, 0);
  const totalEarning = rows.reduce((s, r) => s + r.pos.suppliedUsdc, 0);
  const pendingProps = st.proposals.filter((x) => x.status === 'awaiting_confirmation');
  const pendingIntents = st.intents.filter((x) => x.status === 'awaiting_confirmation');
  const move =
    st.moves
      .slice()
      .reverse()
      .find((m) => isInFlight(m)) ?? st.moves[st.moves.length - 1];
  const hbAge = Math.max(0, w.now() - st.sentinel.lastBeat);

  const worst = loans.reduce((m, r) => Math.min(m, r.d.healthFactor), Infinity);
  const netWorth = rows.reduce((s, r) => s + r.b.USDC + r.pos.suppliedUsdc + r.d.collateralUsd - r.d.debtUsd, 0);
  const wTone = worst < p.healthFactor.trigger ? 'bad' : worst < p.healthFactor.warn ? 'warn' : 'ok';
  return (
    <div className="stack">
      <Checklist go={go} />
      <div className="stats">
        <Stat icon="wallet" label="Net value" value={fmtUsd(netWorth)} sub="Idle + earning + collateral − debt" />
        <Stat icon="coins" label="Idle USDC" value={fmtUsd(totalIdle)} sub={`${fmtUsd(p.rescueReserveUsd)} kept as rescue reserve`} />
        <Stat icon="yield" label="Earning" value={fmtUsd(totalEarning)} sub="Supplied on Aave V3" />
        <Stat
          icon="pulse"
          label="Lowest health factor"
          value={Number.isFinite(worst) ? fmtHf(worst) : '–'}
          tone={Number.isFinite(worst) ? wTone : undefined}
          sub={`Trigger ${p.healthFactor.trigger} · target ${p.healthFactor.target}`}
        />
      </div>
      <div className="grid two">
        <div className="stack" data-tour="dashboard-loans">
          <Card
            title="Loan health"
            right={
              <Badge tone={p.paused ? 'bad' : 'ok'} title="Risk Sentinel">
                Sentinel{' '}
                {p.paused ? 'paused' : st.sentinel.workerDown ? 'DOWN' : `ok · ${hbAge < 120 ? `${Math.round(hbAge)}s ago` : 'idle'}`}
              </Badge>
            }
          >
            {loans.length === 0 ? (
              <Empty>No open loans. Use the one-click demo setup in the Account tab to open one.</Empty>
            ) : (
              <div className="gauges">
                {loans.map((r) => (
                  <div key={r.id} className="gauge-card">
                    <div className="gauge-title">{chainName(r.id)} · Aave V3</div>
                    <Gauge
                      hf={r.d.healthFactor}
                      trigger={p.healthFactor.trigger}
                      warn={p.healthFactor.warn}
                      target={p.healthFactor.target}
                    />
                    <div className="small muted">
                      Collateral {fmtUsd(r.d.collateralUsd)} · Debt {fmtUsd(r.d.debtUsd)}
                    </div>
                    <div className="small muted">
                      ETH {fmtUsd(r.d.price)} · trigger {p.healthFactor.trigger} → target {p.healthFactor.target}
                    </div>
                    {r.d.debtUsd > 0 && r.d.healthFactor < p.healthFactor.warn && (
                      <Badge tone={r.d.healthFactor < p.healthFactor.trigger ? 'bad' : 'warn'}>
                        {r.d.healthFactor < p.healthFactor.trigger ? 'Rescue zone' : 'Warning zone'}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
            {benchActive && (
              <div className="compare">
                <div>
                  <b>Protected</b> <span className="muted">(your account)</span>
                  <div className="big ok-t">{fmtHf(w.accountData(42161, acct).healthFactor)}</div>
                </div>
                <div>
                  <b>Unprotected</b> <span className="muted">(identical loan, no agent)</span>
                  <div className={`big ${bench.healthFactor < 1 ? 'bad-t' : ''}`}>{fmtHf(bench.healthFactor)}</div>
                  <div className="small muted">
                    Debt {fmtUsd(bench.debtUsd)}
                    {st.liquidations.some((l) => l.benchmark) && <Badge tone="bad">liquidated</Badge>}
                  </div>
                </div>
              </div>
            )}
            <h4>Health factor over time (Arbitrum)</h4>
            <Spark
              series={[
                { name: 'Protected', values: snaps.map((s) => Math.min(s.healthFactor, 3)) },
                {
                  name: 'Unprotected',
                  values: snaps.map((s) => (s.benchHf !== undefined ? Math.min(s.benchHf, 3) : NaN)).filter(Number.isFinite),
                },
              ]}
              colors={['var(--ok)', 'var(--muted)']}
            />
            <div className="legend small muted">
              <span className="dot" style={{ background: 'var(--ok)' }} /> protected{' '}
              <span className="dot" style={{ background: 'var(--muted)' }} /> unprotected · dashed line = liquidation (1.0)
            </div>
          </Card>

          <Card title="Balances">
            <div className="scroll">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Chain</th>
                    <th>Idle USDC</th>
                    <th>Earning</th>
                    <th>APY</th>
                    <th>Collateral</th>
                    <th>Debt</th>
                    <th>Gas reserve</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{chainName(r.id)}</td>
                      <td>{fmtUsd(r.b.USDC)}</td>
                      <td>{fmtUsd(r.pos.suppliedUsdc)}</td>
                      <td>{r.ch.usdcSupplyApy.toFixed(2)}%</td>
                      <td>{r.pos.collateralWeth ? `${r.pos.collateralWeth.toFixed(3)} WETH` : '–'}</td>
                      <td>{r.pos.debtUsdc ? fmtUsd(r.pos.debtUsdc) : '–'}</td>
                      <td className={r.gas < r.ch.gasUsd * 5 ? 'bad-t' : ''}>{fmtUsd(r.gas)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Total</td>
                    <td>{fmtUsd(totalIdle)}</td>
                    <td>{fmtUsd(totalEarning)}</td>
                    <td colSpan={4} />
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="small muted">
              Rescue reserve: the agent keeps {fmtUsd(p.rescueReserveUsd)} idle USDC on chains where you have a loan, so it can always
              repay.
            </p>
          </Card>
        </div>

        <div className="stack">
          {(pendingIntents.length > 0 || pendingProps.length > 0) && (
            <Card title="Waiting for you" className="attn">
              {pendingIntents.map((i) => (
                <div key={i.id} className="pending">
                  <div>{i.summaries.join(' ')}</div>
                  <div className="row">
                    <Btn kind="primary" onClick={() => e.confirmIntent(i.id)}>
                      Confirm rule
                    </Btn>
                    <Btn onClick={() => e.rejectIntent(i.id)}>Reject</Btn>
                  </div>
                </div>
              ))}
              {pendingProps.map((r) => (
                <div key={r.id} className="pending">
                  <div>{r.proposal.reason}</div>
                  <div className="row">
                    <Btn kind="primary" onClick={() => e.confirmProposal(r.id)}>
                      Approve
                    </Btn>
                    <Btn onClick={() => e.rejectProposal(r.id)}>Reject</Btn>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <SecurityPosture />

          <Card
            title="Standing rules"
            right={
              <Btn kind="ghost" onClick={() => go('agent')}>
                Edit
              </Btn>
            }
          >
            <ul className="plain">
              <li>
                <Badge tone={st.rules.protect.enabled ? 'ok' : 'neutral'}>{st.rules.protect.enabled ? 'On' : 'Off'}</Badge> Loan protection:
                rescue below {p.healthFactor.trigger}, restore to {p.healthFactor.target}
              </li>
              <li>
                <Badge tone={st.rules.yieldRule ? 'ok' : 'neutral'}>{st.rules.yieldRule ? 'On' : 'Off'}</Badge>{' '}
                {st.rules.yieldRule
                  ? `Yield: ${st.rules.yieldRule.amount === 'all_idle' ? 'all idle USDC' : fmtUsd(st.rules.yieldRule.amount)} → ${st.rules.yieldRule.destinationChain ? chainName(st.rules.yieldRule.destinationChain) : 'best net yield'}`
                  : 'Yield optimization: tell the agent in the Agent tab'}
              </li>
              <li>
                Limits: {fmtUsd(p.caps.perAction)} per action · {fmtUsd(p.caps.perDay)} per day · slippage ≤ {p.maxSlippageBps / 100}% ·
                policy v{p.version}
              </li>
            </ul>
            {st.safeMode && (
              <p className="err">
                Safe mode is ON after an unexpected result. All actions are denied. <Btn onClick={() => e.clearSafeMode()}>Clear</Btn>
              </p>
            )}
          </Card>

          <Card title="Latest cross-chain move">
            {move ? (
              <>
                <div className="row between">
                  <b>
                    {fmtUsd(move.amount)} · {chainName(move.srcChain)} → {chainName(move.dstChain)}
                  </b>
                  <Badge
                    tone={
                      move.state === 'completed'
                        ? 'ok'
                        : ['failed', 'halted', 'idle_after_failure'].includes(move.state)
                          ? 'bad'
                          : move.state === 'cancelled'
                            ? 'neutral'
                            : 'info'
                    }
                  >
                    {move.state.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <ul className="notes">
                  {move.notes.slice(-4).map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
                {isInFlight(move) && move.state !== 'bridging' && <Btn onClick={() => e.cancelMoveById(move.id)}>Cancel</Btn>}
              </>
            ) : (
              <Empty>No moves yet.</Empty>
            )}
          </Card>

          <Card title="Alerts and events" right={<Badge>{st.notifications.length}</Badge>}>
            {st.notifications.length === 0 ? (
              <Empty>Nothing yet.</Empty>
            ) : (
              <ul className="feed">
                {st.notifications
                  .slice(-14)
                  .reverse()
                  .map((n) => (
                    <li key={n.id} className={n.level}>
                      <span className="t">{fmtTime(n.time)}</span> {n.text}
                    </li>
                  ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Checklist({ go }: { go: (t: string) => void }) {
  const e = useEngine();
  const st = e.state;
  const acct = st.accountAddress;
  const funded =
    !!acct && ([1, 10, 42161] as const).some((id) => e.world.balance(id, acct).USDC > 0 || e.world.position(id, acct).collateralWeth > 0);
  const steps = [
    { label: 'Wallet connected', done: !!st.owner, tab: 'account' },
    { label: 'Smart account created', done: !!acct, tab: 'account' },
    { label: 'Account funded', done: funded, tab: 'account' },
    { label: 'Session key granted', done: st.session?.status === 'active', tab: 'account' },
    { label: 'First goal confirmed', done: st.intents.some((i) => i.status === 'active'), tab: 'agent' },
  ];
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) return null;
  const next = steps.find((s) => !s.done)!;
  return (
    <Card
      title={`Get started · ${n}/${steps.length}`}
      right={
        <Btn kind="primary" onClick={() => go(next.tab)}>
          Next: {next.label}
        </Btn>
      }
    >
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={n}>
        <span style={{ width: `${(n / steps.length) * 100}%` }} />
      </div>
      <ul className="check-list">
        {steps.map((s) => (
          <li key={s.label} className={s.done ? 'done' : ''}>
            <span className="tick">{s.done && <Icon name="check" size={12} />}</span>
            {s.label}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SecurityPosture() {
  const e = useEngine();
  const st = e.state;
  const p = st.policy!;
  const now = e.world.now();
  const hr = headroom(p, e.history(), now);
  const sess = st.session;
  const left = sess ? Math.max(0, sess.expiresAt - now) : 0;
  const sessionOk = sess?.status === 'active' && left > 0;
  const rows: [string, boolean, string][] = [
    [
      'Bounded session key (enforced on-chain)',
      sessionOk,
      sessionOk
        ? `Expires in ${left >= 3600 ? Math.round(left / 3600) + 'h' : Math.round(left / 60) + 'm'}`
        : sess
          ? sess.status
          : 'Not granted',
    ],
    ['Deterministic policy engine', !p.paused && !st.safeMode, st.safeMode ? 'Safe mode' : p.paused ? 'Paused' : `Policy v${p.version}`],
    ['Owner control (pause or revoke anytime)', true, 'Always available'],
  ];
  return (
    <Card
      title="Security posture"
      right={
        <Badge tone={rows.every((r) => r[1]) ? 'ok' : 'warn'}>{rows.every((r) => r[1]) ? 'All layers active' : 'Attention needed'}</Badge>
      }
    >
      <ul className="layers">
        {rows.map(([label, ok, detail]) => (
          <li key={label}>
            <span className={`lamp ${ok ? 'on' : 'off'}`} />
            <span>{label}</span>
            <small>{detail}</small>
          </li>
        ))}
      </ul>
      <div className="meter-row">
        <span>Daily spend</span>
        <b>
          {fmtUsd(hr.spentToday)} <span className="muted">of {fmtUsd(p.caps.perDay)}</span>
        </b>
      </div>
      <Meter value={hr.spentToday} max={p.caps.perDay} />
      <p className="small muted">
        Counts every executed action in the last 24 hours, including rescues. The on-chain session enforces the same cap independently.
      </p>
    </Card>
  );
}
