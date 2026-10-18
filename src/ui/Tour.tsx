import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Btn, Icon } from './parts';

export interface TourStep {
  id: string;
  tab: 'dashboard' | 'agent' | 'yield' | 'activity' | 'account' | 'lab';
  badge: string;
  title: string;
  icon: string;
  body: ReactNode;
  tip?: string;
  targetHint?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    tab: 'dashboard',
    badge: 'Introduction',
    title: 'Welcome to AegisAgent',
    icon: 'sparkles',
    body: (
      <>
        <p>
          AegisAgent is an autonomous, intent-based smart wallet for decentralized finance (DeFi). It optimizes stablecoin yield across{' '}
          <b>Arbitrum, Optimism, and Ethereum</b> while continuously protecting your loans from liquidation.
        </p>
        <p>
          Our golden rule: <i>&ldquo;The AI proposes, code decides.&rdquo;</i> The agent can never bypass your policies or transfer funds to
          unauthorized addresses.
        </p>
      </>
    ),
    tip: 'Press the Right Arrow key (→) or click Next to explore every feature across all pages.',
  },
  {
    id: 'dashboard',
    tab: 'dashboard',
    badge: 'Page 1 of 6 · Dashboard',
    title: 'Real-Time Health & Position Gauges',
    icon: 'dashboard',
    body: (
      <>
        <p>
          The <b>Dashboard</b> provides an instant bird&apos;s-eye view of your portfolio, active lending positions, and the agent&apos;s
          operational status.
        </p>
        <p>
          The circular gauge displays your <b>Health Factor (HF)</b>. If your collateral price plunges and drops below the trigger threshold,
          the Risk Sentinel initiates an automatic rescue.
        </p>
      </>
    ),
    tip: 'Health Factor < 1.0 means liquidation. Aegis targets a safe recovery buffer (target 1.40) well before that happens.',
    targetHint: 'Active Loans & Health Factor Gauges',
  },
  {
    id: 'agent',
    tab: 'agent',
    badge: 'Page 2 of 6 · Agent',
    title: 'Conversational Intent Engine',
    icon: 'agent',
    body: (
      <>
        <p>
          State your directives in natural English—for example: <i>&ldquo;Keep my loan above 1.4&rdquo;</i> or{' '}
          <i>&ldquo;Move my idle USDC to the best stablecoin yield.&rdquo;</i>
        </p>
        <p>
          A strict Zod-validated intent parser translates your words into structured actions. For safety, the intent schema has{' '}
          <b>no recipient address field</b>, completely eliminating prompt-injection fund drains.
        </p>
      </>
    ),
    tip: 'Any standing policy limit changes (like daily caps or gas ceilings) always require your explicit confirmation.',
    targetHint: 'Chat Input & Standing Rule Settings',
  },
  {
    id: 'yield',
    tab: 'yield',
    badge: 'Page 3 of 6 · Yield',
    title: 'Net-Gain Cost-Aware Yield Scanner',
    icon: 'yield',
    body: (
      <>
        <p>
          Aegis continuously tracks pool yields live from <b>DeFiLlama</b> and ranks opportunities by true <b>net gain</b>.
        </p>
        <p>
          Before recommending any deposit or bridge, the math subtracts aggregator bridge fees, source/destination gas, and slippage. It
          also relies on <b>30-day mean APYs</b> to protect you from chasing transient spikes.
        </p>
      </>
    ),
    tip: 'Moves only execute if the net yield beats costs and breaks even within your policy horizon (default: ≤ 14 days).',
    targetHint: 'Ranked Yield Pools & Net-Gain Metrics',
  },
  {
    id: 'activity',
    tab: 'activity',
    badge: 'Page 4 of 6 · Activity',
    title: 'Deterministic Policy Engine & Audit Trail',
    icon: 'activity',
    body: (
      <>
        <p>
          Every single proposal is evaluated against <b>25+ fail-closed policy rules</b> before execution (e.g.{' '}
          <code>R-CAP-ACTION</code>, <code>R-RESERVE</code>, <code>R-SLIPPAGE</code>).
        </p>
        <p>
          The <b>Activity</b> page keeps an immutable record of every decision—allowed, denied, or awaiting confirmation—with full rule
          reasons and simulation outflows.
        </p>
      </>
    ),
    tip: 'Click on any transaction record to inspect the exact simulated checks and policy evaluations.',
    targetHint: 'Decision Feed & Rule ID Auditing',
  },
  {
    id: 'account',
    tab: 'account',
    badge: 'Page 5 of 6 · Account',
    title: 'ERC-4337 Smart Account & Session Keys',
    icon: 'account',
    body: (
      <>
        <p>
          Aegis operates via an independently bounded <b>ERC-4337 session key</b>. The account contract itself enforces that the agent can
          only call approved contracts, specific selectors, and send funds only back to your own smart account.
        </p>
        <p>
          Real cryptographic signatures (secp256k1 via <code>viem</code>) are validated on each UserOperation. Session keys automatically
          expire and can be revoked at any time.
        </p>
      </>
    ),
    tip: 'Private keys live in an isolated DemoKms and are never exposed in application state or logs.',
    targetHint: 'Session Key Status, Permissions & Gas Reserves',
  },
  {
    id: 'lab',
    tab: 'lab',
    badge: 'Page 6 of 6 · Lab',
    title: 'Crash Simulator & Adversarial Playground',
    icon: 'lab',
    body: (
      <>
        <p>
          The <b>Lab</b> lets you test the agent under hostile conditions. Trigger a <b>−40% ETH price crash</b> to watch Aegis
          rescue your loan by repaying debt or supplying collateral, while an identical unprotected benchmark loan is liquidated.
        </p>
        <p>
          You can also inject faults (stale oracles, sequencer downtime, gas spikes, RPC outages) or run the automated adversarial attack suite.
        </p>
      </>
    ),
    tip: 'Try clicking "1. Setup demo" followed by "−40%" in the Lab to see autonomous rescue in action.',
    targetHint: 'Crash Testing, Fault Toggles & Adversarial Suite',
  },
  {
    id: 'controls',
    tab: 'dashboard',
    badge: 'Top Navigation Controls',
    title: 'Simulation Clock & Instant Kill Switch',
    icon: 'play',
    body: (
      <>
        <p>
          Control the simulated fork using the top header buttons:
        </p>
        <ul className="tour-list">
          <li>
            <b>▶ Live / Run</b>: Advances the simulation clock automatically (one block every ~1.2s). Press <code>L</code> to toggle.
          </li>
          <li>
            <b>Speed Multiplier</b>: Speed up time by <code>0.5×</code>, <code>1×</code>, or <code>3×</code>.
          </li>
          <li>
            <b>Step</b>: Advance exactly one block forward.
          </li>
          <li>
            <b>Emergency Stop</b>: Instantly revokes the session key and freezes all agent activity in a single click.
          </li>
        </ul>
      </>
    ),
    tip: 'Keyboard navigation: 1–6 switch tabs, L toggles Live mode, and you can re-launch this tour anytime from the header!',
    targetHint: 'Header Controls: Live, Speed, Step & Emergency Stop',
  },
];

export function Tour({
  onClose,
  go,
}: {
  onClose: () => void;
  go: (tab: string) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    go(TOUR_STEPS[0].tab);
  }, [go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (stepIndex < TOUR_STEPS.length - 1) {
          const next = stepIndex + 1;
          setStepIndex(next);
          go(TOUR_STEPS[next].tab);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        if (stepIndex > 0) {
          const prev = stepIndex - 1;
          setStepIndex(prev);
          go(TOUR_STEPS[prev].tab);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepIndex, onClose, go]);

  const current = TOUR_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const goTo = (index: number) => {
    setStepIndex(index);
    go(TOUR_STEPS[index].tab);
  };

  const next = () => {
    if (isLast) {
      onClose();
    } else {
      goTo(stepIndex + 1);
    }
  };

  const prev = () => {
    if (!isFirst) goTo(stepIndex - 1);
  };

  return (
    <div className="tour-portal" role="dialog" aria-modal="true" aria-label="Interactive Tour">
      {/* Background overlay with pulse effect */}
      <div className="tour-backdrop" onClick={onClose} />

      {/* Target hint highlight banner */}
      {current.targetHint && (
        <div className="tour-target-banner" key={`hint-${current.id}`}>
          <span className="tour-target-dot" />
          <span>Focused Area: <b>{current.targetHint}</b></span>
        </div>
      )}

      {/* Main floating tour card */}
      <div className="tour-card" key={current.id}>
        <header className="tour-card-header">
          <div className="tour-step-meta">
            <Badge tone="info">{current.badge}</Badge>
            <span className="tour-step-counter">
              {stepIndex + 1} / {TOUR_STEPS.length}
            </span>
          </div>
          <button className="tour-close-btn" onClick={onClose} title="Close Tour (Esc)" aria-label="Close Tour">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="tour-card-body">
          <div className="tour-title-row">
            <div className="tour-icon-box">
              <Icon name={current.icon} size={22} />
            </div>
            <h2>{current.title}</h2>
          </div>

          <div className="tour-content">{current.body}</div>

          {current.tip && (
            <div className="tour-tip">
              <Icon name="sparkles" size={15} />
              <span>{current.tip}</span>
            </div>
          )}
        </div>

        <footer className="tour-card-footer">
          {/* Progress dots */}
          <div className="tour-dots" role="tablist" aria-label="Tour Steps">
            {TOUR_STEPS.map((step, idx) => (
              <button
                key={step.id}
                role="tab"
                aria-selected={idx === stepIndex}
                className={`tour-dot ${idx === stepIndex ? 'active' : ''} ${idx < stepIndex ? 'done' : ''}`}
                onClick={() => goTo(idx)}
                title={`Step ${idx + 1}: ${step.title}`}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="tour-actions">
            {!isFirst && (
              <Btn onClick={prev} title="Previous step (←)">
                <Icon name="arrowLeft" size={13} /> Back
              </Btn>
            )}
            <Btn kind="ghost" onClick={onClose} title="Skip tour (Esc)">
              Skip
            </Btn>
            <Btn kind="primary" onClick={next} title={isLast ? 'Complete tour' : 'Next step (→)'}>
              {isLast ? (
                <>
                  <Icon name="check" size={13} /> Finish Tour
                </>
              ) : (
                <>
                  Next <Icon name="arrowRight" size={13} />
                </>
              )}
            </Btn>
          </div>
        </footer>
      </div>
    </div>
  );
}
