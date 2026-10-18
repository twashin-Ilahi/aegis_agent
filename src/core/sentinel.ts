import { CONTRACTS, SELECTORS } from './contracts';
import { collateralNeeded, fmtHf, fmtUsd, rescueRepayValue } from './math';
import { headroom } from './policy';
import { chainName, type ActionKind, type Asset, type ChainId } from './types';
import { ORACLE_HEARTBEAT_SECONDS, RpcError } from './world';
import type { Engine } from './engine';

export interface RescueStep {
  kind: Extract<ActionKind, 'repay' | 'supply' | 'withdraw'>;
  asset: Asset;
  amount: number; // token units
  valueUsd: number;
  note: string;
}
export interface RescuePlanInput {
  collateralUsd: number;
  debtUsd: number;
  liquidationThreshold: number;
  price: number;
  idleUsdc: number;
  idleWeth: number;
  suppliedUsdc: number;
  hfTarget: number;
  perAction: number;
  dayRemaining: number;
}
export interface RescuePlan {
  steps: RescueStep[];
  needRepayUsd: number;
  shortfallUsd: number; // repay-equivalent value that could not be covered
}

/**
 * Rescue actions in order of preference:
 * 1. repay from idle stablecoins, 2. add collateral from idle collateral tokens,
 * 3. withdraw from a yield position on the same chain, then repay.
 * Every step is clamped by policy caps and by available funds.
 * (Flash-loan assisted deleveraging is an optional extension and is not built.)
 */
export function planRescue(i: RescuePlanInput): RescuePlan {
  const need = rescueRepayValue(i.collateralUsd, i.liquidationThreshold, i.debtUsd, i.hfTarget);
  const steps: RescueStep[] = [];
  if (need <= 0) return { steps, needRepayUsd: 0, shortfallUsd: 0 };
  let capLeft = i.dayRemaining;
  let coll = i.collateralUsd;
  let debt = i.debtUsd;
  const take = (v: number) => Math.max(0, Math.min(v, i.perAction, capLeft));

  const r1 = take(Math.min(need, i.idleUsdc, debt));
  if (r1 > 0.01) {
    steps.push({ kind: 'repay', asset: 'USDC', amount: r1, valueUsd: r1, note: 'Repay debt from idle USDC' });
    capLeft -= r1;
    debt -= r1;
  }
  let remaining = rescueRepayValue(coll, i.liquidationThreshold, debt, i.hfTarget);

  if (remaining > 0.01 && i.idleWeth > 0) {
    const wantUsd = collateralNeeded(coll, i.liquidationThreshold, debt, i.hfTarget);
    const addUsd = take(Math.min(wantUsd, i.idleWeth * i.price));
    if (addUsd > 0.01) {
      steps.push({ kind: 'supply', asset: 'WETH', amount: addUsd / i.price, valueUsd: addUsd, note: 'Add collateral from idle WETH' });
      capLeft -= addUsd;
      coll += addUsd;
      remaining = rescueRepayValue(coll, i.liquidationThreshold, debt, i.hfTarget);
    }
  }

  if (remaining > 0.01 && i.suppliedUsdc > 0.01) {
    // withdraw + repay both count against caps, so each dollar uses cap twice
    const w = Math.max(0, Math.min(remaining, i.suppliedUsdc, i.perAction, capLeft / 2));
    if (w > 0.01) {
      steps.push({ kind: 'withdraw', asset: 'USDC', amount: w, valueUsd: w, note: 'Withdraw from the yield position' });
      steps.push({ kind: 'repay', asset: 'USDC', amount: w, valueUsd: w, note: 'Repay debt with withdrawn USDC' });
      capLeft -= 2 * w;
      debt -= w;
      remaining = rescueRepayValue(coll, i.liquidationThreshold, debt, i.hfTarget);
    }
  }
  return { steps, needRepayUsd: need, shortfallUsd: Math.max(0, remaining) };
}

/** One Sentinel pass over every allowed chain (Flow B). Fails closed on stale or missing data. */
export async function sentinelTick(e: Engine) {
  const st = e.state;
  const w = e.world;
  st.sentinel.lastBeat = w.now();
  const policy = st.policy;
  const account = st.accountAddress;
  if (!policy || !account) return;
  if (policy.paused || st.safeMode) return;

  for (const chainId of policy.allowedChains) {
    const name = chainName(chainId);
    let data;
    try {
      data = w.readAccountData(chainId, account);
    } catch (err) {
      if (err instanceof RpcError) e.notify('alert', `${name}: ${err.message}. Skipping this check (fail closed).`, `rpc-${chainId}`);
      continue;
    }
    if (data.debtUsd <= 0.0001) {
      st.sentinel.warned[chainId] = false;
      continue;
    }
    e.recordSnapshot(chainId, data);

    if (!data.sequencerUp) {
      e.notify('alert', `${name}: sequencer is down, so I will not act blindly. Waiting for it to recover.`, `seq-${chainId}`);
      continue;
    }
    if (data.oracleAgeSeconds > ORACLE_HEARTBEAT_SECONDS) {
      e.notify(
        'alert',
        `${name}: price oracle is stale (${Math.round(data.oracleAgeSeconds / 60)} min old). No automatic action; please check your position.`,
        `stale-${chainId}`,
      );
      continue;
    }
    const dev = Math.abs(data.price - data.secondaryPrice) / data.secondaryPrice;
    if (dev > 0.1) {
      e.notify(
        'alert',
        `${name}: the protocol oracle differs from the reference price by ${(dev * 100).toFixed(0)}%. Possible manipulation, so I will not act. Please check your position.`,
        `dev-${chainId}`,
      );
      continue;
    }

    const hf = data.healthFactor;
    if (hf < policy.healthFactor.warn) {
      if (!st.sentinel.warned[chainId]) {
        st.sentinel.warned[chainId] = true;
        e.notify('warn', `${name}: health factor is ${fmtHf(hf)}, below your warning level of ${policy.healthFactor.warn}.`);
      }
    } else if (hf > policy.healthFactor.warn + 0.05) st.sentinel.warned[chainId] = false;

    if (!st.rules.protect.enabled) continue;
    if (st.rules.protect.chain && st.rules.protect.chain !== chainId) continue;
    if (hf < policy.healthFactor.trigger) await rescue(e, chainId, hf);
  }
}

async function rescue(e: Engine, chainId: ChainId, hfBefore: number) {
  const st = e.state;
  const w = e.world;
  const policy = e.policy;
  const account = e.account;
  const name = chainName(chainId);
  const last = st.sentinel.lastRescueAt[chainId];
  if (last != null && w.now() - last < policy.cooldownSeconds) return;

  const data = w.readAccountData(chainId, account);
  const bal = w.balance(chainId, account);
  const hr = headroom(policy, e.history(), w.now());
  const plan = planRescue({
    collateralUsd: data.collateralUsd,
    debtUsd: data.debtUsd,
    liquidationThreshold: data.liquidationThreshold,
    price: data.price,
    idleUsdc: bal.USDC,
    idleWeth: bal.WETH,
    suppliedUsdc: data.suppliedUsdc,
    hfTarget: policy.healthFactor.target,
    perAction: hr.perAction,
    dayRemaining: hr.dayRemaining,
  });
  if (plan.steps.length === 0) {
    e.notify(
      'alert',
      `${name}: health factor ${fmtHf(hfBefore)} is below your trigger, but there are no funds (or no cap headroom) to rescue with. Add USDC or collateral now.`,
      `nofunds-${chainId}`,
    );
    return;
  }
  e.notify(
    'warn',
    `${name}: health factor ${fmtHf(hfBefore)} is below your trigger of ${policy.healthFactor.trigger}. Starting a rescue (target ${policy.healthFactor.target}).`,
  );
  const c = CONTRACTS[chainId];
  let ok = true;
  for (const step of plan.steps) {
    const proposal = e.newProposal({
      source: 'sentinel',
      kind: step.kind,
      chainId,
      target: c.pool,
      selector: SELECTORS[step.kind],
      params: { asset: step.asset, amount: step.amount, ...(step.kind === 'withdraw' ? { to: account } : {}) },
      urgent: true,
      meta: { rescue: true },
      reason: `${step.note} (${fmtUsd(step.valueUsd)}) because the health factor was ${fmtHf(hfBefore)}, below the trigger of ${policy.healthFactor.trigger}.`,
    });
    const res = await e.process(proposal);
    if (res.decision.result !== 'allow' || res.action?.status !== 'success') {
      ok = false;
      e.notify(
        'alert',
        `${name}: rescue step "${step.note}" did not complete: ${res.decision.result === 'allow' ? (res.action?.error ?? 'failed') : res.decision.reason}`,
      );
      break;
    }
  }
  st.sentinel.lastRescueAt[chainId] = w.now(); // throttles retries and denial spam too
  const after = w.readAccountData(chainId, account);
  e.recordSnapshot(chainId, after);
  if (ok) {
    const tail =
      plan.shortfallUsd > 0.5
        ? ` Funds or caps only covered part of it (${fmtUsd(plan.shortfallUsd)} short of target); I will continue after the cooldown.`
        : '';
    e.notify('success', `${name}: rescue complete. Health factor ${fmtHf(hfBefore)} → ${fmtHf(after.healthFactor)}.${tail}`);
  }
}
