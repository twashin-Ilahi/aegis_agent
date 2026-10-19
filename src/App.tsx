import { useEffect, useState } from 'react';
import { Account } from './ui/Account';
import { Activity } from './ui/Activity';
import { Agent } from './ui/Agent';
import { Dashboard } from './ui/Dashboard';
import { Lab } from './ui/Lab';
import { YieldTab } from './ui/YieldTab';
import { Badge, Btn, Icon, Logo } from './ui/parts';
import { useAsync } from './ui/hooks';
import { NotificationBell, ThemeButton, Toaster, useTheme } from './ui/chrome';
import { fmtDateTime, useEngine, useRunLoop } from './ui/store';
import { Tour } from './ui/Tour';
import { GuideBook } from './ui/GuideBook';
import { Analytics } from '@vercel/analytics/react';

const TABS = [
  ['dashboard', 'Dashboard', 'Overview of your positions and the agent'],
  ['agent', 'Aegi (Assistant)', 'Tell Aegi your goals in plain English and set your limits'],
  ['yield', 'Yield', 'Opportunities ranked after costs'],
  ['activity', 'Activity', 'Every decision, with the reason'],
  ['account', 'Account', 'Wallet, smart account and session key'],
  ['lab', 'Crash demo & tests', 'Crash scenarios, fault injection and security tests'],
] as const;
type Tab = (typeof TABS)[number][0];

export default function App() {
  const e = useEngine();
  const st = e.state;
  const [tab, setTab] = useState<Tab>(() => {
    const h = window.location.hash.slice(1) as Tab;
    return TABS.some(([k]) => k === h) ? h : 'dashboard';
  });
  const [tourOpen, setTourOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [speed, setSpeed] = useState(1);
  const { live, setLive } = useRunLoop(Math.round(1200 / speed));
  const [theme, cycleTheme] = useTheme();
  const { busy, run } = useAsync();
  const go = (t: string) => {
    setTab(t as Tab);
    window.location.hash = t;
  };
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (ev.metaKey || ev.ctrlKey || ev.altKey || (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
      const n = Number(ev.key);
      if (n >= 1 && n <= TABS.length) go(TABS[n - 1][0]);
      else if (ev.key === 'l') setLive((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const paused = !!st.policy?.paused;
  const sessionOk = st.session?.status === 'active';
  const pending =
    st.intents.filter((i) => i.status === 'awaiting_confirmation').length +
    st.proposals.filter((p) => p.status === 'awaiting_confirmation').length;
  const current = TABS.find(([k]) => k === tab)!;

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand" data-tour="brand">
          <Logo size={38} />
          <div>
            <b>AegisAgent</b>
            <small>The AI proposes, code decides</small>
          </div>
        </div>
        <nav className="nav" role="tablist" aria-label="Sections">
          {TABS.map(([k, label], i) => (
            <button
              key={k}
              role="tab"
              title={`${label} (press ${i + 1})`}
              aria-selected={tab === k}
              className={tab === k ? 'on' : ''}
              onClick={() => go(k)}
            >
              <Icon name={k} />
              {k === 'agent' && <span className="sr-only">Agent </span>}
              {k === 'lab' && <span className="sr-only">Lab </span>}
              <span>{label}</span>
              {k === 'dashboard' && pending > 0 && <span className="pip">{pending}</span>}
            </button>
          ))}
        </nav>
        <div className="side-foot">
          <button className="tour-side-btn" onClick={() => setTourOpen(true)} title="Take an interactive tour of AegisAgent">
            <Icon name="sparkles" size={14} />
            <span>Take a Tour</span>
          </button>
          <button className="guide-side-btn" onClick={() => setGuideOpen(true)} title="Beginner's Guide Book: Learn crypto & AegisAgent from scratch">
            <Icon name="book" size={14} />
            <span>Guide Book</span>
          </button>
          <div className="env">
            <span className="env-dot" />
            <div>
              <b>Simulated mainnet fork</b>
              <small>No real funds. Chains, prices and bridges are simulated.</small>
            </div>
          </div>
          <ThemeButton mode={theme} onClick={cycleTheme} />
          <div className="clock" title="Simulated time">
            {fmtDateTime(e.world.now())} · block {e.world.s.block}
          </div>
        </div>
      </aside>

      <div className="content">
        <div className="sim-banner" role="status">
          <span className="sim-banner-dot" aria-hidden="true" />
          <span>Simulation: no real funds or real chain.</span>
        </div>
        <header className="top">
          <div className="titles">
            <h1>{current[1]}</h1>
            <p>{current[2]}</p>
          </div>
          <div className="status">
            <Badge tone={!st.policy ? 'neutral' : paused ? 'bad' : 'ok'}>
              <span className="pulse" />
              {!st.policy ? 'No account' : paused ? 'Agent paused' : 'Agent active'}
            </Badge>
            <Badge
              tone={sessionOk ? 'ok' : st.session ? 'bad' : 'neutral'}
              title={st.session ? `Expires ${fmtDateTime(st.session.expiresAt)}` : ''}
            >
              <Icon name="key" size={12} /> Session {st.session?.status ?? 'none'}
            </Badge>
            {st.safeMode && <Badge tone="bad">SAFE MODE</Badge>}
          </div>
          <div className="controls" data-tour="header-controls">
            <Btn kind="ghost" onClick={() => setGuideOpen(true)} title="Beginner's Guide Book: Everything explained from scratch">
              <Icon name="book" size={13} /> Guide
            </Btn>
            <Btn kind="ghost" onClick={() => setTourOpen(true)} title="Interactive tour of all features">
              <Icon name="sparkles" size={13} /> Tour
            </Btn>
            <NotificationBell />
            <Btn kind={live ? 'primary' : 'default'} onClick={() => setLive(!live)} title="Advance one block every ~1.2 seconds">
              <Icon name="play" size={13} /> {live ? 'Live' : 'Run'}
            </Btn>
            <select
              className="speed"
              value={speed}
              onChange={(ev) => setSpeed(Number(ev.target.value))}
              aria-label="Simulation speed"
              title="Simulation speed"
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={3}>3×</option>
            </select>
            <Btn onClick={() => run('step', () => e.tick())} busy={busy === 'step'} disabled={!st.policy} title="Advance one block">
              <Icon name="step" size={13} /> Step
            </Btn>
            <Btn
              kind="danger"
              disabled={!st.policy}
              busy={busy === 'stop'}
              onClick={() => run('stop', () => e.emergencyStop())}
              title="Pause the agent and revoke its session key"
            >
              <Icon name="stop" size={14} /> Emergency stop
            </Btn>
            {paused && !st.safeMode && <Btn onClick={() => e.resume()}>Resume</Btn>}
          </div>
        </header>

        <main>
          {tab === 'dashboard' && (
            <Dashboard
              go={go}
              onOpenTour={() => setTourOpen(true)}
              onOpenGuide={() => setGuideOpen(true)}
              live={live}
              setLive={setLive}
            />
          )}
          {tab === 'agent' && <Agent />}
          {tab === 'yield' && <YieldTab />}
          {tab === 'activity' && <Activity />}
          {tab === 'account' && <Account />}
          {tab === 'lab' && <Lab />}
        </main>

        {tourOpen && <Tour onClose={() => setTourOpen(false)} go={go} />}
        {guideOpen && (
          <GuideBook
            onClose={() => setGuideOpen(false)}
            onOpenTour={() => {
              setGuideOpen(false);
              setTourOpen(true);
            }}
            go={go}
          />
        )}
        <Toaster />
        <Analytics />
        <footer>
          Research prototype on a simulated fork. Not financial advice. Do not connect real funds until the system has been reviewed by
          security professionals.
        </footer>
      </div>
    </div>
  );
}
