import { useLayoutEffect, useRef, useState } from "react";

export default function ScaledSlide({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setScale(Math.min(entry.contentRect.width / 1920, entry.contentRect.height / 1080));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} className={`presentation-scale ${className}`}><div className="presentation-scaled-content" style={{ transform: `scale(${scale})` }}>{children}</div></div>;
}