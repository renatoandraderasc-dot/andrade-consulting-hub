import { useMemo, useState } from "react";
import { CalendarDays, RefreshCw, Tag } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

export type PresetKey =
  | "hoje"
  | "ontem"
  | "7dias"
  | "mes"
  | "mes_passado"
  | "30dias"
  | "custom";

export interface Periodo {
  preset: PresetKey;
  inicio: string; // yyyy-MM-dd
  fim: string; // yyyy-MM-dd
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "ontem", label: "Ontem" },
  { key: "7dias", label: "Últimos 7 dias" },
  { key: "mes", label: "Este mês" },
  { key: "mes_passado", label: "Mês passado" },
  { key: "30dias", label: "Últimos 30 dias" },
  { key: "custom", label: "Personalizado" },
];

export function periodoFromPreset(preset: PresetKey, base = new Date()): Periodo {
  const hoje = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  switch (preset) {
    case "hoje":
      return { preset, inicio: iso(hoje), fim: iso(hoje) };
    case "ontem": {
      const o = addDays(hoje, -1);
      return { preset, inicio: iso(o), fim: iso(o) };
    }
    case "7dias":
      return { preset, inicio: iso(addDays(hoje, -6)), fim: iso(hoje) };
    case "30dias":
      return { preset, inicio: iso(addDays(hoje, -29)), fim: iso(hoje) };
    case "mes_passado": {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return { preset, inicio: iso(ini), fim: iso(fim) };
    }
    case "mes":
    default: {
      const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      // termina em D-1 (ontem); se hoje for dia 1, mantém o dia 1
      const ontem = addDays(hoje, -1);
      const fim = ontem < ini ? ini : ontem;
      return { preset: "mes", inicio: iso(ini), fim: iso(fim) };
    }
  }
}

export const TODA_LOJA = "__loja_toda__";

const parse = (s: string) => new Date(`${s}T12:00:00`);
const fmt = (s: string) => parse(s).toLocaleDateString("pt-BR");
const fmtCurto = (s: string) =>
  parse(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

interface Props {
  periodo: Periodo;
  onPeriodoChange: (p: Periodo) => void;
  categoria: string;
  onCategoriaChange: (c: string) => void;
  categorias: { name: string; total: number }[];
  onRefresh?: () => void;
  loading?: boolean;
}

export default function DashboardFilterBar({
  periodo,
  onPeriodoChange,
  categoria,
  onCategoriaChange,
  categorias,
  onRefresh,
  loading,
}: Props) {
  const [open, setOpen] = useState(false);
  const range: DateRange = useMemo(
    () => ({ from: parse(periodo.inicio), to: parse(periodo.fim) }),
    [periodo.inicio, periodo.fim],
  );

  const resumo = `Período: ${fmtCurto(periodo.inicio)} a ${fmtCurto(periodo.fim)} · ${
    categoria === TODA_LOJA ? "Loja toda" : categoria
  }`;

  return (
    <div className="sticky top-0 z-30 -mx-6 mb-6 border-b border-border bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex flex-wrap items-center gap-2">
        {/* Período */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted/40">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              {fmt(periodo.inicio)} — {fmt(periodo.fim)}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <div className="flex flex-col sm:flex-row">
              <div className="flex sm:flex-col gap-1 border-b sm:border-b-0 sm:border-r border-border p-2 flex-wrap">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => {
                      if (p.key === "custom") {
                        onPeriodoChange({ ...periodo, preset: "custom" });
                        return;
                      }
                      onPeriodoChange(periodoFromPreset(p.key));
                      setOpen(false);
                    }}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-left text-xs whitespace-nowrap hover:bg-muted/60",
                      periodo.preset === p.key
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-foreground",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <Calendar
                mode="range"
                locale={ptBR}
                selected={range}
                defaultMonth={range.from}
                numberOfMonths={2}
                onSelect={(r) => {
                  if (!r?.from) return;
                  const from = iso(r.from);
                  const to = iso(r.to ?? r.from);
                  onPeriodoChange({ preset: "custom", inicio: from, fim: to });
                  if (r.to) setOpen(false);
                }}
                className={cn("p-3 pointer-events-auto")}
              />
            </div>
          </PopoverContent>
        </Popover>

        {/* Categoria */}
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1">
          <Tag className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={categoria}
            onChange={(e) => onCategoriaChange(e.target.value)}
            className="bg-transparent text-xs text-foreground focus:outline-none max-w-[220px]"
          >
            <option value={TODA_LOJA}>Loja toda</option>
            {categorias.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {onRefresh && (
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted/40"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Atualizar
          </button>
        )}

        <span className="text-[11px] text-muted-foreground">{resumo}</span>
      </div>
    </div>
  );
}
