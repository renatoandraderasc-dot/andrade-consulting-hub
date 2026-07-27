interface Props {
  pct: number; // 0..100+
  label?: string;
  className?: string;
}
export default function Thermometer({ pct, label, className = "" }: Props) {
  const clamped = Math.max(0, Math.min(pct, 130));
  const width = Math.min(clamped, 100);
  const tone =
    pct >= 100 ? "bg-gondola-green" : pct >= 80 ? "bg-poster-yellow" : "bg-offer-red";
  const textOnBar =
    pct >= 100 ? "text-white" : pct >= 80 ? "text-ink" : "text-white";
  return (
    <div className={className}>
      {label && (
        <div className="flex items-center justify-between mb-1">
          <span className="font-condensed uppercase text-[10px] tracking-widest font-bold text-muted-foreground">
            {label}
          </span>
          <span className="font-price text-sm tabular">{pct.toFixed(0)}%</span>
        </div>
      )}
      <div className="relative h-6 border-2 border-ink bg-paper-shade overflow-hidden">
        <div
          className={`h-full ${tone} transition-all duration-500 flex items-center justify-end pr-2`}
          style={{ width: `${width}%` }}
        >
          {width > 20 && (
            <span className={`font-condensed font-bold text-[11px] uppercase ${textOnBar}`}>
              {pct.toFixed(0)}%
            </span>
          )}
        </div>
        {width <= 20 && (
          <span className="absolute inset-0 flex items-center justify-center font-condensed font-bold text-[11px] uppercase text-ink dark:text-foreground">
            {pct.toFixed(0)}%
          </span>
        )}
      </div>
    </div>
  );
}
