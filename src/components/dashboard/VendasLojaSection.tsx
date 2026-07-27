import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Store, TrendingUp, DollarSign, Percent, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
      color: "text-primary",
    },
    {
      label: "Lucro do mês",
      value: fmtBRL(totals.realLucro),
      sub: `Meta ${fmtBRL(totals.metaLucro)}`,
      icon: TrendingUp,
      color: "text-emerald-500",
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
      color: "text-amber-500",
    },
    {
      label: "% da meta atingida",
      value: fmtPct(totals.pctMeta),
      sub: `Projeção (real + metas restantes) ${fmtBRL(totals.projecaoMes)}`,
      icon: Target,
      color: "text-orange-500",
    },
  ];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-8 mb-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <Store className="w-5 h-5 text-primary" />
        <h2 className="font-display text-lg font-semibold">Vendas da Loja</h2>
        <span className="text-xs text-muted-foreground font-body">
          (total do supermercado — department = LOJA)
        </span>
      </div>

      {loading && rows.length === 0 ? (
        <div className="text-sm text-muted-foreground font-body py-8 text-center">
          Carregando...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground font-body py-8 text-center bg-card border border-border rounded-lg">
          Sem dados de <strong>LOJA</strong> para este mês.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            {cards.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.label}
                  className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1"
                >
                  <div className="flex items-center gap-2 text-muted-foreground font-body text-xs">
                    <Icon className={`w-4 h-4 ${c.color}`} />
                    {c.label}
                  </div>
                  <div className="font-display text-xl font-bold">{c.value}</div>
                  <div className="text-xs text-muted-foreground font-body">{c.sub}</div>
                </div>
              );
            })}
          </div>

          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-sm font-semibold">
                Evolução diária — Realizado × Meta
              </h3>
              <div className="text-xs text-muted-foreground font-body">
                Projeção: realizado + metas restantes:{" "}
                <span className="text-foreground font-semibold">
                  {fmtBRL(totals.projecaoMes)}
                </span>{" "}
                ({totals.diasComRealizado}/{totals.totalDias} dias)
              </div>
            </div>
            <div style={{ width: "100%", height: 320 }}>
              <ResponsiveContainer>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="dia" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickFormatter={(v) =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: any) => fmtBRL(Number(v))}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Meta" fill="hsl(var(--muted-foreground))" opacity={0.5} />
                  <Bar dataKey="Realizado" fill="hsl(var(--primary))" />
                  <Line
                    type="monotone"
                    dataKey="Meta acumulada"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="4 4"
                  />
                  <Line
                    type="monotone"
                    dataKey="Realizado acumulado"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </motion.section>
  );
}
