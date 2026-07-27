import { ReactNode } from "react";

interface PriceTagCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  badge?: { text: string; tone?: "green" | "red" | "yellow" | "ink" };
  ribbonTone?: "yellow" | "red" | "green" | "ink";
  icon?: ReactNode;
  className?: string;
}

const ribbonClass: Record<string, string> = {
  yellow: "bg-poster-yellow text-ink",
  red: "bg-offer-red text-white",
  green: "bg-gondola-green text-white",
  ink: "bg-ink text-paper",
};

const badgeClass: Record<string, string> = {
  green: "bg-gondola-green text-white border-gondola-green",
  red: "bg-offer-red text-white border-offer-red",
  yellow: "bg-poster-yellow text-ink border-ink",
  ink: "bg-ink text-paper border-ink",
};

export default function PriceTagCard({
  label,
  value,
  sub,
  badge,
  ribbonTone = "yellow",
  icon,
  className = "",
}: PriceTagCardProps) {
  return (
    <div className={`relative ${className}`}>
      <div className="clip-tag-lg bg-card border-2 border-ink shadow-md">
        <div
          className={`clip-tag-lg h-8 flex items-center px-4 uppercase tracking-widest text-[11px] font-bold font-condensed ${ribbonClass[ribbonTone]}`}
        >
          {icon && <span className="mr-2 inline-flex items-center">{icon}</span>}
          {label}
        </div>
        <div className="px-5 pt-4 pb-5 min-h-[110px] flex flex-col justify-between">
          <div className="font-price text-4xl md:text-5xl leading-none text-ink dark:text-foreground break-words">
            {value}
          </div>
          {sub && (
            <div className="mt-3 text-[11px] uppercase tracking-wider font-condensed font-semibold text-muted-foreground">
              {sub}
            </div>
          )}
        </div>
      </div>

      {badge && (
        <div
          className={`absolute -top-3 -right-3 h-14 w-14 rounded-full border-2 flex flex-col items-center justify-center text-center font-condensed font-bold leading-none shadow-sm ${badgeClass[badge.tone || "yellow"]}`}
        >
          <span className="text-[9px] uppercase tracking-wider opacity-80">de/por</span>
          <span className="text-sm mt-0.5">{badge.text}</span>
        </div>
      )}
    </div>
  );
}
