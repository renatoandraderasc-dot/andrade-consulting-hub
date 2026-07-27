interface Props {
  pct: number; // 0..100+
  label?: string;
  className?: string;
}

function tone(pct: number) {
  if (pct >= 100) return "bg-success";
  if (pct >= 80) return "bg-warning";
  return "bg-danger";
}

/**
 * Slim BI progress bar: 4px track, no text inside. Percentage is shown as
 * external text next to (or above) the bar.
 */
export default function Thermometer({ pct, label, className = "" }: Props) {
  const width = Math.max(0, Math.min(pct, 100));
  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <span className="text-[11px] tabular text-muted-foreground">{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
          <div className={`h-full ${tone(pct)} transition-all duration-500`} style={{ width: `${width}%` }} />
        </div>
        {!label && (
          <span className="text-[11px] tabular text-muted-foreground min-w-[36px] text-right">
            {pct.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
