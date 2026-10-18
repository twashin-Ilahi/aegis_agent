# AegisAgent

An AI-driven, intent-based smart wallet for DeFi. You state a goal in plain English; the agent finds yield across Arbitrum, Optimism and Ethereum and guards your Aave loan from liquidation, **within limits you set**. *The AI proposes, code decides.*

This is a React + TypeScript implementation of `AegisAgent Product and Technical Documentation.pdf`.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 128 tests: unit, integration, adversarial, security, UI smoke
npm run lint && npm run typecheck && npm run build   # same checks as CI (.github/workflows/ci.yml)
npm run format   # Prettier
```

Quick tour: **Account → One-click demo setup**, press **▶ Live** in the header, then **Lab → −40%**. Watch the protected loan get rescued while the identical unprotected loan is liquidated. Then try the **Agent** tab ("Keep my funds earning the highest stablecoin yield while keeping my liquidation risk low.") and **Lab → Run suite**.

## Using the app

- Keyboard: **1-6** switch sections, **L** toggles Live. Theme (system/light/dark) and simulation speed (0.5x/1x/3x) are in the sidebar and header.
- Alerts and successes appear as toasts and are kept in the Dashboard feed. Destructive actions ask for confirmation, except **Emergency stop**, which is deliberately one click.
- A runtime error shows a recovery screen instead of a blank page; state is persisted in the browser and can be reset from Account.

## Security

See [SECURITY.md](SECURITY.md) for the threat model, controls, how each is tested, deployment headers, and honest limitations. The production build ships a strict Content-Security-Policy; `docker build -t aegis .` serves it from an unprivileged nginx with the full header set.

## What is real and what is simulated

Be clear about this before relying on any result.

| Real (runs for real in the app) | Simulated (stand-ins, same interfaces) |
|---|---|
| Policy engine: deterministic, fail-closed, 25+ rules with IDs and plain-language reasons | Chains: an in-browser "mainnet fork" ledger (`src/core/world.ts`) with an Aave-style market, oracle, liquidations, bridges, gas |
| Intent engine: strict zod schemas, offline parser, optional Claude tool-use parser, injection flags | ERC-4337 account, EntryPoint and bundler: modelled; the session-key **validator** (allowlist, selectors, recipient pin, caps, period, expiry, revocation, nonce) is implemented and runs independently of the policy engine |
| Real secp256k1 keys and signatures (viem): the owner signs session grants/revocations, the session key signs every UserOperation, and the chain recovers and verifies them | KMS/HSM: `DemoKms` keeps the key out of state and logs, but lives in browser session storage |
| Yield scanner against the live DeFiLlama API (falls back to a labelled offline snapshot) | Aggregator (Li.Fi/Socket) quotes and bridge settlement |
| Net-gain / break-even math, rescue-amount math, Risk Sentinel with cooldown, caps, reserve, failover, stale-oracle and sequencer checks | Postgres, Redis/BullMQ, Node API: replaced by the in-browser `Engine` exposing the same operations (`postIntent`, `confirm*`, `setPolicy`, `revokeSession`, …) |
| Cross-chain executor state machine with every failure mode in the spec | Chainlink Automation fallback, Foundry contract tests, flash-loan deleveraging (spec: optional, "build last"): **not built** |

Nothing here touches a real chain or real funds. The spec's own rule applies: until professionally reviewed, use only a fork or testnets.

## Mapping to the spec

| Spec | Where |
|---|---|
| §12 Smart account & session keys (FR1, FR2) | `core/world.ts` (`validateUserOp`, `enableSession`, `revokeSession`), `core/engine.ts` (`grantSession`, `emergencyStop`), `core/kms.ts` |
| §13 Policy engine (FR4) | `core/policy.ts`; every rule type in the spec's table, evaluation order, `allow / deny / confirm` with a rule ID |
| §14 Intent engine (FR3) | `core/intent.ts` (5 intent types, clarifying questions, never guesses amounts/addresses) |
| §15 Yield scanner (FR7) | `core/yield.ts` (filters, base APY vs reward APY, 30-day mean, net-gain formula, break-even, on-chain re-read) |
| §16 Cross-chain executor (FR8) | `core/executor.ts` (quote → policy → simulate → sign → poll → deposit → reconcile; idempotency; one in-flight move; gas gate; all failure modes) |
| §17 Risk Sentinel (FR5, FR6) | `core/sentinel.ts` (thresholds 1.5 / 1.15 / 1.4 / 1.5, rescue order, heartbeat watchdog, RPC failover, retries) |
| §18 Data model & API | `EngineState` in `core/engine.ts` (intents, proposals + decisions, actions, snapshots, session, policy versions) |
| §19 Dashboard (FR10) | `src/ui/*`: connect/create, rules chat + policy editor, health-factor gauges, activity log with per-rule trail, always-visible emergency stop |
| §20 Threat model | Lab tab: stale/manipulated oracle, sequencer down, RPC down, gas spike, compromised backend, hostile router, partial fill, … |
| §21 Testing strategy | `src/core/__tests__`, `src/ui/__tests__` |
| §24 Demo plan | Lab tab: setup script, crash script (10/20/30/40%), reset script; two identical loans side by side |

## Design decisions worth knowing

- **Two layers of enforcement.** The off-chain policy engine runs first and explains denials. The simulated account then re-checks target, function, recipient, per-action and per-period caps, expiry and revocation. `Lab → Run suite` includes a "compromised backend" that signs with the session key and bypasses the policy engine; the chain rejects it.
- **Fail closed.** Stale/diverging oracle, sequencer down, RPC failure, malformed proposal, simulation failure or any exception means no action and an alert.
- **The LLM cannot act.** Intents have no address field. Model output is validated against the same strict schema as the offline parser, and text containing addresses or injection phrases never reaches the model. Standing rules (and any limit change) need explicit confirmation; intents can only *tighten* slippage/gas limits.
- **Rescue reserve.** Optional yield moves never sweep the idle USDC the Sentinel needs (`rescueReserveUsd`, default $2,000 on chains with a loan). This is this implementation's answer to the spec's open question about where rescue funds come from.
- **Trigger semantics.** A rescue starts below the trigger (1.15) and restores to the target (1.4). A cap-limited partial rescue that lifts HF back above the trigger is not repeated until the position falls again.
- **Simplified lending model.** One collateral asset (WETH, LT 0.8), one debt asset (USDC), liquidations repay 50% at a 5% bonus. USDC supplied for yield does not count as collateral. Amounts are JS numbers, fine for a simulator, not for production accounting.
- **Defaults differ from the spec's example caps.** The spec lists $500/action and $1,000/day as examples. Defaults here are $2,500 and $5,000 so that a rescue in the 30% crash scenario fits; change them in the policy editor.

## Optional: use a language model for intents

Agent tab → *Language model settings*. Paste an Anthropic API key (kept in this tab's session storage only), choose a model, tick *Use the model*. The request uses tool calling with `tool_choice: any`. On any failure the offline parser is used instead. Note this sends your goal text to the API from the browser; do not paste secrets into chat.

## Items marked [Verify] in the spec that remain unverified

Contract addresses, the 4-byte selector of the simulated bridge entrypoint, DeFiLlama field names beyond those used here, account-provider session-key capabilities, competitor claims, hackathon judging criteria, and any legal or regulatory position. See spec §25.

## Project layout

```
src/core        engine, policy, intent, yield, executor, sentinel, simulated chain, scenarios
src/core/__tests__   unit + integration + adversarial + 20-run reliability test
src/ui          React screens
```
