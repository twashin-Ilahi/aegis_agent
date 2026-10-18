import { toFunctionSelector } from 'viem';
import type { ActionKind, ChainId, Hex } from './types';

// Addresses are the public deployments used by the simulated fork. [Verify] before any real use.
export const CONTRACTS: Record<ChainId, { pool: Hex; usdc: Hex; weth: Hex; router: Hex }> = {
  42161: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    router: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  },
  10: {
    pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
    usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    weth: '0x4200000000000000000000000000000000000006',
    router: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  },
  1: {
    pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
    usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    router: '0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE',
  },
};

export const SIGS = {
  supply: 'supply(address,uint256,address,uint16)',
  repay: 'repay(address,uint256,uint256,address)',
  withdraw: 'withdraw(address,uint256,address)',
  bridge: 'bridgeTokens(address,uint256,uint256,address)', // simulated aggregator entrypoint
  transfer: 'transfer(address,uint256)',
} as const;

export const SELECTORS: Record<ActionKind, Hex> = {
  supply: toFunctionSelector(SIGS.supply),
  repay: toFunctionSelector(SIGS.repay),
  withdraw: toFunctionSelector(SIGS.withdraw),
  bridge: toFunctionSelector(SIGS.bridge),
  transfer: toFunctionSelector(SIGS.transfer),
};

export const selectorName = (sel: string): string =>
  (Object.keys(SELECTORS) as ActionKind[]).find((k) => SELECTORS[k].toLowerCase() === sel.toLowerCase()) ?? sel;

export const ATTACKER: Hex = '0x000000000000000000000000000000000000dEaD';
export const FAKE_ROUTER: Hex = '0xBAD0000000000000000000000000000000000bad';
export const lc = (a: string) => a.toLowerCase();
