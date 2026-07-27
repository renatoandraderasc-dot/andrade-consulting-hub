import { useMemo, useState } from "react";

interface Props {
  pct: number; // % da meta
  compact?: boolean;
}

/**
 * Persona "Dona Oferta": mascote de cartaz de supermercado.
 * Feliz quando bate meta, neutra em zona amarela, triste quando abaixo.
 */
export default function MascotPersona({ pct, compact = false }: Props) {
  const [hovered, setHovered] = useState(false);

  const mood = pct >= 100 ? "happy" : pct >= 80 ? "neutral" : "sad";
  const message = useMemo(() => {
    if (mood === "happy") {
      const opts = [
        "UHUL! Bateu a meta! 🎉",
        "Isso, gente! Meta na conta!",
        "Cartaz brilhando: OFERTA IMBATÍVEL!",
      ];
      return opts[Math.floor(pct) % opts.length];
    }
    if (mood === "neutral") {
      return `Quase lá! Faltam ${(100 - pct).toFixed(1)}% pra bater a meta.`;
    }
    const opts = [
      `Poxa... estamos ${(100 - pct).toFixed(1)}% abaixo da meta.`,
      "Bora movimentar a gôndola?",
      "Tá difícil o mês, mas vamos virar!",
    ];
    return opts[Math.floor(pct) % opts.length];
  }, [mood, pct]);

  const ringTone =
    mood === "happy" ? "bg-gondola-green" : mood === "neutral" ? "bg-poster-yellow" : "bg-offer-red";
  const cheek = mood === "happy" ? "#E01B24" : mood === "sad" ? "#8a1c22" : "#c98a12";

  return (
    <div
      className={compact ? "inline-flex items-center gap-3" : "fixed bottom-4 right-4 z-40 flex items-end gap-3"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(hovered || compact) && (
        <div className="max-w-[220px] bg-ink text-paper px-3 py-2 border-2 border-ink font-condensed text-xs uppercase tracking-wide relative shadow-md">
          {message}
          {!compact && (
            <span className="absolute -right-2 bottom-3 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px] border-l-ink" />
          )}
        </div>
      )}

      <div
        className={`relative ${mood === "happy" ? "animate-mascot-bob" : mood === "sad" ? "" : "animate-mascot-sway"}`}
      >
        <div className={`absolute -inset-1 ${ringTone} rounded-full opacity-30 blur-sm`} />
        <svg
          viewBox="0 0 100 110"
          width={compact ? 48 : 72}
          height={compact ? 52 : 78}
          className="relative drop-shadow"
        >
          {/* Etiqueta atrás */}
          <polygon
            points="12,6 88,6 96,18 96,96 4,96 4,18"
            fill="hsl(var(--poster-yellow))"
            stroke="hsl(var(--ink))"
            strokeWidth="3"
          />
          <line x1="12" y1="16" x2="88" y2="16" stroke="hsl(var(--ink))" strokeWidth="1.5" strokeDasharray="2 2" />

          {/* Cabeça (tomate) */}
          <circle cx="50" cy="58" r="26" fill="#E01B24" stroke="hsl(var(--ink))" strokeWidth="3" />
          {/* Folhinha */}
          <path d="M42 33 Q50 22 58 33 Q54 30 50 32 Q46 30 42 33 Z" fill="#2E7D32" stroke="hsl(var(--ink))" strokeWidth="2" />

          {/* Olhos */}
          {mood === "sad" ? (
            <>
              <path d="M40 56 q3 -3 6 0" stroke="hsl(var(--ink))" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <path d="M54 56 q3 -3 6 0" stroke="hsl(var(--ink))" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <circle cx="43" cy="55" r="2.5" fill="hsl(var(--ink))" />
              <circle cx="57" cy="55" r="2.5" fill="hsl(var(--ink))" />
            </>
          )}

          {/* Bochechas */}
          <circle cx="38" cy="64" r="3" fill={cheek} opacity="0.6" />
          <circle cx="62" cy="64" r="3" fill={cheek} opacity="0.6" />

          {/* Boca */}
          {mood === "happy" && (
            <path d="M40 68 Q50 78 60 68" stroke="hsl(var(--ink))" strokeWidth="2.5" fill="hsl(var(--ink))" strokeLinejoin="round" />
          )}
          {mood === "neutral" && (
            <line x1="43" y1="72" x2="57" y2="72" stroke="hsl(var(--ink))" strokeWidth="2.5" strokeLinecap="round" />
          )}
          {mood === "sad" && (
            <>
              <path d="M40 74 Q50 66 60 74" stroke="hsl(var(--ink))" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              <circle cx="41" cy="63" r="1.5" fill="#3b82f6" />
            </>
          )}
        </svg>
        {/* Selo % */}
        <div
          className={`absolute -bottom-1 -right-2 h-8 w-8 rounded-full border-2 border-ink ${ringTone} flex items-center justify-center font-condensed font-bold text-[10px] ${
            mood === "neutral" ? "text-ink" : "text-white"
          } ${mood === "happy" ? "animate-live-pulse" : ""}`}
        >
          {pct.toFixed(0)}%
        </div>
      </div>
    </div>
  );
}
