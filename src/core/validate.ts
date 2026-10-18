import type { EngineState } from './engine';
import { validatePolicy } from './policy';
import { CHAIN_IDS } from './types';
import type { Policy } from './types';

const ADDR = /^0x[0-9a-fA-F]{40}$/;
const LC_ADDR = /^0x[0-9a-f]{40}$/;
const SEL = /^0x[0-9a-fA-F]{8}$/;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown, min = -Infinity, max = Infinity): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const list = (v: unknown, max = 5000) => Array.isArray(v) && v.length <= max;
// tiny negative dust can result from float arithmetic, so balances tolerate it
const DUST = -1e-6;

/**
 * Persisted browser state is untrusted input (it can be edited, corrupted or written by another tab).
 * Anything that does not pass is discarded and the app starts fresh, rather than running on tampered numbers.
 */
export function isSaneState(s: unknown): s is EngineState {
  try {
    if (!isObj(s) || s.v !== 1) return false;
    const w = s.world;
    if (
      !isObj(w) ||
      !fin(w.clock, 0, 1e11) ||
      !fin(w.block, 0) ||
      !fin(w.seq, 0) ||
      !isObj(w.chains) ||
      !isObj(w.bridges) ||
      !isObj(w.faults)
    )
      return false;
    for (const id of CHAIN_IDS) {
      const c = w.chains[id];
      if (!isObj(c)) return false;
      if (!fin(c.wethPrice, 1e-6, 1e9) || !fin(c.wethPriceSecondary, 1e-6, 1e9)) return false;
      if (!fin(c.usdcSupplyApy, 0, 1000) || !fin(c.usdcBorrowApr, 0, 1000) || !fin(c.gasUsd, 0, 1e6)) return false;
      if (!fin(c.liquidationThreshold, 0.01, 1) || !fin(c.liquidationBonus, 0, 1) || !fin(c.oracleUpdatedAt, 0)) return false;
      if (!fin(c.paymasterBudgetUsd, 0, 1e12) || typeof c.sequencerUp !== 'boolean' || typeof c.oracleFrozen !== 'boolean') return false;
      if (!list(c.providers, 10) || !(c.providers as unknown[]).every((p) => isObj(p) && typeof p.healthy === 'boolean')) return false;
      for (const m of ['balances', 'positions', 'nonces', 'gasReserveUsd', 'accounts', 'sessions'] as const) {
        const rec = c[m];
        if (!isObj(rec)) return false;
        if (Object.keys(rec).length > 200 || !Object.keys(rec).every((k) => LC_ADDR.test(k))) return false;
      }
      for (const b of Object.values(c.balances as Record<string, unknown>))
        if (!isObj(b) || !fin(b.USDC, DUST, 1e15) || !fin(b.WETH, DUST, 1e15)) return false;
      for (const p of Object.values(c.positions as Record<string, unknown>)) {
        if (!isObj(p) || !fin(p.collateralWeth, DUST, 1e15) || !fin(p.debtUsdc, DUST, 1e15) || !fin(p.suppliedUsdc, DUST, 1e15))
          return false;
      }
      for (const n of Object.values(c.nonces as Record<string, unknown>)) if (!fin(n, 0, 1e12)) return false;
      for (const g of Object.values(c.gasReserveUsd as Record<string, unknown>)) if (!fin(g, DUST, 1e12)) return false;
    }
    for (const k of [
      'intents',
      'chat',
      'proposals',
      'actions',
      'snapshots',
      'notifications',
      'moves',
      'liquidations',
      'policyVersions',
    ] as const) {
      if (!list(s[k])) return false;
    }
    if (
      s.owner !== null &&
      !(
        isObj(s.owner) &&
        typeof s.owner.address === 'string' &&
        ADDR.test(s.owner.address) &&
        (s.owner.mode === 'demo' || s.owner.mode === 'injected')
      )
    )
      return false;
    if (s.accountAddress !== null && !(typeof s.accountAddress === 'string' && ADDR.test(s.accountAddress))) return false;
    if (s.session !== null) {
      const x = s.session;
      if (
        !isObj(x) ||
        typeof x.key !== 'string' ||
        !ADDR.test(x.key) ||
        !fin(x.expiresAt, 0) ||
        (x.status !== 'active' && x.status !== 'revoked')
      )
        return false;
    }
    if (s.policy !== null) {
      const p = s.policy;
      if (
        !isObj(p) ||
        !fin(p.version, 1) ||
        !fin(p.expiresAt, 0) ||
        typeof p.paused !== 'boolean' ||
        typeof p.autoExecuteMoves !== 'boolean'
      )
        return false;
      if (typeof p.ownerAddress !== 'string' || !ADDR.test(p.ownerAddress)) return false;
      const caps = p.caps;
      if (!isObj(caps) || !fin(caps.perAction, 0, 1e12) || !fin(caps.perDay, 0, 1e12)) return false;
      const hf = p.healthFactor;
      if (!isObj(hf) || !fin(hf.warn, 1, 100) || !fin(hf.trigger, 1, 100) || !fin(hf.target, 1, 100) || !fin(hf.floor, 1, 100))
        return false;
      for (const k of [
        'maxSlippageBps',
        'gasCeilingUsd',
        'minNetGainUsd',
        'maxBreakEvenDays',
        'horizonDays',
        'minTvlUsd',
        'rescueReserveUsd',
        'cooldownSeconds',
      ] as const) {
        if (!fin(p[k], 0, 1e12)) return false;
      }
      if (!list(p.allowedChains, 3) || !(p.allowedChains as unknown[]).every((c) => CHAIN_IDS.includes(c as never))) return false;
      if (!list(p.allowedContracts, 50)) return false;
      for (const c of p.allowedContracts as unknown[]) {
        if (!isObj(c) || !CHAIN_IDS.includes(c.chainId as never) || typeof c.address !== 'string' || !ADDR.test(c.address)) return false;
        if (!list(c.selectors, 20) || !(c.selectors as unknown[]).every((x) => typeof x === 'string' && SEL.test(x))) return false;
      }
      if (validatePolicy(p as unknown as Policy).length) return false;
    }
    return isObj(s.rules) && isObj(s.sentinel) && isObj(s.settings);
  } catch {
    return false;
  }
}
