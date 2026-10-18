import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Badge, Btn, Icon } from './parts';

export interface TourStep {
  id: string;
  tab: 'dashboard' | 'agent' | 'yield' | 'activity' | 'account' | 'lab';
  badge: string;
  title: string;
  icon: string;
  selector: string;
  targetHint: string;
  body: ReactNode;
  tip?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    tab: 'dashboard',
    badge: 'Introduction',
    title: 'Welcome to AegisAgent',
    icon: 'sparkles',
    selector: '[data-tour="brand"]',
    targetHint: 'AegisAgent Security Core',
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
    tip: 'Press the Right Arrow key (→) or click Next to explore every feature with interactive UI callouts.',
  },
  {
    id: 'dashboard',
    tab: 'dashboard',
    badge: 'Page 1 of 6 · Dashboard',
    title: 'Real-Time Health & Position Gauges',
    icon: 'dashboard',
    selector: '[data-tour="dashboard-loans"], [data-tour="dashboard-hero"], [data-tour="dashboard-stats"]',
    targetHint: 'Active Loans & Risk Gauges',
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
  },
  {
    id: 'agent',
    tab: 'agent',
    badge: 'Page 2 of 6 · Agent',
    title: 'Conversational Intent Engine',
    icon: 'agent',
    selector: '[data-tour="agent-chat"]',
    targetHint: 'Conversational Intent Interface',
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
  },
  {
    id: 'yield',
    tab: 'yield',
    badge: 'Page 3 of 6 · Yield',
    title: 'Net-Gain Cost-Aware Yield Scanner',
    icon: 'yield',
    selector: '[data-tour="yield-scanner"]',
    targetHint: 'Live DeFiLlama Yield Scanner',
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
  },
  {
    id: 'activity',
    tab: 'activity',
    badge: 'Page 4 of 6 · Activity',
    title: 'Deterministic Policy Engine & Audit Trail',
    icon: 'activity',
    selector: '[data-tour="activity-feed"]',
    targetHint: 'Policy Checks & Audit Trail',
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
  },
  {
    id: 'account',
    tab: 'account',
    badge: 'Page 5 of 6 · Account',
    title: 'ERC-4337 Smart Account & Session Keys',
    icon: 'account',
    selector: '[data-tour="account-setup"]',
    targetHint: 'ERC-4337 Session Key Management',
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
  },
  {
    id: 'lab',
    tab: 'lab',
    badge: 'Page 6 of 6 · Lab',
    title: 'Crash Simulator & Adversarial Playground',
    icon: 'lab',
    selector: '[data-tour="lab-demo-card"]',
    targetHint: 'Market Crash Simulator & Fault Controls',
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
  },
  {
    id: 'controls',
    tab: 'dashboard',
    badge: 'Top Navigation Controls',
    title: 'Simulation Clock & Instant Kill Switch',
    icon: 'play',
    selector: '[data-tour="header-controls"]',
    targetHint: 'Live Simulation & Emergency Stop',
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
  },
];

interface RectState {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function Tour({
  onClose,
  go,
}: {
  onClose: () => void;
  go: (tab: string) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<RectState | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const current = TOUR_STEPS[stepIndex];

  // Navigate tab when step changes
  useEffect(() => {
    go(current.tab);
  }, [stepIndex, current.tab, go]);

  // Find, scroll to, and measure target element
  useEffect(() => {
    let active = true;
    let attempts = 0;

    const measure = () => {
      if (!active) return;
      const el = document.querySelector(current.selector) as HTMLElement | null;
      if (el) {
        // Ensure element is visible
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        const rect = el.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      } else if (attempts < 12) {
        attempts++;
        setTimeout(measure, 60);
      } else {
        setTargetRect(null);
      }
    };

    // Initial measure after short delay for tab switch transition
    const timer = setTimeout(measure, 80);

    const onReposition = () => {
      const el = document.querySelector(current.selector) as HTMLElement | null;
      if (el) {
        const rect = el.getBoundingClientRect();
        setTargetRect({
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
    };

    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);

    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [stepIndex, current.selector]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (stepIndex < TOUR_STEPS.length - 1) {
          setStepIndex(stepIndex + 1);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowLeft') {
        if (stepIndex > 0) {
          setStepIndex(stepIndex - 1);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stepIndex, onClose]);

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  const goTo = (index: number) => {
    setStepIndex(index);
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

  // Compute dynamic card position relative to spotlight target
  const computeCardStyle = (): { style: CSSProperties; placement: string } => {
    if (!targetRect || window.innerWidth < 820) {
      return {
        style: {
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        },
        placement: 'center',
      };
    }

    const cardWidth = 520;
    const cardHeight = 360;
    const padding = 16;
    const spaceBelow = window.innerHeight - (targetRect.top + targetRect.height);
    const spaceAbove = targetRect.top;
    const spaceRight = window.innerWidth - (targetRect.left + targetRect.width);

    // Prefer placing below target if room
    if (spaceBelow >= cardHeight + padding) {
      const left = Math.max(20, Math.min(window.innerWidth - cardWidth - 20, targetRect.left));
      return {
        style: {
          position: 'fixed',
          top: `${targetRect.top + targetRect.height + padding}px`,
          left: `${left}px`,
        },
        placement: 'below',
      };
    }

    // Otherwise place above target if room
    if (spaceAbove >= cardHeight + padding) {
      const left = Math.max(20, Math.min(window.innerWidth - cardWidth - 20, targetRect.left));
      return {
        style: {
          position: 'fixed',
          bottom: `${window.innerHeight - targetRect.top + padding}px`,
          left: `${left}px`,
        },
        placement: 'above',
      };
    }

    // Otherwise place to right if room
    if (spaceRight >= cardWidth + padding) {
      const top = Math.max(20, Math.min(window.innerHeight - cardHeight - 20, targetRect.top));
      return {
        style: {
          position: 'fixed',
          top: `${top}px`,
          left: `${targetRect.left + targetRect.width + padding}px`,
        },
        placement: 'right',
      };
    }

    // Fallback: centered
    return {
      style: {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      },
      placement: 'center',
    };
  };

  const { style: cardStyle, placement } = computeCardStyle();

  return (
    <div className="tour-portal" role="dialog" aria-modal="true" aria-label="Interactive Tour">
      {/* Fallback backdrop if element not yet measured */}
      {!targetRect && <div className="tour-backdrop" onClick={onClose} />}

      {/* Spotlight cutout callout animation directly over target element */}
      {targetRect && (
        <div
          className="tour-spotlight"
          style={{
            top: `${Math.max(4, targetRect.top - 6)}px`,
            left: `${Math.max(4, targetRect.left - 6)}px`,
            width: `${targetRect.width + 12}px`,
            height: `${targetRect.height + 12}px`,
          }}
        >
          {/* Pulsing beacon border animation */}
          <div className="tour-spotlight-pulse" />

          {/* Floating beacon pill */}
          <div className="tour-spotlight-badge">
            <span className="tour-target-dot" />
            <span>{current.targetHint}</span>
          </div>
        </div>
      )}

      {/* Main interactive tour card */}
      <div
        ref={cardRef}
        className={`tour-card tour-placement-${placement}`}
        style={cardStyle}
        key={current.id}
      >
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
          {/* Clickable progress dots */}
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
