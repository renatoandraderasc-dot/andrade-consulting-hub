import { ReactNode } from "react";
import { ArrowUp, ArrowDown } from "lucide-react";

interface PriceTagCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  /** Small delta chip beside the sub line. Colored via `tone`. */
  badge?: { text: string; tone?: "success" | "warning" | "danger" | "neutral" };
  /** Kept for API compatibility — no longer renders a colored ribbon. */
  ribbonTone?: "yellow" | "red" | "green" | "ink" | "success" | "warning" | "danger" | "neutral";
  icon?: ReactNode;
  className?: string;
  /** Optional progress %, 0..100+. Rendered as a slim 4px bar with the pct as text. */
  progressPct?: number;
}

const toneText: Record<string, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  neutral: "text-muted-foreground",
};

const toneBar: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  neutral: "bg-muted-foreground/60",
};

function pctTone(p?: number): "success" | "warning" | "danger" | "neutral" {
  if (p == null) return "neutral";
  if (p >= 100) return "success";
  if (p >= 80) return "warning";
  return "danger";
}

export default function PriceTagCard({
  label,
  value,
  sub,
  badge,
  icon,
  className = "",
  progressPct,
}: PriceTagCardProps) {
  const tone = badge?.tone ?? "neutral";
  const isDelta =
    badge && (badge.text.trim().startsWith("+") || badge.text.trim().startsWith("-"));
  const deltaUp = badge?.text.trim().startsWith("+");
  const barTone = toneBar[pctTone(progressPct)];
  const barPct = Math.max(0, Math.min(progressPct ?? 0, 100));

  return (
    <div
      className={`rounded-lg bg-card border border-border p-5 flex flex-col gap-3 ${className}`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon && <span className="inline-flex items-center">{icon}</span>}
        <span className="text-[11px] uppercase tracking-wider font-medium">{label}</span>
      </div>

      <div className="text-[32px] leading-none font-semibold tabular text-foreground break-words">
        {value}
      </div>

      {(sub || badge) && (
        <div className="flex items-center justify-between gap-3 min-h-[20px]">
          {sub && (
            <span className="text-xs text-muted-foreground tabular">{sub}</span>
          )}
          {badge && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium tabular ${toneText[tone]}`}
            >
              {isDelta &&
                (deltaUp ? (
                  <ArrowUp className="w-3 h-3" strokeWidth={2.5} />
                ) : (
                  <ArrowDown className="w-3 h-3" strokeWidth={2.5} />
                ))}
              {badge.text}
            </span>
          )}
        </div>
      )}

      {progressPct != null && (
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full ${barTone} transition-all duration-500`}
              style={{ width: `${barPct}%` }}
            />
          </div>
          <span className="text-[11px] text-muted-foreground tabular min-w-[36px] text-right">
            {progressPct.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
