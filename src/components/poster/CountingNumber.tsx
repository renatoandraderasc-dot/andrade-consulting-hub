import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  format?: (v: number) => string;
  durationMs?: number;
  className?: string;
}

export default function CountingNumber({
  value,
  format = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
  durationMs = 800,
  className = "",
}: Props) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = previous.current;
    const to = value;
    if (from === to) {
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else previous.current = to;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  return <span className={`tabular ${className}`}>{format(display)}</span>;
}
