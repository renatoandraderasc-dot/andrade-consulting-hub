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

/** Tela cheia de carregamento: bloqueia a tela ate o processo terminar. */
export function CartProgressOverlay({ value, label, detail }: CartProgressProps) {
  const auto = useAutoProgress(value === undefined);
  const pct = Math.max(0, Math.min(100, Math.round(value ?? auto)));

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-background">
      <img src={logo} alt="Andrade Consultoria" className="h-20 w-auto object-contain opacity-95" />

      <div className="relative" style={{ width: 180, height: 150 }}>
        {[0, 1, 2, 3].map((i) => (
          <img
            key={i}
            src={logo}
            alt=""
            aria-hidden
            className="absolute left-1/2 h-8 w-8 -translate-x-1/2 rounded-full bg-card p-1 shadow"
            style={{ animation: `cart-drop 1.5s ${i * 0.35}s cubic-bezier(.5,.05,.6,1) infinite` }}
          />
        ))}
        <ShoppingCart
          className="absolute bottom-0 left-1/2 h-24 w-24 -translate-x-1/2 text-primary"
          style={{ animation: "cart-bump 1.5s ease-in-out infinite" }}
        />
      </div>

      <div className="w-[min(520px,86vw)] text-center">
        <p className="text-lg font-semibold text-foreground">{label ?? "Atualizando dados..."}</p>
        {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
        <div className="mt-5 h-3 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-3 text-3xl font-bold tabular-nums text-primary">{pct}%</p>
      </div>

      <style>{`
        @keyframes cart-drop {
          0%   { transform: translate(-50%, -20px) scale(.7); opacity: 0; }
          20%  { opacity: 1; }
          70%  { transform: translate(-50%, 78px) scale(1); opacity: 1; }
          85%  { transform: translate(-50%, 92px) scale(.5); opacity: 0; }
          100% { transform: translate(-50%, 92px) scale(.5); opacity: 0; }
        }
        @keyframes cart-bump {
          0%, 60%, 100% { transform: translate(-50%, 0); }
          72% { transform: translate(-50%, 5px); }
          84% { transform: translate(-50%, -2px); }
        }
      `}</style>
    </div>
  );
}

export default CartProgress;
