import { useEffect, useState } from "react";
import { ShoppingCart } from "lucide-react";
import logo from "@/assets/andrade-logo.png";
import { cn } from "@/lib/utils";

/**
 * Barra de progresso padrao do app: % + carrinho de compras com produtos
 * "caindo" dentro do carrinho, usando a logotipo da empresa como base.
 */
export interface CartProgressProps {
  /** 0-100. Se omitido, usa progresso automatico (indeterminado). */
  value?: number;
  label?: string;
  detail?: string;
  className?: string;
  compact?: boolean;
}

/** Progresso automatico que avanca ate 95% enquanto o processo roda. */
export function useAutoProgress(active: boolean, ceiling = 95) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    if (!active) {
      setPct(100);
      const t = setTimeout(() => setPct(0), 600);
      return () => clearTimeout(t);
    }
    setPct(6);
    const id = setInterval(() => {
      setPct((p) => (p >= ceiling ? p : p + Math.max(0.4, (ceiling - p) * 0.06)));
    }, 350);
    return () => clearInterval(id);
  }, [active, ceiling]);
  return Math.min(100, Math.round(pct));
}

export function CartProgress({ value, label, detail, className, compact }: CartProgressProps) {
  const auto = useAutoProgress(value === undefined);
  const pct = Math.max(0, Math.min(100, Math.round(value ?? auto)));

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("flex items-center gap-3", compact ? "mb-1.5" : "mb-2")}>
        <div className="relative shrink-0" style={{ width: compact ? 44 : 60, height: compact ? 40 : 54 }}>
          {/* produtos entrando no carrinho */}
          {[0, 1, 2].map((i) => (
            <img
              key={i}
              src={logo}
              alt=""
              aria-hidden
              className="absolute left-1/2 -translate-x-1/2 rounded-full shadow-sm"
              style={{
                width: compact ? 12 : 16,
                height: compact ? 12 : 16,
                animation: `cart-drop 1.4s ${i * 0.45}s cubic-bezier(.5,.05,.6,1) infinite`,
              }}
            />
          ))}
          <ShoppingCart
            className="absolute bottom-0 left-1/2 -translate-x-1/2 text-primary"
            style={{ width: compact ? 24 : 32, height: compact ? 24 : 32, animation: "cart-bump 1.4s ease-in-out infinite" }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={cn("truncate font-medium text-foreground", compact ? "text-xs" : "text-sm")}>
              {label ?? "Atualizando dados..."}
            </p>
            <span className={cn("font-bold tabular-nums text-primary", compact ? "text-xs" : "text-sm")}>{pct}%</span>
          </div>
          {detail && <p className="truncate text-[11px] text-muted-foreground">{detail}</p>}
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      <style>{`
        @keyframes cart-drop {
          0%   { transform: translate(-50%, -120%) scale(.7); opacity: 0; }
          25%  { opacity: 1; }
          70%  { transform: translate(-50%, 45%) scale(1); opacity: 1; }
          85%  { transform: translate(-50%, 55%) scale(.6); opacity: 0; }
          100% { transform: translate(-50%, 55%) scale(.6); opacity: 0; }
        }
        @keyframes cart-bump {
          0%, 60%, 100% { transform: translate(-50%, 0); }
          72% { transform: translate(-50%, 3px); }
          84% { transform: translate(-50%, -1px); }
        }
      `}</style>
    </div>
  );
}

/** Overlay de tela cheia para processos longos. */
export function CartProgressOverlay({ value, label, detail }: CartProgressProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-[min(420px,90vw)] rounded-xl border bg-card p-6 shadow-lg">
        <CartProgress value={value} label={label} detail={detail} />
      </div>
    </div>
  );
}

export default CartProgress;
