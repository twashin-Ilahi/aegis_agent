export type Hex = `0x${string}`;
export type ChainId = 1 | 42161 | 10;
export type Asset = 'USDC' | 'WETH';
export type ActionKind = 'supply' | 'repay' | 'withdraw' | 'bridge' | 'transfer';
export type Source = 'intent' | 'sentinel' | 'scanner' | 'executor';

export const CHAIN_IDS: ChainId[] = [42161, 10, 1];
export const CHAIN_INFO: Record<ChainId, { name: string; llama: string; gasUsd: number }> = {
  42161: { name: 'Arbitrum', llama: 'Arbitrum', gasUsd: 0.06 },
  10: { name: 'Optimism', llama: 'Optimism', gasUsd: 0.05 },
  1: { name: 'Ethereum', llama: 'Ethereum', gasUsd: 2.4 },
};
export const chainName = (id: number) => CHAIN_INFO[id as ChainId]?.name ?? `Chain ${id}`;

export interface ActionProposal {
  id: string;
  source: Source;
  kind: ActionKind;
  chainId: ChainId;
  target: Hex;
  selector: Hex;
  params: {
    asset: Asset;
    amount: number; // token units
    to?: Hex; // recipient / receiver
    destChainId?: ChainId;
    slippageBps?: number;
    router?: Hex;
  };
  nativeValue: number;
  urgent: boolean;
  meta: {
    rescue?: boolean;
    voluntary?: boolean; // yield move or other optional action
    netGainUsd?: number;
    breakEvenDays?: number;
    feeUsd?: number;
    gasUsd?: number;
    moveId?: string;
    rule?: string;
  };
  reason: string;
  createdAt: number;
}

export interface Outflow {
  token: Asset;
  amount: number;
  to: Hex;
}

export interface SimResult {
  ok: boolean;
  error?: string;
  outflows: Outflow[];
  gasUsd: number;
  valueUsd: number;
  hfBefore: number;
  hfAfter: number;
  usdcIdleAfter: number;
  hasDebt: boolean;
}

export type DecisionResult = 'allow' | 'deny' | 'confirm';
export interface Check {
  ruleId: string;
  pass: boolean;
  detail: string;
}
export interface Decision {
  result: DecisionResult;
  ruleId: string;
  reason: string;
  checks: Check[];
  sim?: SimResult;
}

export interface Policy {
  ownerAddress: Hex;
  version: number;
  allowedChains: ChainId[];
  allowedContracts: { chainId: ChainId; address: Hex; selectors: Hex[]; label: string }[];
  caps: { perAction: number; perDay: number; currency: 'USD' };
  maxSlippageBps: number;
  gasCeilingUsd: number;
  minNetGainUsd: number;
  maxBreakEvenDays: number;
  horizonDays: number;
  minTvlUsd: number;
  rescueReserveUsd: number;
  healthFactor: { warn: number; trigger: number; target: number; floor: number };
  cooldownSeconds: number;
  expiresAt: number;
  paused: boolean;
  autoExecuteMoves: boolean;
}

export interface HistoryEntry {
  time: number;
  valueUsd: number;
  kind: ActionKind;
  source: Source;
  rescue: boolean;
}
