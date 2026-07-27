import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Trophy, TrendingUp, TrendingDown, Calendar, Filter, Sparkles, Flag, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DEPARTMENTS = ["PADARIA", "AÇOUGUE", "HORTIFRUTI"];
const KPI_LABELS: Record<string, string> = {
  faturamento: "Faturamento",
  margem: "Margem",
  arrecadacao: "Arrecadação",
  volume: "Mix",
};

interface DayMetric {
  day: number;
  date: string;
  meta_vendas: number;
  realizado_vendas: number;
  meta_lucro: number;
  realizado_lucro: number;
  meta_margem_pct: number;
  realizado_margem_pct: number;
  meta_volume: number;
  realizado_volume: number;
}

const pctFmt = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;

const PIC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState<"mes" | "dia">("mes");
  const [rawData, setRawData] = useState<Record<string, DayMetric[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) { navigate("/login"); return; }
    if (user) fetchStoreInfo();
  }, [user, authLoading]);

  useEffect(() => {
    if (storeId) fetchData();
  }, [storeId, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`pic-sdm-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_daily_metrics", filter: `store_id=eq.${storeId}` },
        () => fetchData(),
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, selectedMonth, selectedYear]);


  const fetchStoreInfo = async () => {
    const { data: access } = await supabase
      .from("user_store_access").select("store_id, stores(name)").eq("user_id", user!.id).eq("approved", true).limit(1).single();
    if (access) {
      setStoreId(access.store_id);
      setStoreName((access as any).stores?.name || "");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const endDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-31`;

    const results: Record<string, DayMetric[]> = {};
    for (const dept of DEPARTMENTS) {
      const { data } = await supabase
        .from("store_daily_metrics")
        .select("*")
        .eq("store_id", storeId)
        .eq("department", dept)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true });

      if (data && data.length > 0) {
        results[dept] = data.map((d) => ({
          day: new Date(d.date + "T12:00:00").getDate(),
          date: d.date,
          meta_vendas: Number(d.meta_vendas) || 0,
          realizado_vendas: Number(d.realizado_vendas) || 0,
          meta_lucro: Number(d.meta_lucro) || 0,
          realizado_lucro: Number(d.realizado_lucro) || 0,
          meta_margem_pct: Number(d.meta_margem_pct) || 0,
          realizado_margem_pct: Number(d.realizado_margem_pct) || 0,
          meta_volume: Number(d.meta_volume) || 0,
          realizado_volume: Number(d.realizado_volume) || 0,
        }));
      }
    }
    setRawData(results);
    setLoading(false);
  };

  // Build KPI data per department
  const deptKpis = useMemo(() => {
    const result: Record<string, Record<string, { acumulado: number; daily: { day: number; pct: number }[] }>> = {};
    for (const dept of DEPARTMENTS) {
      const rows = rawData[dept] || [];
      result[dept] = {};

      const calcKpi = (metaKey: keyof DayMetric, realKey: keyof DayMetric) => {
        let metaAcum = 0, realAcum = 0;
        const daily: { day: number; pct: number }[] = [];
        for (const r of rows) {
          metaAcum += Number(r[metaKey]) || 0;
          realAcum += Number(r[realKey]) || 0;
          const pct = metaAcum > 0 ? (realAcum / metaAcum) * 100 : 0;
          daily.push({ day: r.day, pct });
        }
        const acumulado = metaAcum > 0 ? (realAcum / metaAcum) * 100 : 0;
        return { acumulado, daily };
      };

      const calcMargemKpi = () => {
        let metaAcum = 0, realAcum = 0, count = 0;
        const daily: { day: number; pct: number }[] = [];
        for (const r of rows) {
          if (r.meta_margem_pct > 0) {
            metaAcum += r.meta_margem_pct;
            realAcum += r.realizado_margem_pct;
            count++;
          }
          const avgMeta = count > 0 ? metaAcum / count : 0;
          const avgReal = count > 0 ? realAcum / count : 0;
          const pct = avgMeta > 0 ? (avgReal / avgMeta) * 100 : 0;
          daily.push({ day: r.day, pct });
        }
        const avgMeta = count > 0 ? metaAcum / count : 0;
        const avgReal = count > 0 ? realAcum / count : 0;
        const acumulado = avgMeta > 0 ? (avgReal / avgMeta) * 100 : 0;
        return { acumulado, daily };
      };

      result[dept].faturamento = calcKpi("meta_vendas", "realizado_vendas");
      result[dept].margem = calcMargemKpi();
      result[dept].arrecadacao = calcKpi("meta_lucro", "realizado_lucro");
      result[dept].volume = calcKpi("meta_volume", "realizado_volume");
    }
    return result;
  }, [rawData]);

  // AI Analysis
  const aiAnalysis = useMemo(() => {
    const insights: string[] = [];
    for (const dept of DEPARTMENTS) {
      const kpis = deptKpis[dept];
      if (!kpis) continue;
      const fat = kpis.faturamento?.acumulado || 0;
      const marg = kpis.margem?.acumulado || 0;

      if (fat >= 100) insights.push(`🏆 ${dept} superou a meta de faturamento com ${pctFmt(fat)}!`);
      else if (fat >= 90) insights.push(`📈 ${dept} está próximo da meta de faturamento (${pctFmt(fat)}).`);
      else if (fat > 0 && fat < 70) insights.push(`⚠️ ${dept} está abaixo de 70% da meta de faturamento (${pctFmt(fat)}).`);

      if (marg >= 100) insights.push(`✅ ${dept}: margem acima da meta (${pctFmt(marg)}).`);
      else if (marg > 0 && marg < 80) insights.push(`🔴 ${dept}: margem crítica em ${pctFmt(marg)} da meta.`);
    }
    if (insights.length === 0) insights.push("📊 Sem dados suficientes para análise neste período.");
    return insights;
  }, [deptKpis]);

  const today = new Date().getDate();

  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-2.5 rounded-xl shadow-lg">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-heading text-foreground">PIC — Painel de Indicadores Comerciais</h1>
              <p className="text-sm text-muted-foreground font-body">Acompanhamento de metas por departamento</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-[140px] bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.slice(1).map((m, i) => (<SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>))}</SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-[100px] bg-card border-border"><SelectValue /></SelectTrigger>
              <SelectContent>{[2024, 2025, 2026].map((y) => (<SelectItem key={y} value={String(y)}>{y}</SelectItem>))}</SelectContent>
            </Select>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="ml-2">
              <TabsList className="bg-card border border-border">
                <TabsTrigger value="mes" className="text-xs">Mensal</TabsTrigger>
                <TabsTrigger value="dia" className="text-xs">Diário</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </motion.div>

        {/* AI Analysis */}
        <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
          className="bg-gradient-to-r from-card via-card to-amber-500/5 border border-amber-500/20 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-amber-500" />
            <h3 className="font-heading font-bold text-foreground text-sm">Análise Inteligente</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {aiAnalysis.map((insight, i) => (
              <motion.p key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 + i * 0.05 }}
                className="text-sm text-muted-foreground font-body">{insight}</motion.p>
            ))}
          </div>
        </motion.div>

        {/* Department Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {DEPARTMENTS.map((dept, deptIdx) => (
            <DepartmentCard key={dept} dept={dept} kpis={deptKpis[dept] || {}} viewMode={viewMode} delay={deptIdx * 0.1} today={today} />
          ))}
        </div>

        {/* Finish Line Animation */}
        <FinishLineAnimation deptKpis={deptKpis} />
      </div>
    </ClientLayout>
  );
};

// ========== DEPARTMENT CARD ==========
interface DeptCardProps {
  dept: string;
  kpis: Record<string, { acumulado: number; daily: { day: number; pct: number }[] }>;
  viewMode: "mes" | "dia";
  delay: number;
  today: number;
}

const DepartmentCard = ({ dept, kpis, viewMode, delay, today }: DeptCardProps) => {
  const kpiKeys = ["faturamento", "margem", "arrecadacao", "volume"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + delay, duration: 0.5 }}
      className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm"
    >
      {/* Department Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 px-5 py-3 flex items-center justify-between">
        <h2 className="text-white font-heading font-bold text-lg tracking-wide">{dept}</h2>
        <div className="flex items-center gap-1.5">
          {kpiKeys.map((k) => {
            const val = kpis[k]?.acumulado || 0;
            return (
              <span key={k} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${val >= 100 ? "bg-emerald-500/20 text-emerald-400" : val >= 80 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                {KPI_LABELS[k]?.charAt(0)}: {val > 0 ? pctFmt(val) : "—"}
              </span>
            );
          })}
        </div>
      </div>

      {/* KPI Charts */}
      <div className="p-4 space-y-4">
        {kpiKeys.map((kpiKey) => {
          const kpiData = kpis[kpiKey];
          if (!kpiData) return null;
          return (
            <KpiSection key={kpiKey} label={KPI_LABELS[kpiKey]} kpi={kpiData} viewMode={viewMode} today={today} />
          );
        })}
      </div>
    </motion.div>
  );
};

// ========== KPI SECTION (Horizontal Bar Chart) ==========
interface KpiSectionProps {
  label: string;
  kpi: { acumulado: number; daily: { day: number; pct: number }[] };
  viewMode: "mes" | "dia";
  today: number;
}

const KpiSection = ({ label, kpi, viewMode, today }: KpiSectionProps) => {
  const [expanded, setExpanded] = useState(false);
  const acumColor = kpi.acumulado >= 100 ? "bg-emerald-500" : kpi.acumulado >= 80 ? "bg-blue-500" : "bg-red-500";

  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between mb-1.5 group cursor-pointer">
        <span className="text-xs font-heading font-bold text-foreground uppercase tracking-wider">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {/* Acumulado bar */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] text-muted-foreground font-mono w-16 shrink-0">ACUMUL.</span>
        <div className="flex-1 h-5 bg-muted/40 rounded-sm overflow-hidden relative">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(kpi.acumulado, 120)}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className={`h-full ${acumColor} rounded-sm`}
            style={{ maxWidth: "100%" }}
          />
          {/* 100% mark */}
          <div className="absolute top-0 bottom-0 left-[83.3%] w-px bg-foreground/20" style={{ left: `${Math.min(100, 100)}%` }} />
        </div>
        <span className={`text-xs font-mono font-bold w-16 text-right ${kpi.acumulado >= 100 ? "text-emerald-500" : kpi.acumulado >= 80 ? "text-blue-500" : "text-red-500"}`}>
          {kpi.acumulado > 0 ? pctFmt(kpi.acumulado) : "—"}
        </span>
      </div>

      {/* Daily bars (expandable) */}
      <AnimatePresence>
        {(expanded || viewMode === "dia") && kpi.daily.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="space-y-0.5 mt-1">
              {kpi.daily.map((d, i) => {
                const barColor = d.pct >= 100 ? "bg-emerald-500" : d.pct >= 80 ? "bg-blue-500" : "bg-red-500";
                const isToday = d.day === today;
                return (
                  <motion.div
                    key={d.day}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className={`flex items-center gap-2 ${isToday ? "bg-amber-500/10 rounded px-1 -mx-1" : ""}`}
                  >
                    <span className={`text-[10px] font-mono w-16 shrink-0 ${isToday ? "text-amber-500 font-bold" : "text-muted-foreground"}`}>
                      {isToday ? "▶ " : ""}{d.day}
                    </span>
                    <div className="flex-1 h-4 bg-muted/30 rounded-sm overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(d.pct, 120)}%` }}
                        transition={{ duration: 0.6, delay: i * 0.02 }}
                        className={`h-full ${barColor} rounded-sm`}
                        style={{ maxWidth: "100%" }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono w-16 text-right ${d.pct >= 100 ? "text-emerald-500" : d.pct >= 80 ? "text-blue-500" : "text-red-500"}`}>
                      {d.pct > 0 ? pctFmt(d.pct) : "—"}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ========== FINISH LINE ANIMATION ==========
const FinishLineAnimation = ({ deptKpis }: { deptKpis: Record<string, Record<string, { acumulado: number }>> }) => {
  const rankings = useMemo(() => {
    return DEPARTMENTS.map((dept) => {
      const kpis = deptKpis[dept] || {};
      const avg = (
        (kpis.faturamento?.acumulado || 0) +
        (kpis.margem?.acumulado || 0) +
        (kpis.arrecadacao?.acumulado || 0) +
        (kpis.volume?.acumulado || 0)
      ) / 4;
      return { dept, avg };
    }).sort((a, b) => b.avg - a.avg);
  }, [deptKpis]);

  const maxAvg = Math.max(...rankings.map((r) => r.avg), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8 }}
      className="bg-card border border-border rounded-2xl overflow-hidden"
    >
      <div className="bg-gradient-to-r from-amber-600 to-orange-500 px-5 py-3 flex items-center gap-3">
        <Flag className="w-5 h-5 text-white" />
        <h2 className="text-white font-heading font-bold text-lg">Corrida de Metas — Ranking Geral</h2>
      </div>

      <div className="p-5 space-y-3">
        {rankings.map((r, i) => {
          const progress = maxAvg > 0 ? (r.avg / Math.max(maxAvg, 100)) * 100 : 0;
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "4️⃣";
          const barColor = r.avg >= 100 ? "from-emerald-500 to-emerald-400" : r.avg >= 80 ? "from-blue-500 to-blue-400" : "from-red-500 to-red-400";

          return (
            <motion.div key={r.dept} initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.9 + i * 0.15 }}>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-lg">{medal}</span>
                <span className="font-heading font-bold text-foreground text-sm w-24">{r.dept}</span>
                <div className="flex-1 relative">
                  {/* Track */}
                  <div className="h-7 bg-muted/30 rounded-full overflow-hidden relative">
                    {/* Checker pattern at finish line */}
                    <div className="absolute right-0 top-0 bottom-0 w-3 z-10"
                      style={{
                        background: "repeating-conic-gradient(hsl(var(--foreground)) 0% 25%, transparent 0% 50%) 0 0 / 6px 6px",
                        opacity: 0.15,
                      }}
                    />
                    {/* Progress bar */}
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(progress, 100)}%` }}
                      transition={{ duration: 1.5, delay: 1 + i * 0.15, ease: "easeOut" }}
                      className={`h-full bg-gradient-to-r ${barColor} rounded-full flex items-center justify-end pr-2 relative`}
                    >
                      {/* Runner icon */}
                      <motion.span
                        animate={{ y: [0, -2, 0] }}
                        transition={{ repeat: Infinity, duration: 0.5 }}
                        className="text-white text-xs"
                      >
                        🏃
                      </motion.span>
                    </motion.div>
                  </div>
                  {/* Finish line */}
                  <div className="absolute top-0 bottom-0 right-0 flex items-center">
                    <div className="w-0.5 h-full bg-foreground/20" />
                    <Flag className="w-3 h-3 text-amber-500 -ml-0.5 -mt-1" />
                  </div>
                </div>
                <span className={`font-mono font-bold text-sm w-20 text-right ${r.avg >= 100 ? "text-emerald-500" : r.avg >= 80 ? "text-blue-500" : "text-red-500"}`}>
                  {r.avg > 0 ? pctFmt(r.avg) : "—"}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default PIC;
