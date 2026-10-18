import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { Engine, initialState } from '../engine';
import { setupDemo } from '../scenarios';
import { CONTRACTS, SELECTORS } from '../contracts';
import { isSaneState } from '../validate';
import { fetchYields, normalizePools } from '../yield';
import { validateToolCalls } from '../intent';
import { grantMessage } from '../engine';
import { CSP_HEADER, CSP_META, SECURITY_HEADERS } from '../../../security/headers.mjs';
import type { KvStore } from '../kms';
import type { Hex } from '../types';

const offline = (async () => {
  throw new Error('offline');
}) as unknown as typeof fetch;
const mem = (): KvStore & { map: Map<string, string> } => {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
};
async function mk(opts: ConstructorParameters<typeof Engine>[0] = {}) {
  const e = new Engine({ fetchImpl: offline, ...opts });
  await setupDemo(e);
  return e;
}
const read = (p: string) => readFileSync(new URL(`../../../${p}`, import.meta.url), 'utf8');
const supplyCall = { kind: 'supply', target: CONTRACTS[10].pool, selector: SELECTORS.supply, asset: 'USDC', amount: 1 } as const;

describe('session key lifecycle', () => {
  it('a revoked key cannot be resurrected by replaying its old signed grant', async () => {
    const e = await mk();
    const key = e.state.session!.key;
    const old = structuredClone(e.world.chain(10).sessions[key.toLowerCase()]);
    // reconstruct exactly what the owner originally signed
    const signer = await e.getOwnerSigner();
    const msg = grantMessage(10, old);
    const sig = await signer.signMessage(msg);
    await e.revokeSession();
    old.revoked = false;
    await expect(e.world.enableSession(10, old, sig, msg)).rejects.toThrow(/already registered/);
    expect((await e.attemptBypass(10, { ...supplyCall })).ok).toBe(false);
  });
  it('rejects session lifetimes over 30 days, past expiry, and nonsensical caps', async () => {
    const e = await mk();
    const base = structuredClone(e.world.chain(10).sessions[e.state.session!.key.toLowerCase()]);
    const owner = await e.getOwnerSigner();
    const try1 = async (patch: (s: typeof base) => void) => {
      const s = structuredClone(base);
      s.key = privateKeyToAccount(generatePrivateKey()).address;
      patch(s);
      const msg = grantMessage(10, s);
      return e.world.enableSession(10, s, await owner.signMessage(msg), msg);
    };
    await expect(try1((s) => (s.validUntil = e.world.now() + 31 * 86400))).rejects.toThrow(/30 days/);
    await expect(try1((s) => (s.validUntil = e.world.now() - 5))).rejects.toThrow(/30 days/);
    await expect(try1((s) => (s.caps.USDC.perPeriod = Number.POSITIVE_INFINITY))).rejects.toThrow(/caps/);
    await expect(try1((s) => (s.caps.USDC.perAction = -1))).rejects.toThrow(/caps/);
    await expect(try1(() => undefined)).resolves.toBeUndefined();
  });
  it('a validly signed op for a malformed or non-finite call is still rejected by the chain', async () => {
    const e = await mk();
    for (const call of [
      { ...supplyCall, amount: Number.NaN },
      { ...supplyCall, amount: Number.POSITIVE_INFINITY },
      { ...supplyCall, amount: -5 },
      { ...supplyCall, kind: 'transfer', target: CONTRACTS[10].usdc, selector: SELECTORS.transfer, to: '__proto__' as Hex },
      { ...supplyCall, target: 'constructor' as Hex },
    ] as const) {
      const r = await e.attemptBypass(10, { ...call });
      expect(r.ok).toBe(false);
    }
    expect(Object.getPrototypeOf(e.world.chain(10).balances)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).USDC).toBeUndefined();
  });
  it('a signature over different call data does not authorize another call', async () => {
    const e = await mk();
    const { toHash } = await import('../world');
    const sess = e.state.session!;
    const op = { sender: e.account, chainId: 10 as const, nonce: 0, call: { ...supplyCall }, nativeValue: 0, sessionKey: sess.key };
    const sig = await e.kms.signHash(sess.key, toHash(op));
    const tampered = { ...op, call: { ...supplyCall, amount: 2000 }, signature: sig };
    await expect(e.world.submitUserOp(tampered)).rejects.toThrow(/bad signature/);
    const replayed = { ...op, signature: sig };
    await e.world.submitUserOp(replayed);
    await expect(e.world.submitUserOp(replayed)).rejects.toThrow(/nonce/); // replay protection
  });
});

describe('policy pipeline integrity', () => {
  it('concurrent proposals cannot jointly exceed the daily cap', async () => {
    const e = await mk();
    const p = structuredClone(e.policy);
    p.caps = { perAction: 2500, perDay: 3000, currency: 'USD' };
    e.setPolicy(p);
    const mkp = () =>
      e.newProposal({
        source: 'scanner',
        kind: 'supply',
        chainId: 10,
        target: CONTRACTS[10].pool,
        selector: SELECTORS.supply,
        params: { asset: 'USDC', amount: 2000 },
        urgent: false,
        meta: { voluntary: true, netGainUsd: 50, breakEvenDays: 1 },
        reason: 'race',
      });
    const results = await Promise.all([e.process(mkp()), e.process(mkp()), e.process(mkp())]);
    expect(results.filter((r) => r.action?.status === 'success')).toHaveLength(1);
    expect(results.filter((r) => r.decision.ruleId === 'R-CAP-DAY')).toHaveLength(2);
    expect(e.world.position(10, e.account).suppliedUsdc).toBeCloseTo(2000, 2);
  });
  it('mutating a proposal after submission cannot change what was evaluated or signed', async () => {
    const e = await mk();
    const proposal = e.newProposal({
      source: 'scanner',
      kind: 'supply',
      chainId: 10,
      target: CONTRACTS[10].pool,
      selector: SELECTORS.supply,
      params: { asset: 'USDC', amount: 100 },
      urgent: false,
      meta: { voluntary: true, netGainUsd: 50, breakEvenDays: 1 },
      reason: 'mutation',
    });
    const pending = e.process(proposal);
    proposal.params.amount = 4000; // caller tampers after handing it over
    const r = await pending;
    expect(r.action?.status).toBe('success');
    expect(e.world.position(10, e.account).suppliedUsdc).toBeCloseTo(100, 2);
    expect(Object.isFrozen(r.proposal.proposal)).toBe(true);
    expect(() => {
      'use strict';
      (r.proposal.proposal.params as { amount: number }).amount = 1;
    }).toThrow();
  });
  it('rejects absurdly large amounts at the schema level', async () => {
    const e = await mk();
    const p = e.newProposal({
      source: 'intent',
      kind: 'supply',
      chainId: 10,
      target: CONTRACTS[10].pool,
      selector: SELECTORS.supply,
      params: { asset: 'USDC', amount: 1e15 },
      urgent: false,
      meta: { voluntary: true, netGainUsd: 10 },
      reason: 'x',
    });
    expect((await e.process(p)).decision.ruleId).toBe('R-SCHEMA');
  });
});

describe('persisted state is untrusted', () => {
  it('a normal state round-trips', async () => {
    const storage = mem();
    const e = await mk({ storage, sessionStorage: mem() });
    await new Promise((r) => setTimeout(r, 400));
    expect(isSaneState(JSON.parse(storage.map.get('aegis-agent:state:v1')!))).toBe(true);
    expect(isSaneState(JSON.parse(JSON.stringify(initialState())))).toBe(true);
    expect(e.account).toBeTruthy();
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- tampering helpers poke at arbitrary JSON
  const tampers: [string, (s: Record<string, any>) => void][] = [
    ['negative cap', (s) => (s.policy.caps.perAction = -1)],
    ['huge cap', (s) => (s.policy.caps.perDay = 1e30)],
    ['NaN-like price', (s) => (s.world.chains['42161'].wethPrice = null)],
    ['zero price', (s) => (s.world.chains['42161'].wethPrice = 0)],
    ['negative balance', (s) => (s.world.chains['10'].balances[Object.keys(s.world.chains['10'].balances)[0]].USDC = -500)],
    ['script in address', (s) => (s.accountAddress = '<img src=x onerror=alert(1)>')],
    [
      'prototype key',
      (s) => Object.defineProperty(s.world.chains['10'].balances, '__proto__', { value: { USDC: 1, WETH: 1 }, enumerable: true }),
    ],
    ['wrong version', (s) => (s.v = 2)],
    ['allowlist with garbage', (s) => (s.policy.allowedContracts[0].address = ['java', 'script:alert(1)'].join(''))],
    ['chain not in allowlist set', (s) => (s.policy.allowedChains = [999])],
    ['oversized history', (s) => (s.actions = new Array(10_000).fill({}))],
    ['trigger above target', (s) => (s.policy.healthFactor.trigger = 9)],
  ];
  for (const [name, mutate] of tampers) {
    it(`discards state with: ${name}`, async () => {
      const storage = mem();
      const e = await mk({ storage, sessionStorage: mem() });
      await new Promise((r) => setTimeout(r, 400));
      const raw = JSON.parse(storage.map.get('aegis-agent:state:v1')!);
      mutate(raw);
      storage.map.set('aegis-agent:state:v1', JSON.stringify(raw));
      const fresh = new Engine({ storage, sessionStorage: mem(), fetchImpl: offline });
      expect(fresh.state.accountAddress).toBeNull();
      expect(fresh.state.policy).toBeNull();
      expect(e.state.accountAddress).toBeTruthy();
    });
  }
  it('survives corrupt JSON', () => {
    const storage = mem();
    storage.map.set('aegis-agent:state:v1', '{not json');
    expect(new Engine({ storage, fetchImpl: offline }).state.owner).toBeNull();
  });
});

describe('untrusted external data and model output', () => {
  it('the model cannot override the tool it called through input fields', () => {
    const r = validateToolCalls([{ name: 'query', input: { type: 'stop', scope: 'revoke', subject: 'status' } }]);
    expect(r.kind).toBe('unsupported'); // extra keys are rejected by the strict schema
    const r2 = validateToolCalls([{ name: 'query', input: { subject: 'status', type: 'stop' } }]);
    expect(r2.kind === 'ok' && r2.intents[0].type).toBe('query'); // the tool name wins; the injected type is discarded
    const ok = validateToolCalls([{ name: 'query', input: { subject: 'status' } }]);
    expect(ok.kind === 'ok' && ok.intents[0].type).toBe('query');
  });
  it('bounds the work done on a hostile oversized yields response', () => {
    const rows = Array.from({ length: 100_000 }, (_, i) => ({
      chain: 'Arbitrum',
      project: 'aave-v3',
      symbol: 'USDC',
      tvlUsd: 1e9,
      apyBase: 4,
      stablecoin: true,
      pool: `p${i}`,
    }));
    expect(normalizePools({ data: rows }).length).toBeLessThanOrEqual(30_000);
  });
  it('the yield request times out instead of hanging, and sends no credentials or referrer', async () => {
    let init: RequestInit | undefined;
    const hang = ((_u: unknown, i: RequestInit) => {
      init = i;
      return new Promise((_res, rej) => i.signal!.addEventListener('abort', () => rej(new Error('aborted'))));
    }) as unknown as typeof fetch;
    const t0 = Date.now();
    const snap = await fetchYields(0, hang, 'https://yields.llama.fi/pools', 50);
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(snap.source).toBe('fallback');
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' });
  });
  it('rate limits chat messages when configured and caps message length for the model', async () => {
    const e = await mk({ intentMinIntervalMs: 5000 });
    await e.postIntent('What is my health factor?');
    await expect(e.postIntent('What is my health factor?')).rejects.toThrow(/wait/);
    const e2 = await mk();
    e2.state.settings.useLlm = true;
    e2.llmKey = 'k';
    let called = false;
    e2.fetchImpl = (async () => {
      called = true;
      throw new Error('should not be called');
    }) as unknown as typeof fetch;
    const r = await e2.postIntent('x'.repeat(601));
    expect(r.status).toBe('unsupported');
    expect(called).toBe(false);
  });
});

describe('web hardening', () => {
  it('index.html has no inline script, inline style or event handlers (CSP-safe)', () => {
    const html = read('index.html');
    expect(html).not.toMatch(/<script(?![^>]*\bsrc=)[^>]*>/i);
    expect(html).not.toMatch(/<style/i);
    expect(html).not.toMatch(/\son[a-z]+=/i);
    expect(html).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
  });
  it('CSP allows no inline code or third-party scripts and only the two API origins for fetch', () => {
    expect(CSP_META).toContain("default-src 'none'");
    expect(CSP_META).toContain("script-src 'self'");
    expect(CSP_META).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(CSP_META).toContain("connect-src 'self' https://yields.llama.fi https://api.anthropic.com");
    expect(CSP_HEADER).toContain("frame-ancestors 'none'");
  });
  it('public/_headers and deploy/nginx.conf match the single source of truth', () => {
    const h = read('public/_headers');
    const n = read('deploy/nginx.conf');
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
      expect(h).toContain(`${k}: ${v}`);
      expect(n).toContain(`add_header ${k} "${v}" always;`);
    }
  });
  it('source never uses dangerous DOM sinks', async () => {
    const { readdirSync, statSync } = await import('node:fs');
    const walk = (d: string): string[] =>
      readdirSync(d).flatMap((f) => {
        const p = `${d}/${f}`;
        return statSync(p).isDirectory() ? (f === '__tests__' ? [] : walk(p)) : /\.(ts|tsx)$/.test(f) ? [p] : [];
      });
    const root = fileURLToPath(new URL('../../', import.meta.url));
    for (const f of walk(root)) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/dangerouslySetInnerHTML|\binnerHTML\b|\beval\(|new Function\(|document\.write/);
    }
  });
});
