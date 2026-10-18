import { z } from 'zod';
import {
  CHAIN_IDS,
  chainName,
  type ActionProposal,
  type Check,
  type ChainId,
  type Decision,
  type HistoryEntry,
  type Hex,
  type Policy,
  type SimResult,
} from './types';
import { CONTRACTS, SELECTORS, lc, selectorName } from './contracts';
import { fmtHf, fmtUsd } from './math';

const hex = z.string().regex(/^0x[0-9a-fA-F]+$/);
const addr = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const chainIdSchema = z.union([z.literal(1), z.literal(42161), z.literal(10)]);

export const proposalSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['intent', 'sentinel', 'scanner', 'executor']),
  kind: z.enum(['supply', 'repay', 'withdraw', 'bridge', 'transfer']),
  chainId: chainIdSchema,
  target: addr,
  selector: hex.length(10),
  params: z.object({
    asset: z.enum(['USDC', 'WETH']),
    amount: z.number().positive().finite().max(1e12),
    to: addr.optional(),
    destChainId: chainIdSchema.optional(),
    slippageBps: z.number().min(0).max(10_000).optional(),
    router: addr.optional(),
  }),
  nativeValue: z.number().min(0).finite(),
  urgent: z.boolean(),
  meta: z.object({
    rescue: z.boolean().optional(),
    voluntary: z.boolean().optional(),
    netGainUsd: z.number().optional(),
    breakEvenDays: z.number().optional(),
    feeUsd: z.number().optional(),
    gasUsd: z.number().optional(),
    moveId: z.string().optional(),
    rule: z.string().optional(),
  }),
  reason: z.string(),
  createdAt: z.number(),
});

export const DEFAULT_EXPIRY_SECONDS = 7 * 24 * 3600;

export function defaultPolicy(owner: Hex, now: number): Policy {
  const allowedContracts: Policy['allowedContracts'] = [];
  for (const id of CHAIN_IDS) {
    const c = CONTRACTS[id];
    allowedContracts.push({
      chainId: id,
      address: c.pool,
      selectors: [SELECTORS.supply, SELECTORS.repay, SELECTORS.withdraw],
      label: 'Aave V3 Pool',
    });
    allowedContracts.push({ chainId: id, address: c.router, selectors: [SELECTORS.bridge], label: 'Li.Fi router' });
  }
  return {
    ownerAddress: owner,
    version: 1,
    allowedChains: [...CHAIN_IDS],
    allowedContracts,
    caps: { perAction: 2500, perDay: 5000, currency: 'USD' },
    maxSlippageBps: 50,
    gasCeilingUsd: 0.5,
    minNetGainUsd: 2,
    maxBreakEvenDays: 14,
    horizonDays: 30,
    minTvlUsd: 10_000_000,
    rescueReserveUsd: 2000,
    healthFactor: { warn: 1.5, trigger: 1.15, target: 1.4, floor: 1.5 },
    cooldownSeconds: 60,
    expiresAt: now + DEFAULT_EXPIRY_SECONDS,
    paused: false,
    autoExecuteMoves: true,
  };
}

export function validatePolicy(p: Policy): string[] {
  const errs: string[] = [];
  const hf = p.healthFactor;
  if (!(hf.trigger > 1.02)) errs.push('Health factor trigger must be above 1.02.');
  if (!(hf.target > hf.trigger)) errs.push('Health factor target must be above the trigger.');
  if (!(hf.warn >= hf.trigger)) errs.push('Warn level must be at or above the trigger.');
  if (!(hf.floor >= hf.trigger)) errs.push('Floor must be at or above the trigger.');
  if (hf.target > 10) errs.push('Health factor target above 10 is not meaningful.');
  if (!(p.caps.perAction > 0) || !(p.caps.perDay >= p.caps.perAction)) errs.push('Per-day cap must be at least the per-action cap.');
  if (p.maxSlippageBps < 0 || p.maxSlippageBps > 300) errs.push('Max slippage must be between 0 and 300 bps.');
  if (p.gasCeilingUsd < 0) errs.push('Gas ceiling cannot be negative.');
  if (p.cooldownSeconds < 0) errs.push('Cooldown cannot be negative.');
  if (p.allowedChains.length === 0) errs.push('At least one chain must be allowed.');
  return errs;
}

export interface EvalContext {
  policy: Policy;
  accountAddress: Hex;
  now: number;
  history: HistoryEntry[];
  simulate: () => SimResult;
  confirmed?: boolean;
  safeMode?: boolean;
  sessionValid?: boolean;
  lastRescueAt?: number | null;
}

export function headroom(policy: Policy, history: HistoryEntry[], now: number) {
  const day = history.filter((h) => now - h.time < 86400).reduce((s, h) => s + h.valueUsd, 0);
  return { perAction: policy.caps.perAction, dayRemaining: Math.max(0, policy.caps.perDay - day), spentToday: day };
}

/**
 * Deterministic gate. No LLM, no randomness. Fails closed: any exception becomes a deny.
 */
export function evaluate(proposal: ActionProposal, ctx: EvalContext): Decision {
  const checks: Check[] = [];
  const done = (result: Decision['result'], ruleId: string, reason: string, sim?: SimResult): Decision => ({
    result,
    ruleId,
    reason,
    checks,
    sim,
  });
  const pass = (ruleId: string, detail: string) => checks.push({ ruleId, pass: true, detail });
  const fail = (ruleId: string, reason: string, sim?: SimResult) => {
    checks.push({ ruleId, pass: false, detail: reason });
    return done('deny', ruleId, reason, sim);
  };
  try {
    const { policy: p } = ctx;
    const parsed = proposalSchema.safeParse(proposal);
    if (!parsed.success) return fail('R-SCHEMA', 'The proposal is malformed, so nothing was signed.');
    pass('R-SCHEMA', 'Proposal matches the schema');

    if (ctx.safeMode) return fail('R-SAFE', 'Safe mode is on after an unexpected result. Clear it in the dashboard to continue.');
    if (p.paused) return fail('R-PAUSED', 'The agent is paused by the owner.');
    if (ctx.now >= p.expiresAt) return fail('R-EXPIRED', 'The session has expired. Grant a new session key to continue.');
    if (ctx.sessionValid === false) return fail('R-SESSION', 'There is no active session key for this chain.');
    pass('R-STATE', 'Agent is active and within its session window');

    const chainOk = (id: ChainId) => p.allowedChains.includes(id);
    if (!chainOk(proposal.chainId)) return fail('R-CHAIN', `${chainName(proposal.chainId)} is not an allowed chain.`);
    if (proposal.params.destChainId && !chainOk(proposal.params.destChainId))
      return fail('R-CHAIN', `${chainName(proposal.params.destChainId)} is not an allowed destination chain.`);
    pass('R-CHAIN', 'Chain allowed');

    const entry = p.allowedContracts.find((c) => c.chainId === proposal.chainId && lc(c.address) === lc(proposal.target));
    if (!entry) return fail('R-CONTRACT', `Contract ${proposal.target} is not on the allowlist for ${chainName(proposal.chainId)}.`);
    if (!entry.selectors.some((s) => lc(s) === lc(proposal.selector)))
      return fail('R-SELECTOR', `Function ${selectorName(proposal.selector)} is not allowed on ${entry.label}.`);
    if (lc(proposal.selector) !== lc(SELECTORS[proposal.kind]))
      return fail('R-SELECTOR', 'The call data does not match the stated action.');
    pass('R-CONTRACT', `${entry.label} / ${selectorName(proposal.selector)} allowed`);

    if (proposal.params.to && lc(proposal.params.to) !== lc(ctx.accountAddress))
      return fail('R-RECIPIENT', 'Funds may only go to your own smart account. A different recipient was requested.');
    if (proposal.kind === 'bridge') {
      if (
        !proposal.params.router ||
        lc(proposal.params.router) !== lc(CONTRACTS[proposal.chainId].router) ||
        lc(proposal.target) !== lc(CONTRACTS[proposal.chainId].router)
      )
        return fail('R-ROUTER', 'The bridge router is not the pinned, allowlisted router.');
    }
    pass('R-RECIPIENT', 'Recipient is the owner account');

    const maxSlip = p.maxSlippageBps;
    if ((proposal.params.slippageBps ?? 0) > maxSlip)
      return fail('R-SLIPPAGE', `Slippage ${(proposal.params.slippageBps ?? 0) / 100}% is above your ${maxSlip / 100}% limit.`);
    pass('R-SLIPPAGE', 'Slippage within limit');

    const voluntary = !!proposal.meta.voluntary;
    const gas = proposal.meta.gasUsd ?? 0;
    if (!proposal.urgent && !proposal.meta.rescue && gas > p.gasCeilingUsd && voluntary) {
      return fail('R-GAS', `Gas cost ${fmtUsd(gas)} is above your ${fmtUsd(p.gasCeilingUsd)} ceiling, so it was postponed.`);
    }
    pass('R-GAS', 'Cost within ceiling or urgent');

    if (voluntary) {
      const gain = proposal.meta.netGainUsd;
      if (gain === undefined || !(gain >= p.minNetGainUsd))
        return fail(
          'R-NETGAIN',
          `Net gain ${gain === undefined ? 'unknown' : fmtUsd(gain)} is below the required ${fmtUsd(p.minNetGainUsd)} margin.`,
        );
      const be = proposal.meta.breakEvenDays;
      if (be !== undefined && be > p.maxBreakEvenDays)
        return fail('R-BREAKEVEN', `Break-even of ${be.toFixed(1)} days is longer than your ${p.maxBreakEvenDays}-day limit.`);
      pass('R-NETGAIN', 'Net gain beats costs by the required margin');
    }

    // Caps use the simulated value, not the value the proposer claims.
    const sim = ctx.simulate();
    if (!sim.ok) return fail('R-SIM', `Simulation failed: ${sim.error ?? 'unknown error'}.`, sim);
    pass('R-SIM', 'Simulation succeeded');
    const value = Math.max(sim.valueUsd, 0);
    if (value > p.caps.perAction + 1e-9)
      return fail('R-CAP-ACTION', `${fmtUsd(value)} is above the ${fmtUsd(p.caps.perAction)} per-action cap.`, sim);
    pass('R-CAP-ACTION', 'Within per-action cap');
    const hr = headroom(p, ctx.history, ctx.now);
    if (value > hr.dayRemaining + 1e-9)
      return fail(
        'R-CAP-DAY',
        `${fmtUsd(value)} would exceed the ${fmtUsd(p.caps.perDay)} daily cap (${fmtUsd(hr.spentToday)} already used).`,
        sim,
      );
    pass('R-CAP-DAY', 'Within daily cap');

    const explained = new Set([lc(ctx.accountAddress), lc(CONTRACTS[proposal.chainId].pool)]);
    const bad = sim.outflows.find((o) => !explained.has(lc(o.to)));
    if (bad)
      return fail(
        'R-SIM-OUTFLOW',
        `Simulation shows ${bad.amount.toFixed(2)} ${bad.token} leaving to ${bad.to}, which is not you or the lending pool.`,
        sim,
      );
    pass('R-SIM-OUTFLOW', 'No unexplained outflows');

    if (voluntary && sim.hasDebt && proposal.params.asset === 'USDC' && sim.usdcIdleAfter < p.rescueReserveUsd - 1e-9)
      return fail(
        'R-RESERVE',
        `This would leave ${fmtUsd(sim.usdcIdleAfter)} idle on a chain with a loan, below your ${fmtUsd(p.rescueReserveUsd)} rescue reserve.`,
        sim,
      );
    pass('R-RESERVE', 'Rescue reserve kept');

    if (sim.hfAfter < p.healthFactor.floor && sim.hfAfter < sim.hfBefore - 1e-9)
      return fail(
        'R-HF-FLOOR',
        `Health factor would fall to ${fmtHf(sim.hfAfter)}, below your floor of ${fmtHf(p.healthFactor.floor)}.`,
        sim,
      );
    pass('R-HF-FLOOR', 'Health factor floor respected');

    if (proposal.meta.rescue && ctx.lastRescueAt != null && ctx.now - ctx.lastRescueAt < p.cooldownSeconds)
      return fail('R-COOLDOWN', `A rescue ran ${Math.round(ctx.now - ctx.lastRescueAt)}s ago; the cooldown is ${p.cooldownSeconds}s.`, sim);
    pass('R-COOLDOWN', 'Cooldown passed');

    if (voluntary && !p.autoExecuteMoves && !ctx.confirmed) {
      checks.push({ ruleId: 'R-CONFIRM', pass: false, detail: 'Needs your confirmation' });
      return done('confirm', 'R-CONFIRM', 'Your policy asks for confirmation before optional moves.', sim);
    }
    pass('R-CONFIRM', 'No confirmation needed');
    return done('allow', 'R-ALLOW', 'Every policy rule passed.', sim);
  } catch (e) {
    // fail closed
    return fail('R-ERROR', `Unexpected error, so no action was taken: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function policySummary(p: Policy): string {
  return [
    `Chains: ${p.allowedChains.map(chainName).join(', ')}`,
    `Per action ${fmtUsd(p.caps.perAction)}, per day ${fmtUsd(p.caps.perDay)}`,
    `Slippage ≤ ${p.maxSlippageBps / 100}%, gas ceiling ${fmtUsd(p.gasCeilingUsd)}`,
    `Health factor warn ${p.healthFactor.warn}, trigger ${p.healthFactor.trigger}, target ${p.healthFactor.target}, floor ${p.healthFactor.floor}`,
    `Min net gain ${fmtUsd(p.minNetGainUsd)}, break-even ≤ ${p.maxBreakEvenDays}d, rescue reserve ${fmtUsd(p.rescueReserveUsd)}`,
  ].join('\n');
}
