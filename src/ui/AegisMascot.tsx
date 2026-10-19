export interface AegisMascotProps {
  mood?: 'alert' | 'warn' | 'success' | 'info';
  size?: number;
  className?: string;
  animate?: boolean;
}

export function AegisMascot({ mood = 'info', size = 42, className = '', animate = true }: AegisMascotProps) {
  const isAlert = mood === 'alert';
  const isWarn = mood === 'warn';
  const isHappy = !isAlert && !isWarn;

  // Theme colors based on mood
  const glowColor = isAlert ? '#ef4444' : isWarn ? '#f59e0b' : '#38bdf8';
  const eyeColor = isAlert ? '#fca5a5' : isWarn ? '#fde047' : '#38bdf8';
  const accentGradientId = `aegi-grad-${mood}`;
  const glowFilterId = `aegi-glow-${mood}`;

  return (
    <div
      className={`aegis-mascot-container ${animate ? 'mascot-floating' : ''} ${className}`}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="aegis-mascot-svg"
      >
        <defs>
          <linearGradient id={accentGradientId} x1="20" y1="10" x2="80" y2="90" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor={isAlert ? '#ef4444' : isWarn ? '#f59e0b' : '#38bdf8'} />
            <stop offset="100%" stopColor={isAlert ? '#dc2626' : isWarn ? '#d97706' : '#6366f1'} />
          </linearGradient>
          <filter id={glowFilterId} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Thruster Aura */}
        <ellipse cx="50" cy="90" rx="14" ry="4" fill={glowColor} opacity="0.4" filter={`url(#${glowFilterId})`} />
        <ellipse cx="50" cy="89" rx="8" ry="2.5" fill="#ffffff" opacity="0.7" />

        {/* Floating Hands */}
        {/* Right Hand */}
        <circle cx="76" cy="71" r="5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
        <circle cx="76" cy="71" r="2.5" fill={glowColor} opacity="0.8" />

        {/* Mini Shield held in Left Hand */}
        <g transform="translate(14, 62)">
          <path
            d="M 12 0 L 22 3 L 22 13 Q 17 19 12 22 Q 7 19 7 13 L 7 3 Z"
            fill={`url(#${accentGradientId})`}
            stroke="#ffffff"
            strokeWidth="1.2"
            filter={`url(#${glowFilterId})`}
          />
          <path d="M 12 4 L 17 6 L 17 12 Q 14 16 12 18 Q 10 16 10 12 L 10 6 Z" fill="#ffffff" opacity="0.3" />
          <path d="M 10 9 L 12 6 L 14 9" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <circle cx="28" cy="73" r="4.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />

        {/* Chibi Torso */}
        <rect x="37" y="65" width="26" height="20" rx="9" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
        {/* Chestplate Armor */}
        <path d="M 43 67 L 57 67 L 55 76 Q 50 80 45 76 Z" fill={`url(#${accentGradientId})`} opacity="0.2" />
        {/* Mini Chest Core / Aegis Chevron */}
        <circle cx="50" cy="73" r="3.2" fill={glowColor} filter={`url(#${glowFilterId})`} />
        <circle cx="50" cy="73" r="1.5" fill="#ffffff" />

        {/* Ear Wings / Antennas */}
        {/* Left Ear Wing */}
        <path
          d="M 23 38 C 14 33 13 45 22 49 Z"
          fill={`url(#${accentGradientId})`}
          stroke="#ffffff"
          strokeWidth="1.2"
        />
        {/* Right Ear Wing */}
        <path
          d="M 77 38 C 86 33 87 45 78 49 Z"
          fill={`url(#${accentGradientId})`}
          stroke="#ffffff"
          strokeWidth="1.2"
        />

        {/* Head Crest / Antenna */}
        <path d="M 48 18 L 52 18 L 51 9 L 49 9 Z" fill="#cbd5e1" />
        <circle cx="50" cy="8" r="4.5" fill={glowColor} filter={`url(#${glowFilterId})`} />
        <circle cx="50" cy="8" r="2" fill="#ffffff" />

        {/* Main Chibi Helmet */}
        <rect
          x="21"
          y="18"
          width="58"
          height="50"
          rx="24"
          fill="#f8fafc"
          stroke="#cbd5e1"
          strokeWidth="2"
        />
        {/* Helmet Top Specular Highlight */}
        <path d="M 32 23 Q 50 19 68 23" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />

        {/* Visor Screen */}
        <rect
          x="26"
          y="28"
          width="48"
          height="32"
          rx="14"
          fill="#090d16"
          stroke="#1e293b"
          strokeWidth="1.5"
        />

        {/* Visor Internal Glow */}
        <ellipse cx="50" cy="44" rx="20" ry="12" fill={glowColor} opacity="0.12" />

        {/* Expressive Digital Eyes & Face */}
        {isAlert && (
          /* Alert / Determined Guardian Eyes */
          <g>
            {/* Angry / Determined Brows */}
            <path d="M 32 37 L 44 41" stroke={eyeColor} strokeWidth="2" strokeLinecap="round" />
            <path d="M 68 37 L 56 41" stroke={eyeColor} strokeWidth="2" strokeLinecap="round" />
            {/* Sharp Eyes */}
            <polygon points="34,42 43,45 35,49" fill={eyeColor} filter={`url(#${glowFilterId})`} />
            <polygon points="66,42 57,45 65,49" fill={eyeColor} filter={`url(#${glowFilterId})`} />
            <circle cx="38" cy="44" r="1.2" fill="#ffffff" />
            <circle cx="62" cy="44" r="1.2" fill="#ffffff" />
            {/* Serious small mouth */}
            <path d="M 47 52 L 53 52" stroke={eyeColor} strokeWidth="1.6" strokeLinecap="round" />
          </g>
        )}

        {isWarn && (
          /* Warning / Alert Watchful Eyes */
          <g>
            {/* Wide Curious Eyes */}
            <circle cx="38" cy="43" r="5" fill={eyeColor} filter={`url(#${glowFilterId})`} />
            <circle cx="62" cy="43" r="5" fill={eyeColor} filter={`url(#${glowFilterId})`} />
            {/* Big Catchlights */}
            <circle cx="36.5" cy="41.5" r="1.8" fill="#ffffff" />
            <circle cx="60.5" cy="41.5" r="1.8" fill="#ffffff" />
            <circle cx="40" cy="44.5" r="0.9" fill="#ffffff" />
            <circle cx="64" cy="44.5" r="0.9" fill="#ffffff" />
            {/* Small surprise 'o' mouth */}
            <ellipse cx="50" cy="52" rx="2" ry="2.5" fill={eyeColor} />
          </g>
        )}

        {isHappy && (
          /* Success / Happy Friendly Eyes */
          <g>
            {/* Joyful Arch Eyes */}
            <path
              d="M 33 45 Q 38 37 43 45"
              fill="none"
              stroke={eyeColor}
              strokeWidth="2.8"
              strokeLinecap="round"
              filter={`url(#${glowFilterId})`}
            />
            <path
              d="M 57 45 Q 62 37 67 45"
              fill="none"
              stroke={eyeColor}
              strokeWidth="2.8"
              strokeLinecap="round"
              filter={`url(#${glowFilterId})`}
            />
            {/* Rosy Cheeks */}
            <circle cx="31" cy="49" r="3.2" fill="#ec4899" opacity="0.6" filter={`url(#${glowFilterId})`} />
            <circle cx="69" cy="49" r="3.2" fill="#ec4899" opacity="0.6" filter={`url(#${glowFilterId})`} />
            {/* Sweet Smiling Mouth */}
            <path d="M 46 49 Q 50 54 54 49" fill="none" stroke={eyeColor} strokeWidth="2" strokeLinecap="round" />
            {/* Cute Sparkle near eye */}
            <path d="M 48 35 L 50 32 L 52 35 L 50 38 Z" fill="#ffffff" opacity="0.8" />
          </g>
        )}
      </svg>
    </div>
  );
}
