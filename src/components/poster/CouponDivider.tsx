interface Props {
  label?: string;
  className?: string;
}
export default function CouponDivider({ label, className = "" }: Props) {
  return (
    <div className={`flex items-center gap-3 my-4 ${className}`}>
      <div className="picote flex-1" />
      {label && (
        <span className="font-condensed uppercase tracking-widest text-[10px] font-bold text-muted-foreground whitespace-nowrap">
          {label}
        </span>
      )}
      <div className="picote flex-1" />
    </div>
  );
}
