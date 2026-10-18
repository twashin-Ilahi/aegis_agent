import { useState } from 'react';
import { CHAIN_IDS, chainName, type ChainId } from '../core/types';
import { fmtUsd } from '../core/math';
import { policySummary } from '../core/policy';
import { selectorName } from '../core/contracts';
import { setupDemo } from '../core/scenarios';
import { Badge, Btn, Card, CopyButton, Field } from './parts';
import { useAsync } from './hooks';
import { fmtDateTime, short, useEngine } from './store';
import { ConfirmDialog } from './chrome';

export function Account() {
  const e = useEngine();
  const st = e.state;
  const { busy, error, run } = useAsync();
  const [hours, setHours] = useState(72);
  const [faucetChain, setFaucetChain] = useState<ChainId>(42161);
  const [faucetAmount, setFaucetAmount] = useState(1000);
  const [confirmReset, setConfirmReset] = useState(false);
  const hasWallet = !!st.owner;
  const hasAccount = !!st.accountAddress;
  const sessionOk = st.session?.status === 'active';
  const hasEth = typeof window !== 'undefined' && !!(window as { ethereum?: unknown }).ethereum;

  return (
    <div className="grid two" data-tour="account-setup">
      <div className="stack">
        <Card
          title="1. Connect a wallet"
          right={hasWallet && <Badge tone="ok">{st.owner!.mode === 'demo' ? 'Demo wallet' : 'Browser wallet'}</Badge>}
        >
          <p className="muted">
            You own the smart account. The agent never sees your wallet key. It only gets a temporary session key that you sign for.
          </p>
          {hasWallet ? (
            <p>
              Owner: <code>{st.owner!.address}</code> <CopyButton text={st.owner!.address} label="Copy owner address" />
            </p>
          ) : null}
          <div className="row">
            <Btn kind="primary" busy={busy === 'demo'} onClick={() => run('demo', () => e.connectDemoWallet())}>
              Create demo wallet
            </Btn>
            <Btn
              disabled={!hasEth}
              title={hasEth ? '' : 'No browser wallet detected'}
              busy={busy === 'inj'}
              onClick={() => run('inj', () => e.connectInjected())}
            >
              Connect browser wallet
            </Btn>
          </div>
          <p className="small muted">
            All activity runs on a simulated mainnet fork with no real funds. A browser wallet is only asked to sign session grants and
            revocations.
          </p>
        </Card>

        <Card title="2. Create smart accounts" right={hasAccount && <Badge tone="ok">Ready</Badge>}>
          <p className="muted">One ERC-4337 account per chain, owned by you, with the same address on every chain.</p>
          {hasAccount && (
            <p>
              Account: <code>{st.accountAddress}</code> <CopyButton text={st.accountAddress!} label="Copy account address" />
            </p>
          )}
          <Btn
            kind="primary"
            disabled={!hasWallet || hasAccount}
            onClick={() => run('acct', () => e.deployAccounts())}
            busy={busy === 'acct'}
          >
            Deploy on {CHAIN_IDS.map(chainName).join(', ')}
          </Btn>
        </Card>

        <Card title="3. Fund the account (fork faucet)">
          <p className="muted">
            The quickest start is the demo setup: it opens a loan, funds idle USDC, tops up gas and issues a session key. You can also fund
            by hand.
          </p>
          <div className="row">
            <Btn
              kind="primary"
              disabled={busy === 'demo-setup'}
              busy={busy === 'demo-setup'}
              onClick={() => run('demo-setup', () => setupDemo(e, { hours }))}
            >
              One-click demo setup
            </Btn>
          </div>
          <hr />
          <div className="row wrap">
            <Field label="Chain">
              <select value={faucetChain} onChange={(ev) => setFaucetChain(Number(ev.target.value) as ChainId)}>
                {CHAIN_IDS.map((id) => (
                  <option key={id} value={id}>
                    {chainName(id)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="USDC amount">
              <input type="number" min={0} value={faucetAmount} onChange={(ev) => setFaucetAmount(Number(ev.target.value))} />
            </Field>
            <Btn
              disabled={!hasAccount}
              onClick={() => {
                const cur = e.world.balance(faucetChain, e.account).USDC;
                e.world.deal(faucetChain, e.account, 'USDC', cur + faucetAmount);
                e.emit();
              }}
            >
              Add USDC
            </Btn>
            <Btn
              disabled={!hasAccount}
              onClick={() => {
                e.world.fundGasReserve(
                  faucetChain,
                  e.account,
                  10 + (e.world.chain(faucetChain).gasReserveUsd[e.account.toLowerCase()] ?? 0),
                );
                e.emit();
              }}
            >
              Top up gas $10
            </Btn>
          </div>
        </Card>

        <Card
          title="4. Grant a session key"
          right={
            sessionOk ? <Badge tone="ok">Active</Badge> : st.session ? <Badge tone="bad">{st.session.status}</Badge> : <Badge>None</Badge>
          }
        >
          <p className="muted">
            You sign a scoped permission for a temporary key. The chain itself rejects anything outside it, even if our servers were
            compromised.
          </p>
          <div className="row wrap">
            <Field label="Valid for (hours)">
              <input type="number" min={1} max={720} value={hours} onChange={(ev) => setHours(Number(ev.target.value))} />
            </Field>
            <Btn kind="primary" disabled={!hasAccount} busy={busy === 'grant'} onClick={() => run('grant', () => e.grantSession(hours))}>
              {sessionOk ? 'Re-issue session key' : 'Grant session key'}
            </Btn>
            <Btn kind="danger" disabled={!sessionOk} busy={busy === 'revoke'} onClick={() => run('revoke', () => e.revokeSession())}>
              Revoke
            </Btn>
          </div>
          {st.session && (
            <dl className="kv">
              <dt>Session key</dt>
              <dd>
                <code>{short(st.session.key, 8)}</code>
              </dd>
              <dt>Expires</dt>
              <dd>{fmtDateTime(st.session.expiresAt)}</dd>
              <dt>Permissions hash</dt>
              <dd>
                <code>{short(st.session.permissionsHash, 8)}</code>
              </dd>
              <dt>Key storage</dt>
              <dd>Demo KMS (browser session only). The key is never in app state or logs.</dd>
            </dl>
          )}
          {error && <p className="err">{error}</p>}
        </Card>
      </div>

      <div className="stack">
        <Card title="What the agent can and cannot do">
          {st.policy ? (
            <>
              <h4 className="ok-t">It can</h4>
              <ul>
                <li>Repay debt or add collateral when your health factor drops below {st.policy.healthFactor.trigger}.</li>
                <li>
                  Supply, withdraw (to your own account only) and bridge USDC between {st.policy.allowedChains.map(chainName).join(', ')}.
                </li>
                <li>
                  Move up to {fmtUsd(st.policy.caps.perAction)} per action and {fmtUsd(st.policy.caps.perDay)} per day.
                </li>
              </ul>
              <h4 className="bad-t">It cannot</h4>
              <ul>
                <li>Send funds to any other address, or call any contract that is not on the list below.</li>
                <li>Exceed your caps, spend native ETH, or act after the session ends or you revoke it.</li>
                <li>Touch your main wallet key. It never has it.</li>
              </ul>
              <pre className="pre">{policySummary(st.policy)}</pre>
            </>
          ) : (
            <p className="muted">Create the smart account to see your limits.</p>
          )}
        </Card>

        {st.policy && (
          <Card title="On-chain allowlist (enforced by the account)">
            <table className="tbl small">
              <thead>
                <tr>
                  <th>Chain</th>
                  <th>Contract</th>
                  <th>Functions</th>
                </tr>
              </thead>
              <tbody>
                {st.policy.allowedContracts.map((c, i) => (
                  <tr key={i}>
                    <td>{chainName(c.chainId)}</td>
                    <td>
                      {c.label}
                      <br />
                      <code>{short(c.address, 6)}</code>
                    </td>
                    <td>{c.selectors.map(selectorName).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        <Card title="Danger zone">
          <p className="muted">Wipe everything (wallet, account, history) and start over.</p>
          <Btn kind="danger" onClick={() => setConfirmReset(true)}>
            Reset everything
          </Btn>
          <ConfirmDialog
            open={confirmReset}
            danger
            title="Reset everything?"
            confirmLabel="Reset"
            onCancel={() => setConfirmReset(false)}
            onConfirm={() => {
              setConfirmReset(false);
              e.resetAll();
            }}
          >
            This deletes the wallet, smart accounts, policy, history and the simulated fork from this browser. It cannot be undone.
          </ConfirmDialog>
        </Card>
      </div>
    </div>
  );
}
