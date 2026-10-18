import { CONTRACTS, FAKE_ROUTER, SELECTORS } from './contracts';
import { netGain, fmtUsd } from './math';
import { chainName, type ActionProposal, type ChainId, type Hex } from './types';
import type { Recommendation } from './yield';
import type { Engine } from './engine';

export type MoveState =
  | 'planned'
  | 'scheduled' // waiting for cheaper gas
  | 'awaiting_confirmation'
  | 'bridging'
  | 'arrived'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'idle_after_failure' // funds sit idle in the owner's account on the destination
  | 'halted'; // unexpected fill: safe mode on

export const TERMINAL: MoveState[] = ['completed', 'failed', 'cancelled', 'idle_after_failure', 'halted'];
export const BRIDGE_TIMEOUT_SECONDS = 600;

export interface Quote {
  id: string;
  router: Hex;
  receiver: Hex;
  feeUsd: number;
  slippageBps: number;
  gasUsd: number;
  expiresAt: number;
}
export interface Move {
  id: string;
  idemKey: string;
  asset: 'USDC';
  amount: number;
  srcChain: ChainId;
  dstChain: ChainId;
  fromPosition: boolean;
  state: MoveState;
  netGainUsd: number;
  breakEvenDays: number;
  apyDest: number;
  apySrc: number;
  maxGasUsd?: number;
  withdrawn: boolean;
  quote?: Quote;
  bridgeId?: string;
  sentAt?: number;
  received?: number;
  delayAlerted?: boolean;
  attempts: { quote: number; source: number; deposit: number };
  notes: string[];
  createdAt: number;
  updatedAt: number;
}

export const isInFlight = (m: Move) => !TERMINAL.includes(m.state);
export const bridgeFeeUsd = (amount: number) => 0.3 + amount * 0.0005;
export const BRIDGE_SLIPPAGE_BPS = 8;

/** Aggregator quote (simulated Li.Fi / Socket). Faults can expire the quote or swap the router. */
export function getQuote(e: Engine, src: ChainId, dst: ChainId, amount: number): Quote {
  const w = e.world;
  const f = w.s.faults;
  let expiresAt = w.now() + 120;
  if (f.quoteExpired) {
    expiresAt = w.now() - 1;
    f.quoteExpired = false; // one-shot, so the re-quote path can be observed
  }
  void dst;
  return {
    id: w.nextId('q'),
    router: f.maliciousRouter ? FAKE_ROUTER : CONTRACTS[src].router,
    receiver: e.account,
    feeUsd: bridgeFeeUsd(amount),
    slippageBps: BRIDGE_SLIPPAGE_BPS,
    gasUsd: w.gasFor(src, { kind: 'bridge' }),
    expiresAt,
  };
}

/** Start a move from an approved recommendation. Only one in-flight move per user; idempotent. */
export function startMove(
  e: Engine,
  rec: Recommendation,
  opts: { maxGasUsd?: number; retryFailed?: boolean } = {},
): { ok: boolean; reason: string; move?: Move } {
  const st = e.state;
  if (st.safeMode) return { ok: false, reason: 'Safe mode is on.' };
  if (st.moves.some(isInFlight)) return { ok: false, reason: 'Another move is already in flight.' };
  const idem = `${rec.asset}:${rec.sourceChain}:${rec.destChain}:${Math.round(rec.amount)}:${rec.fromPosition}:${Math.floor(e.world.now() / 3600)}`;
  const dup = st.moves.some((m) => m.idemKey === idem && (!opts.retryFailed || (m.state !== 'cancelled' && m.state !== 'failed')));
  if (dup) return { ok: false, reason: 'This exact move was already handled in the last hour.' };
  const now = e.world.now();
  const m: Move = {
    id: e.world.nextId('mv'),
    idemKey: idem,
    asset: 'USDC',
    amount: rec.amount,
    srcChain: rec.sourceChain,
    dstChain: rec.destChain,
    fromPosition: rec.fromPosition,
    state: 'planned',
    netGainUsd: rec.netGainUsd,
    breakEvenDays: rec.breakEvenDays,
    apyDest: rec.apyDest,
    apySrc: rec.apySrc,
    maxGasUsd: opts.maxGasUsd,
    withdrawn: !rec.fromPosition,
    attempts: { quote: 0, source: 0, deposit: 0 },
    notes: [
      `Planned: ${rec.sourceChain === rec.destChain ? 'supply on' : 'move to'} ${chainName(rec.destChain)} (net gain ${fmtUsd(rec.netGainUsd)}).`,
    ],
    createdAt: now,
    updatedAt: now,
  };
  st.moves.push(m);
  if (st.moves.length > 50) st.moves.splice(0, st.moves.length - 50);
  return { ok: true, reason: 'Move started', move: m };
}

const note = (e: Engine, m: Move, text: string) => {
  m.notes.push(text);
  m.updatedAt = e.world.now();
};
const fail = (e: Engine, m: Move, text: string, state: MoveState = 'failed') => {
  m.state = state;
  note(e, m, text);
  e.notify(state === 'failed' ? 'alert' : 'warn', `Move ${chainName(m.srcChain)} → ${chainName(m.dstChain)}: ${text}`);
};

function mkProposal(
  e: Engine,
  m: Move,
  kind: 'supply' | 'withdraw' | 'bridge',
  chainId: ChainId,
  amount: number,
  extra: Partial<ActionProposal['params']>,
  reason: string,
  quote?: Quote,
) {
  const c = CONTRACTS[chainId];
  return e.newProposal({
    source: 'executor',
    kind,
    chainId,
    target: kind === 'bridge' ? (quote?.router ?? c.router) : c.pool,
    selector: SELECTORS[kind],
    params: { asset: 'USDC', amount, ...extra },
    urgent: false,
    meta: {
      voluntary: true,
      netGainUsd: m.netGainUsd,
      breakEvenDays: m.breakEvenDays,
      feeUsd: quote?.feeUsd,
      gasUsd: e.world.gasFor(chainId, { kind }),
      moveId: m.id,
    },
    reason,
  });
}

/** Re-read the live rate on-chain (API data lags) and recompute the net gain before acting. */
function recheck(e: Engine, m: Move): boolean {
  const p = e.policy;
  const live = e.world.readApy(m.dstChain);
  const local = m.srcChain === m.dstChain;
  const g = netGain({
    apyDest: Math.min(m.apyDest, live),
    apySrc: m.apySrc,
    amount: m.amount,
    horizonDays: p.horizonDays,
    bridgeFee: local ? 0 : bridgeFeeUsd(m.amount),
    gasSrc: e.world.chain(m.srcChain).gasUsd * (local ? 1 : 2),
    gasDest: local ? 0 : e.world.chain(m.dstChain).gasUsd,
    slippageCost: local ? 0 : (m.amount * BRIDGE_SLIPPAGE_BPS) / 10_000,
  });
  if (g.net < p.minNetGainUsd || g.breakEvenDays > p.maxBreakEvenDays) {
    fail(e, m, `The live on-chain rate (${live.toFixed(2)}%) no longer beats costs, so I cancelled the move.`, 'cancelled');
    return false;
  }
  if (!local && !m.fromPosition) {
    // idle funds could simply be supplied on the source chain; bridging must still beat that by the margin
    const stay = netGain({
      apyDest: e.world.readApy(m.srcChain),
      apySrc: 0,
      amount: m.amount,
      horizonDays: p.horizonDays,
      bridgeFee: 0,
      gasSrc: e.world.chain(m.srcChain).gasUsd,
      gasDest: 0,
      slippageCost: 0,
    });
    if (g.net - stay.net < p.minNetGainUsd) {
      fail(
        e,
        m,
        `Live rates changed: staying on ${chainName(m.srcChain)} now earns almost as much as moving, so I cancelled the move.`,
        'cancelled',
      );
      return false;
    }
  }
  m.netGainUsd = g.net;
  m.breakEvenDays = g.breakEvenDays;
  return true;
}

async function submitBridge(e: Engine, m: Move, confirmed: boolean) {
  const q = (m.quote && m.quote.expiresAt > e.world.now() ? m.quote : undefined) ?? getQuote(e, m.srcChain, m.dstChain, m.amount);
  m.quote = q;
  if (q.expiresAt <= e.world.now()) {
    m.attempts.quote++;
    note(e, m, 'Quote expired; requesting a new one and re-checking the policy.');
    if (m.attempts.quote >= 3) fail(e, m, 'Quote kept expiring, so I stopped.');
    return;
  }
  const p = mkProposal(
    e,
    m,
    'bridge',
    m.srcChain,
    m.amount,
    { to: q.receiver, destChainId: m.dstChain, slippageBps: q.slippageBps, router: q.router },
    `Bridge ${m.amount.toFixed(0)} USDC from ${chainName(m.srcChain)} to ${chainName(m.dstChain)} to earn ${m.apyDest.toFixed(2)}% (net gain ${fmtUsd(m.netGainUsd)} over the horizon).`,
    q,
  );
  const res = await e.process(p, { confirmed });
  if (res.decision.result === 'confirm') {
    m.state = 'awaiting_confirmation';
    note(e, m, 'Waiting for your confirmation.');
    return;
  }
  if (res.decision.result === 'deny') {
    if (res.decision.ruleId === 'R-GAS') {
      m.state = 'scheduled';
      note(e, m, res.decision.reason);
      return;
    }
    fail(e, m, `Blocked by policy (${res.decision.ruleId}): ${res.decision.reason}`);
    return;
  }
  if (res.action?.status !== 'success') {
    m.attempts.source++;
    note(e, m, `Source transaction failed: ${res.action?.error ?? 'unknown'}.`);
    if (m.attempts.source >= 2) fail(e, m, 'Source transaction failed twice. Funds stay in your account.');
    return;
  }
  m.bridgeId = res.action.bridgeId;
  m.sentAt = e.world.now();
  m.state = 'bridging';
  note(e, m, `Bridge submitted (${res.action.txHash?.slice(0, 10)}…). Polling the aggregator.`);
}

async function deposit(e: Engine, m: Move) {
  const bal = e.world.balance(m.dstChain, e.account).USDC;
  const amount = Math.min(m.received ?? m.amount, bal);
  const p = mkProposal(
    e,
    m,
    'supply',
    m.dstChain,
    amount,
    {},
    `Deposit ${amount.toFixed(2)} USDC on ${chainName(m.dstChain)} after the bridge arrived.`,
  );
  p.urgent = true; // never strand funds that already arrived
  const res = await e.process(p, { confirmed: true });
  if (res.decision.result === 'allow' && res.action?.status === 'success') {
    m.state = 'completed';
    note(
      e,
      m,
      `Deposited ${amount.toFixed(2)} USDC. Reconciled: bridged ${m.amount.toFixed(2)}, received ${(m.received ?? 0).toFixed(2)}.`,
    );
    e.notify('success', `Move complete: ${fmtUsd(amount)} now earning ${m.apyDest.toFixed(2)}% on ${chainName(m.dstChain)}.`);
    return;
  }
  m.attempts.deposit++;
  const why = res.decision.result === 'deny' ? res.decision.reason : (res.action?.error ?? 'unknown');
  note(e, m, `Deposit failed: ${why}`);
  if (m.attempts.deposit >= 2)
    fail(e, m, `Funds arrived but the deposit failed. They are idle in your account on ${chainName(m.dstChain)}.`, 'idle_after_failure');
}

/** Advance the single in-flight move by one stage. Called once per block. */
export async function advanceMoves(e: Engine) {
  const m = e.state.moves.find(isInFlight);
  if (!m) return;
  const w = e.world;
  const policy = e.policy;
  if (policy.paused || e.state.safeMode) return;
  try {
    switch (m.state) {
      case 'planned':
      case 'scheduled': {
        if (m.maxGasUsd !== undefined && w.gasFor(m.srcChain, { kind: 'bridge' }) > m.maxGasUsd) {
          if (m.state !== 'scheduled') note(e, m, `Gas is above your ${fmtUsd(m.maxGasUsd)} limit; waiting.`);
          m.state = 'scheduled';
          return;
        }
        if (m.state === 'planned' && !recheck(e, m)) return;
        if (!m.withdrawn) {
          const p = mkProposal(
            e,
            m,
            'withdraw',
            m.srcChain,
            m.amount,
            { to: e.account },
            `Withdraw ${m.amount.toFixed(0)} USDC from the ${chainName(m.srcChain)} yield position to move it.`,
          );
          const res = await e.process(p, { confirmed: true });
          if (res.decision.result === 'allow' && res.action?.status === 'success') {
            m.withdrawn = true;
            note(e, m, 'Withdrawn from the source position.');
          } else if (res.decision.ruleId === 'R-GAS') m.state = 'scheduled';
          else
            fail(
              e,
              m,
              `Withdraw did not complete: ${res.decision.result === 'deny' ? res.decision.reason : (res.action?.error ?? 'unknown')}`,
            );
          return;
        }
        if (m.srcChain === m.dstChain) {
          m.received = m.amount;
          const sup = mkProposal(
            e,
            m,
            'supply',
            m.dstChain,
            m.amount,
            {},
            `Supply ${m.amount.toFixed(0)} idle USDC on ${chainName(m.dstChain)} to earn ${m.apyDest.toFixed(2)}%.`,
          );
          const res = await e.process(sup, { confirmed: false });
          if (res.decision.result === 'confirm') {
            m.state = 'awaiting_confirmation';
            return;
          }
          if (res.decision.result === 'allow' && res.action?.status === 'success') {
            m.state = 'completed';
            note(e, m, 'Supplied.');
            e.notify('success', `Supplied ${fmtUsd(m.amount)} USDC on ${chainName(m.dstChain)} at ${m.apyDest.toFixed(2)}%.`);
          } else if (res.decision.ruleId === 'R-GAS') {
            m.state = 'scheduled';
            note(e, m, res.decision.reason);
          } else
            fail(
              e,
              m,
              res.decision.result === 'deny'
                ? `Blocked by policy (${res.decision.ruleId}): ${res.decision.reason}`
                : `Transaction failed: ${res.action?.error ?? 'unknown'}`,
            );
          return;
        }
        await submitBridge(e, m, false);
        return;
      }
      case 'bridging': {
        const b = w.s.bridges[m.bridgeId ?? ''];
        if (!b) return fail(e, m, 'Bridge record not found. Not starting another move.', 'halted');
        if (b.status === 'pending') {
          if (!m.delayAlerted && w.now() - (m.sentAt ?? w.now()) > BRIDGE_TIMEOUT_SECONDS) {
            m.delayAlerted = true;
            note(e, m, 'Bridge is slower than expected. Still polling; no second move will be started.');
            e.notify('warn', `Bridge to ${chainName(m.dstChain)} is delayed. I keep polling and will not start another move.`);
          }
          return;
        }
        m.received = b.received;
        const tol = 1 - (policy.maxSlippageBps + 5) / 10_000;
        if (b.received < m.amount * tol) {
          e.state.safeMode = true;
          fail(
            e,
            m,
            `Unexpected fill: received ${b.received.toFixed(2)} of ${m.amount.toFixed(2)} USDC. Safe mode is ON and further actions are denied.`,
            'halted',
          );
          return;
        }
        m.state = 'arrived';
        note(e, m, `Funds arrived (${b.received.toFixed(2)} USDC).`);
        return;
      }
      case 'arrived':
        await deposit(e, m);
        return;
      case 'awaiting_confirmation':
        return; // user action
    }
  } catch (err) {
    fail(e, m, `Unexpected error, so I stopped: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** The user confirmed a move that was waiting (policy.autoExecuteMoves = false). */
export async function confirmMove(e: Engine, moveId: string) {
  const m = e.state.moves.find((x) => x.id === moveId);
  if (!m || m.state !== 'awaiting_confirmation') return;
  if (m.srcChain === m.dstChain) {
    m.state = 'planned';
    const sup = mkProposal(
      e,
      m,
      'supply',
      m.dstChain,
      m.amount,
      {},
      `Supply ${m.amount.toFixed(0)} idle USDC on ${chainName(m.dstChain)} (confirmed).`,
    );
    const res = await e.process(sup, { confirmed: true });
    if (res.decision.result === 'allow' && res.action?.status === 'success') {
      m.state = 'completed';
      e.notify('success', `Supplied ${fmtUsd(m.amount)} USDC on ${chainName(m.dstChain)}.`);
    } else fail(e, m, res.decision.result === 'deny' ? res.decision.reason : (res.action?.error ?? 'failed'));
    return;
  }
  m.state = 'planned';
  await submitBridge(e, m, true);
}

export function cancelMove(e: Engine, moveId: string) {
  const m = e.state.moves.find((x) => x.id === moveId);
  if (m && isInFlight(m) && m.state !== 'bridging') {
    m.state = 'cancelled';
    note(e, m, 'Cancelled by you.');
  }
}
