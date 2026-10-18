import { keccak256, recoverMessageAddress, stringToHex } from 'viem';
import { CONTRACTS, SELECTORS, lc, selectorName } from './contracts';
import { healthFactor } from './math';
import { CHAIN_IDS, CHAIN_INFO, type ActionKind, type Asset, type ChainId, type Hex, type Outflow, type SimResult } from './types';

export class ChainRevert extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(`${code}: ${message}`);
  }
}
export class RpcError extends Error {}

export interface Balances {
  USDC: number;
  WETH: number;
}
export interface Position {
  collateralWeth: number;
  debtUsdc: number;
  suppliedUsdc: number;
}
export interface Permission {
  target: Hex;
  selectors: Hex[];
}
export interface OnchainSession {
  key: Hex;
  account: Hex;
  permissions: Permission[];
  nativeValueLimit: number;
  caps: Record<Asset, { perAction: number; perPeriod: number }>;
  periodSeconds: number;
  periodStart: number;
  spent: Record<Asset, number>;
  validAfter: number;
  validUntil: number;
  recipientMustEqualAccount: boolean;
  revoked: boolean;
}
export interface ChainState {
  id: ChainId;
  wethPrice: number;
  wethPriceSecondary: number;
  oracleUpdatedAt: number;
  oracleFrozen: boolean;
  usdcSupplyApy: number;
  usdcBorrowApr: number;
  gasUsd: number;
  sequencerUp: boolean;
  providers: { name: string; healthy: boolean }[];
  balances: Record<string, Balances>;
  positions: Record<string, Position>;
  nonces: Record<string, number>;
  gasReserveUsd: Record<string, number>;
  accounts: Record<string, { owner: Hex }>;
  sessions: Record<string, OnchainSession>;
  paymasterEnabled: boolean;
  paymasterBudgetUsd: number;
  liquidationThreshold: number;
  liquidationBonus: number;
}
export interface Faults {
  quoteExpired: boolean;
  sourceRevert: boolean;
  bridgeDelay: boolean;
  depositFail: boolean;
  partialFill: boolean;
  maliciousRouter: boolean;
  submitTransientFailures: number;
}
export interface BridgeTransfer {
  id: string;
  srcChain: ChainId;
  dstChain: ChainId;
  amount: number;
  received: number;
  receiver: Hex;
  eta: number;
  status: 'pending' | 'arrived';
  createdAt: number;
}
export interface WorldState {
  clock: number;
  block: number;
  seq: number;
  chains: Record<ChainId, ChainState>;
  bridges: Record<string, BridgeTransfer>;
  faults: Faults;
}
export interface CallSpec {
  kind: ActionKind;
  target: Hex;
  selector: Hex;
  asset: Asset;
  amount: number;
  to?: Hex;
  destChainId?: ChainId;
  slippageBps?: number;
}
export interface UserOp {
  sender: Hex;
  chainId: ChainId;
  nonce: number;
  call: CallSpec;
  nativeValue: number;
  sessionKey: Hex;
  signature?: Hex;
}
export interface Liquidation {
  chainId: ChainId;
  account: string;
  repaidUsd: number;
  seizedWeth: number;
}
export interface AccountData {
  collateralUsd: number;
  debtUsd: number;
  liquidationThreshold: number;
  healthFactor: number;
  price: number;
  secondaryPrice: number;
  oracleAgeSeconds: number;
  sequencerUp: boolean;
  suppliedUsdc: number;
}

export const ORACLE_HEARTBEAT_SECONDS = 3600;
export const MAX_SESSION_SECONDS = 30 * 86400;
const isAddr = (a: unknown): a is string => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
export const BLOCK_SECONDS = 12;
const YEAR = 365 * 24 * 3600;
const emptyBal = (): Balances => ({ USDC: 0, WETH: 0 });
const emptyPos = (): Position => ({ collateralWeth: 0, debtUsdc: 0, suppliedUsdc: 0 });
export const toHash = (op: UserOp): Hex =>
  keccak256(
    stringToHex(
      JSON.stringify({
        s: op.sender,
        c: op.chainId,
        n: op.nonce,
        k: op.call,
        v: op.nativeValue,
        sk: op.sessionKey,
      }),
    ),
  );

export function defaultWorldState(now = 1_790_000_000): WorldState {
  const mk = (id: ChainId, apy: number, apr: number): ChainState => ({
    id,
    wethPrice: 3000,
    wethPriceSecondary: 3000,
    oracleUpdatedAt: now,
    oracleFrozen: false,
    usdcSupplyApy: apy,
    usdcBorrowApr: apr,
    gasUsd: CHAIN_INFO[id].gasUsd,
    sequencerUp: true,
    providers: [
      { name: 'primary-rpc', healthy: true },
      { name: 'backup-rpc', healthy: true },
    ],
    balances: {},
    positions: {},
    nonces: {},
    gasReserveUsd: {},
    accounts: {},
    sessions: {},
    paymasterEnabled: false,
    paymasterBudgetUsd: 0,
    liquidationThreshold: 0.8,
    liquidationBonus: 0.05,
  });
  return {
    clock: now,
    block: 1,
    seq: 0,
    chains: { 42161: mk(42161, 4.2, 5.4), 10: mk(10, 7.8, 5.9), 1: mk(1, 3.9, 4.8) },
    bridges: {},
    faults: {
      quoteExpired: false,
      sourceRevert: false,
      bridgeDelay: false,
      depositFail: false,
      partialFill: false,
      maliciousRouter: false,
      submitTransientFailures: 0,
    },
  };
}

/** Pure application of a call to a (possibly cloned) world state. Throws ChainRevert. */
function applyCall(
  s: WorldState,
  chainId: ChainId,
  account: Hex,
  call: CallSpec,
  faults = true,
): { outflows: Outflow[]; bridgeId?: string } {
  const ch = s.chains[chainId];
  const a = lc(account);
  const bal = (ch.balances[a] ??= emptyBal());
  const pos = (ch.positions[a] ??= emptyPos());
  const c = CONTRACTS[chainId];
  const amt = call.amount;
  const outflows: Outflow[] = [];
  if (!(amt > 0) || !Number.isFinite(amt)) throw new ChainRevert('EXEC', 'invalid amount');
  if (!isAddr(call.target) || (call.to !== undefined && !isAddr(call.to))) throw new ChainRevert('EXEC', 'malformed address');
  if (call.destChainId !== undefined && !s.chains[call.destChainId]) throw new ChainRevert('EXEC', 'unknown destination chain');
  if (lc(call.selector) !== lc(SELECTORS[call.kind])) throw new ChainRevert('EXEC', 'selector does not match call data');
  switch (call.kind) {
    case 'supply': {
      if (lc(call.target) !== lc(c.pool)) throw new ChainRevert('EXEC', 'supply target is not the pool');
      if (bal[call.asset] + 1e-9 < amt) throw new ChainRevert('EXEC', `insufficient ${call.asset} balance`);
      if (faults && call.asset === 'USDC' && s.faults.depositFail) throw new ChainRevert('EXEC', 'pool deposit reverted (injected fault)');
      bal[call.asset] -= amt;
      if (call.asset === 'USDC') pos.suppliedUsdc += amt;
      else pos.collateralWeth += amt;
      outflows.push({ token: call.asset, amount: amt, to: c.pool });
      break;
    }
    case 'repay': {
      if (lc(call.target) !== lc(c.pool)) throw new ChainRevert('EXEC', 'repay target is not the pool');
      if (call.asset !== 'USDC') throw new ChainRevert('EXEC', 'only USDC debt supported');
      const pay = Math.min(amt, pos.debtUsdc);
      if (pay <= 0) throw new ChainRevert('EXEC', 'no debt to repay');
      if (bal.USDC + 1e-9 < pay) throw new ChainRevert('EXEC', 'insufficient USDC balance');
      bal.USDC -= pay;
      pos.debtUsdc -= pay;
      outflows.push({ token: 'USDC', amount: pay, to: c.pool });
      break;
    }
    case 'withdraw': {
      if (lc(call.target) !== lc(c.pool)) throw new ChainRevert('EXEC', 'withdraw target is not the pool');
      const to = call.to ?? account;
      if (call.asset === 'USDC') {
        if (pos.suppliedUsdc + 1e-9 < amt) throw new ChainRevert('EXEC', 'withdraw exceeds supplied balance');
        pos.suppliedUsdc = Math.max(0, pos.suppliedUsdc - amt);
      } else {
        if (pos.collateralWeth + 1e-9 < amt) throw new ChainRevert('EXEC', 'withdraw exceeds collateral');
        pos.collateralWeth -= amt;
        if (pos.debtUsdc > 0 && healthFactor(pos.collateralWeth * ch.wethPrice, ch.liquidationThreshold, pos.debtUsdc) < 1)
          throw new ChainRevert('EXEC', 'withdraw would make position liquidatable');
      }
      (ch.balances[lc(to)] ??= emptyBal())[call.asset] += amt;
      if (lc(to) !== a) outflows.push({ token: call.asset, amount: amt, to });
      break;
    }
    case 'transfer': {
      const to = call.to;
      if (!to) throw new ChainRevert('EXEC', 'missing recipient');
      if (bal[call.asset] + 1e-9 < amt) throw new ChainRevert('EXEC', `insufficient ${call.asset} balance`);
      bal[call.asset] -= amt;
      (ch.balances[lc(to)] ??= emptyBal())[call.asset] += amt;
      outflows.push({ token: call.asset, amount: amt, to });
      break;
    }
    case 'bridge': {
      if (call.asset !== 'USDC') throw new ChainRevert('EXEC', 'only USDC can be bridged');
      if (!call.destChainId || call.destChainId === chainId) throw new ChainRevert('EXEC', 'invalid destination chain');
      if (faults && s.faults.sourceRevert) throw new ChainRevert('EXEC', 'router reverted (injected fault)');
      if (bal.USDC + 1e-9 < amt) throw new ChainRevert('EXEC', 'insufficient USDC balance');
      const receiver = call.to ?? account;
      bal.USDC -= amt;
      const id = `br_${++s.seq}`;
      const slip = (call.slippageBps ?? 0) / 10_000;
      const received = faults && s.faults.partialFill ? amt * 0.9 : amt * (1 - Math.min(slip, 0.0008));
      s.bridges[id] = {
        id,
        srcChain: chainId,
        dstChain: call.destChainId,
        amount: amt,
        received,
        receiver,
        eta: s.clock + (faults && s.faults.bridgeDelay ? 3 * 3600 : 60),
        status: 'pending',
        createdAt: s.clock,
      };
      outflows.push({ token: 'USDC', amount: amt, to: receiver });
      return { outflows, bridgeId: id };
    }
  }
  return { outflows };
}

export class World {
  s: WorldState;
  constructor(state?: WorldState) {
    this.s = state ?? defaultWorldState();
  }

  now() {
    return this.s.clock;
  }
  chain(id: ChainId) {
    return this.s.chains[id];
  }

  // ---- setup helpers (the "anvil_setBalance" of the fork) ----
  ensure(chainId: ChainId, addr: string) {
    const ch = this.chain(chainId);
    const a = lc(addr);
    return { bal: (ch.balances[a] ??= emptyBal()), pos: (ch.positions[a] ??= emptyPos()) };
  }
  deal(chainId: ChainId, addr: string, asset: Asset, amount: number) {
    this.ensure(chainId, addr).bal[asset] = amount;
  }
  balance(chainId: ChainId, addr: string): Balances {
    return this.ensure(chainId, addr).bal;
  }
  position(chainId: ChainId, addr: string): Position {
    return this.ensure(chainId, addr).pos;
  }
  setPosition(chainId: ChainId, addr: string, p: Partial<Position>) {
    Object.assign(this.ensure(chainId, addr).pos, p);
  }
  setPrice(chainId: ChainId, price: number, opts: { oracleOnly?: boolean } = {}) {
    const ch = this.chain(chainId);
    ch.wethPrice = price;
    if (!opts.oracleOnly) ch.wethPriceSecondary = price;
    if (!ch.oracleFrozen) ch.oracleUpdatedAt = this.s.clock;
  }

  // ---- reads (through RPC failover) ----
  private rpc(chainId: ChainId): string {
    const p = this.chain(chainId).providers.find((x) => x.healthy);
    if (!p) throw new RpcError(`all RPC providers failed on ${CHAIN_INFO[chainId].name}`);
    return p.name;
  }
  readAccountData(chainId: ChainId, addr: string): AccountData {
    this.rpc(chainId);
    return this.accountData(chainId, addr);
  }
  accountData(chainId: ChainId, addr: string, state: WorldState = this.s): AccountData {
    const ch = state.chains[chainId];
    const p = ch.positions[lc(addr)] ?? emptyPos();
    const collateralUsd = p.collateralWeth * ch.wethPrice;
    return {
      collateralUsd,
      debtUsd: p.debtUsdc,
      liquidationThreshold: ch.liquidationThreshold,
      healthFactor: healthFactor(collateralUsd, ch.liquidationThreshold, p.debtUsdc),
      price: ch.wethPrice,
      secondaryPrice: ch.wethPriceSecondary,
      oracleAgeSeconds: state.clock - ch.oracleUpdatedAt,
      sequencerUp: ch.sequencerUp,
      suppliedUsdc: p.suppliedUsdc,
    };
  }
  readApy(chainId: ChainId): number {
    this.rpc(chainId);
    return this.chain(chainId).usdcSupplyApy;
  }

  // ---- simulation (eth_call on a clone) ----
  simulate(chainId: ChainId, account: Hex, call: CallSpec): SimResult {
    const clone = structuredClone(this.s) as WorldState;
    const before = this.accountData(chainId, account);
    const price = this.chain(chainId).wethPrice;
    const base: SimResult = {
      ok: false,
      outflows: [],
      gasUsd: this.gasFor(chainId, call),
      valueUsd: call.asset === 'WETH' ? call.amount * price : call.amount,
      hfBefore: before.healthFactor,
      hfAfter: before.healthFactor,
      usdcIdleAfter: this.balance(chainId, account).USDC,
      hasDebt: before.debtUsd > 0,
    };
    try {
      const r = applyCall(clone, chainId, account, call);
      const after = this.accountData(chainId, account, clone);
      return {
        ...base,
        ok: true,
        outflows: r.outflows,
        hfAfter: after.healthFactor,
        usdcIdleAfter: (clone.chains[chainId].balances[lc(account)] ?? emptyBal()).USDC,
      };
    } catch (e) {
      return { ...base, error: e instanceof Error ? e.message : String(e) };
    }
  }
  gasFor(chainId: ChainId, call: Pick<CallSpec, 'kind'>): number {
    return this.chain(chainId).gasUsd * (call.kind === 'bridge' ? 2 : 1);
  }

  // ---- accounts and sessions ----
  deployAccount(chainId: ChainId, account: Hex, owner: Hex) {
    this.chain(chainId).accounts[lc(account)] = { owner };
    this.ensure(chainId, account);
  }
  fundGasReserve(chainId: ChainId, account: Hex, usd: number) {
    this.chain(chainId).gasReserveUsd[lc(account)] = usd;
  }

  async enableSession(chainId: ChainId, session: OnchainSession, ownerSig: Hex, message: string) {
    const ch = this.chain(chainId);
    const acct = ch.accounts[lc(session.account)];
    if (!acct) throw new ChainRevert('AA20', 'account not deployed');
    const signer = await recoverMessageAddress({ message, signature: ownerSig });
    if (lc(signer) !== lc(acct.owner)) throw new ChainRevert('AA24', 'session grant not signed by account owner');
    // a key is registered once; re-submitting an old signed grant must never resurrect a revoked key
    if (ch.sessions[lc(session.key)]) throw new ChainRevert('AA24', 'session key already registered');
    if (!(session.validUntil > this.s.clock) || session.validUntil - this.s.clock > MAX_SESSION_SECONDS)
      throw new ChainRevert('AA22', 'session lifetime must be positive and at most 30 days');
    for (const t of ['USDC', 'WETH'] as const) {
      const c = session.caps[t];
      if (!(c.perAction >= 0) || !(c.perPeriod >= c.perAction) || !Number.isFinite(c.perPeriod))
        throw new ChainRevert('AA23', 'invalid session caps');
    }
    ch.sessions[lc(session.key)] = structuredClone({ ...session, revoked: false });
  }
  async revokeSession(chainId: ChainId, key: Hex, ownerSig: Hex, message: string) {
    const ch = this.chain(chainId);
    const sess = ch.sessions[lc(key)];
    if (!sess) return;
    const acct = ch.accounts[lc(sess.account)];
    const signer = await recoverMessageAddress({ message, signature: ownerSig });
    if (!acct || lc(signer) !== lc(acct.owner)) throw new ChainRevert('AA24', 'revocation not signed by account owner');
    sess.revoked = true;
  }

  /** Validation performed by the account's session-key module, independent of any backend policy. */
  async validateUserOp(op: UserOp) {
    const state = this.s;
    const ch = state.chains[op.chainId];
    if (!op.signature) throw new ChainRevert('AA24', 'missing signature');
    if (!Number.isFinite(op.call.amount) || op.call.amount <= 0) throw new ChainRevert('AA23', 'invalid amount');
    if (!isAddr(op.call.target) || (op.call.to !== undefined && !isAddr(op.call.to))) throw new ChainRevert('AA23', 'malformed address');
    const sess = ch.sessions[lc(op.sessionKey)];
    if (!sess) throw new ChainRevert('AA24', 'unknown session key');
    const signer = await recoverMessageAddress({ message: { raw: toHash(op) }, signature: op.signature });
    if (lc(signer) !== lc(op.sessionKey)) throw new ChainRevert('AA24', 'bad signature');
    if (sess.revoked) throw new ChainRevert('AA22', 'session key revoked');
    if (lc(sess.account) !== lc(op.sender)) throw new ChainRevert('AA24', 'session key belongs to another account');
    if (state.clock < sess.validAfter || state.clock > sess.validUntil)
      throw new ChainRevert('AA22', 'session key expired or not yet valid');
    if ((ch.nonces[lc(op.sender)] ?? 0) !== op.nonce) throw new ChainRevert('AA25', 'invalid account nonce');
    const perm = sess.permissions.find((p) => lc(p.target) === lc(op.call.target));
    if (!perm) throw new ChainRevert('AA23', `target ${op.call.target} not in session allowlist`);
    if (!perm.selectors.some((x) => lc(x) === lc(op.call.selector)))
      throw new ChainRevert('AA23', `function ${selectorName(op.call.selector)} not permitted on this target`);
    if (op.nativeValue > sess.nativeValueLimit) throw new ChainRevert('AA23', 'native value exceeds session limit');
    if (op.call.to && sess.recipientMustEqualAccount && lc(op.call.to) !== lc(sess.account))
      throw new ChainRevert('AA23', 'recipient must be the owner account');
    const cap = sess.caps[op.call.asset];
    if (op.call.amount > cap.perAction + 1e-9) throw new ChainRevert('AA23', 'amount exceeds per-action session cap');
    const fresh = state.clock - sess.periodStart >= sess.periodSeconds;
    const spent = fresh ? 0 : sess.spent[op.call.asset];
    if (spent + op.call.amount > cap.perPeriod + 1e-9) throw new ChainRevert('AA23', 'amount exceeds per-period session cap');
  }

  /** Bundler + EntryPoint: validate, pay gas, execute. */
  async submitUserOp(op: UserOp): Promise<{ txHash: Hex; userOpHash: Hex; gasUsd: number; bridgeId?: string }> {
    const ch = this.chain(op.chainId);
    this.rpc(op.chainId);
    if (!ch.sequencerUp) throw new ChainRevert('SEQ', 'sequencer is down');
    if (this.s.faults.submitTransientFailures > 0) {
      this.s.faults.submitTransientFailures--;
      throw new ChainRevert('TRANSIENT', 'replacement transaction underpriced');
    }
    await this.validateUserOp(op);
    const gas = this.gasFor(op.chainId, op.call);
    const a = lc(op.sender);
    if (ch.paymasterEnabled && ch.paymasterBudgetUsd >= gas) ch.paymasterBudgetUsd -= gas;
    else if ((ch.gasReserveUsd[a] ?? 0) >= gas) ch.gasReserveUsd[a] -= gas;
    else throw new ChainRevert('AA21', 'account did not pay prefund (gas reserve empty)');
    const sess = ch.sessions[lc(op.sessionKey)];
    const r = applyCall(this.s, op.chainId, op.sender, op.call);
    if (this.s.clock - sess.periodStart >= sess.periodSeconds) {
      sess.periodStart = this.s.clock;
      sess.spent = { USDC: 0, WETH: 0 };
    }
    sess.spent[op.call.asset] += op.call.amount;
    ch.nonces[a] = (ch.nonces[a] ?? 0) + 1;
    const userOpHash = toHash(op);
    const txHash = keccak256(stringToHex(`${userOpHash}:${this.s.block}:${++this.s.seq}`));
    return { txHash, userOpHash, gasUsd: gas, bridgeId: r.bridgeId };
  }

  // ---- time ----
  tickBlock(dt = BLOCK_SECONDS): Liquidation[] {
    this.advance(dt);
    this.s.block++;
    return this.liquidate();
  }
  private advance(dt: number) {
    this.s.clock += dt;
    for (const id of CHAIN_IDS) {
      const ch = this.chain(id);
      if (!ch.oracleFrozen) ch.oracleUpdatedAt = this.s.clock;
      for (const p of Object.values(ch.positions)) {
        p.suppliedUsdc *= 1 + (ch.usdcSupplyApy / 100) * (dt / YEAR);
        p.debtUsdc *= 1 + (ch.usdcBorrowApr / 100) * (dt / YEAR);
      }
    }
    for (const b of Object.values(this.s.bridges)) {
      if (b.status === 'pending' && this.s.clock >= b.eta) {
        b.status = 'arrived';
        this.ensure(b.dstChain, b.receiver).bal.USDC += b.received;
      }
    }
  }
  /** Coarse jump (used by "advance time"); interest accrues once, blocks are not simulated. */
  fastForward(seconds: number) {
    this.advance(seconds);
    this.s.block += Math.floor(seconds / BLOCK_SECONDS);
    return this.liquidate();
  }
  /** Public liquidators: any account below HF 1 gets half its debt repaid at a bonus. */
  liquidate(): Liquidation[] {
    const out: Liquidation[] = [];
    for (const id of CHAIN_IDS) {
      const ch = this.chain(id);
      for (const [addr, p] of Object.entries(ch.positions)) {
        if (p.debtUsdc <= 0) continue;
        const hf = healthFactor(p.collateralWeth * ch.wethPrice, ch.liquidationThreshold, p.debtUsdc);
        if (hf >= 1) continue;
        const repay = p.debtUsdc * 0.5;
        const seize = Math.min(p.collateralWeth, (repay * (1 + ch.liquidationBonus)) / ch.wethPrice);
        p.debtUsdc -= repay;
        p.collateralWeth -= seize;
        out.push({ chainId: id, account: addr, repaidUsd: repay, seizedWeth: seize });
      }
    }
    return out;
  }
  nextId(prefix: string) {
    return `${prefix}_${++this.s.seq}`;
  }
}
