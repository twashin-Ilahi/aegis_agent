import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Badge, Btn, Icon } from './parts';

interface Chapter {
  id: string;
  num: string;
  title: string;
  subtitle: string;
  icon: string;
  content: ReactNode;
}

const CHAPTERS: Chapter[] = [
  {
    id: 'basics',
    num: '01',
    title: 'Crypto & DeFi for Beginners',
    subtitle: 'The foundational concepts behind decentralized finance',
    icon: 'coins',
    content: (
      <div className="guide-prose">
        <div className="guide-callout info">
          <Icon name="sparkles" size={18} />
          <div>
            <strong>No previous knowledge required!</strong>
            <p className="small">
              This guide assumes you have never used cryptocurrency or decentralized finance before. By the end of this 5-minute read,
              you will understand how everything works.
            </p>
          </div>
        </div>

        <h3>1. What is Cryptocurrency?</h3>
        <p>
          Traditional money (like Dollars or Euros) sits in commercial banks. When you send money, your bank approves and logs the transfer
          in their private database.
        </p>
        <p>
          A <b>cryptocurrency</b> (like Ethereum or USDC) is digital money that lives on a shared, decentralized public computer network called a{' '}
          <b>blockchain</b>. No single bank or company controls it. Instead of a bank account password, you hold a cryptographic key that
          proves you own your funds.
        </p>

        <h3>2. What is a Smart Contract?</h3>
        <p>
          Think of a smart contract as an automated digital vending machine:
        </p>
        <div className="guide-box">
          <i>Traditional banking:</i> You ask a loan officer for money &rarr; they review paperwork &rarr; they manually approve or deny.
          <br />
          <i>Smart contracts:</i> You deposit collateral into code &rarr; the code automatically dispenses your loan in seconds, strictly
          following transparent rules written in software.
        </div>

        <h3>3. What is DeFi (Decentralized Finance)?</h3>
        <p>
          <b>DeFi</b> is the entire ecosystem of financial services—lending, borrowing, trading, and earning savings interest—built
          entirely with smart contracts, accessible to anyone with an internet connection, 24 hours a day, 365 days a year.
        </p>

        <h3>4. What is a Stablecoin (USDC)?</h3>
        <p>
          Tokens like Bitcoin or Ethereum fluctuate in market price constantly. A <b>stablecoin</b> like <b>USDC</b> is designed to always be
          worth exactly <b>$1.00 USD</b>. It is ideal for borrowing and earning predictable interest without market volatility.
        </p>

        <h3>5. What are Blockchains & Layer 2s (Arbitrum & Optimism)?</h3>
        <p>
          <b>Ethereum</b> is the most secure blockchain for finance, but during busy periods its transaction computing fees (called <b>gas fees</b>)
          can become expensive.
        </p>
        <p>
          <b>Layer 2 networks</b> (like <b>Arbitrum</b> and <b>Optimism</b>) are speed and cost extensions built right on top of Ethereum.
          They process hundreds of transactions instantly for pennies in gas, while inheriting Ethereum&apos;s ironclad security.
        </p>
      </div>
    ),
  },
  {
    id: 'aegis',
      num: '02',
      title: 'What is AegisAgent?',
      subtitle: 'Your 24/7 autonomous shield and yield optimizer',
      icon: 'shield',
      content: (
        <div className="guide-prose">
          <h3>The Challenge in DeFi</h3>
          <p>
            While DeFi offers extraordinary opportunities to earn yield and borrow funds, it has two major headaches for regular users:
          </p>
          <ul>
            <li>
              <b>Yield fragmentation:</b> The best interest rates constantly move across different chains (Arbitrum, Optimism, Ethereum). Finding and moving funds manually is tedious and expensive.
            </li>
            <li>
              <b>Sudden liquidations:</b> If you borrow against collateral and the market crashes while you sleep, your collateral can be seized in minutes.
            </li>
          </ul>

          <h3>How AegisAgent Solves This</h3>
          <p>
            AegisAgent is an <b>AI-guarded smart wallet</b> that acts like a vigilant financial co-pilot:
          </p>
          <div className="guide-grid">
            <div className="guide-card">
              <Icon name="yield" size={20} />
              <strong>Scans & Optimizes Yield</strong>
              <p className="small">Tracks live pool yields across chains and automatically recommends moving idle stablecoins to the highest true net return.</p>
            </div>
            <div className="guide-card">
              <Icon name="shield" size={20} />
              <strong>Watches Your Loans 24/7</strong>
              <p className="small">The autonomous Risk Sentinel tracks your loan health on every block and rescues it before it can ever be liquidated.</p>
            </div>
          </div>

          <div className="guide-callout warn">
            <Icon name="key" size={18} />
            <div>
              <strong>Our Golden Principle: &ldquo;The AI proposes, code decides.&rdquo;</strong>
              <p className="small">
                Many users fear that an AI agent might hallucinate, be hacked, or drain their wallet. In AegisAgent, <b>the AI never holds your keys</b>.
                The AI can only propose actions. Every proposal must pass through a strict, deterministic smart contract policy engine that enforces hard spending caps, allowlisted destinations, and session key limits.
              </p>
            </div>
          </div>

          <h3>Is Real Money at Risk Here?</h3>
          <p>
            <b>No!</b> This entire application runs on an in-browser <b>simulated mainnet fork</b>. All tokens (WETH, USDC), price movements,
            and contracts are completely simulated. You can test crashes, rebalances, and attacks with 100% safety and zero financial risk.
          </p>
        </div>
      ),
    },
    {
      id: 'loans',
      num: '03',
      title: 'Lending & Liquidations Explained',
      subtitle: 'Understanding the mechanics of loan safety and rescue',
      icon: 'dashboard',
      content: (
        <div className="guide-prose">
          <h3>How Borrowing Works in DeFi</h3>
          <p>
            In traditional banking, loans require credit checks. In DeFi, loans are <b>collateralized</b>:
          </p>
          <ol>
            <li>You deposit an asset you believe in (e.g. <b>3.0 WETH</b> worth $9,000) as <b>Collateral</b>.</li>
            <li>You borrow a stable currency (e.g. <b>4,500 USDC</b>) to use or earn interest elsewhere, without having to sell your ETH.</li>
          </ol>

          <h3>What is the Health Factor (HF)?</h3>
          <p>
            The <b>Health Factor</b> is a single number that tells you how safe your loan is from being seized:
          </p>
          <div className="guide-table-wrap">
            <table className="guide-table">
              <thead>
                <tr>
                  <th>Health Factor</th>
                  <th>Status</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>&gt; 1.30</b></td>
                  <td><span className="hf-badge ok"><Icon name="shield" size={10} /> Safe</span></td>
                  <td>Healthy collateral cushion. Very low risk.</td>
                </tr>
                <tr>
                  <td><b>1.15 – 1.30</b></td>
                  <td><span className="hf-badge warn"><Icon name="pulse" size={10} /> Watch</span></td>
                  <td>Collateral price has dropped. Position is tightening.</td>
                </tr>
                <tr>
                  <td><b>1.00 – 1.15</b></td>
                  <td><span className="hf-badge bad"><Icon name="stop" size={10} /> At risk</span></td>
                  <td>Critical danger. Imminent liquidation threshold.</td>
                </tr>
                <tr>
                  <td><b>&lt; 1.00</b></td>
                  <td><span className="hf-badge bad">💥 Liquidated</span></td>
                  <td>Collateral seized and sold at a discount with a penalty!</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h3>How the Risk Sentinel Rescues Your Loan</h3>
          <p>
            When ETH market price drops sharply, your collateral value shrinks while your debt remains the same, driving your Health Factor down.
          </p>
          <p>
            If your Health Factor approaches the danger trigger (<b>HF 1.20</b>), AegisAgent&apos;s <b>Risk Sentinel</b> automatically executes an on-chain rescue:
          </p>
          <ul>
            <li>It uses idle funds to repay a slice of the borrowed debt, or supplies additional collateral.</li>
            <li>This instantly pushes your Health Factor back up to a comfortable <b>safe zone (HF &ge; 1.40)</b>.</li>
            <li>Meanwhile, an unmanaged loan with no sentinel gets liquidated and loses money.</li>
          </ul>
        </div>
      ),
    },
    {
      id: 'tabs',
      num: '04',
      title: 'Guide to the 6 Pages',
      subtitle: 'What every screen in this application does',
      icon: 'dashboard',
      content: (
        <div className="guide-prose">
          <p>AegisAgent is divided into 6 intuitive screens accessible from the left sidebar:</p>

          <div className="guide-page-row">
            <div className="guide-page-icon"><Icon name="dashboard" size={20} /></div>
            <div>
              <strong>1. Dashboard (Key 1)</strong>
              <p className="small">
                Your command center. Highlights your portfolio value and features the <b>side-by-side comparison</b> between your Protected Loan and an Unprotected Benchmark Loan. Also contains the one-click <b>&ldquo;Run the demo&rdquo;</b> and <b>&ldquo;Reset&rdquo;</b> buttons.
              </p>
            </div>
          </div>

          <div className="guide-page-row">
            <div className="guide-page-icon"><Icon name="agent" size={20} /></div>
            <div>
              <strong>2. Agent (Key 2)</strong>
              <p className="small">
                The conversational brain. Talk to Aegis in plain English (e.g. <i>&ldquo;Keep my loan above 1.4&rdquo;</i>). Try the clickable prompt chips, including the <b>&ldquo;⚡ Try an attack&rdquo;</b> chip to watch our prompt-injection firewall block malicious prompts.
              </p>
            </div>
          </div>

          <div className="guide-page-row">
            <div className="guide-page-icon"><Icon name="yield" size={20} /></div>
            <div>
              <strong>3. Yield (Key 3)</strong>
              <p className="small">
                Tracks live pool interest rates from DeFiLlama. Unlike naïve trackers, Aegis computes the true <b>net gain</b> after bridge fees, gas, and slippage, filtering out temporary rate spikes with 30-day averages.
              </p>
            </div>
          </div>

          <div className="guide-page-row">
            <div className="guide-page-icon"><Icon name="activity" size={20} /></div>
            <div>
              <strong>4. Activity (Key 4)</strong>
              <p className="small">
                The full cryptographic audit log. Every single action is presented as a clear 3-step trail: <code>AI proposed &rarr; Policy checked &rarr; Allowed or Blocked</code>.
              </p>
            </div>
          </div>

          <div className="guide-page-row">
            <div className="guide-page-icon"><Icon name="account" size={20} /></div>
            <div>
              <strong>5. Account (Key 5)</strong>
              <p className="small">
                Manage your ERC-4337 smart contract account, owner wallet, and scoped session keys. Technical jargon (selectors, nonces, bps) is hidden behind an optional &ldquo;Advanced&rdquo; toggle.
              </p>
            </div>
          </div>

          <div className="guide-page-row">
            <div className="guide-page-icon"><Icon name="lab" size={20} /></div>
            <div>
              <strong>6. Crash demo & tests (Key 6)</strong>
              <p className="small">
                The testing playground. Simulate market drops (−10% to −40%), inject chaos faults (stale oracles, network delays), and run the automated 29-case security attack suite.
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'quickstart',
      num: '05',
      title: '3-Minute Quickstart',
      subtitle: 'The best way to experience AegisAgent right now',
      icon: 'play',
      content: (
        <div className="guide-prose">
          <p>Ready to see everything in action? Here is the recommended 3-minute walkthrough:</p>

          <div className="guide-steps-list">
            <div className="guide-step-item">
              <span className="guide-step-badge">1</span>
              <div>
                <strong>Go to the Dashboard</strong>
                <p className="small">Look at the top demo bar and click <b>&ldquo;Run the demo&rdquo;</b>.</p>
              </div>
            </div>

            <div className="guide-step-item">
              <span className="guide-step-badge">2</span>
              <div>
                <strong>Watch the −40% Crash & Rescue</strong>
                <p className="small">
                  The demo immediately creates two identical loans (Protected vs. Unprotected) and triggers a 40% ETH market drop.
                  Watch the live status indicators:
                  <br />
                  &bull; Step 1: <i>Price drops 40%</i>
                  <br />
                  &bull; Step 2: <i>Sentinel triggers</i>
                  <br />
                  &bull; Step 3: <i>Protected loan rescued; unprotected loan liquidated</i>
                </p>
              </div>
            </div>

            <div className="guide-step-item">
              <span className="guide-step-badge">3</span>
              <div>
                <strong>Talk to the Agent</strong>
                <p className="small">Click the <b>Agent</b> tab in the sidebar. Click one of the example prompt chips (e.g. <i>&ldquo;Keep my loan above 1.4&rdquo;</i>) and press Send to see how natural goals become validated policies.</p>
              </div>
            </div>

            <div className="guide-step-item">
              <span className="guide-step-badge">4</span>
              <div>
                <strong>Test a Security Attack</strong>
                <p className="small">Click the red <b>&ldquo;⚡ Try an attack&rdquo;</b> chip. Notice how the agent recognizes the injection phrase and safely flags and blocks it.</p>
              </div>
            </div>

            <div className="guide-step-item">
              <span className="guide-step-badge">5</span>
              <div>
                <strong>Reset Whenever You Want</strong>
                <p className="small">Click the <b>&ldquo;Reset&rdquo;</b> button on the Dashboard anytime to return to a clean, fresh slate.</p>
              </div>
            </div>
          </div>

          <div className="guide-callout info">
            <Icon name="sparkles" size={18} />
            <div>
              <strong>Want an interactive walkthrough on the screen?</strong>
              <p className="small">
                Click the <b>Take a Tour</b> button in the sidebar or header. It highlights actual elements on your screen with pulsing spotlight callouts!
              </p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'glossary',
      num: '06',
      title: 'Jargon Buster (Glossary)',
      subtitle: 'Common crypto and DeFi terms in plain English',
      icon: 'book',
      content: (
        <div className="guide-prose">
          <p>Confused by a term? Here is the plain-English translation of every technical phrase used in the app:</p>

          <div className="guide-glossary-list">
            <div className="guide-glossary-item">
              <strong>Collateral</strong>
              <p className="small">Valuable assets (like ETH) you deposit as security when taking out a crypto loan.</p>
            </div>

            <div className="guide-glossary-item">
              <strong>Debt / Borrow</strong>
              <p className="small">The amount of funds (usually stablecoins like USDC) you borrow against your collateral.</p>
            </div>

            <div className="guide-glossary-item">
              <strong>Health Factor (HF)</strong>
              <p className="small">A score of loan safety. HF &gt; 1.30 is Safe. HF &lt; 1.00 results in immediate liquidation.</p>
            </div>

            <div className="guide-glossary-item">
              <strong>Liquidation</strong>
              <p className="small">The automatic penalty event where the lending protocol seizes your collateral to pay off your debt because its value dropped too low.</p>
            </div>

            <div className="guide-glossary-item">
              <strong>Session Key (ERC-4337)</strong>
              <p className="small">A temporary, restricted key given to the AI that can only perform pre-approved actions and expires automatically.</p>
            </div>

            <div className="guide-glossary-item">
              <strong>APY (Annual Percentage Yield)</strong>
              <p className="small">The estimated yearly return earned on deposited funds, including the effect of compounding interest.</p>
            </div>

            <div className="guide-glossary-item">
              <strong>Slippage</strong>
              <p className="small">The tiny price difference between when a trade or bridge is submitted and when it actually executes.</p>
            </div>

            <div className="guide-glossary-item">
              <strong>Gas Fee</strong>
              <p className="small">The small transaction fee paid to blockchain network validators for computing and recording your transaction.</p>
            </div>

            <div className="guide-glossary-item">
              <strong>Oracle</strong>
              <p className="small">A secure price feed that reports real-world market prices (like ETH in USD) to smart contracts.</p>
            </div>

            <div className="guide-glossary-item">
              <strong>Fail-Closed</strong>
              <p className="small">A security standard where if anything is unclear, frozen, or broken (like an oracle), the agent refuses to act rather than guessing.</p>
            </div>
          </div>
        </div>
      ),
    },
  ];

export function GuideBook({
  onClose,
  onOpenTour,
  go,
}: {
  onClose: () => void;
  onOpenTour?: () => void;
  go: (tab: string) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Keyboard navigation: Escape closes, Left/Right switches chapters
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' && activeIdx < CHAPTERS.length - 1) {
        setActiveIdx((i) => i + 1);
      } else if (e.key === 'ArrowLeft' && activeIdx > 0) {
        setActiveIdx((i) => i - 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeIdx, onClose]);

  // Scroll reader back to top on chapter change
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeIdx]);

  const current = CHAPTERS[activeIdx];
  const isFirst = activeIdx === 0;
  const isLast = activeIdx === CHAPTERS.length - 1;

  const handleStartDemo = () => {
    onClose();
    go('dashboard');
  };

  const handleStartTour = () => {
    onClose();
    if (onOpenTour) onOpenTour();
  };

  return (
    <div className="guide-scrim" role="dialog" aria-modal="true" aria-label="Beginner's Guide Book" onClick={onClose}>
      <div className="guide-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="guide-header">
          <div className="guide-header-title">
            <div className="guide-book-icon">
              <Icon name="book" size={20} />
            </div>
            <div>
              <div className="guide-badge-row">
                <Badge tone="info">Beginner&apos;s Handbook</Badge>
                <span className="small muted">Chapter {current.num} of 06</span>
              </div>
              <h2>{current.title}</h2>
            </div>
          </div>
          <button className="guide-close-btn" onClick={onClose} title="Close Guide (Esc)" aria-label="Close Guide">
            <Icon name="close" size={16} />
          </button>
        </header>

        {/* Body with sidebar nav and reading pane */}
        <div className="guide-body">
          <nav className="guide-nav" aria-label="Table of Contents">
            <div className="guide-nav-header">Table of Contents</div>
            {CHAPTERS.map((ch, idx) => (
              <button
                key={ch.id}
                className={`guide-nav-item ${idx === activeIdx ? 'active' : ''}`}
                onClick={() => setActiveIdx(idx)}
              >
                <span className="guide-nav-num">{ch.num}</span>
                <span className="guide-nav-text">{ch.title}</span>
              </button>
            ))}

            <div className="guide-nav-quick">
              <div className="guide-nav-quick-title">Quick Actions</div>
              <button className="guide-nav-action-btn" onClick={handleStartDemo}>
                <Icon name="play" size={13} /> Run Demo on Dashboard
              </button>
              {onOpenTour && (
                <button className="guide-nav-action-btn ghost" onClick={handleStartTour}>
                  <Icon name="sparkles" size={13} /> Interactive Tour
                </button>
              )}
            </div>
          </nav>

          <main ref={contentRef} className="guide-content" tabIndex={0}>
            <div className="guide-content-header">
              <span className="guide-chapter-tag">Chapter {current.num}</span>
              <h1>{current.title}</h1>
              <p className="guide-subtitle">{current.subtitle}</p>
            </div>
            {current.content}
          </main>
        </div>

        {/* Footer */}
        <footer className="guide-footer">
          <div className="guide-footer-left">
            <Btn kind="ghost" onClick={handleStartTour} title="Switch to the interactive UI tour">
              <Icon name="sparkles" size={13} /> Take interactive tour
            </Btn>
          </div>
          <div className="guide-footer-actions">
            {!isFirst && (
              <Btn onClick={() => setActiveIdx((i) => i - 1)} title="Previous Chapter (←)">
                <Icon name="arrowLeft" size={13} /> Previous
              </Btn>
            )}
            {!isLast ? (
              <Btn kind="primary" onClick={() => setActiveIdx((i) => i + 1)} title="Next Chapter (→)">
                Next Chapter <Icon name="arrowRight" size={13} />
              </Btn>
            ) : (
              <Btn kind="primary" onClick={handleStartDemo} title="Close guide and open dashboard">
                <Icon name="play" size={13} /> Try the Demo Now
              </Btn>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
