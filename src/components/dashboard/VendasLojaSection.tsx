import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Store, TrendingUp, DollarSign, Percent, BarChart3, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import PriceTagCard from "@/components/poster/PriceTagCard";
import CouponDivider from "@/components/poster/CouponDivider";
import StatusStamp from "@/components/poster/StatusStamp";
import VrOfflineNotice from "@/components/VrOfflineNotice";
import { useVrRealizado, LOJA, canonDept } from "@/hooks/useVrRealizado";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  
} from "recharts";

interface Props {
  storeId: string;
  startDate: string;
  endDate: string;
  categoria?: string | null;
  departamento?: string | null;
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
  metaVolume: number;
  realizadoVolume: number;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtBRL = (v: number) => brl.format(v || 0);
const fmtPct = (v: number) => `${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const fmtNum = (v: number) => (v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtShort = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
    : v >= 1000
    ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`
    : String(v || 0);

export default function VendasLojaSection({ storeId, startDate, endDate, categoria, departamento }: Props) {
  const [metas, setMetas] = useState<any[]>([]);
  const [loadingMetas, setLoadingMetas] = useState(false);


  // Realizado sempre ao vivo, direto do VR (nada vem do banco)
  const { data: vr, loading: loadingVr, offline, errorMsg, updatedAt, refresh } = useVrRealizado(
    storeId,
    startDate,
    endDate,
    categoria,
  );

  const fetchMetas = async () => {
    if (!storeId) return;
    setLoadingMetas(true);
    const alvo = departamento ? canonDept(departamento) : LOJA;
    let q = supabase
      .from("store_daily_metrics")
      .select("date, department, meta_vendas, meta_lucro, meta_margem_pct, meta_volume")
      .eq("store_id", storeId);
    if (alvo === LOJA) q = q.eq("department", LOJA);
    const { data } = await q.gte("date", startDate).lte("date", endDate).order("date");
    let linhas: any[] = data || [];
    if (alvo !== LOJA) {
      const porDia = new Map<string, any>();
      for (const l of linhas) {
        if (canonDept(String(l.department || "")) !== alvo) continue;
        const c = porDia.get(l.date) || { date: l.date, meta_vendas: 0, meta_lucro: 0, meta_volume: 0 };
        c.meta_vendas += Number(l.meta_vendas) || 0;
        c.meta_lucro += Number(l.meta_lucro) || 0;
        c.meta_volume += Number(l.meta_volume) || 0;
        porDia.set(l.date, c);
      }
      linhas = [...porDia.values()].map((d) => ({
        ...d,
        meta_margem_pct: d.meta_vendas > 0 ? (d.meta_lucro / d.meta_vendas) * 100 : 0,
      }));
    }
    setMetas(linhas);
    setLoadingMetas(false);
  };

  useEffect(() => {
    fetchMetas();
  }, [storeId, startDate, endDate, departamento]);

  const loading = loadingMetas || loadingVr;

  // Junta metas (banco) com realizado (ao vivo)
  // Regra D-1: o dia corrente é parcial e NÃO entra no realizado.
  const hojeStr = useMemo(() => {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
  }, []);

  const rows: DailyLoja[] = useMemo(() => {
    if (!vr) return [];
    const real = new Map((vr[LOJA] || []).map((r) => [r.date, r]));
    const dates = new Set<string>([...metas.map((m: any) => m.date), ...real.keys()]);
    return [...dates]
      .sort()
      .map((date) => {
        const m: any = metas.find((x: any) => x.date === date) || {};
        const r = date < hojeStr ? real.get(date) : undefined;
        return {
          date,
          day: Number(date.slice(8, 10)),
          metaVendas: Number(m.meta_vendas) || 0,
          realizadoVendas: r?.vendas || 0,
          metaLucro: Number(m.meta_lucro) || 0,
          realizadoLucro: r?.lucro || 0,
          metaMargemPct: Number(m.meta_margem_pct) || 0,
          realizadoMargemPct: r?.margemPct || 0,
          metaVolume: Number(m.meta_volume) || 0,
          realizadoVolume: r?.volume || 0,
        };
      });
  }, [metas, vr, hojeStr]);

  // Dias sem operação (meta e realizado zerados) são ignorados em médias,
  // projeções e nos gráficos de evolução.
  const opRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          r.metaVendas > 0 ||
          r.realizadoVendas > 0 ||
          r.metaLucro > 0 ||
          r.realizadoLucro > 0,
      ),
    [rows],
  );


  const totals = useMemo(() => {
    const metaVendas = opRows.reduce((s, r) => s + r.metaVendas, 0);
    const realVendas = opRows.reduce((s, r) => s + r.realizadoVendas, 0);
    const metaLucro = opRows.reduce((s, r) => s + r.metaLucro, 0);
    const realLucro = opRows.reduce((s, r) => s + r.realizadoLucro, 0);
    // Standardized: realized profit ÷ realized revenue
    const margemReal = realVendas > 0 ? (realLucro / realVendas) * 100 : 0;
    const margemMeta = metaVendas > 0 ? (metaLucro / metaVendas) * 100 : 0;
    const pctMeta = metaVendas > 0 ? (realVendas / metaVendas) * 100 : 0;

    const hoje = new Date();
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
    const isCurrentMonth =
      opRows.length > 0 &&
      opRows[0].date.slice(0, 7) === hojeStr.slice(0, 7);
    const diasComRealizado = opRows.filter((r) => r.realizadoVendas > 0).length;
    const totalDias = opRows.length;
    const diasIgnorados = rows.length - opRows.length;

    // Meta acumulada = soma das metas até hoje (ou mês todo, se mês fechado)
    const rowsAteHoje = isCurrentMonth ? opRows.filter((r) => r.date <= hojeStr) : opRows;
    const metaAcumVendas = rowsAteHoje.reduce((s, r) => s + r.metaVendas, 0);
    const metaAcumLucro = rowsAteHoje.reduce((s, r) => s + r.metaLucro, 0);
    const realAcumVendas = rowsAteHoje.reduce((s, r) => s + r.realizadoVendas, 0);
    const realAcumLucro = rowsAteHoje.reduce((s, r) => s + r.realizadoLucro, 0);

    const pctAcumVendas = metaAcumVendas > 0 ? (realAcumVendas / metaAcumVendas) * 100 : 0;
    const pctAcumLucro = metaAcumLucro > 0 ? (realAcumLucro / metaAcumLucro) * 100 : 0;

    // Média diária considerando apenas dias com operação já realizados
    const mediaDiaria = diasComRealizado > 0 ? realVendas / diasComRealizado : 0;

    // O dia corrente ainda nao tem realizado (regra D-1), entao a sua meta
    // entra na projecao junto com os dias futuros.
    const metasRestantesVendas = opRows
      .filter((r) => r.date >= hojeStr)
      .reduce((s, r) => s + r.metaVendas, 0);
    const metasRestantesLucro = opRows
      .filter((r) => r.date >= hojeStr)
      .reduce((s, r) => s + r.metaLucro, 0);

    const metaVolume = opRows.reduce((s, r) => s + r.metaVolume, 0);
    const realVolume = opRows.reduce((s, r) => s + r.realizadoVolume, 0);
    const metasRestantesVolume = opRows
      .filter((r) => r.date >= hojeStr)
      .reduce((s, r) => s + r.metaVolume, 0);
    const projecaoVolume = realVolume + metasRestantesVolume;
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
      metaVolume,
      realVolume,
      projecaoVolume,
      mediaDiaria,
      diasComRealizado,
      totalDias,
      diasIgnorados,
      isCurrentMonth,
    };
  }, [rows, opRows]);

  const chartData = useMemo(() => {
    let accReal = 0;
    let accMeta = 0;
    return opRows.map((r) => {
      accReal += r.realizadoVendas;
      accMeta += r.metaVendas;
      return {
        dia: String(r.day).padStart(2, "0"),
        "Meta diária": r.metaVendas,
        Realizado: r.realizadoVendas,
        // Fix: was accMeta + accReal (double-counted). Correct = cumulative meta only.
        "Meta acumulada": accMeta,
        "Realizado acumulado": accReal,
        // Projeção (meta diária) do dia corrente em diante
        "Projeção": r.date >= hojeStr ? r.metaVendas : null,
      };
    });
  }, [opRows, hojeStr]);


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
      label: "Volume",
      value: fmtNum(totals.realVolume),
      sub: `Meta ${fmtNum(totals.metaVolume)}`,
      icon: BarChart3,
      pct: totals.metaVolume > 0 ? (totals.realVolume / totals.metaVolume) * 100 : 0,
    },
  ];

  const margemProj = totals.projecaoMes > 0 ? (totals.projecaoLucro / totals.projecaoMes) * 100 : 0;
  const projCards = [
    {
      label: "Projeção — Faturamento do mês",
      value: fmtBRL(totals.projecaoMes),
      sub: `Meta ${fmtBRL(totals.metaVendas)}`,
      icon: DollarSign,
      pct: totals.metaVendas > 0 ? (totals.projecaoMes / totals.metaVendas) * 100 : 0,
    },
    {
      label: "Projeção — Lucro do mês",
      value: fmtBRL(totals.projecaoLucro),
      sub: `Meta ${fmtBRL(totals.metaLucro)}`,
      icon: TrendingUp,
      pct: totals.metaLucro > 0 ? (totals.projecaoLucro / totals.metaLucro) * 100 : 0,
    },
    {
      label: "Projeção — Margem %",
      value: fmtPct(margemProj),
      sub: `Meta ${fmtPct(totals.margemMeta)}`,
      icon: Percent,
      pct: totals.margemMeta > 0 ? (margemProj / totals.margemMeta) * 100 : 0,
    },
    {
      label: "Projeção — Volume",
      value: fmtNum(totals.projecaoVolume),
      sub: `Meta ${fmtNum(totals.metaVolume)}`,
      icon: BarChart3,
      pct: totals.metaVolume > 0 ? (totals.projecaoVolume / totals.metaVolume) * 100 : 0,
    },
  ];


  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 mb-6"
    >
      <CouponDivider label={departamento && canonDept(departamento) !== LOJA ? `Vendas — ${departamento}` : "Vendas da loja — Supermercado total"} />

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Store className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
            Vendas da loja
          </h2>
          {!offline && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-live-pulse" />
              Ao vivo{updatedAt ? ` · ${updatedAt.toLocaleTimeString("pt-BR")}` : ""}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted/40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingVr ? "animate-spin" : ""}`} /> Atualizar
          </button>
          {!offline && <StatusStamp pct={totals.pctMeta} />}
        </div>
      </div>

      {offline ? (
        <VrOfflineNotice message={errorMsg} />
      ) : loading && rows.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg bg-card border border-border py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Sem dados de <strong className="text-foreground">LOJA</strong> para o período selecionado.
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

          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Projeções</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {projCards.map((c) => (
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

          <div className="rounded-lg bg-card border border-border">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">
                Evolução diária — Realizado × Meta
              </h3>
              <div className="text-[11px] text-muted-foreground">
                Projeção {fmtBRL(totals.projecaoMes)} · Média/dia {fmtBRL(totals.mediaDiaria)} · {totals.diasComRealizado}/{totals.totalDias} dias
                {totals.diasIgnorados > 0 && ` · ${totals.diasIgnorados} sem operação ignorado(s)`}

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
                      yAxisId="acum"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={fmtShort}
                    />
                    <YAxis
                      yAxisId="dia"
                      orientation="right"
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
                    <Bar
                      yAxisId="dia"
                      dataKey="Meta diária"
                      fill="hsl(var(--muted-foreground))"
                      fillOpacity={0.35}
                      barSize={10}
                    />
                    <Bar
                      yAxisId="dia"
                      dataKey="Realizado"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.85}
                      barSize={10}
                    />
                    <Area
                      yAxisId="acum"
                      type="monotone"
                      dataKey="Realizado acumulado"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#gradRealizado)"
                      dot={false}
                    />
                    <Line
                      yAxisId="acum"
                      type="monotone"
                      dataKey="Meta acumulada"
                      stroke="hsl(var(--muted-foreground))"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                    />
                    <Line
                      yAxisId="dia"
                      type="monotone"
                      dataKey="Projeção"
                      stroke="hsl(var(--warning, 38 92% 50%))"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      dot={{ r: 2 }}
                      connectNulls={false}
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
