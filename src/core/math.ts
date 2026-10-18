/** HF = collateral_value x liquidation_threshold / debt_value */
export function healthFactor(collateralUsd: number, liqThreshold: number, debtUsd: number): number {
  if (debtUsd <= 0) return Number.POSITIVE_INFINITY;
  return (collateralUsd * liqThreshold) / debtUsd;
}

/** repay_value = debt_value - collateral_value x LT / HF_target (never negative) */
export function rescueRepayValue(collateralUsd: number, liqThreshold: number, debtUsd: number, hfTarget: number): number {
  const debtTarget = (collateralUsd * liqThreshold) / hfTarget;
  return Math.max(0, debtUsd - debtTarget);
}

/** Collateral value that must be added so HF reaches target at the current debt. */
export function collateralNeeded(collateralUsd: number, liqThreshold: number, debtUsd: number, hfTarget: number): number {
  return Math.max(0, (debtUsd * hfTarget) / liqThreshold - collateralUsd);
}

export interface NetGainInput {
  apyDest: number; // percent
  apySrc: number; // percent
  amount: number;
  horizonDays: number;
  bridgeFee: number;
  gasSrc: number;
  gasDest: number;
  slippageCost: number;
}
export interface NetGain {
  gross: number;
  costs: number;
  net: number;
  breakEvenDays: number;
}

/** net_gain = (apy_dest - apy_src) x amount x (horizon/365) - (bridge_fee + gas_src + gas_dest + slippage_cost) */
export function netGain(i: NetGainInput): NetGain {
  const dailyGain = ((i.apyDest - i.apySrc) / 100) * i.amount * (1 / 365);
  const gross = dailyGain * i.horizonDays;
  const costs = i.bridgeFee + i.gasSrc + i.gasDest + i.slippageCost;
  const breakEvenDays = dailyGain > 0 ? costs / dailyGain : Number.POSITIVE_INFINITY;
  return { gross, costs, net: gross - costs, breakEvenDays };
}

export const round = (n: number, d = 2) => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};
export const fmtUsd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
export const fmtHf = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : '∞');
