import { winPercent } from '../lib/chess';

interface EvalBarProps {
  cp: number | null;
  mate: number | null;
  label: string;
}

export function EvalBar({ cp, mate, label }: EvalBarProps) {
  const white = winPercent(cp, mate);
  const clamped = Math.max(2, Math.min(98, white));
  return (
    <div className="evalbar" title={`White winning chances: ${Math.round(white)}%`}>
      <div className="evalbar__black" style={{ height: `${100 - clamped}%` }}>
        <span>{label && Number(cp) < 0 ? label : ''}</span>
      </div>
      <div className="evalbar__white" style={{ height: `${clamped}%` }}>
        <span>{label && Number(cp) >= 0 ? label : ''}</span>
      </div>
      <div className="evalbar__mid" />
    </div>
  );
}
