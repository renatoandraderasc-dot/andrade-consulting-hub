import { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export type KpiTone = "neutral" | "good" | "warn" | "bad";

const toneClass: Record<KpiTone, string> = {
  neutral: "text-muted-foreground",
  good: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-destructive",
};

interface KpiCardProps {
  icon: ReactNode;
  title: string;
  value: string;
  context?: string;
  tone?: KpiTone;
  trend?: number | null;
  loading?: boolean;
}

export default function KpiCard({ icon, title, value, context, tone = "neutral", trend, loading }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 rounded-lg bg-secondary text-primary flex items-center justify-center border border-border">
          {icon}
        </div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
      </div>

      {loading ? (
        <>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-52" />
        </>
      ) : (
        <>
          <p className={`text-2xl font-semibold tabular-nums ${tone === "neutral" ? "text-foreground" : toneClass[tone]}`}>
            {value}
          </p>
          <div className={`flex items-center gap-1 text-xs ${toneClass[tone]}`}>
            {trend != null && trend !== 0 && (
              trend > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
            )}
            <span>{context}</span>
          </div>
        </>
      )}
    </div>
  );
}
