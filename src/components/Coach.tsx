import type { Mood } from '../types';

interface CoachProps {
  mood: Mood;
  size?: number;
  animated?: boolean;
}

/** Cocoa — the café owl who reviews your games. */
export function Cocoa({ mood, size = 96, animated = true }: CoachProps) {
  const pupil = {
    proud: { x: 0, y: -1.2 },
    happy: { x: 0, y: 0 },
    neutral: { x: 0, y: 0.4 },
    thinking: { x: -1.8, y: -1.4 },
    worried: { x: 0.6, y: 1.4 },
    alarmed: { x: 0, y: 0.6 },
  }[mood];

  const brow = {
    proud: { left: -8, right: 8 },
    happy: { left: -4, right: 4 },
    neutral: { left: 0, right: 0 },
    thinking: { left: -10, right: 2 },
    worried: { left: 8, right: -8 },
    alarmed: { left: 12, right: -12 },
  }[mood];

  const beak =
    mood === 'alarmed'
      ? 'M 50 58 L 58 70 L 50 78 L 42 70 Z'
      : mood === 'proud' || mood === 'happy'
        ? 'M 50 60 L 58 69 L 50 74 L 42 69 Z'
        : 'M 50 60 L 57 68 L 50 73 L 43 68 Z';

  return (
    <svg
      className={`cocoa${animated ? ' cocoa--animated' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Cocoa the coach, looking ${mood}`}
    >
      <defs>
        <radialGradient id="cocoaBody" cx="35%" cy="25%" r="85%">
          <stop offset="0%" stopColor="#a9704a" />
          <stop offset="55%" stopColor="#84532f" />
          <stop offset="100%" stopColor="#5c3720" />
        </radialGradient>
        <radialGradient id="cocoaBelly" cx="50%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#f6e3c4" />
          <stop offset="100%" stopColor="#d9b98d" />
        </radialGradient>
        <linearGradient id="cocoaScarf" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#e39a4b" />
          <stop offset="100%" stopColor="#b4512a" />
        </linearGradient>
        <radialGradient id="cocoaGlow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="rgba(237,166,79,0)" />
          <stop offset="100%" stopColor="rgba(237,166,79,0.22)" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="48" fill="url(#cocoaGlow)" />
      <circle cx="50" cy="52" r="40" fill="#2a1a11" opacity="0.55" />

      {/* ear tufts */}
      <path d="M26 34 L22 18 L36 27 Z" fill="#6d4226" />
      <path d="M74 34 L78 18 L64 27 Z" fill="#6d4226" />

      {/* body */}
      <ellipse cx="50" cy="58" rx="30" ry="30" fill="url(#cocoaBody)" />
      <ellipse cx="50" cy="64" rx="18" ry="21" fill="url(#cocoaBelly)" />

      {/* wings */}
      <ellipse cx="23" cy="58" rx="8" ry="16" fill="#6f4528" transform="rotate(-10 23 58)" />
      <ellipse cx="77" cy="58" rx="8" ry="16" fill="#6f4528" transform="rotate(10 77 58)" />

      {/* head */}
      <ellipse cx="50" cy="41" rx="27" ry="24" fill="url(#cocoaBody)" />

      {/* facial disc */}
      <ellipse cx="38.5" cy="41" rx="13" ry="12.5" fill="#f0dcbd" opacity="0.95" />
      <ellipse cx="61.5" cy="41" rx="13" ry="12.5" fill="#f0dcbd" opacity="0.95" />

      {mood === 'alarmed' ? (
        <>
          <circle cx="38.5" cy="41" r="9.6" fill="#fbefd9" />
          <circle cx="61.5" cy="41" r="9.6" fill="#fbefd9" />
        </>
      ) : (
        <>
          <circle cx="38.5" cy="41" r="8.4" fill="#fbefd9" />
          <circle cx="61.5" cy="41" r="8.4" fill="#fbefd9" />
        </>
      )}

      {/* irises */}
      <circle cx={38.5 + pupil.x} cy={41 + pupil.y} r="5.2" fill="#d9852f" />
      <circle cx={61.5 + pupil.x} cy={41 + pupil.y} r="5.2" fill="#d9852f" />
      <circle cx={38.5 + pupil.x} cy={41 + pupil.y} r="2.5" fill="#241409" />
      <circle cx={61.5 + pupil.x} cy={41 + pupil.y} r="2.5" fill="#241409" />
      <circle cx={36.9 + pupil.x} cy={39.2 + pupil.y} r="1.1" fill="#fff6e6" opacity="0.9" />
      <circle cx={59.9 + pupil.x} cy={39.2 + pupil.y} r="1.1" fill="#fff6e6" opacity="0.9" />

      {/* brows */}
      <path
        d={`M29 ${31 + brow.left * 0.1} Q35 ${28 + brow.left * 0.35} 43 ${31 - brow.left * 0.15}`}
        stroke="#4d2d18"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d={`M57 ${31 + brow.right * 0.15} Q65 ${28 - brow.right * 0.35} 71 ${31 - brow.right * 0.1}`}
        stroke="#4d2d18"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />

      {/* beak */}
      <path d={beak} fill="#e0a04c" stroke="#b4712f" strokeWidth="1" strokeLinejoin="round" />

      {/* scarf */}
      <path d="M31 66 Q50 74 69 66 L67 72 Q50 79 33 72 Z" fill="url(#cocoaScarf)" />
      <path d="M47 73 L53 73 L56 86 L50 82 L44 86 Z" fill="#b4512a" />

      {mood === 'proud' && (
        <>
          <path d="M78 26 l2.2 5.2 5.6 0.6 -4.2 3.8 1.2 5.5 -4.8 -3 -4.8 3 1.2 -5.5 -4.2 -3.8 5.6 -0.6 Z" fill="#f3c879" />
        </>
      )}
    </svg>
  );
}
