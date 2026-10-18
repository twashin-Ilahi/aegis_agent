import { useState } from 'react';
import { crash, faults, restoreSnapshot, runAdversarialSuite, saveSnapshot, setupDemo, type AdversarialResult } from '../core/scenarios';
import { CHAIN_IDS, chainName, type ChainId } from '../core/types';
import { Badge, Btn, Card } from './parts';
import { useAsync } from './hooks';
import { useEngine } from './store';

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="check">
      <input type="checkbox" checked={on} onChange={(ev) => set(ev.target.checked)} /> {label}
    </label>
  );
}

export function Lab() {
  const e = useEngine();
  const st = e.state;
  const { busy, error, run } = useAsync();
  const [chain, setChain] = useState<ChainId>(42161);
  const [results, setResults] = useState<AdversarialResult[] | null>(null);
  const f = e.world.s.faults;
  const ch = e.world.chain(chain);
  const ready = !!st.accountAddress && !!st.policy;

  return (
    <div className="grid two">
      <div className="stack" data-tour="lab-demo-card">
        <Card title="Demo scripts (mainnet-fork simulator)">
          <p className="small muted">
            Three scripts from the demo plan: setup (two identical loans), crash (price moves), reset (restore the saved snapshot). All
            values are simulated; no real funds.
          </p>
          <div className="row wrap">
            <Btn kind="primary" busy={busy === 'setup'} onClick={() => run('setup', () => setupDemo(e))}>
              1. Setup: open two identical loans
            </Btn>
            <Btn onClick={() => restoreSnapshot(e)} disabled={!st.demoSnapshot}>
              3. Reset to snapshot
            </Btn>
            <Btn onClick={() => saveSnapshot(e)} disabled={!ready}>
              Save snapshot now
            </Btn>
          </div>
          <h4>2. Crash ETH over 8 blocks (press Live in the header)</h4>
          <div className="row wrap">
            {[10, 20, 30, 40].map((p) => (
              <Btn key={p} kind="danger" disabled={!ready} onClick={() => crash(e, p, 8)}>
                −{p}%
              </Btn>
            ))}
            <Btn disabled={!ready} onClick={() => run('ff1', () => e.fastForward(3600))}>
              +1 hour
            </Btn>
            <Btn disabled={!ready} onClick={() => run('ff24', () => e.fastForward(86400))}>
              +1 day
            </Btn>
            <Btn disabled={!ready} onClick={() => run('tick', () => e.tick())}>
              Step 1 block
            </Btn>
          </div>
          {st.scenario && (
            <p className="small">
              Running: {st.scenario.label} ({st.scenario.step}/{st.scenario.steps})
            </p>
          )}
          <p className="small muted">
            The unprotected benchmark loan sees the same prices. At −40% it falls below 1.0 and is liquidated while the protected loan
            survives.
          </p>
          {error && <p className="err">{error}</p>}
        </Card>

        <Card
          title="Fault injection"
          right={
            <select value={chain} onChange={(ev) => setChain(Number(ev.target.value) as ChainId)}>
              {CHAIN_IDS.map((id) => (
                <option key={id} value={id}>
                  {chainName(id)}
                </option>
              ))}
            </select>
          }
        >
          <p className="small muted">Each fault checks a failure mode from the spec. The system should fail closed and tell you.</p>
          <div className="faults">
            <Toggle label="Oracle stale (frozen timestamp)" on={ch.oracleFrozen} set={(v) => faults.staleOracle(e, chain, v)} />
            <Toggle label="Sequencer down" on={!ch.sequencerUp} set={(v) => faults.sequencer(e, chain, !v)} />
            <Toggle
              label="Primary RPC down (failover)"
              on={!ch.providers[0].healthy}
              set={(v) => faults.rpc(e, chain, v ? 'primary_down' : 'ok')}
            />
            <Toggle label="All RPCs down" on={!ch.providers[1].healthy} set={(v) => faults.rpc(e, chain, v ? 'all_down' : 'ok')} />
            <Toggle label="Sentinel worker crashed" on={st.sentinel.workerDown} set={(v) => faults.workerDown(e, v)} />
          </div>
          <div className="row wrap">
            <Btn onClick={() => faults.manipulatedOracle(e, chain, ch.wethPrice * 0.6)}>Manipulate oracle −40% (reference unchanged)</Btn>
            <Btn onClick={() => faults.gasSpike(e, chain, 25)}>Gas ×25</Btn>
            <Btn onClick={() => faults.gasSpike(e, chain, 1)}>Gas normal</Btn>
            <Btn disabled={!ready} onClick={() => faults.gasReserve(e, chain, 0.05)}>
              Drain gas reserve
            </Btn>
            <Btn disabled={!ready} onClick={() => faults.insufficientFunds(e)}>
              Remove all rescue funds
            </Btn>
            <Btn onClick={() => faults.rateDrift(e, chain, Math.max(0.5, ch.usdcSupplyApy - 4))}>Drop on-chain APY by 4 pts</Btn>
          </div>
          <h4>Bridge and aggregator</h4>
          <div className="faults">
            <Toggle label="Quote expires (one-shot)" on={f.quoteExpired} set={(v) => faults.bridge(e, 'quoteExpired', v)} />
            <Toggle label="Source transaction reverts" on={f.sourceRevert} set={(v) => faults.bridge(e, 'sourceRevert', v)} />
            <Toggle label="Bridge delayed 3 hours" on={f.bridgeDelay} set={(v) => faults.bridge(e, 'bridgeDelay', v)} />
            <Toggle label="Funds arrive, deposit reverts" on={f.depositFail} set={(v) => faults.bridge(e, 'depositFail', v)} />
            <Toggle label="Partial / unexpected fill (90%)" on={f.partialFill} set={(v) => faults.bridge(e, 'partialFill', v)} />
            <Toggle
              label="Aggregator returns an unknown router"
              on={f.maliciousRouter}
              set={(v) => faults.bridge(e, 'maliciousRouter', v)}
            />
          </div>
          <div className="row">
            <Btn onClick={() => faults.transient(e, 2)}>Next 2 submissions fail (underpriced)</Btn>
          </div>
        </Card>
      </div>

      <div className="stack">
        <Card
          title="Adversarial test suite"
          right={
            results && (
              <Badge tone={results.every((r) => r.blocked) ? 'ok' : 'bad'}>
                {results.filter((r) => r.blocked).length}/{results.length} blocked
              </Badge>
            )
          }
        >
          <p className="small muted">
            Prompt injections, malformed model output, forged proposals and a simulated compromised backend that signs with the session key
            and bypasses the policy engine. Every case must be blocked.
          </p>
          <Btn kind="primary" busy={busy === 'adv'} onClick={() => run('adv', async () => setResults(await runAdversarialSuite(e)))}>
            Run suite
          </Btn>
          {results && (
            <div className="scroll">
              <table className="tbl small">
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Case</th>
                    <th>Result</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td>{r.group}</td>
                      <td>
                        {r.name}
                        {r.input && <div className="muted ellipsis">{r.input}</div>}
                      </td>
                      <td>
                        <Badge tone={r.blocked ? 'ok' : 'bad'}>{r.blocked ? 'blocked' : 'NOT BLOCKED'}</Badge>
                      </td>
                      <td className="ellipsis">{r.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="Liquidation events">
          {st.liquidations.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <ul className="plain">
              {st.liquidations.map((l, i) => (
                <li key={i}>
                  <Badge tone={l.benchmark ? 'neutral' : 'bad'}>{l.benchmark ? 'unprotected loan' : 'YOUR loan'}</Badge>{' '}
                  {chainName(l.chainId)}: ${l.repaidUsd.toFixed(0)} of debt repaid by liquidators
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
