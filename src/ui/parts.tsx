import { useState, type ReactNode } from 'react';

export function Card({
  title,
  right,
  children,
  className = '',
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <header className="card-h">
          <h3>{title}</h3>
          <div>{right}</div>
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({
  tone = 'neutral',
  children,
  title,
}: {
  tone?: 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`badge ${tone}`} title={title}>
      {children}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  kind = 'default',
  disabled,
  title,
  busy,
}: {
  children: ReactNode;
  onClick?: () => unknown;
  kind?: 'default' | 'primary' | 'danger' | 'ghost';
  disabled?: boolean;
  title?: string;
  busy?: boolean;
}) {
  return (
    <button className={`btn ${kind}`} onClick={() => void onClick?.()} disabled={disabled || busy} title={title}>
      {busy ? '…' : children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: ReactNode; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** Half-circle health factor gauge. Zones follow the user's policy: liquidation, trigger, warn. */
export function Gauge({
  hf,
  trigger,
  warn,
  target,
  max = 2.5,
  size = 200,
}: {
  hf: number;
  trigger: number;
  warn: number;
  target: number;
  max?: number;
  size?: number;
}) {
  const w = size;
  const cx = w / 2;
  const cy = w / 2 + 10;
  const r = w / 2 - 16;
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  const ang = (v: number) => Math.PI * (1 - clamp(v) / max);
  const pt = (v: number, rad = r) => [cx + rad * Math.cos(ang(v)), cy - rad * Math.sin(ang(v))];
  const arc = (a: number, b: number) => {
    const [x1, y1] = pt(a);
    const [x2, y2] = pt(b);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const zones: [number, number, string][] = [
    [0, 1, 'var(--bad)'],
    [1, trigger, 'var(--orange)'],
    [trigger, warn, 'var(--warn)'],
    [warn, max, 'var(--ok)'],
  ];
  const finite = Number.isFinite(hf);
  const v = finite ? hf : max;
  const [nx, ny] = pt(v, r - 6);
  const color = !finite ? 'var(--muted)' : hf < 1 ? 'var(--bad)' : hf < trigger ? 'var(--orange)' : hf < warn ? 'var(--warn)' : 'var(--ok)';
  const [tx, ty] = pt(target, r + 9);
  return (
    <svg
      viewBox={`0 0 ${w} ${w / 2 + 40}`}
      width="100%"
      style={{ maxWidth: size }}
      role="img"
      aria-label={`Health factor ${finite ? hf.toFixed(2) : 'infinite'}`}
    >
      {zones.map(([a, b, c], i) => (
        <path key={i} d={arc(a, b)} stroke={c} strokeWidth={11} fill="none" opacity={0.85} />
      ))}
      <circle cx={tx} cy={ty} r={3} fill="var(--accent)" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={color} strokeWidth={3} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={6} fill={color} />
      <text x={cx} y={cy + 28} textAnchor="middle" fontSize="22" fontWeight={700} fill={color}>
        {finite ? hf.toFixed(2) : '∞'}
      </text>
    </svg>
  );
}

export function Spark({
  series,
  colors,
  height = 70,
  floor = 1,
}: {
  series: { name: string; values: number[] }[];
  colors: string[];
  height?: number;
  floor?: number;
}) {
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  if (all.length < 2) return <div className="muted small">Not enough data yet. Press Live or Step.</div>;
  const lo = Math.min(floor - 0.1, ...all);
  const hi = Math.max(...all, floor + 0.2);
  const W = 300;
  const x = (i: number, n: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => height - ((v - lo) / (hi - lo || 1)) * (height - 6) - 3;
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label="Health factor history"
    >
      <line x1={0} x2={W} y1={y(floor)} y2={y(floor)} stroke="var(--bad)" strokeDasharray="3 3" opacity={0.6} />
      {series.map((s, k) => (
        <polyline
          key={s.name}
          fill="none"
          stroke={colors[k]}
          strokeWidth={2}
          points={s.values.map((v, i) => `${x(i, s.values.length)},${y(Math.min(v, hi))}`).join(' ')}
        />
      ))}
    </svg>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

const ICONS: Record<string, string> = {
  dashboard: 'M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z',
  agent: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 1 1 21 11.5z',
  yield: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
  lab: 'M9 3h6M10 3v6L4 20a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 20l-6-11V3',
  shield: 'M12 2l8 3v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V5l8-3z',
  stop: 'M8 2h8l6 6v8l-6 6H8l-6-6V8z',
  play: 'M6 4l14 8-14 8z',
  step: 'M5 4l10 8-10 8zM19 4v16',
  key: 'M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  monitor: 'M2 4h20v12H2zM8 20h8M12 16v4',
  check: 'M20 6 9 17l-5-5',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7V6a2 2 0 0 1 2-2h12M16 14h2',
  coins:
    'M8 8a5 3 0 1 0 0-6 5 3 0 0 0 0 6zM3 5v4c0 1.7 2.2 3 5 3M3 9v4c0 1.7 2.2 3 5 3M16 21a5 3 0 1 0 0-6 5 3 0 0 0 0 6zM11 18v-4c0-1.7 2.2-3 5-3s5 1.3 5 3v4',
  pulse: 'M3 12h4l3-8 4 16 3-8h4',
  chain: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
  sparkles: 'M12 3v3m0 12v3m9-9h-3M6 12H3m14.5-6.5l-2.1 2.1M8.6 15.4l-2.1 2.1m11-2.1l-2.1-2.1M8.6 8.6L6.5 6.5',
  tour: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  close: 'M18 6L6 18M6 6l12 12',
  arrowRight: 'M5 12h14M12 5l7 7-7 7',
  arrowLeft: 'M19 12H5M12 19l-7-7 7-7',
};
export function Icon({ name, size = 18 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={ICONS[name] ?? ''} />
    </svg>
  );
}

export function HfStatusBadge({
  hf,
  trigger = 1.15,
  warn = 1.25,
}: {
  hf: number;
  trigger?: number;
  warn?: number;
}) {
  if (!Number.isFinite(hf)) return null;
  const isAtRisk = hf < trigger;
  const isWatch = !isAtRisk && hf < warn;
  const label = isAtRisk ? 'At risk' : isWatch ? 'Watch' : 'Safe';
  const tone = isAtRisk ? 'bad' : isWatch ? 'warn' : 'ok';
  const icon = isAtRisk ? 'stop' : isWatch ? 'pulse' : 'shield';

  return (
    <span className={`hf-badge ${tone}`} title={`Status: ${label} · Trigger ${trigger} · Warn ${warn}`}>
      <Icon name={icon} size={11} />
      <span>{label}</span>
    </span>
  );
}

export function HelpTooltip({ text }: { text: string }) {
  return (
    <span className="help-tip" tabIndex={0} role="note" aria-label={text} title={text}>
      ?
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
  icon,
  badge,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'ok' | 'warn' | 'bad';
  icon?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-l">
        <span className="stat-l-main">
          {icon && <Icon name={icon} size={14} />}
          {label}
        </span>
        {badge}
      </div>
      <div className={`stat-v ${tone ?? ''}`}>{value}</div>
      {sub && <div className="stat-s">{sub}</div>}
    </div>
  );
}

export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="AegisAgent logo">
      <defs>
        <linearGradient id="aegis-g" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <path d="M32 3.5 56 12v18.5C56 45.5 46 55.5 32 60.5 18 55.5 8 45.5 8 30.5V12z" fill="url(#aegis-g)" />
      <path d="M32 3.5 56 12v18.5C56 45.5 46 55.5 32 60.5V3.5z" fill="#fff" opacity=".12" />
      <path d="M21.5 45 32 19l10.5 26M26 37h12" fill="none" stroke="#fff" strokeWidth="4.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="32" cy="16.5" r="3.6" fill="#fff" />
      <circle cx="32" cy="16.5" r="1.4" fill="#6366f1" />
    </svg>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="copy"
      title={label}
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1200);
          },
          () => undefined,
        );
      }}
    >
      <Icon name={done ? 'check' : 'copy'} size={13} />
    </button>
  );
}

export function Meter({ value, max, tone }: { value: number; max: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const pct = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  const t = tone ?? (pct > 90 ? 'bad' : pct > 70 ? 'warn' : 'ok');
  return (
    <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span className={t} style={{ width: `${pct}%` }} />
    </div>
  );
}
