import { getAddress, keccak256, stringToHex } from 'viem';
import { advanceMoves, cancelMove, confirmMove, isInFlight, startMove, type Move } from './executor';
import { describeIntent, parseOffline, parseWithLlm, ruleLabel, formatRule, type Intent, type IntentResult } from './intent';
import { fmtHf, fmtUsd, round } from './math';
import { defaultPolicy, evaluate, policySummary, validatePolicy, type EvalContext } from './policy';
import { sentinelTick } from './sentinel';
import { isSaneState } from './validate';
import { DemoKms, type KvStore } from './kms';
import {
  rank,
  fetchYields,
  FALLBACK_POOLS,
  eligiblePools,
  chainFromLlama,
  decisionApy,
  type Holding,
  type Recommendation,
  type YieldSnapshot,
} from './yield';
import {
  ChainRevert,
  RpcError,
  World,
  toHash,
  defaultWorldState,
  BLOCK_SECONDS,
  type AccountData,
  type CallSpec,
  type OnchainSession,
  type UserOp,
  type WorldState,
} from './world';
import {
  CHAIN_IDS,
  chainName,
  type ActionKind,
  type ActionProposal,
  type ChainId,
  type Decision,
  type HistoryEntry,
  type Hex,
  type Policy,
  type Source,
} from './types';

export const BENCH: Hex = '0x00000000000000000000000000000000000BE9c4'; // unprotected benchmark loan
export type NotifLevel = 'info' | 'warn' | 'alert' | 'success';
export interface Notification {
  id: string;
  time: number;
  level: NotifLevel;
  text: string;
}
export interface PositionSnapshot {
  time: number;
  chainId: ChainId;
  healthFactor: number;
  collateralUsd: number;
  debtUsd: number;
  price: number;
  benchHf?: number;
}
export interface ProposalRecord {
  id: string;
  proposal: ActionProposal;
  status: 'pending' | 'denied' | 'awaiting_confirmation' | 'executed' | 'failed' | 'rejected';
  decision?: Decision;
  createdAt: number;
}
export interface ActionRecord {
  id: string;
  proposalId: string;
  time: number;
  source: Source;
  kind: ActionKind;
  chainId: ChainId;
  summary: string;
  valueUsd: number;
  rescue: boolean;
  status: 'success' | 'denied' | 'failed' | 'rejected_onchain';
  ruleId: string;
  reason: string;
  txHash?: Hex;
  userOpHash?: Hex;
  bridgeId?: string;
  error?: string;
  gasUsd?: number;
  retries?: number;
  hfBefore?: number;
  hfAfter?: number;
}
export interface IntentRecord {
  id: string;
  rawText: string;
  time: number;
  via?: 'offline' | 'llm';
  flags: string[];
  status: 'awaiting_confirmation' | 'active' | 'rejected' | 'answered' | 'unsupported' | 'clarify';
  intents: Intent[];
  summaries: string[];
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  time: number;
  intentRecordId?: string;
}
export interface YieldRule {
  amount: number | 'all_idle';
  sourceChain: ChainId | null;
  destinationChain: ChainId | null;
  maxGasUsd?: number;
  createdAt: number;
}
export interface SessionInfo {
  key: Hex;
  createdAt: number;
  expiresAt: number;
  permissionsHash: Hex;
  status: 'active' | 'revoked';
}
export interface CrashScenario {
  from: number;
  to: number;
  steps: number;
  step: number;
  label: string;
}
export interface EngineState {
  v: 1;
  world: WorldState;
  owner: { address: Hex; mode: 'demo' | 'injected' } | null;
  accountAddress: Hex | null;
  policy: Policy | null;
  policyVersions: Policy[];
  session: SessionInfo | null;
  intents: IntentRecord[];
  chat: ChatMessage[];
  proposals: ProposalRecord[];
  actions: ActionRecord[];
  snapshots: PositionSnapshot[];
  notifications: Notification[];
  moves: Move[];
  rules: { protect: { enabled: boolean; chain: ChainId | null }; yieldRule: YieldRule | null };
  sentinel: {
    lastBeat: number;
    lastRescueAt: Partial<Record<ChainId, number>>;
    warned: Partial<Record<ChainId, boolean>>;
    workerDown: boolean;
    watchdogAlerted: boolean;
  };
  safeMode: boolean;
  yields: YieldSnapshot | null;
  scenario: CrashScenario | null;
  settings: { useLlm: boolean; llmModel: string; syncRates: boolean };
  demoSnapshot: string | null;
  lastYieldCheckBlock: number;
  liquidations: { time: number; chainId: ChainId; account: string; repaidUsd: number; benchmark: boolean }[];
}

export interface ProcessResult {
  decision: Decision;
  proposal: ProposalRecord;
  action?: ActionRecord;
}
export interface OwnerSigner {
  address: Hex;
  signMessage(message: string): Promise<Hex>;
}
export interface EngineOptions {
  storage?: KvStore;
  sessionStorage?: KvStore;
  fetchImpl?: typeof fetch;
  persistKey?: string;
  /** Minimum gap between chat messages (UI sets this; tests leave it off). */
  intentMinIntervalMs?: number;
}

const STORAGE_KEY = 'aegis-agent:state:v1';
const WATCHDOG_SECONDS = 5 * BLOCK_SECONDS;

export function initialState(): EngineState {
  return {
    v: 1,
    world: defaultWorldState(),
    owner: null,
    accountAddress: null,
    policy: null,
    policyVersions: [],
    session: null,
    intents: [],
    chat: [],
    proposals: [],
    actions: [],
    snapshots: [],
    notifications: [],
    moves: [],
    rules: { protect: { enabled: true, chain: null }, yieldRule: null },
    sentinel: { lastBeat: 0, lastRescueAt: {}, warned: {}, workerDown: false, watchdogAlerted: false },
    safeMode: false,
    yields: null,
    scenario: null,
    settings: { useLlm: false, llmModel: 'claude-sonnet-5-5', syncRates: true },
    demoSnapshot: null,
    lastYieldCheckBlock: 0,
    liquidations: [],
  };
}

export const accountAddressFor = (owner: Hex): Hex =>
  getAddress(`0x${keccak256(stringToHex(`aegis-account:${owner.toLowerCase()}:salt1`)).slice(26)}`);

export function grantMessage(chainId: ChainId, s: OnchainSession): string {
  return [
    'AegisAgent: enable session key',
    `Chain: ${chainId}`,
    `Account: ${s.account}`,
    `Session key: ${s.key}`,
    `Valid until: ${s.validUntil}`,
    `Per-action cap (USDC): ${s.caps.USDC.perAction}`,
    `Per-period cap (USDC): ${s.caps.USDC.perPeriod}`,
    `Permissions: ${keccak256(stringToHex(JSON.stringify(s.permissions)))}`,
  ].join('\n');
}
export const revokeMessage = (chainId: ChainId, key: Hex) => `AegisAgent: revoke session key ${key} on chain ${chainId}`;

export class Engine {
  state: EngineState;
  world: World;
  kms: DemoKms;
  version = 0;
  private listeners = new Set<() => void>();
  private signer: OwnerSigner | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private ticking = false;
  private lock: Promise<unknown> = Promise.resolve();
  private lastIntentAt = 0;
  fetchImpl: typeof fetch;
  llmKey = '';

  constructor(private opts: EngineOptions = {}) {
    this.kms = new DemoKms(opts.sessionStorage);
    this.fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    this.state = this.load() ?? initialState();
    this.world = new World(this.state.world);
    try {
      this.llmKey = opts.sessionStorage?.getItem('aegis:llmkey') ?? '';
    } catch {
      /* ignore */
    }
  }

  // ---------------- store plumbing ----------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  emit() {
    this.version++;
    this.listeners.forEach((l) => l());
    if (this.opts.storage && !this.persistTimer) {
      this.persistTimer = setTimeout(() => {
        this.persistTimer = null;
        try {
          this.opts.storage?.setItem(this.opts.persistKey ?? STORAGE_KEY, JSON.stringify(this.state));
        } catch {
          /* quota or disabled storage */
        }
      }, 300);
    }
  }
  private load(): EngineState | null {
    try {
      const raw = this.opts.storage?.getItem(this.opts.persistKey ?? STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw) as EngineState;
      // persisted state is untrusted: anything that fails validation is discarded
      return isSaneState(s) ? { ...initialState(), ...s } : null;
    } catch {
      return null;
    }
  }
  resetAll() {
    if (this.state.session) this.kms.destroy(this.state.session.key);
    this.state = initialState();
    this.world = new World(this.state.world);
    this.signer = null;
    try {
      this.opts.storage?.removeItem(this.opts.persistKey ?? STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.emit();
  }

  // ---------------- accessors ----------------
  get account(): Hex {
    if (!this.state.accountAddress) throw new Error('No smart account yet');
    return this.state.accountAddress;
  }
  get policy(): Policy {
    if (!this.state.policy) throw new Error('No policy yet');
    return this.state.policy;
  }
  history(): HistoryEntry[] {
    return this.state.actions
      .filter((a) => a.status === 'success')
      .map((a) => ({ time: a.time, valueUsd: a.valueUsd, kind: a.kind, source: a.source, rescue: a.rescue }));
  }
  notify(level: NotifLevel, text: string, dedupeKey?: string) {
    const st = this.state;
    if (dedupeKey) {
      const recent = st.notifications.slice(-30).find((n) => n.text === text);
      if (recent && this.world.now() - recent.time < 600) return;
    }
    st.notifications.push({ id: this.world.nextId('n'), time: this.world.now(), level, text });
    if (st.notifications.length > 200) st.notifications.splice(0, st.notifications.length - 200);
  }
  recordSnapshot(chainId: ChainId, d: AccountData) {
    const st = this.state;
    const bp = this.world.position(42161, BENCH);
    const bench = chainId === 42161 && bp.debtUsdc > 0 ? this.world.accountData(42161, BENCH).healthFactor : undefined;
    st.snapshots.push({
      time: this.world.now(),
      chainId,
      healthFactor: Number.isFinite(d.healthFactor) ? d.healthFactor : 99,
      collateralUsd: d.collateralUsd,
      debtUsd: d.debtUsd,
      price: d.price,
      benchHf: bench,
    });
    if (st.snapshots.length > 600) st.snapshots.splice(0, st.snapshots.length - 600);
  }
  sessionActive(chainId: ChainId): boolean {
    const s = this.state.session;
    if (!s || s.status !== 'active') return false;
    const on = this.world.chain(chainId).sessions[s.key.toLowerCase()];
    return !!on && !on.revoked && this.world.now() <= on.validUntil && this.kms.has(s.key);
  }

  // ---------------- wallet and account ----------------
  async connectDemoWallet(): Promise<Hex> {
    this.resetAll();
    const address = this.kms.createKey();
    this.state.owner = { address, mode: 'demo' };
    this.signer = { address, signMessage: (m) => this.kms.signText(address, m) };
    this.notify('info', 'Demo wallet created in this browser (fork only, no real funds).');
    this.emit();
    return address;
  }
  async connectInjected(): Promise<Hex> {
    const eth = (globalThis as { ethereum?: { request(a: { method: string; params?: unknown[] }): Promise<unknown> } }).ethereum;
    if (!eth) throw new Error('No browser wallet found. Use the demo wallet instead.');
    const accts = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
    if (!accts?.[0]) throw new Error('Wallet returned no account.');
    const address = getAddress(accts[0]);
    this.resetAll();
    this.state.owner = { address, mode: 'injected' };
    this.signer = this.injectedSigner(address);
    this.notify('info', `Connected wallet ${address.slice(0, 8)}… (actions run on the simulated fork).`);
    this.emit();
    return address;
  }
  private injectedSigner(address: Hex): OwnerSigner {
    const eth = (globalThis as { ethereum?: { request(a: { method: string; params?: unknown[] }): Promise<unknown> } }).ethereum;
    return {
      address,
      signMessage: async (message) => {
        if (!eth) throw new Error('Wallet is not available.');
        return (await eth.request({ method: 'personal_sign', params: [stringToHex(message), address] })) as Hex;
      },
    };
  }
  async getOwnerSigner(): Promise<OwnerSigner> {
    if (this.signer) return this.signer;
    const o = this.state.owner;
    if (!o) throw new Error('Connect a wallet first.');
    if (o.mode === 'demo') {
      if (!this.kms.has(o.address)) throw new Error('Demo wallet key is gone (browser session ended). Reset and create a new demo wallet.');
      this.signer = { address: o.address, signMessage: (m) => this.kms.signText(o.address, m) };
    } else {
      this.signer = this.injectedSigner(o.address);
    }
    return this.signer;
  }

  /** Deploy (counterfactual) smart accounts on every chain and set the default policy. */
  deployAccounts() {
    const st = this.state;
    if (!st.owner) throw new Error('Connect a wallet first.');
    const account = accountAddressFor(st.owner.address);
    for (const id of CHAIN_IDS) this.world.deployAccount(id, account, st.owner.address);
    st.accountAddress = account;
    if (!st.policy) {
      st.policy = defaultPolicy(st.owner.address, this.world.now());
      st.policyVersions = [structuredClone(st.policy)];
    }
    this.notify('success', `Smart account ready at ${account.slice(0, 10)}… on ${CHAIN_IDS.map(chainName).join(', ')}.`);
    this.emit();
  }

  private buildSession(chainId: ChainId, key: Hex, validUntil: number): OnchainSession {
    const p = this.policy;
    return {
      key,
      account: this.account,
      permissions: p.allowedContracts.filter((c) => c.chainId === chainId).map((c) => ({ target: c.address, selectors: c.selectors })),
      nativeValueLimit: 0,
      caps: { USDC: { perAction: p.caps.perAction, perPeriod: p.caps.perDay }, WETH: { perAction: 2, perPeriod: 5 } },
      periodSeconds: 86400,
      periodStart: this.world.now(),
      spent: { USDC: 0, WETH: 0 },
      validAfter: this.world.now() - 1,
      validUntil,
      recipientMustEqualAccount: true,
      revoked: false,
    };
  }

  /** Owner signs a scoped grant per chain; the private key of the session key stays in the KMS. */
  async grantSession(hours = 72) {
    const st = this.state;
    const signer = await this.getOwnerSigner();
    if (!st.accountAddress || !st.policy) throw new Error('Create the smart account first.');
    if (st.session?.status === 'active') await this.revokeSession(true).catch(() => undefined);
    const key = this.kms.createKey();
    const validUntil = this.world.now() + hours * 3600;
    let permissionsHash: Hex = '0x';
    for (const id of st.policy.allowedChains) {
      const sess = this.buildSession(id, key, validUntil);
      permissionsHash = keccak256(stringToHex(JSON.stringify({ p: sess.permissions, c: sess.caps })));
      const msg = grantMessage(id, sess);
      const sig = await signer.signMessage(msg);
      await this.world.enableSession(id, sess, sig, msg);
    }
    st.session = { key, createdAt: this.world.now(), expiresAt: validUntil, permissionsHash, status: 'active' };
    st.policy = { ...st.policy, expiresAt: validUntil, paused: false, version: st.policy.version + 1 };
    st.policyVersions.push(structuredClone(st.policy));
    this.notify(
      'success',
      `Session key ${key.slice(0, 10)}… enabled until ${new Date(validUntil * 1000).toISOString().slice(0, 16)}Z with scoped permissions.`,
    );
    this.emit();
  }

  async revokeSession(quiet = false) {
    const st = this.state;
    const s = st.session;
    if (!s || s.status !== 'active') return;
    const signer = await this.getOwnerSigner();
    for (const id of CHAIN_IDS) {
      if (!this.world.chain(id).sessions[s.key.toLowerCase()]) continue;
      const msg = revokeMessage(id, s.key);
      await this.world.revokeSession(id, s.key, await signer.signMessage(msg), msg);
    }
    this.kms.destroy(s.key);
    s.status = 'revoked';
    if (!quiet) this.notify('success', 'Session key revoked on every chain. The agent can no longer sign anything.');
    this.emit();
  }

  /** Emergency stop: pause instantly (off-chain), then revoke on-chain with the owner's signature. */
  async emergencyStop() {
    if (this.state.policy) this.state.policy = { ...this.state.policy, paused: true };
    this.notify('alert', 'Emergency stop: the agent is paused.');
    this.emit();
    try {
      await this.revokeSession();
    } catch (e) {
      this.notify(
        'warn',
        `Paused, but the on-chain revoke was not signed (${e instanceof Error ? e.message : 'cancelled'}). The key still exists until you revoke it.`,
      );
      this.emit();
    }
  }
  pause() {
    this.setPolicy({ ...this.policy, paused: true });
    this.notify('warn', 'Agent paused.');
    this.emit();
  }
  resume() {
    if (this.state.safeMode) {
      this.notify('warn', 'Clear safe mode first.');
      return this.emit();
    }
    this.setPolicy({ ...this.policy, paused: false });
    this.notify('info', 'Agent resumed.');
    this.emit();
  }
  clearSafeMode() {
    this.state.safeMode = false;
    this.notify('info', 'Safe mode cleared.');
    this.emit();
  }

  /** PUT /policies. Every change creates a new version. */
  setPolicy(next: Policy): string[] {
    const errs = validatePolicy(next);
    if (errs.length) return errs;
    const old = this.state.policy;
    this.state.policy = { ...next, version: (old?.version ?? 0) + 1 };
    this.state.policyVersions.push(structuredClone(this.state.policy));
    if (this.state.policyVersions.length > 50) this.state.policyVersions.shift();
    this.emit();
    return [];
  }

  // ---------------- proposals and the pipeline (Flow A, step 4) ----------------
  newProposal(p: Omit<ActionProposal, 'id' | 'createdAt' | 'nativeValue'> & { nativeValue?: number }): ActionProposal {
    return { nativeValue: 0, ...p, id: this.world.nextId('prop'), createdAt: this.world.now() };
  }
  private evalCtx(p: ActionProposal, confirmed: boolean): EvalContext {
    const w = this.world;
    return {
      policy: this.policy,
      accountAddress: this.account,
      now: w.now(),
      history: this.history(),
      simulate: () => w.simulate(p.chainId, this.account, toCall(p)),
      confirmed,
      safeMode: this.state.safeMode,
      sessionValid: this.sessionActive(p.chainId),
      lastRescueAt: this.state.sentinel.lastRescueAt[p.chainId] ?? null,
    };
  }

  /** Policy check, simulate, sign with the session key, submit, log. Never throws. */
  /**
   * Policy check, simulate, sign, submit, log. Never throws.
   * Calls are serialized: the cap and cooldown checks read the history that the previous call writes,
   * so two concurrent proposals must not both be evaluated against the same running total.
   */
  process(input: ActionProposal, opts: { confirmed?: boolean } = {}): Promise<ProcessResult> {
    // snapshot synchronously, at call time, so the caller cannot change it while it waits in the queue
    const proposal = freezeClone(input);
    const run = this.lock.then(() => this.processLocked(proposal, opts));
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async processLocked(proposal: ActionProposal, opts: { confirmed?: boolean }): Promise<ProcessResult> {
    const st = this.state;
    const w = this.world;
    let rec = st.proposals.find((r) => r.id === proposal.id);
    if (!rec) {
      rec = { id: proposal.id, proposal, status: 'pending', createdAt: w.now() };
      st.proposals.push(rec);
      if (st.proposals.length > 300) st.proposals.splice(0, st.proposals.length - 300);
    }
    const decision = evaluate(proposal, this.evalCtx(proposal, !!opts.confirmed));
    rec.decision = decision;
    const base = {
      id: w.nextId('act'),
      proposalId: proposal.id,
      time: w.now(),
      source: proposal.source,
      kind: proposal.kind,
      chainId: proposal.chainId,
      summary: proposal.reason,
      valueUsd: decision.sim?.valueUsd ?? (proposal.params.asset === 'USDC' ? proposal.params.amount : 0),
      rescue: !!proposal.meta.rescue,
      ruleId: decision.ruleId,
      reason: decision.reason,
    };
    if (decision.result === 'confirm') {
      rec.status = 'awaiting_confirmation';
      this.notify('info', `Needs your confirmation: ${proposal.reason}`);
      this.emit();
      return { decision, proposal: rec };
    }
    if (decision.result === 'deny') {
      rec.status = 'denied';
      const action: ActionRecord = { ...base, status: 'denied' };
      this.pushAction(action);
      if (proposal.source === 'intent' || proposal.source === 'scanner')
        this.notify('warn', `Blocked by policy (${decision.ruleId}): ${decision.reason}`);
      this.emit();
      return { decision, proposal: rec, action };
    }
    const action = await this.submit(proposal, base, decision);
    rec.status = action.status === 'success' ? 'executed' : 'failed';
    this.pushAction(action);
    this.emit();
    return { decision, proposal: rec, action };
  }

  private pushAction(a: ActionRecord) {
    this.state.actions.push(a);
    if (this.state.actions.length > 500) this.state.actions.splice(0, this.state.actions.length - 500);
  }

  private async submit(p: ActionProposal, base: Omit<ActionRecord, 'status'>, decision: Decision): Promise<ActionRecord> {
    const w = this.world;
    const sess = this.state.session;
    const ok = (r: Awaited<ReturnType<World['submitUserOp']>>, retries: number): ActionRecord => ({
      ...base,
      status: 'success',
      txHash: r.txHash,
      userOpHash: r.userOpHash,
      bridgeId: r.bridgeId,
      gasUsd: r.gasUsd,
      retries,
      hfBefore: decision.sim?.hfBefore,
      hfAfter: decision.sim?.hfAfter,
    });
    if (!sess || sess.status !== 'active') return { ...base, status: 'failed', error: 'No active session key.' };
    let retries = 0;
    for (;;) {
      const op = await this.signedOp(p, sess.key).catch((e: unknown) => e as Error);
      if (op instanceof Error) return { ...base, status: 'failed', error: op.message };
      try {
        const r = await w.submitUserOp(op);
        this.lowGasCheck(p.chainId);
        return ok(r, retries);
      } catch (err) {
        if (err instanceof ChainRevert && err.code === 'TRANSIENT' && retries < 3) {
          retries++; // bump fees, back off, re-read the nonce
          continue;
        }
        const msg = err instanceof Error ? err.message : String(err);
        const onchain = err instanceof ChainRevert && /^AA2[2-5]/.test(err.code) && err.code !== 'AA21';
        if (err instanceof RpcError || msg.includes('sequencer')) this.notify('alert', `${chainName(p.chainId)}: ${msg}`);
        return { ...base, status: onchain ? 'rejected_onchain' : 'failed', error: msg, retries };
      }
    }
  }

  private async signedOp(p: ActionProposal, key: Hex): Promise<UserOp> {
    const op: UserOp = {
      sender: this.account,
      chainId: p.chainId,
      nonce: this.world.chain(p.chainId).nonces[this.account.toLowerCase()] ?? 0,
      call: toCall(p),
      nativeValue: p.nativeValue,
      sessionKey: key,
    };
    op.signature = await this.kms.signHash(key, toHash(op));
    return op;
  }

  private lowGasCheck(chainId: ChainId) {
    const left = this.world.chain(chainId).gasReserveUsd[this.account.toLowerCase()] ?? 0;
    const ch = this.world.chain(chainId);
    if (!ch.paymasterEnabled && left < ch.gasUsd * 5)
      this.notify(
        'warn',
        `${chainName(chainId)}: gas reserve is low (${fmtUsd(left)}). The Sentinel needs gas to rescue. Top it up.`,
        `gas-${chainId}`,
      );
  }

  /** What a compromised backend could try: sign with the session key and bypass the policy engine. */
  async attemptBypass(chainId: ChainId, call: CallSpec): Promise<{ ok: boolean; message: string }> {
    const sess = this.state.session;
    if (!sess) return { ok: false, message: 'no session' };
    const op: UserOp = {
      sender: this.account,
      chainId,
      nonce: this.world.chain(chainId).nonces[this.account.toLowerCase()] ?? 0,
      call,
      nativeValue: 0,
      sessionKey: sess.key,
    };
    try {
      op.signature = await this.kms.signHash(sess.key, toHash(op));
      await this.world.submitUserOp(op);
      this.emit();
      return { ok: true, message: 'The chain accepted it.' };
    } catch (e) {
      this.emit();
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  }

  async confirmProposal(id: string) {
    const rec = this.state.proposals.find((p) => p.id === id);
    if (!rec || rec.status !== 'awaiting_confirmation') return;
    if (rec.proposal.meta.moveId) {
      await confirmMove(this, rec.proposal.meta.moveId);
      rec.status = 'executed';
    } else await this.process(rec.proposal, { confirmed: true });
    this.emit();
  }
  rejectProposal(id: string) {
    const rec = this.state.proposals.find((p) => p.id === id);
    if (!rec || rec.status !== 'awaiting_confirmation') return;
    rec.status = 'rejected';
    if (rec.proposal.meta.moveId) cancelMove(this, rec.proposal.meta.moveId);
    this.emit();
  }

  // ---------------- intents (Flow A, steps 1-3) ----------------
  setLlmKey(key: string) {
    this.llmKey = key.trim();
    try {
      if (this.llmKey) this.opts.sessionStorage?.setItem('aegis:llmkey', this.llmKey);
      else this.opts.sessionStorage?.removeItem('aegis:llmkey');
    } catch {
      /* ignore */
    }
    this.emit();
  }
  private say(role: 'user' | 'agent', text: string, intentRecordId?: string) {
    this.state.chat.push({ id: this.world.nextId('msg'), role, text, time: this.world.now(), intentRecordId });
    if (this.state.chat.length > 200) this.state.chat.shift();
  }

  async parse(text: string): Promise<IntentResult> {
    const st = this.state;
    if (st.settings.useLlm && this.llmKey && text.length <= 600) {
      try {
        return await parseWithLlm(text, st.policy ? policySummary(st.policy) : '', {
          apiKey: this.llmKey,
          model: st.settings.llmModel,
          fetchImpl: this.fetchImpl,
        });
      } catch (e) {
        this.notify('warn', `Language model unavailable (${e instanceof Error ? e.message : 'error'}). Used the offline parser instead.`);
      }
    }
    return parseOffline(text);
  }

  /** POST /intents. The intent engine only parses; nothing executes except stop/query. */
  async postIntent(text: string): Promise<IntentRecord> {
    const st = this.state;
    const w = this.world;
    const gap = this.opts.intentMinIntervalMs ?? 0;
    const nowMs = Date.now();
    if (gap > 0 && nowMs - this.lastIntentAt < gap) throw new Error('Please wait a moment before sending another message.');
    this.lastIntentAt = nowMs;
    this.say('user', text);
    const res = await this.parse(text);
    const rec: IntentRecord = {
      id: w.nextId('int'),
      rawText: text,
      time: w.now(),
      via: res.kind === 'ok' ? res.via : undefined,
      flags: res.flags,
      status: 'answered',
      intents: [],
      summaries: [],
    };
    st.intents.push(rec);
    if (st.intents.length > 200) st.intents.shift();
    if (res.kind === 'clarify') {
      rec.status = 'clarify';
      this.say('agent', res.question, rec.id);
    } else if (res.kind === 'unsupported') {
      rec.status = 'unsupported';
      this.say('agent', res.reason, rec.id);
      if (res.flags.length) this.notify('warn', `Blocked a suspicious request (${res.flags.join(', ')}). Nothing was proposed.`);
    } else {
      const answers: string[] = [];
      const pending: Intent[] = [];
      for (const i of res.intents) {
        if (i.type === 'query') answers.push(this.answer(i.subject));
        else if (i.type === 'stop') {
          if (i.scope === 'revoke') {
            await this.emergencyStop();
            answers.push('Done. I paused the agent and revoked the session key.');
          } else {
            if (st.policy) this.pause();
            answers.push('Done. The agent is paused.');
          }
        } else pending.push(i);
      }
      rec.intents = pending;
      rec.summaries = pending.map(describeIntent);
      if (answers.length) this.say('agent', answers.join('\n\n'), rec.id);
      if (pending.length) {
        rec.status = 'awaiting_confirmation';
        this.say(
          'agent',
          `Here is what I understood:\n${rec.summaries.map((s, n) => `${n + 1}. ${s}`).join('\n')}\n\nThis becomes a standing rule only after you confirm. The agent can propose, but your policy and the on-chain limits decide.`,
          rec.id,
        );
      }
    }
    this.emit();
    return rec;
  }

  answer(subject: Extract<Intent, { type: 'query' }>['subject']): string {
    const st = this.state;
    const w = this.world;
    if (!st.accountAddress || !st.policy) return 'Set up your smart account first (Account tab).';
    const acct = st.accountAddress;
    switch (subject) {
      case 'health_factor': {
        const lines = CHAIN_IDS.map((id) => {
          try {
            const d = w.readAccountData(id, acct);
            if (d.debtUsd <= 0.01) return null;
            return `${chainName(id)}: health factor ${fmtHf(d.healthFactor)} (collateral ${fmtUsd(d.collateralUsd)}, debt ${fmtUsd(d.debtUsd)}). Trigger ${st.policy!.healthFactor.trigger}, target ${st.policy!.healthFactor.target}.`;
          } catch {
            return `${chainName(id)}: unable to read right now.`;
          }
        }).filter(Boolean);
        return lines.length ? lines.join('\n') : 'You have no open loans on the supported chains.';
      }
      case 'balances':
        return CHAIN_IDS.map((id) => {
          const b = w.balance(id, acct);
          const p = w.position(id, acct);
          return `${chainName(id)}: idle ${fmtUsd(b.USDC)} USDC, earning ${fmtUsd(p.suppliedUsdc)}, collateral ${p.collateralWeth.toFixed(3)} WETH, debt ${fmtUsd(p.debtUsdc)}.`;
        }).join('\n');
      case 'yield': {
        const pools = eligiblePools(st.yields?.pools ?? FALLBACK_POOLS, st.policy);
        return (
          pools.map((p) => `${p.chain}: ${decisionApy(p).toFixed(2)}% USDC on Aave V3`).join('\n') +
          `\n(${st.yields?.source === 'live' ? 'live DeFiLlama data' : 'offline snapshot'})`
        );
      }
      case 'policy':
        return `Your current limits (version ${st.policy.version}):\n${policySummary(st.policy)}\nThe agent cannot send funds anywhere except your own account, and cannot call contracts outside the allowlist.`;
      case 'status':
        return `Agent ${st.policy.paused ? 'PAUSED' : 'active'}. Session key ${st.session?.status ?? 'none'}. Sentinel last checked ${Math.max(0, Math.round(w.now() - st.sentinel.lastBeat))}s ago. Safe mode ${st.safeMode ? 'ON' : 'off'}.`;
    }
  }

  /** POST /intents/:id/confirm — activate the standing rules. */
  async confirmIntent(id: string) {
    const st = this.state;
    const rec = st.intents.find((r) => r.id === id);
    if (!rec || rec.status !== 'awaiting_confirmation' || !st.policy) return;
    const msgs: string[] = [];
    let capsChanged = false;
    for (const i of rec.intents) {
      if (i.type === 'set_rule') {
        const p = structuredClone(st.policy!);
        switch (i.ruleType) {
          case 'perDayCap':
            p.caps.perDay = i.value;
            if (p.caps.perAction > i.value) p.caps.perAction = i.value;
            capsChanged = true;
            break;
          case 'perActionCap':
            p.caps.perAction = i.value;
            if (p.caps.perDay < i.value) p.caps.perDay = i.value;
            capsChanged = true;
            break;
          case 'maxSlippageBps':
            p.maxSlippageBps = i.value;
            break;
          case 'gasCeilingUsd':
            p.gasCeilingUsd = i.value;
            break;
          case 'minNetGainUsd':
            p.minNetGainUsd = i.value;
            break;
          case 'healthFactorFloor':
            p.healthFactor.floor = i.value;
            break;
          case 'cooldownSeconds':
            p.cooldownSeconds = i.value;
            break;
        }
        const errs = this.setPolicy(p);
        msgs.push(
          errs.length
            ? `Could not apply ${ruleLabel(i.ruleType)}: ${errs.join(' ')}`
            : `${ruleLabel(i.ruleType)} is now ${formatRule(i.ruleType, i.value)}.`,
        );
      } else if (i.type === 'protect_position') {
        const p = structuredClone(st.policy!);
        if (i.healthFactorTrigger) {
          const t = round(i.healthFactorTrigger, 2);
          p.healthFactor = {
            trigger: t,
            warn: round(t + 0.1, 2),
            target: round(i.healthFactorTarget ?? t + 0.25, 2),
            floor: round(t + 0.1, 2),
          };
        } else if (i.healthFactorTarget) p.healthFactor.target = i.healthFactorTarget;
        const errs = this.setPolicy(p);
        if (errs.length) msgs.push(`Could not apply protection: ${errs.join(' ')}`);
        else {
          st.rules.protect = { enabled: true, chain: i.chain ?? null };
          msgs.push(
            `Risk Sentinel is watching ${i.chain ? chainName(i.chain) : 'all chains'}: rescue below ${st.policy!.healthFactor.trigger}, restore to ${st.policy!.healthFactor.target}.`,
          );
        }
      } else if (i.type === 'optimize_yield') {
        const p = structuredClone(st.policy!);
        if (i.maxSlippageBps !== undefined && i.maxSlippageBps < p.maxSlippageBps) p.maxSlippageBps = i.maxSlippageBps; // intents may only tighten
        if (i.maxGasUsd !== undefined && i.maxGasUsd < p.gasCeilingUsd) p.gasCeilingUsd = i.maxGasUsd;
        if (i.minNetGainBps !== undefined && typeof i.amount === 'number')
          p.minNetGainUsd = Math.max(p.minNetGainUsd, (i.minNetGainBps / 10_000) * i.amount);
        this.setPolicy(p);
        st.rules.yieldRule = {
          amount: i.amount,
          sourceChain: i.sourceChain ?? null,
          destinationChain: i.destinationChain ?? null,
          maxGasUsd: i.maxGasUsd,
          createdAt: this.world.now(),
        };
        msgs.push('Yield rule is active. I will move funds only when the net gain beats costs and every policy check passes.');
      }
    }
    rec.status = 'active';
    if (capsChanged && st.session?.status === 'active') {
      try {
        await this.grantSession(Math.max(1, Math.round((st.session.expiresAt - this.world.now()) / 3600)));
        msgs.push('Session key re-issued so the on-chain caps match your new limits.');
      } catch (e) {
        msgs.push(
          `New caps need a fresh session key: ${e instanceof Error ? e.message : 'not signed'}. Until then the chain enforces the old caps.`,
        );
      }
    }
    this.say('agent', `Confirmed.\n${msgs.join('\n')}`, rec.id);
    if (st.rules.yieldRule) await this.evaluateYieldRule();
    this.emit();
  }
  rejectIntent(id: string) {
    const rec = this.state.intents.find((r) => r.id === id);
    if (!rec || rec.status !== 'awaiting_confirmation') return;
    rec.status = 'rejected';
    this.say('agent', 'Okay, nothing was changed.', rec.id);
    this.emit();
  }

  updateSettings(patch: Partial<EngineState['settings']>) {
    Object.assign(this.state.settings, patch);
    this.emit();
  }

  // ---------------- yield ----------------
  async scanYields() {
    const st = this.state;
    st.yields = await fetchYields(this.world.now(), this.fetchImpl);
    if (st.settings.syncRates) {
      for (const p of eligiblePools(st.yields.pools, st.policy ?? defaultPolicy('0x0000000000000000000000000000000000000001', 0))) {
        const id = chainFromLlama(p.chain);
        if (id) this.world.chain(id).usdcSupplyApy = decisionApy(p);
      }
    }
    this.emit();
  }
  holdings(): Holding[] {
    const p = this.policy;
    return p.allowedChains.map((id) => {
      const b = this.world.balance(id, this.account);
      const pos = this.world.position(id, this.account);
      const reserve = pos.debtUsdc > 0 ? p.rescueReserveUsd : 0;
      return { chainId: id, idleUsdc: Math.max(0, b.USDC - reserve), suppliedUsdc: pos.suppliedUsdc };
    });
  }
  recommendations(
    filter: { maxAmount?: number | 'all_idle'; sourceChain?: ChainId | null; destChain?: ChainId | null } = {},
  ): Recommendation[] {
    if (!this.state.policy || !this.state.accountAddress) return [];
    const gasUsd = Object.fromEntries(CHAIN_IDS.map((id) => [id, this.world.chain(id).gasUsd])) as Record<ChainId, number>;
    return rank({
      pools: this.state.yields?.pools ?? FALLBACK_POOLS,
      policy: this.policy,
      holdings: this.holdings(),
      gasUsd,
      bridgeFeeBps: 5,
      fixedBridgeUsd: 0.3,
      slippageBps: 8,
      liveApy: (c) => {
        try {
          return this.world.readApy(c);
        } catch {
          return 0; // cannot verify the live rate, so assume nothing
        }
      },
      ...filter,
    });
  }
  /** Standing yield rule: pick the best executable recommendation and start a move. */
  async evaluateYieldRule() {
    const st = this.state;
    const rule = st.rules.yieldRule;
    if (!rule || !st.policy || !st.accountAddress || st.policy.paused || st.safeMode) return;
    if (st.moves.some(isInFlight)) return;
    const recs = this.recommendations({ maxAmount: rule.amount, sourceChain: rule.sourceChain, destChain: rule.destinationChain }).filter(
      (r) => r.executable,
    );
    const best = recs[0];
    if (!best) return;
    const r = startMove(this, best, { maxGasUsd: rule.maxGasUsd });
    if (r.ok)
      this.notify(
        'info',
        `Yield rule: ${best.sourceChain === best.destChain ? 'supplying' : 'moving'} ${fmtUsd(best.amount)} USDC to ${chainName(best.destChain)} (net ${fmtUsd(best.netGainUsd)}).`,
      );
    this.emit();
  }
  startRecommendation(rec: Recommendation) {
    const r = startMove(this, rec, { retryFailed: true });
    this.notify(
      r.ok ? 'info' : 'warn',
      r.ok
        ? `Started: ${rec.sourceChain === rec.destChain ? 'supply' : 'move'} ${fmtUsd(rec.amount)} USDC → ${chainName(rec.destChain)}.`
        : `Could not start: ${r.reason}`,
    );
    this.emit();
    return r;
  }
  cancelMoveById(id: string) {
    cancelMove(this, id);
    this.emit();
  }

  // ---------------- time ----------------
  /** One block: market moves, liquidations, Sentinel (Flow B), executor, yield rule, watchdog. */
  async tick() {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const st = this.state;
      const w = this.world;
      this.stepScenario();
      const liqs = w.tickBlock();
      for (const l of liqs) {
        const bench = l.account === BENCH.toLowerCase();
        st.liquidations.push({ time: w.now(), chainId: l.chainId, account: l.account, repaidUsd: l.repaidUsd, benchmark: bench });
        this.notify(
          bench ? 'info' : 'alert',
          `${bench ? 'Unprotected benchmark loan' : 'YOUR position'} was liquidated on ${chainName(l.chainId)}: ${fmtUsd(l.repaidUsd)} of debt repaid by liquidators with a 5% bonus.`,
        );
      }
      if (st.policy && st.accountAddress) {
        if (!st.sentinel.workerDown) await sentinelTick(this);
        await advanceMoves(this);
        if (st.rules.yieldRule && w.s.block - st.lastYieldCheckBlock >= 5) {
          st.lastYieldCheckBlock = w.s.block;
          await this.evaluateYieldRule();
        }
        this.watchdog();
      }
    } catch (e) {
      this.notify('alert', `Tick failed: ${e instanceof Error ? e.message : String(e)}. No action taken.`);
    } finally {
      this.ticking = false;
      this.emit();
    }
  }
  private watchdog() {
    const st = this.state;
    const gap = this.world.now() - st.sentinel.lastBeat;
    if (gap > WATCHDOG_SECONDS) {
      if (!st.sentinel.watchdogAlerted) {
        st.sentinel.watchdogAlerted = true;
        this.notify('alert', `Sentinel heartbeat missing for ${Math.round(gap)}s. Your position is NOT being watched. Restart the worker.`);
      }
    } else st.sentinel.watchdogAlerted = false;
  }
  private stepScenario() {
    const sc = this.state.scenario;
    if (!sc) return;
    sc.step++;
    const price = sc.from + ((sc.to - sc.from) * Math.min(sc.step, sc.steps)) / sc.steps;
    for (const id of CHAIN_IDS) this.world.setPrice(id, price);
    if (sc.step >= sc.steps) {
      this.notify('info', `Scenario finished: ${sc.label}.`);
      this.state.scenario = null;
    }
  }
  async fastForward(seconds: number) {
    const w = this.world;
    const liqs = w.fastForward(seconds);
    for (const l of liqs)
      this.state.liquidations.push({
        time: w.now(),
        chainId: l.chainId,
        account: l.account,
        repaidUsd: l.repaidUsd,
        benchmark: l.account === BENCH.toLowerCase(),
      });
    this.notify('info', `Advanced time by ${Math.round(seconds / 3600)}h. Interest accrued.`);
    await this.tick();
  }
}

export function toCall(p: ActionProposal): CallSpec {
  return {
    kind: p.kind,
    target: p.target,
    selector: p.selector,
    asset: p.params.asset,
    amount: p.params.amount,
    to: p.params.to,
    destChainId: p.params.destChainId,
    slippageBps: p.params.slippageBps,
  };
}

function freezeClone<T>(v: T): T {
  const c = structuredClone(v);
  const f = (o: unknown) => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      Object.values(o).forEach(f);
    }
  };
  f(c);
  return c;
}
