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
  Line,
  Bar,
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

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

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
    const margemReal = realVendas > 0 ? (realLucro / realVendas) * 100 : 0;
    const pctMeta = metaVendas > 0 ? (realVendas / metaVendas) * 100 : 0;

    // Projeção: realizado + metas dos dias restantes
    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const diasComRealizado = rows.filter((r) => r.realizadoVendas > 0).length;
    const totalDias = rows.length;

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
      pctMeta,
      projecaoMes,
      projecaoLucro,
      diasComRealizado,
      totalDias,
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
        "Meta acumulada": accMeta + accReal,
        "Realizado acumulado": accReal,
      };
    });
  }, [rows]);

  const cards = [
    {
      label: "Faturamento do mês",
      value: fmtBRL(totals.realVendas),
      sub: `Meta ${fmtBRL(totals.metaVendas)}`,
      icon: DollarSign,
      ribbon: "yellow" as const,
      pct: totals.pctMeta,
    },
    {
      label: "Lucro do mês",
      value: fmtBRL(totals.realLucro),
      sub: `Meta ${fmtBRL(totals.metaLucro)}`,
      icon: TrendingUp,
      ribbon: "red" as const,
      pct: totals.metaLucro > 0 ? (totals.realLucro / totals.metaLucro) * 100 : 0,
    },
    {
      label: "Margem %",
      value: fmtPct(totals.margemReal),
      sub: `Meta ${
        totals.realVendas > 0
          ? fmtPct(totals.metaVendas > 0 ? (totals.metaLucro / totals.metaVendas) * 100 : 0)
          : "—"
      }`,
      icon: Percent,
      ribbon: "green" as const,
      pct: totals.metaVendas > 0
        ? (totals.margemReal / ((totals.metaLucro / totals.metaVendas) * 100)) * 100
        : 0,
    },
    {
      label: "% da meta atingida",
      value: fmtPct(totals.pctMeta),
      sub: `Proj. ${fmtBRL(totals.projecaoMes)}`,
      icon: Target,
      ribbon: "ink" as const,
      pct: totals.pctMeta,
    },
  ];

  const toneFromPct = (p: number): "green" | "yellow" | "red" =>
    p >= 100 ? "green" : p >= 80 ? "yellow" : "red";

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 mb-6"
    >
      <CouponDivider label="Vendas da Loja — Supermercado Total" />

      <div className="flex items-center justify-between mb-4 mt-3">
        <div className="flex items-center gap-2">
          <Store className="w-5 h-5 text-offer-red" />
          <h2 className="font-condensed uppercase tracking-widest text-lg font-bold">
            Vendas da Loja
          </h2>
          <span className="inline-flex items-center gap-1 ml-2 px-2 py-0.5 bg-offer-red text-white text-[10px] font-condensed uppercase tracking-widest animate-live-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-white" /> Ao vivo
          </span>
        </div>
        <StatusStamp pct={totals.pctMeta} />
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-sm text-muted-foreground font-condensed uppercase tracking-widest py-8 text-center">
          Carregando...
        </div>
      ) : rows.length === 0 ? (
        <div className="clip-tag bg-card border-2 border-ink py-8 text-center">
          <p className="font-condensed uppercase tracking-widest text-sm">
            Sem dados de <strong>LOJA</strong> para este mês.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6 pt-2">
            {cards.map((c) => (
              <PriceTagCard
                key={c.label}
                label={c.label}
                ribbonTone={c.ribbon}
                icon={<c.icon className="w-3.5 h-3.5" />}
                value={c.value}
                sub={c.sub}
                badge={{ text: `${c.pct.toFixed(0)}%`, tone: toneFromPct(c.pct) }}
              />
            ))}
          </div>

          <div className="clip-tag bg-card border-2 border-ink">
            <div className="bg-ink text-paper px-4 py-2 flex items-center justify-between">
              <h3 className="font-condensed uppercase tracking-widest text-sm font-bold">
                Evolução diária — Realizado × Meta
              </h3>
              <div className="text-[10px] font-condensed uppercase tracking-widest text-poster-yellow">
                Projeção: {fmtBRL(totals.projecaoMes)} · {totals.diasComRealizado}/{totals.totalDias} dias
              </div>
            </div>
            <div className="p-4">
              <div style={{ width: "100%", height: 320 }}>
                <ResponsiveContainer>
                  <ComposedChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--ink) / 0.15)" />
                    <XAxis dataKey="dia" stroke="hsl(var(--ink))" fontSize={11} />
                    <YAxis
                      stroke="hsl(var(--ink))"
                      fontSize={11}
                      tickFormatter={(v) =>
                        v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "2px solid hsl(var(--ink))",
                        borderRadius: 0,
                        fontSize: 12,
                        fontFamily: "Archivo Narrow, sans-serif",
                      }}
                      formatter={(v: any) => fmtBRL(Number(v))}
                    />
                    <Legend wrapperStyle={{ fontSize: 12, fontFamily: "Archivo Narrow, sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }} />
                    <Bar dataKey="Meta" fill="hsl(var(--ink) / 0.25)" />
                    <Bar dataKey="Realizado" fill="hsl(var(--poster-yellow))" stroke="hsl(var(--ink))" strokeWidth={1} />
                    <Line
                      type="monotone"
                      dataKey="Meta acumulada"
                      stroke="hsl(var(--offer-red))"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="4 4"
                    />
                    <Line
                      type="monotone"
                      dataKey="Realizado acumulado"
                      stroke="hsl(var(--gondola-green))"
                      strokeWidth={2.5}
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
