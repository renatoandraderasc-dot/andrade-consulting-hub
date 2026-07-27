interface Props {
  label?: string;
  className?: string;
}
/** Section title with a discrete 1px underline. No dotted dividers. */
export default function CouponDivider({ label, className = "" }: Props) {
  return (
    <div className={`mt-8 mb-4 ${className}`}>
      {label && (
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-2">
          {label}
        </div>
      )}
      <div className="h-px w-full bg-border" />
    </div>
  );
}
