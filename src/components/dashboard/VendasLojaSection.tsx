import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Store, TrendingUp, DollarSign, Percent, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PriceTagCard from "@/components/poster/PriceTagCard";
import CouponDivider from "@/components/poster/CouponDivider";
import StatusStamp from "@/components/poster/StatusStamp";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  
} from "recharts";

interface Props {
  storeId: string;
  month: number;
  year: number;
}

interface DailyLoja {
  date: string;
  day: number;
  metaVendas: number;
  realizadoVendas: number;
  metaLucro: number;
  realizadoLucro: number;
  metaMargemPct: number;
  realizadoMargemPct: number;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtBRL = (v: number) => brl.format(v || 0);
const fmtPct = (v: number) => `${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtShort = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
    : v >= 1000
    ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`
    : String(v || 0);

export default function VendasLojaSection({ storeId, month, year }: Props) {
  const [rows, setRows] = useState<DailyLoja[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!storeId) return;
    setLoading(true);
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate =
      month === 12
        ? `${year + 1}-01-01`
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const { data } = await supabase
      .from("store_daily_metrics")
      .select("*")
      .eq("store_id", storeId)
      .eq("department", "LOJA")
      .gte("date", startDate)
      .lt("date", endDate)
      .order("date");

    setRows(
      (data || []).map((d: any) => ({
        date: d.date,
        day: Number(d.date.slice(8, 10)),
        metaVendas: Number(d.meta_vendas) || 0,
        realizadoVendas: Number(d.realizado_vendas) || 0,
        metaLucro: Number(d.meta_lucro) || 0,
        realizadoLucro: Number(d.realizado_lucro) || 0,
        metaMargemPct: Number(d.meta_margem_pct) || 0,
        realizadoMargemPct: Number(d.realizado_margem_pct) || 0,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [storeId, month, year]);

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`dash-loja-${storeId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "store_daily_metrics",
          filter: `store_id=eq.${storeId}`,
        },
        () => fetchData(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [storeId, month, year]);

  const totals = useMemo(() => {
    const metaVendas = rows.reduce((s, r) => s + r.metaVendas, 0);
    const realVendas = rows.reduce((s, r) => s + r.realizadoVendas, 0);
    const metaLucro = rows.reduce((s, r) => s + r.metaLucro, 0);
    const realLucro = rows.reduce((s, r) => s + r.realizadoLucro, 0);
    // Standardized: realized profit ÷ realized revenue
    const margemReal = realVendas > 0 ? (realLucro / realVendas) * 100 : 0;
    const margemMeta = metaVendas > 0 ? (metaLucro / metaVendas) * 100 : 0;
    const pctMeta = metaVendas > 0 ? (realVendas / metaVendas) * 100 : 0;

    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const isCurrentMonth =
      rows.length > 0 &&
      rows[0].date.slice(0, 7) === hojeStr.slice(0, 7);
    const diasComRealizado = rows.filter((r) => r.realizadoVendas > 0).length;
    const totalDias = rows.length;

    // Meta acumulada = soma das metas até hoje (ou mês todo, se mês fechado)
    const rowsAteHoje = isCurrentMonth ? rows.filter((r) => r.date <= hojeStr) : rows;
    const metaAcumVendas = rowsAteHoje.reduce((s, r) => s + r.metaVendas, 0);
    const metaAcumLucro = rowsAteHoje.reduce((s, r) => s + r.metaLucro, 0);
    const realAcumVendas = rowsAteHoje.reduce((s, r) => s + r.realizadoVendas, 0);
    const realAcumLucro = rowsAteHoje.reduce((s, r) => s + r.realizadoLucro, 0);

    const pctAcumVendas = metaAcumVendas > 0 ? (realAcumVendas / metaAcumVendas) * 100 : 0;
    const pctAcumLucro = metaAcumLucro > 0 ? (realAcumLucro / metaAcumLucro) * 100 : 0;

    const metasRestantesVendas = rows
      .filter((r) => r.date > hojeStr)
      .reduce((s, r) => s + r.metaVendas, 0);
    const metasRestantesLucro = rows
      .filter((r) => r.date > hojeStr)
      .reduce((s, r) => s + r.metaLucro, 0);

    const projecaoMes = realVendas + metasRestantesVendas;
    const projecaoLucro = realLucro + metasRestantesLucro;

    return {
      metaVendas,
      realVendas,
      metaLucro,
      realLucro,
      margemReal,
      margemMeta,
      pctMeta,
      metaAcumVendas,
      metaAcumLucro,
      pctAcumVendas,
      pctAcumLucro,
      projecaoMes,
      projecaoLucro,
      diasComRealizado,
      totalDias,
      isCurrentMonth,
    };
  }, [rows]);

  const chartData = useMemo(() => {
    let accReal = 0;
    let accMeta = 0;
    return rows.map((r) => {
      accReal += r.realizadoVendas;
      accMeta += r.metaVendas;
      return {
        dia: String(r.day).padStart(2, "0"),
        Meta: r.metaVendas,
        Realizado: r.realizadoVendas,
        // Fix: was accMeta + accReal (double-counted). Correct = cumulative meta only.
        "Meta acumulada": accMeta,
        "Realizado acumulado": accReal,
      };
    });
  }, [rows]);

  const toneFromPct = (p: number): "success" | "warning" | "danger" =>
    p >= 100 ? "success" : p >= 80 ? "warning" : "danger";

  const cards = [
    {
      label: "Faturamento do mês",
      value: fmtBRL(totals.realVendas),
      sub: `Meta ${fmtBRL(totals.metaVendas)}`,
      icon: DollarSign,
      pct: totals.pctMeta,
      pctAcum: totals.pctAcumVendas,
      metaAcum: totals.metaAcumVendas,
    },
    {
      label: "Lucro do mês",
      value: fmtBRL(totals.realLucro),
      sub: `Meta ${fmtBRL(totals.metaLucro)}`,
      icon: TrendingUp,
      pct: totals.metaLucro > 0 ? (totals.realLucro / totals.metaLucro) * 100 : 0,
      pctAcum: totals.pctAcumLucro,
      metaAcum: totals.metaAcumLucro,
    },
    {
      label: "Margem %",
      value: fmtPct(totals.margemReal),
      sub: `Meta ${fmtPct(totals.margemMeta)}`,
      icon: Percent,
      pct: totals.margemMeta > 0 ? (totals.margemReal / totals.margemMeta) * 100 : 0,
      pctAcum: totals.margemMeta > 0 ? (totals.margemReal / totals.margemMeta) * 100 : 0,
      metaAcum: 0,
    },
    {
      label: "% da meta atingida",
      value: fmtPct(totals.pctMeta),
      sub: `Projeção ${fmtBRL(totals.projecaoMes)}`,
      icon: Target,
      pct: totals.pctMeta,
      pctAcum: totals.pctAcumVendas,
      metaAcum: totals.metaAcumVendas,
    },
  ];


  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 mb-6"
    >
      <CouponDivider label="Vendas da loja — Supermercado total" />

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Store className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Vendas da loja
          </h2>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-live-pulse" />
            Ao vivo
          </span>
        </div>
        <StatusStamp pct={totals.pctMeta} />
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg bg-card border border-border py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Sem dados de <strong className="text-foreground">LOJA</strong> para este mês.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {cards.map((c) => (
              <PriceTagCard
                key={c.label}
                label={c.label}
                icon={<c.icon className="w-4 h-4" />}
                value={c.value}
                sub={c.sub}
                badge={{ text: `${c.pct.toFixed(0)}%`, tone: toneFromPct(c.pct) }}
                progressPct={c.pct}
              />
            ))}
          </div>

          {/* Progresso Total x Meta Acumulada */}
          <div className="rounded-lg bg-card border border-border p-5 mb-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Progresso Total vs. Meta Acumulada
              </h3>
              {totals.isCurrentMonth && (
                <span className="text-[11px] text-muted-foreground">
                  Meta acumulada até hoje ({new Date().toLocaleDateString("pt-BR")})
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  title: "Faturamento",
                  real: totals.realVendas,
                  metaMes: totals.metaVendas,
                  metaAcum: totals.metaAcumVendas,
                  pctTotal: totals.pctMeta,
                  pctAcum: totals.pctAcumVendas,
                },
                {
                  title: "Lucro",
                  real: totals.realLucro,
                  metaMes: totals.metaLucro,
                  metaAcum: totals.metaAcumLucro,
                  pctTotal: totals.metaLucro > 0 ? (totals.realLucro / totals.metaLucro) * 100 : 0,
                  pctAcum: totals.pctAcumLucro,
                },
              ].map((b) => {
                const colorFor = (p: number) =>
                  p >= 100 ? "bg-emerald-500" : p >= 80 ? "bg-blue-500" : p >= 50 ? "bg-amber-500" : "bg-red-500";
                const textColorFor = (p: number) =>
                  p >= 100 ? "text-emerald-500" : p >= 80 ? "text-blue-500" : p >= 50 ? "text-amber-500" : "text-red-500";
                return (
                  <div key={b.title}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-foreground uppercase tracking-wide">{b.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        Realizado {fmtBRL(b.real)}
                      </span>
                    </div>
                    {/* Progresso Total */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-muted-foreground w-20 shrink-0">Total mês</span>
                      <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colorFor(b.pctTotal)} transition-all`}
                          style={{ width: `${Math.min(b.pctTotal, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono font-bold w-14 text-right ${textColorFor(b.pctTotal)}`}>
                        {b.pctTotal.toFixed(1)}%
                      </span>
                    </div>
                    {/* Progresso Meta Acumulada */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground w-20 shrink-0">Acumul. hoje</span>
                      <div className="flex-1 h-2 bg-muted/40 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colorFor(b.pctAcum)} transition-all`}
                          style={{ width: `${Math.min(b.pctAcum, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono font-bold w-14 text-right ${textColorFor(b.pctAcum)}`}>
                        {b.pctAcum.toFixed(1)}%
                      </span>
                    </div>
                    <p className="mt-1 ml-20 text-[10px] text-muted-foreground">
                      Meta mês {fmtBRL(b.metaMes)} · Meta acum. {fmtBRL(b.metaAcum)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>


          <div className="rounded-lg bg-card border border-border">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">
                Evolução diária — Realizado × Meta
              </h3>
              <div className="text-[11px] text-muted-foreground">
                Projeção {fmtBRL(totals.projecaoMes)} · {totals.diasComRealizado}/{totals.totalDias} dias
              </div>
            </div>
            <div className="p-5">
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <ComposedChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="gradRealizado" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="dia"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={fmtShort}
                    />
                    <Tooltip
                      cursor={{ stroke: "hsl(var(--border))" }}
                      contentStyle={{
                        background: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "hsl(var(--foreground))",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                      formatter={(v: any) => fmtBRL(Number(v))}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}
                      iconType="plainline"
                    />
                    <Area
                      type="monotone"
                      dataKey="Realizado acumulado"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#gradRealizado)"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="Meta acumulada"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </motion.section>
  );
}
