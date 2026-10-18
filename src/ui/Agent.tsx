import { useEffect, useRef, useState } from 'react';
import { CHAIN_IDS, chainName, type ChainId, type Policy } from '../core/types';
import { Badge, Btn, Card, Field, HelpTooltip, HfStatusBadge } from './parts';
import { useAsync } from './hooks';
import { fmtTime, useEngine } from './store';

const EXAMPLES = [
  'Keep my funds earning the highest stablecoin yield while keeping my liquidation risk low.',
  'Keep my loan above 1.4',
  'Move my idle USDC to the best stablecoin yield',
  'Never spend more than 500 a day',
  'What is my health factor?',
  'Pause the agent',
];

export function Agent() {
  const e = useEngine();
  const st = e.state;
  const { busy, error, run } = useAsync();
  const [text, setText] = useState('');
  const [showJson, setShowJson] = useState<Record<string, boolean>>({});
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [st.chat.length]);

  const send = (t: string) => {
    const v = t.trim();
    if (!v) return;
    setText('');
    void run('send', () => e.postIntent(v));
  };
  const ready = !!st.accountAddress && !!st.policy;

  return (
    <div className="grid two">
      <div data-tour="agent-chat">
      <Card
        title="Tell the agent your goal"
        right={
          <Badge tone={st.settings.useLlm && e.llmKey ? 'info' : 'neutral'} title="Intent parsing mode">
            {st.settings.useLlm && e.llmKey ? `Language model · ${st.settings.llmModel}` : 'Offline parser'}
          </Badge>
        }
      >
        {!ready && (
          <p className="err">Set up your account first (Account tab). You can still try the parser, but nothing can be activated.</p>
        )}
        <div className="chat">
          {st.chat.length === 0 && (
            <p className="muted">
              Try one of the examples below. I will explain what I understood and ask before activating any standing rule.
            </p>
          )}
          {st.chat.map((m) => {
            const rec = m.intentRecordId ? st.intents.find((i) => i.id === m.intentRecordId) : undefined;
            const pending =
              m.role === 'agent' &&
              rec?.status === 'awaiting_confirmation' &&
              st.chat.filter((c) => c.intentRecordId === rec.id && c.role === 'agent').at(-1)?.id === m.id;
            return (
              <div key={m.id} className={`msg ${m.role}`}>
                <div className="meta">
                  {m.role === 'user' ? 'You' : 'Aegis'} · {fmtTime(m.time)}
                </div>
                <div className="bubble">{m.text}</div>
                {pending && rec && (
                  <div className="row">
                    <Btn kind="primary" busy={busy === `c-${rec.id}`} onClick={() => run(`c-${rec.id}`, () => e.confirmIntent(rec.id))}>
                      Confirm
                    </Btn>
                    <Btn onClick={() => e.rejectIntent(rec.id)}>Reject</Btn>
                    <Btn kind="ghost" onClick={() => setShowJson((s) => ({ ...s, [rec.id]: !s[rec.id] }))}>
                      {showJson[rec.id] ? 'Hide' : 'Show'} structured intent
                    </Btn>
                  </div>
                )}
                {rec && showJson[rec.id] && <pre className="pre">{JSON.stringify(rec.intents, null, 2)}</pre>}
                {rec && rec.flags.length > 0 && m.role === 'agent' && (
                  <div className="row">
                    {rec.flags.map((f) => (
                      <Badge key={f} tone="bad">
                        {f.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div ref={end} />
        </div>
        <form
          className="row"
          onSubmit={(ev) => {
            ev.preventDefault();
            send(text);
          }}
        >
          <input
            className="grow"
            placeholder="e.g. Keep my loan above 1.4"
            value={text}
            onChange={(ev) => setText(ev.target.value)}
            aria-label="Your goal"
            maxLength={600}
          />
          <Btn kind="primary" busy={busy === 'send'} onClick={() => send(text)}>
            Send
          </Btn>
        </form>
        {error && <p className="err">{error}</p>}
        <div className="chips">
          {EXAMPLES.map((x) => (
            <button key={x} className="chip" onClick={() => send(x)}>
              {x}
            </button>
          ))}
        </div>
        <details>
          <summary>Language model settings (optional)</summary>
          <p className="small muted">
            Without a key, a built-in deterministic parser is used. With an Anthropic API key, the model turns text into structured intents
            using tool calls. Its output is validated against the same strict schema, it has no way to sign or execute, and the key is kept
            in this browser tab only.
          </p>
          <div className="row wrap">
            <Field label="API key">
              <input
                type="password"
                placeholder="sk-ant-…"
                defaultValue={e.llmKey}
                onBlur={(ev) => e.setLlmKey(ev.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label="Model">
              <input value={st.settings.llmModel} onChange={(ev) => e.updateSettings({ llmModel: ev.target.value })} />
            </Field>
            <label className="check">
              <input type="checkbox" checked={st.settings.useLlm} onChange={(ev) => e.updateSettings({ useLlm: ev.target.checked })} /> Use
              the model
            </label>
          </div>
        </details>
      </Card>
      </div>

      <div data-tour="policy-editor">
        {st.policy ? <PolicyEditor key={st.policy.version} /> : <Card title="Policy">Create your account to edit the policy.</Card>}
      </div>
    </div>
  );
}

function PolicyEditor() {
  const e = useEngine();
  const base = e.policy;
  const [p, setP] = useState<Policy>(structuredClone(base));
  const [errs, setErrs] = useState<string[]>([]);
  const [msg, setMsg] = useState('');
  const { busy, run } = useAsync();
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const set = (f: (x: Policy) => void) => {
    const n = structuredClone(p);
    f(n);
    setP(n);
    setMsg('');
  };
  const dirty = JSON.stringify(p) !== JSON.stringify(base);
  const save = async () => {
    const errors = e.setPolicy(p);
    setErrs(errors);
    if (errors.length) return;
    const capsChanged = p.caps.perAction !== base.caps.perAction || p.caps.perDay !== base.caps.perDay;
    if (capsChanged && e.state.session?.status === 'active') {
      await e.grantSession(Math.max(1, Math.round((e.state.session.expiresAt - e.world.now()) / 3600)));
      setMsg('Saved. Session key re-issued so the chain enforces the new caps.');
    } else setMsg('Saved as a new policy version.');
  };
  const [advanced, setAdvanced] = useState(false);
  const hf = p.healthFactor;
  return (
    <Card title={`Policy · version ${base.version}`} right={dirty ? <Badge tone="warn">Unsaved</Badge> : <Badge tone="ok">Saved</Badge>}>
      <p className="small muted">
        This mirrors what the chat creates. Every rule is enforced by plain code before anything is signed, and the on-chain session limits
        sit underneath as a second layer.
      </p>
      <div className="row between">
        <h4>Spending</h4>
        <label className="check advanced-toggle">
          <input type="checkbox" checked={advanced} onChange={(ev) => setAdvanced(ev.target.checked)} />
          <span className="small">Advanced (bps)</span>
        </label>
      </div>
      <div className="form">
        <Field label="Per-action cap (USD)">
          <input
            type="number"
            min={0}
            value={p.caps.perAction}
            onChange={(ev) =>
              set((x) => {
                x.caps.perAction = num(ev.target.value);
              })
            }
          />
        </Field>
        <Field label="Per-day cap (USD)">
          <input
            type="number"
            min={0}
            value={p.caps.perDay}
            onChange={(ev) =>
              set((x) => {
                x.caps.perDay = num(ev.target.value);
              })
            }
          />
        </Field>
        {advanced ? (
          <Field label="Max slippage (bps)" hint="50 bps = 0.5% (technical basis points representation)">
            <input
              type="number"
              min={0}
              max={300}
              value={p.maxSlippageBps}
              onChange={(ev) =>
                set((x) => {
                  x.maxSlippageBps = num(ev.target.value);
                })
              }
            />
          </Field>
        ) : (
          <Field
            label={
              <span>
                Max price slippage (%)
                <HelpTooltip text="Maximum acceptable price change between quote and settlement. Lower protects against price impact." />
              </span>
            }
            hint={`Current: ${(p.maxSlippageBps / 100).toFixed(2)}%`}
          >
            <input
              type="number"
              min={0}
              max={3}
              step={0.05}
              value={(p.maxSlippageBps / 100).toFixed(2)}
              onChange={(ev) =>
                set((x) => {
                  x.maxSlippageBps = Math.round(num(ev.target.value) * 100);
                })
              }
            />
          </Field>
        )}
        <Field label="Gas ceiling (USD)" hint="Optional moves wait if gas is higher">
          <input
            type="number"
            min={0}
            step={0.1}
            value={p.gasCeilingUsd}
            onChange={(ev) =>
              set((x) => {
                x.gasCeilingUsd = num(ev.target.value);
              })
            }
          />
        </Field>
        <Field label="Min net gain (USD)">
          <input
            type="number"
            min={0}
            value={p.minNetGainUsd}
            onChange={(ev) =>
              set((x) => {
                x.minNetGainUsd = num(ev.target.value);
              })
            }
          />
        </Field>
        <Field label="Max break-even (days)">
          <input
            type="number"
            min={1}
            value={p.maxBreakEvenDays}
            onChange={(ev) =>
              set((x) => {
                x.maxBreakEvenDays = num(ev.target.value);
              })
            }
          />
        </Field>
        <Field label="Horizon (days)" hint="Used for net-gain math">
          <input
            type="number"
            min={1}
            value={p.horizonDays}
            onChange={(ev) =>
              set((x) => {
                x.horizonDays = num(ev.target.value);
              })
            }
          />
        </Field>
        <Field label="Min pool TVL (USD)">
          <input
            type="number"
            min={0}
            value={p.minTvlUsd}
            onChange={(ev) =>
              set((x) => {
                x.minTvlUsd = num(ev.target.value);
              })
            }
          />
        </Field>
      </div>
      <div className="row between">
        <h4>Loan protection</h4>
        <HelpTooltip text="Health factor measures loan collateral relative to debt. Below 1.0 triggers liquidation; Sentinel rescues positions before reaching that point." />
      </div>
      <p className="small muted">
        Status indicators: <HfStatusBadge hf={hf.target + 0.1} trigger={hf.trigger} warn={hf.warn} /> above {hf.warn} ·{' '}
        <HfStatusBadge hf={hf.trigger + 0.05} trigger={hf.trigger} warn={hf.warn} /> below {hf.warn} ·{' '}
        <HfStatusBadge hf={hf.trigger - 0.05} trigger={hf.trigger} warn={hf.warn} /> below {hf.trigger}
      </p>
      <div className="form">
        <Field label="Warn below">
          <input
            type="number"
            step={0.05}
            value={hf.warn}
            onChange={(ev) =>
              set((x) => {
                x.healthFactor.warn = num(ev.target.value);
              })
            }
          />
        </Field>
        <Field label="Trigger rescue below">
          <input
            type="number"
            step={0.05}
            value={hf.trigger}
            onChange={(ev) =>
              set((x) => {
                x.healthFactor.trigger = num(ev.target.value);
              })
            }
          />
        </Field>
        <Field label="Rescue target">
          <input
            type="number"
            step={0.05}
            value={hf.target}
            onChange={(ev) =>
              set((x) => {
                x.healthFactor.target = num(ev.target.value);
              })
            }
          />
        </Field>
        <Field label="Floor for optional moves">
          <input
            type="number"
            step={0.05}
            value={hf.floor}
            onChange={(ev) =>
              set((x) => {
                x.healthFactor.floor = num(ev.target.value);
              })
            }
          />
        </Field>
        <Field label="Rescue cooldown (s)">
          <input
            type="number"
            min={0}
            value={p.cooldownSeconds}
            onChange={(ev) =>
              set((x) => {
                x.cooldownSeconds = num(ev.target.value);
              })
            }
          />
        </Field>
        <Field label="Rescue reserve (USD)" hint="Idle USDC kept on chains with a loan">
          <input
            type="number"
            min={0}
            value={p.rescueReserveUsd}
            onChange={(ev) =>
              set((x) => {
                x.rescueReserveUsd = num(ev.target.value);
              })
            }
          />
        </Field>
      </div>
      <h4>Scope</h4>
      <div className="row wrap">
        {CHAIN_IDS.map((id: ChainId) => (
          <label key={id} className="check">
            <input
              type="checkbox"
              checked={p.allowedChains.includes(id)}
              onChange={(ev) =>
                set((x) => {
                  x.allowedChains = ev.target.checked ? [...x.allowedChains, id] : x.allowedChains.filter((c) => c !== id);
                })
              }
            />{' '}
            {chainName(id)}
          </label>
        ))}
        <label className="check">
          <input
            type="checkbox"
            checked={p.autoExecuteMoves}
            onChange={(ev) =>
              set((x) => {
                x.autoExecuteMoves = ev.target.checked;
              })
            }
          />{' '}
          Run optional moves automatically (otherwise ask me first)
        </label>
      </div>
      {errs.length > 0 && (
        <ul className="err">
          {errs.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      )}
      {msg && <p className="ok-t">{msg}</p>}
      <div className="row">
        <Btn kind="primary" disabled={!dirty} busy={busy === 'save'} onClick={() => run('save', save)}>
          Save policy
        </Btn>
        <Btn
          disabled={!dirty}
          onClick={() => {
            setP(structuredClone(base));
            setErrs([]);
          }}
        >
          Discard
        </Btn>
      </div>
    </Card>
  );
}
