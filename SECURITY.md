# Security

AegisAgent is a research prototype that runs on a **simulated** fork. It has **not** been independently audited. Nothing in this repository should be used with real funds until it has been reviewed by security professionals (spec §20). Passing the tests below is evidence, not a guarantee.

## Trust boundaries

| Untrusted | Trusted |
|---|---|
| LLM output, user chat text, DeFiLlama data, aggregator quotes, persisted browser state | The deterministic policy engine decision, and the session-key module's checks on the (simulated) account |

The AI proposes; code decides. The model has no signing ability and no field in the intent schema that can carry an address.

## Controls and where they are tested

| Threat | Control | Test |
|---|---|---|
| Prompt injection | Addresses and injection phrases never reach the model; strict zod schema with no address field; tool name always wins over model-supplied `type`; standing rules need confirmation; intents can only tighten limits | `unit.test.ts`, `security.test.ts`, Lab adversarial suite |
| Policy bypass | 25+ fail-closed rules; caps use the **simulated** value, not the claimed one; unexplained outflows denied; proposals are cloned and frozen at call time | `unit.test.ts`, `security.test.ts` |
| Race / double spend of caps | `Engine.process` is serialized, so each check sees the previous action in the running totals | `security.test.ts` (concurrent proposals) |
| Compromised backend | The account module re-validates target, selector, recipient, per-action and per-period caps, expiry, revocation and nonce independent of the policy engine | `integration.test.ts`, `security.test.ts` |
| Replay | UserOp nonce; signature binds chain, call, nonce and key; a signed session grant can register a key **once**, so a revoked key cannot be revived | `security.test.ts` |
| Malformed input to the ledger | Address format, finite positive amounts, known chains validated on-chain-side too (no prototype-key writes) | `security.test.ts` |
| Tampered browser storage | Persisted state is validated structurally and numerically; anything invalid is discarded | `security.test.ts` (12 tamper cases) |
| Hostile external data | Yield rows are coerced, truncated, range-checked, work-bounded; requests time out, send no credentials or referrer, refuse redirects | `unit.test.ts`, `security.test.ts` |
| XSS | React escaping only; ESLint forbids `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, script URLs; production CSP forbids inline script/style | lint, `security.test.ts` |
| Secret exposure | Session private key is never in app state, logs, exports or notifications; owner key is demo-only; the optional API key lives in tab session storage | `integration.test.ts` |
| Supply chain | `npm audit` is clean and enforced in CI; lockfile committed | CI |

## Deploying

Serve `dist/` over HTTPS with the headers in `public/_headers` (Netlify, Cloudflare Pages) or `deploy/nginx.conf` (the `Dockerfile` builds an unprivileged nginx image). Both are generated from `security/headers.mjs`, and a test fails if they drift. The CSP only allows scripts and styles from the same origin, and network calls only to the same origin, `yields.llama.fi` and `api.anthropic.com`. `frame-ancestors 'none'` can only be set as a header, not in the meta tag, so use one of the header configs in production.

## Known limitations (read before relying on this)

- The chain, bridge, KMS and bundler are simulations. Real ERC-4337 modules, real RPC providers, a real KMS/HSM and contract-level tests (Foundry) are required before any real-money use.
- The demo wallet and session keys live in browser session storage. An XSS bug would expose them, which is why the CSP and sink rules above exist. A production system keeps owner keys in the user's wallet and session keys in a KMS.
- The optional model integration calls the Anthropic API directly from the browser with a user-pasted key. A production deployment should proxy this server-side.
- No rate limiting exists beyond a client-side message gap; there is no server.
- Contract addresses, selectors and aggregator behavior are marked `[Verify]` in the specification and have not been verified against mainnet.
- Legal and regulatory questions around automated financial agents have not been assessed.

## Reporting

Open a private security advisory on the repository, or contact the maintainers directly. Please do not file public issues for vulnerabilities.
