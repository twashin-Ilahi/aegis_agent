import { CHAIN_IDS, CHAIN_INFO, chainName, type ChainId, type Policy } from './types';
import { netGain } from './math';

export interface Pool {
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase: number | null;
  apyReward: number | null;
  apyMean30d: number | null;
  stablecoin: boolean;
  pool: string;
}
export interface YieldSnapshot {
  fetchedAt: number;
  source: 'live' | 'fallback';
  pools: Pool[];
  error?: string;
}

// Offline snapshot so the app works without network (illustrative numbers, clearly labelled in the UI).
export const FALLBACK_POOLS: Pool[] = [
  {
    chain: 'Arbitrum',
    project: 'aave-v3',
    symbol: 'USDC',
    tvlUsd: 310_000_000,
    apyBase: 4.2,
    apyReward: 0,
    apyMean30d: 4.4,
    stablecoin: true,
    pool: 'arb-aave-usdc',
  },
  {
    chain: 'Optimism',
    project: 'aave-v3',
    symbol: 'USDC',
    tvlUsd: 120_000_000,
    apyBase: 7.8,
    apyReward: 0.4,
    apyMean30d: 7.1,
    stablecoin: true,
    pool: 'op-aave-usdc',
  },
  {
    chain: 'Ethereum',
    project: 'aave-v3',
    symbol: 'USDC',
    tvlUsd: 2_100_000_000,
    apyBase: 3.9,
    apyReward: 0,
    apyMean30d: 4.0,
    stablecoin: true,
    pool: 'eth-aave-usdc',
  },
  {
    chain: 'Arbitrum',
    project: 'aave-v3',
    symbol: 'USDT',
    tvlUsd: 90_000_000,
    apyBase: 5.1,
    apyReward: 0,
    apyMean30d: 5.0,
    stablecoin: true,
    pool: 'arb-aave-usdt',
  },
  {
    chain: 'Optimism',
    project: 'aave-v3',
    symbol: 'DAI',
    tvlUsd: 6_000_000,
    apyBase: 9.9,
    apyReward: 0,
    apyMean30d: 5.2,
    stablecoin: true,
    pool: 'op-aave-dai',
  },
  {
    chain: 'Ethereum',
    project: 'compound-v3',
    symbol: 'USDC',
    tvlUsd: 900_000_000,
    apyBase: 4.6,
    apyReward: 1.2,
    apyMean30d: 4.5,
    stablecoin: true,
    pool: 'eth-comp-usdc',
  },
  {
    chain: 'Base',
    project: 'aave-v3',
    symbol: 'USDC',
    tvlUsd: 400_000_000,
    apyBase: 5.0,
    apyReward: 0,
    apyMean30d: 5.0,
    stablecoin: true,
    pool: 'base-aave-usdc',
  },
];

interface LlamaPool {
  chain?: string;
  project?: string;
  symbol?: string;
  tvlUsd?: number;
  apyBase?: number | null;
  apyReward?: number | null;
  apyMean30d?: number | null;
  stablecoin?: boolean;
  pool?: string;
}

/** External data is untrusted: coerce and drop anything malformed. */
export function normalizePools(data: unknown): Pool[] {
  const raw0 = (data as { data?: unknown })?.data;
  if (!Array.isArray(raw0)) return [];
  const arr = raw0.length > 30_000 ? raw0.slice(0, 30_000) : raw0; // bound work on hostile input
  const out: Pool[] = [];
  for (const raw of arr as LlamaPool[]) {
    if (!raw || typeof raw.chain !== 'string' || typeof raw.project !== 'string' || typeof raw.symbol !== 'string') continue;
    const tvl = Number(raw.tvlUsd);
    if (!Number.isFinite(tvl)) continue;
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1000 ? v : null);
    out.push({
      chain: raw.chain.slice(0, 40),
      project: raw.project.slice(0, 40),
      symbol: raw.symbol.slice(0, 20),
      tvlUsd: tvl,
      apyBase: n(raw.apyBase),
      apyReward: n(raw.apyReward),
      apyMean30d: n(raw.apyMean30d),
      stablecoin: raw.stablecoin === true,
      pool: String(raw.pool ?? '').slice(0, 80),
    });
  }
  return out;
}

export async function fetchYields(
  now: number,
  fetchImpl: typeof fetch = fetch,
  url = 'https://yields.llama.fi/pools',
  timeoutMs = 8000,
): Promise<YieldSnapshot> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pools = normalizePools(await res.json()).filter((p) => p.project === 'aave-v3' || p.project === 'compound-v3');
    if (pools.length === 0) throw new Error('no usable pools returned');
    return { fetchedAt: now, source: 'live', pools };
  } catch (e) {
    return { fetchedAt: now, source: 'fallback', pools: FALLBACK_POOLS, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export const chainFromLlama = (name: string): ChainId | null => CHAIN_IDS.find((id) => CHAIN_INFO[id].llama === name) ?? null;

/** Pools that pass the user's filters: stablecoin, allowed chain, Aave V3, min TVL. */
export function eligiblePools(pools: Pool[], policy: Policy, symbol = 'USDC') {
  return pools.filter((p) => {
    const id = chainFromLlama(p.chain);
    return (
      p.stablecoin &&
      p.symbol === symbol &&
      p.project === 'aave-v3' &&
      id !== null &&
      policy.allowedChains.includes(id) &&
      p.tvlUsd >= policy.minTvlUsd &&
      p.apyBase !== null
    );
  });
}

/** Base APY for decisions; prefer the 30-day mean, and ignore spikes by taking the lower of spot and mean. */
export function decisionApy(p: Pool): number {
  const spot = p.apyBase ?? 0;
  return p.apyMean30d !== null ? Math.min(spot, p.apyMean30d) : spot;
}

export interface Holding {
  chainId: ChainId;
  idleUsdc: number; // movable idle (after reserve)
  suppliedUsdc: number;
}
export interface Recommendation {
  id: string;
  asset: 'USDC';
  sourceChain: ChainId;
  destChain: ChainId;
  fromPosition: boolean;
  amount: number;
  apySrc: number;
  apyDest: number;
  rewardApyDest: number;
  gross: number;
  costs: number;
  netGainUsd: number;
  breakEvenDays: number;
  bridgeFeeUsd: number;
  gasUsd: number;
  slippageCostUsd: number;
  risks: string[];
  executable: boolean;
  reasonNotExecutable?: string;
}

export interface RankInput {
  pools: Pool[];
  policy: Policy;
  holdings: Holding[];
  gasUsd: Record<ChainId, number>;
  bridgeFeeBps: number;
  fixedBridgeUsd: number;
  slippageBps: number;
  liveApy?: (c: ChainId) => number; // re-read from chain before acting
  maxAmount?: number | 'all_idle';
  sourceChain?: ChainId | null;
  destChain?: ChainId | null;
}

/**
 * Ranked recommendations, net of costs. net_gain = (apy_dest - apy_src) x amount x (horizon/365) - costs.
 * Idle funds earn 0 at the source, so local supply (no bridge) is also a candidate.
 */
export function rank(input: RankInput): Recommendation[] {
  const { policy } = input;
  const elig = eligiblePools(input.pools, policy);
  const apyOf = new Map<ChainId, { decision: number; reward: number; tvl: number }>();
  for (const p of elig) {
    const id = chainFromLlama(p.chain);
    if (id)
      apyOf.set(id, {
        decision: input.liveApy ? Math.min(decisionApy(p), input.liveApy(id)) : decisionApy(p),
        reward: p.apyReward ?? 0,
        tvl: p.tvlUsd,
      });
  }
  const recs: Recommendation[] = [];
  for (const h of input.holdings) {
    if (input.sourceChain && h.chainId !== input.sourceChain) continue;
    const sources: { amount: number; apySrc: number; fromPosition: boolean }[] = [];
    let idle = h.idleUsdc;
    if (typeof input.maxAmount === 'number') idle = Math.min(idle, input.maxAmount);
    idle = Math.min(idle, policy.caps.perAction);
    if (idle > 1) sources.push({ amount: idle, apySrc: 0, fromPosition: false });
    const srcApy = apyOf.get(h.chainId)?.decision ?? 0;
    if (h.suppliedUsdc > 1) {
      let amt = h.suppliedUsdc;
      if (typeof input.maxAmount === 'number') amt = Math.min(amt, input.maxAmount);
      sources.push({ amount: Math.min(amt, policy.caps.perAction), apySrc: srcApy, fromPosition: true });
    }
    for (const src of sources) {
      for (const dest of CHAIN_IDS) {
        const d = apyOf.get(dest);
        if (!d) continue;
        if (src.fromPosition && dest === h.chainId) continue;
        const local = dest === h.chainId;
        const bridgeFee = local ? 0 : input.fixedBridgeUsd + (src.amount * input.bridgeFeeBps) / 10_000;
        const gasSrc = input.gasUsd[h.chainId] * (local ? 1 : 2) + (src.fromPosition ? input.gasUsd[h.chainId] : 0);
        const gasDest = local ? 0 : input.gasUsd[dest];
        const slip = local ? 0 : (src.amount * input.slippageBps) / 10_000;
        const g = netGain({
          apyDest: d.decision,
          apySrc: src.apySrc,
          amount: src.amount,
          horizonDays: policy.horizonDays,
          bridgeFee,
          gasSrc,
          gasDest,
          slippageCost: slip,
        });
        const risks: string[] = [];
        if (!local) risks.push('Bridge and router risk remains; limited by allowlist, pinned receiver and caps.');
        if (d.reward > 0) risks.push(`Reward APY of ${d.reward.toFixed(1)}% is excluded because reward tokens are volatile.`);
        if (d.tvl < 50_000_000) risks.push('Smaller pool: lower liquidity.');
        if (dest === 1) risks.push('Ethereum mainnet gas is high; small positions may not break even.');
        let executable = true;
        let why: string | undefined;
        if (!(g.net > 0)) {
          executable = false;
          why = 'Net gain is not positive after costs.';
        } else if (g.net < policy.minNetGainUsd) {
          executable = false;
          why = 'Net gain is below your minimum margin.';
        } else if (g.breakEvenDays > policy.maxBreakEvenDays) {
          executable = false;
          why = 'Break-even takes longer than your limit.';
        }
        recs.push({
          id: `${h.chainId}-${dest}-${src.fromPosition ? 'pos' : 'idle'}`,
          asset: 'USDC',
          sourceChain: h.chainId,
          destChain: dest,
          fromPosition: src.fromPosition,
          amount: src.amount,
          apySrc: src.apySrc,
          apyDest: d.decision,
          rewardApyDest: d.reward,
          gross: g.gross,
          costs: g.costs,
          netGainUsd: g.net,
          breakEvenDays: g.breakEvenDays,
          bridgeFeeUsd: bridgeFee,
          gasUsd: gasSrc + gasDest,
          slippageCostUsd: slip,
          risks,
          executable,
          reasonNotExecutable: why,
        });
      }
    }
  }
  // A bridge only makes sense if it beats the best local option for the same funds by the margin.
  const bestLocal = new Map<string, number>();
  for (const r of recs) if (r.sourceChain === r.destChain) bestLocal.set(`${r.sourceChain}-${r.fromPosition}`, r.netGainUsd);
  for (const r of recs) {
    if (r.sourceChain === r.destChain || !r.executable) continue;
    const loc = bestLocal.get(`${r.sourceChain}-${r.fromPosition}`);
    if (loc !== undefined && r.netGainUsd - loc < policy.minNetGainUsd) {
      r.executable = false;
      r.reasonNotExecutable = 'Staying on this chain earns almost as much once bridge costs are counted.';
    }
  }
  return recs.filter((r) => !input.destChain || r.destChain === input.destChain).sort((a, b) => b.netGainUsd - a.netGainUsd);
}

export const describeRec = (r: Recommendation) =>
  r.sourceChain === r.destChain
    ? `Supply ${r.amount.toFixed(0)} USDC on ${chainName(r.sourceChain)}`
    : `${r.fromPosition ? 'Withdraw and move' : 'Move'} ${r.amount.toFixed(0)} USDC from ${chainName(r.sourceChain)} to ${chainName(r.destChain)}`;
