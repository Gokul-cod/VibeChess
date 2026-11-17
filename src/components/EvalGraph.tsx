import { useRef } from 'react';

interface EvalGraphProps {
  values: number[]; // win % for White after each position (index 0 = start)
  current: number;
  keyMoments: number[];
  onSeek: (ply: number) => void;
}

export function EvalGraph({ values, current, keyMoments, onSeek }: EvalGraphProps) {
  const ref = useRef<SVGSVGElement>(null);
  const total = Math.max(1, values.length - 1);

  const points = values.map((value, index) => {
    const x = (index / total) * 100;
    const y = 100 - Math.max(3, Math.min(97, value));
    return { x, y };
  });

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const area = `${line} L 100 100 L 0 100 Z`;
  const cursorX = (Math.min(current, total) / total) * 100;
  const cursorPoint = points[Math.min(current, total)];

  const handleSeek = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    onSeek(Math.round(ratio * total));
  };

  return (
    <div className="evalgraph">
      <div className="evalgraph__labels">
        <span>White</span>
        <span>Evaluation</span>
        <span>Black</span>
      </div>
      <svg
        ref={ref}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="evalgraph__svg"
        onClick={handleSeek}
        role="img"
        aria-label="Evaluation graph. Click to jump to a move."
      >
        <defs>
          <linearGradient id="evalFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f0b264" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#f0b264" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" className="evalgraph__bg" />
        <line x1="0" y1="50" x2="100" y2="50" className="evalgraph__mid" />
        <path d={area} fill="url(#evalFill)" />
        <path d={line} className="evalgraph__line" vectorEffect="non-scaling-stroke" />
        {keyMoments.map((ply) => {
          const point = points[Math.min(ply, total)];
          if (!point) return null;
          return <circle key={ply} cx={point.x} cy={point.y} r="1.4" className="evalgraph__moment" />;
        })}
        {cursorPoint && (
          <>
            <line x1={cursorX} y1="0" x2={cursorX} y2="100" className="evalgraph__cursor" vectorEffect="non-scaling-stroke" />
            <circle cx={cursorX} cy={cursorPoint.y} r="2.2" className="evalgraph__dot" />
          </>
        )}
      </svg>
    </div>
  );
}
