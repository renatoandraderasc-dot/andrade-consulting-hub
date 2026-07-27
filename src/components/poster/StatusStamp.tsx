interface Props {
  pct: number;
  className?: string;
}
export default function StatusStamp({ pct, className = "" }: Props) {
  const status =
    pct >= 100
      ? { text: "BATEU A META", tone: "bg-gondola-green text-white border-gondola-green" }
      : pct >= 80
      ? { text: "QUASE LÁ", tone: "bg-poster-yellow text-ink border-ink" }
      : { text: "ABAIXO", tone: "bg-offer-red text-white border-offer-red" };
  return (
    <span
      className={`inline-flex items-center justify-center px-3 py-1 border-2 font-condensed font-bold text-[11px] uppercase tracking-widest ${status.tone} ${className}`}
      style={{ clipPath: "polygon(8px 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 8px 100%, 0 50%)" }}
    >
      {status.text}
    </span>
  );
}
