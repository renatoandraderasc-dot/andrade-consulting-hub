interface Props {
  pct: number;
  className?: string;
}

/**
 * Discrete status chip (BI style): dot + short label, semantic color only in text/dot.
 */
export default function StatusStamp({ pct, className = "" }: Props) {
  const status =
    pct >= 100
      ? { text: "Acima da meta", tone: "text-success", dot: "bg-success" }
      : pct >= 80
      ? { text: "Atenção", tone: "text-warning", dot: "bg-warning" }
      : { text: "Abaixo", tone: "text-danger", dot: "bg-danger" };
  return (
    <span
      className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border border-border bg-card text-[11px] font-medium uppercase tracking-wider ${status.tone} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
      {status.text}
    </span>
  );
}
