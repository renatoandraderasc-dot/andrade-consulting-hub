import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Trophy, TrendingUp, TrendingDown, Calendar, Filter, Sparkles, Flag, ChevronDown, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import SyncStatusBadge from "@/components/SyncStatusBadge";
import VrOfflineNotice from "@/components/VrOfflineNotice";
import { useVrRealizado, VrDia, LOJA } from "@/hooks/useVrRealizado";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import HierarquiaVendasTable from "@/components/relatorios/HierarquiaVendasTable";
import { usePicDepartments } from "@/hooks/usePicDepartments";
import { usePicDisplayMode } from "@/hooks/usePicDisplay";
import ProdutosSemGiro from "@/components/pic/ProdutosSemGiro";




const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const DEFAULT_DEPARTMENTS = ["PADARIA", "AÇOUGUE", "HORTIFRUTI"];
const KPI_LABELS: Record<string, string> = {
  faturamento: "Faturamento",
  quantidade: "Volume",
  arrecadacao: "Arrecadação",
  volume: "MIX de Produtos",
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
  realizado_mix: number;
  meta_mix: number;

}

interface KpiData {
  // Percentuais de progresso
  pctTotal: number;       // Realizado / Meta Mensal
  pctAcumulado: number;   // Realizado até hoje / Meta Acumulada até hoje
  // Valores absolutos
  realizado: number;      // realizado até hoje (ou fim de mês, se mês passado)
  metaMensal: number;     // meta total do mês
  metaAcumulada: number;  // meta até o dia de hoje
  projecao: number;       // realizado até ontem + metas de hoje até o fim do mês
  pctProjecao: number;    // projeção / meta mensal
  hasMeta: boolean;
  daily: { day: number; pct: number; realizado: number; meta: number; hasMeta: boolean }[];
}


const pctFmt = (v: number) => `${v.toFixed(2).replace(".", ",")}%`;

const PIC = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [diaInicio, setDiaInicio] = useState(1);
  const [diaFim, setDiaFim] = useState(0); // 0 = último dia do mês
  const [viewMode, setViewMode] = useState<"mes" | "dia">("mes");
  const [metasData, setMetasData] = useState<Record<string, any[]>>({});
  const [metaMix, setMetaMix] = useState<Record<string, number>>({});
  const [metasMes, setMetasMes] = useState<Record<string, { vendas: number; lucro: number; volume: number; mix: number }>>({});
  const picMode = usePicDisplayMode(storeId);
  const soPct = picMode === "percentual";

  const [loading, setLoading] = useState(true);

  const diasNoMesSel = new Date(selectedYear, selectedMonth, 0).getDate();
  const diaIniEfetivo = Math.min(Math.max(diaInicio, 1), diasNoMesSel);
  const diaFimEfetivo = Math.min(Math.max(diaFim || diasNoMesSel, diaIniEfetivo), diasNoMesSel);
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const periodStart = `${selectedYear}-${pad2(selectedMonth)}-${pad2(diaIniEfetivo)}`;
  const periodEnd = `${selectedYear}-${pad2(selectedMonth)}-${pad2(diaFimEfetivo)}`;

  // Realizado sempre ao vivo, via vr-proxy (nada vem de realizado_* do banco)
  const {
    data: vr,
    loading: loadingVr,
    offline,
    errorMsg,
    updatedAt,
    refresh,
  } = useVrRealizado(storeId, periodStart, periodEnd);

  // Departamentos exibidos: configuracao por cliente (Admin > Departamentos do
  // PIC) quando existir; senao os padroes; senao os que vierem do sistema da
  // loja; e, em ultimo caso, o total da loja.
  const deptsConfig = usePicDepartments(storeId);
  const DEPARTMENTS = useMemo(() => {
    if (deptsConfig?.length) return deptsConfig;

    const todas = Object.keys(vr ?? {});
    const keys = todas.filter((k) => k !== LOJA);
    const temLoja = todas.includes(LOJA);
    const presentes = DEFAULT_DEPARTMENTS.filter((d) => keys.includes(d));
    if (presentes.length) return temLoja ? [LOJA, ...presentes] : presentes;
    if (keys.length) {
      const ordenado = keys.sort((a, b) => a.localeCompare(b, "pt-BR"));
      return temLoja ? [LOJA, ...ordenado] : ordenado;
    }
    return [LOJA];
  }, [vr, deptsConfig]);


  useEffect(() => {
    if (!authLoading && !user) { navigate("/login"); return; }
    if (user) fetchStoreInfo();
  }, [user, authLoading, isAdmin]);

  useEffect(() => {
    if (storeId) fetchMetas();
  }, [storeId, selectedMonth, selectedYear, diaIniEfetivo, diaFimEfetivo]);

  useEffect(() => {
    if (!storeId) return;
    const interval = setInterval(refresh, 60_000);
    const handleFocus = () => refresh();
    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [storeId, refresh]);

  const fetchStoreInfo = async () => {
    if (!user) return;

    const selectedStoreId = sessionStorage.getItem("selectedStoreId");
    if (selectedStoreId) {
      const { data } = await supabase
        .from("stores")
        .select("id, name")
        .eq("id", selectedStoreId)
        .single();
      if (data) {
        setStoreId(data.id);
        setStoreName(data.name);
        return;
      }
    }

    const { data: access } = await supabase
      .from("user_store_access").select("store_id, stores(name)").eq("user_id", user.id).eq("approved", true).limit(1).maybeSingle();
    if (access) {
      setStoreId(access.store_id);
      setStoreName((access as any).stores?.name || "");
      return;
    }

    if (isAdmin) {
      const { data: vrStore } = await supabase
        .from("store_vr_config")
        .select("store_id, stores(name)")
        .eq("enabled", true)
        .order("last_sync_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();

      if (vrStore) {
        setStoreId(vrStore.store_id);
        setStoreName((vrStore as any).stores?.name || "");
      }
    }
  };

  // Metas continuam vindo de store_daily_metrics (colunas meta_*)
  const fetchMetas = async () => {
    setLoading(true);
    const mesInicio = `${selectedYear}-${pad2(selectedMonth)}-01`;
    const mesFim = `${selectedYear}-${pad2(selectedMonth)}-${pad2(diasNoMesSel)}`;
    const [{ data }, { data: mixRows }, { data: mesRows }] = await Promise.all([
      supabase
        .from("store_daily_metrics")
        .select("date, department, meta_vendas, meta_lucro, meta_margem_pct, meta_volume, meta_mix")
        .eq("store_id", storeId)
        .gte("date", periodStart)
        .lte("date", periodEnd)
        .order("date", { ascending: true }),
      supabase
        .from("meta_mix")
        .select("department, meta_mix")
        .eq("store_id", storeId)
        .eq("ano", selectedYear)
        .eq("mes", selectedMonth),
      supabase
        .from("store_daily_metrics")
        .select("department, meta_vendas, meta_lucro, meta_volume, meta_mix")
        .eq("store_id", storeId)
        .gte("date", mesInicio)
        .lte("date", mesFim),
    ]);

    const results: Record<string, any[]> = {};
    for (const d of data || []) (results[d.department] ||= []).push(d);
    setMetasData(results);
    // Meta do mês inteiro (denominador do TOTAL), independente do filtro de dias
    const mes: Record<string, { vendas: number; lucro: number; volume: number; mix: number }> = {};
    for (const r of mesRows || []) {
      const acc = (mes[r.department] ||= { vendas: 0, lucro: 0, volume: 0, mix: 0 });
      acc.vendas += Number(r.meta_vendas) || 0;
      acc.lucro += Number(r.meta_lucro) || 0;
      acc.volume += Number(r.meta_volume) || 0;
      acc.mix += Number(r.meta_mix) || 0;
    }
    setMetasMes(mes);
    setMetaMix(Object.fromEntries((mixRows || []).map((m: any) => [m.department, Number(m.meta_mix) || 0])));
    setLoading(false);
  };



  // Combina metas (banco) com realizado ao vivo (VR)
  const rawData = useMemo(() => {
    const out: Record<string, DayMetric[]> = {};
    for (const dept of DEPARTMENTS) {
      const metas = metasData[dept] || [];
      const real = new Map<string, VrDia>(((vr?.[dept]) || []).map((r) => [r.date, r] as [string, VrDia]));
      const dates = [...new Set<string>([...metas.map((m: any) => m.date), ...real.keys()])].sort();
      out[dept] = dates.map((date) => {
        const m: any = metas.find((x: any) => x.date === date) || {};
        const r = real.get(date);
        return {
          day: Number(date.slice(8, 10)),
          date,
          meta_vendas: Number(m.meta_vendas) || 0,
          realizado_vendas: r?.vendas || 0,
          meta_lucro: Number(m.meta_lucro) || 0,
          realizado_lucro: r?.lucro || 0,
          meta_margem_pct: Number(m.meta_margem_pct) || 0,
          realizado_margem_pct: r?.margemPct || 0,
          meta_volume: Number(m.meta_volume) || 0,
          realizado_volume: r?.volume || 0,
          realizado_mix: r?.mix || 0,
          meta_mix: Number(m.meta_mix) || 0,
        };

      });
    }
    return out;
  }, [metasData, vr]);

  const handleSyncChange = useCallback(() => {
    refresh();
  }, [refresh]);


  // Determina o "dia de hoje" (fuso de Brasília) para o corte do acumulado.
  // Se o mês selecionado é o mês atual → dia corrente.
  // Se for mês passado → último dia com dados; se futuro → 0.
  const hojeSP = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  const spYear = Number(hojeSP.slice(0, 4));
  const spMonth = Number(hojeSP.slice(5, 7));
  const spDay = Number(hojeSP.slice(8, 10));
  const isCurrentMonth = spYear === selectedYear && spMonth === selectedMonth;
  const isPastMonth =
    selectedYear < spYear || (selectedYear === spYear && selectedMonth < spMonth);
  const cutoffDay = Math.min(
    isCurrentMonth ? spDay : isPastMonth ? 31 : 0,
    diaFimEfetivo,
  );



  // Build KPI data per department
  const deptKpis = useMemo(() => {
    const result: Record<string, Record<string, KpiData>> = {};
    for (const dept of DEPARTMENTS) {
      // Ignora dias sem operação (meta e realizado zerados em todos os indicadores)
      const rows = (rawData[dept] || []).filter(
        (r) =>
          r.meta_vendas > 0 ||
          r.realizado_vendas > 0 ||
          r.meta_lucro > 0 ||
          r.realizado_lucro > 0 ||
          r.meta_volume > 0 ||
          r.realizado_volume > 0 ||
          r.meta_margem_pct > 0 ||
          r.realizado_margem_pct > 0 ||
          r.realizado_mix > 0,
      );

      result[dept] = {};

      const mesDept = metasMes[dept];

      // realizado = soma dos dias já decorridos (data <= hoje em Brasília)
      // ACUMUL. = realizado / soma das metas dos dias <= hoje
      // TOTAL   = realizado / meta do mês inteiro
      const calcKpi = (
        metaKey: keyof DayMetric,
        realKey: keyof DayMetric,
        metaMesTotal?: number,
      ) => {
        let metaPeriodo = 0, metaAcumulada = 0, realizado = 0;
        let realizadoOntem = 0, metaRestante = 0;
        let accMetaRun = 0, accRealRun = 0;
        const daily: KpiData["daily"] = [];
        for (const r of rows) {
          const m = Number(r[metaKey]) || 0;
          const v = Number(r[realKey]) || 0;
          metaPeriodo += m;
          if (r.day <= cutoffDay) {
            metaAcumulada += m;
            realizado += v;
            accMetaRun += m;
            accRealRun += v;
            if (r.day < cutoffDay) realizadoOntem += v;
            const pct = accMetaRun > 0 ? (accRealRun / accMetaRun) * 100 : 0;
            // Só dias já ocorridos entram no acumulado diário
            daily.push({ day: r.day, pct, realizado: v, meta: m, hasMeta: m > 0 });
          } else {
            metaRestante += m;
          }
        }
        // Projeção: realizado até o dia anterior + metas do dia atual ao fim do mês
        const metaHojeEmDiante =
          metaRestante + (rows.find((r) => r.day === cutoffDay) ? Number(rows.find((r) => r.day === cutoffDay)![metaKey]) || 0 : 0);
        const projecao = realizadoOntem + metaHojeEmDiante;
        const metaMensal = Number(metaMesTotal) > 0 ? Number(metaMesTotal) : metaPeriodo;
        const pctTotal = metaMensal > 0 ? (realizado / metaMensal) * 100 : 0;
        const pctAcumulado = metaAcumulada > 0 ? (realizado / metaAcumulada) * 100 : 0;
        return {
          pctTotal,
          pctAcumulado,
          realizado,
          metaMensal,
          metaAcumulada,
          projecao,
          pctProjecao: metaMensal > 0 ? (projecao / metaMensal) * 100 : 0,
          hasMeta: metaMensal > 0 || metaAcumulada > 0,
          daily,
        };
      };

      result[dept].faturamento = calcKpi("meta_vendas", "realizado_vendas", mesDept?.vendas);
      result[dept].quantidade = calcKpi("meta_volume", "realizado_volume", mesDept?.volume);
      result[dept].arrecadacao = calcKpi("meta_lucro", "realizado_lucro", mesDept?.lucro);
      // Mix: realizado ao vivo (positivação acumulada) x meta mensal de meta_mix.
      // A meta de mix é mensal: o acumulado até hoje é pro-rata dos dias decorridos.
      const metaMensalMix =
        Number(metaMix[dept]) ||
        Number(mesDept?.mix) ||
        rows.reduce((a, r) => a + (Number(r.meta_mix) || 0), 0);
      {
        let realizado = 0, acumulado = 0;
        let diasDecorridos = 0;
        const daily: KpiData["daily"] = [];
        for (const r of rows) {
          if (r.day > cutoffDay) continue; // dias futuros não entram no acumulado
          acumulado += Number(r.realizado_mix) || 0;
          realizado = acumulado;
          diasDecorridos += 1;
          daily.push({
            day: r.day,
            pct: metaMensalMix > 0 ? (acumulado / metaMensalMix) * 100 : 0,
            realizado: acumulado,
            meta: metaMensalMix,
            hasMeta: metaMensalMix > 0,
          });
        }
        const totalDias = rows.length || diasNoMesSel;
        const metaAcumMix =
          totalDias > 0 ? (metaMensalMix * diasDecorridos) / totalDias : 0;
        result[dept].volume = {
          pctTotal: metaMensalMix > 0 ? (realizado / metaMensalMix) * 100 : 0,
          pctAcumulado: metaAcumMix > 0 ? (realizado / metaAcumMix) * 100 : 0,
          realizado,
          metaMensal: metaMensalMix,
          metaAcumulada: metaAcumMix,
          projecao: metaMensalMix,
          pctProjecao: metaMensalMix > 0 ? 100 : 0,
          hasMeta: metaMensalMix > 0,
          daily,
        };
      }


    }
    return result;
  }, [rawData, cutoffDay, metaMix, metasMes, diasNoMesSel]);


  // AI Analysis
  const aiAnalysis = useMemo(() => {
    const insights: string[] = [];
    for (const dept of DEPARTMENTS) {
      const kpis = deptKpis[dept];
      if (!kpis) continue;
      const fat = kpis.faturamento?.pctAcumulado || 0;
      const vol = kpis.quantidade?.pctAcumulado || 0;

      if (fat >= 100) insights.push(`🏆 ${dept} superou a meta de faturamento com ${pctFmt(fat)}!`);
      else if (fat >= 90) insights.push(`📈 ${dept} está próximo da meta de faturamento (${pctFmt(fat)}).`);
      else if (fat > 0 && fat < 70) insights.push(`⚠️ ${dept} está abaixo de 70% da meta de faturamento (${pctFmt(fat)}).`);

      if (vol >= 100) insights.push(`✅ ${dept}: volume acima da meta (${pctFmt(vol)}).`);
      else if (vol > 0 && vol < 80) insights.push(`🔴 ${dept}: volume crítico em ${pctFmt(vol)} da meta.`);
    }
    if (insights.length === 0) insights.push("📊 Sem dados suficientes para análise neste período.");
    return insights;
  }, [deptKpis]);

  const today = new Date().getDate();

  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto" translate="no">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-2.5 rounded-xl shadow-lg">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-heading text-foreground" translate="no">PIC — Painel de Indicadores Comerciais</h1>
              <div className="flex items-center gap-3 flex-wrap mt-1">
                <p className="text-sm text-muted-foreground font-body">Acompanhamento de metas por departamento</p>
                {storeId && <SyncStatusBadge storeId={storeId} onSyncChange={handleSyncChange} />}
              </div>
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
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Dias</span>
              <Select value={String(diaIniEfetivo)} onValueChange={(v) => setDiaInicio(Number(v))}>
                <SelectTrigger className="w-[70px] bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: diasNoMesSel }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[11px] text-muted-foreground">até</span>
              <Select value={String(diaFimEfetivo)} onValueChange={(v) => setDiaFim(Number(v))}>
                <SelectTrigger className="w-[70px] bg-card border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: diasNoMesSel }, (_, i) => i + 1).map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="ml-2">
              <TabsList className="bg-card border border-border">
                <TabsTrigger value="mes" className="text-xs">Mensal</TabsTrigger>
                <TabsTrigger value="dia" className="text-xs">Diário</TabsTrigger>
              </TabsList>
            </Tabs>
            <button
              onClick={refresh}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs text-foreground hover:bg-muted/40"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingVr ? "animate-spin" : ""}`} /> Atualizar
            </button>
            {!offline && updatedAt && (
              <span className="text-[11px] text-muted-foreground">
                VR ao vivo · {updatedAt.toLocaleTimeString("pt-BR")}
              </span>
            )}
          </div>
        </motion.div>

        {offline ? (
          <VrOfflineNotice message={errorMsg} />
        ) : (
          <>
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
                <DepartmentCard key={dept} dept={dept} kpis={deptKpis[dept] || {}} viewMode={viewMode} delay={deptIdx * 0.1} today={today} soPct={soPct} />
              ))}
            </div>

            {/* Todos os mercadológicos, com abertura até produto */}
            {storeId && !soPct && (
              <HierarquiaVendasTable
                storeId={storeId}
                inicio={periodStart}
                fim={periodEnd}
                title="Todos os mercadológicos"
              />
            )}

            {/* Finish Line Animation */}
            <FinishLineAnimation deptKpis={deptKpis} departments={DEPARTMENTS} />

            {/* Produtos sem giro / em queda por categoria */}
            {storeId && (
              <ProdutosSemGiro storeId={storeId} ano={selectedYear} mes={selectedMonth} />
            )}


          </>
        )}

      </div>
    </ClientLayout>
  );
};

// ========== DEPARTMENT CARD ==========
interface DeptCardProps {
  dept: string;
  kpis: Record<string, KpiData>;
  viewMode: "mes" | "dia";
  delay: number;
  today: number;
  soPct: boolean;
}

const DepartmentCard = ({ dept, kpis, viewMode, delay, today, soPct }: DeptCardProps) => {
  const kpiKeys = ["faturamento", "quantidade", "volume", "arrecadacao"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 + delay, duration: 0.5 }}
      className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm"
    >
      {/* Department Header */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-700 px-5 py-3 flex items-center justify-between">
        <h2 className="text-white font-heading font-bold text-lg tracking-wide" translate="no">{dept}</h2>
        <div className="flex items-center gap-1.5">
          {kpiKeys.map((k) => {
            const val = kpis[k]?.pctAcumulado || 0;
            return (
              <span key={k} className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${val >= 100 ? "bg-emerald-500/20 text-emerald-400" : val >= 80 ? "bg-amber-500/20 text-amber-400" : "bg-red-500/20 text-red-400"}`}>
                {KPI_LABELS[k]?.charAt(0)}: {kpis[k]?.hasMeta ? pctFmt(val) : kpis[k]?.realizado > 0 ? "Real." : "—"}
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
            <KpiSection key={kpiKey} label={KPI_LABELS[kpiKey]} kpi={kpiData} viewMode={viewMode} today={today} soPct={soPct} />
          );
        })}
      </div>
    </motion.div>
  );
};

// ========== KPI SECTION (Horizontal Bar Chart) ==========
interface KpiSectionProps {
  label: string;
  kpi: KpiData;
  viewMode: "mes" | "dia";
  today: number;
  soPct: boolean;
}

const KpiSection = ({ label, kpi, viewMode, today, soPct }: KpiSectionProps) => {
  const [expanded, setExpanded] = useState(false);
  const acumValido = kpi.metaAcumulada > 0;
  const totalValido = kpi.metaMensal > 0;
  const acumColor = kpi.pctAcumulado >= 100 ? "bg-emerald-500" : kpi.pctAcumulado >= 80 ? "bg-blue-500" : "bg-red-500";
  const totalColor = kpi.pctTotal >= 100 ? "bg-emerald-500" : kpi.pctTotal >= 80 ? "bg-blue-500" : "bg-amber-500";
  const isCurrency = label !== "Volume" && label !== "MIX de Produtos";
  const valueFmt = (value: number) => {
    if (soPct) return "—";
    if (label === "Volume" || label === "MIX de Produtos") return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
    return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  };

  const renderBar = (
    labelBar: string,
    pct: number,
    barColor: string,
    tooltipTitle: string,
    tooltipSub: string,
    valido = true,
  ) => (
    <div className="flex items-center gap-2 mb-1" title={`${tooltipTitle}\n${tooltipSub}`}>
      <span className="text-[10px] text-muted-foreground font-mono w-16 shrink-0">{labelBar}</span>
      <div className="flex-1 h-5 bg-muted/40 rounded-sm overflow-hidden relative">
        {valido && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(pct, 120)}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className={`h-full ${barColor} rounded-sm`}
            style={{ maxWidth: "100%" }}
          />
        )}
        <div className="absolute top-0 bottom-0 w-px bg-foreground/20" style={{ left: "100%" }} />
      </div>
      <span className={`text-xs font-mono font-bold w-20 text-right ${!valido ? "text-muted-foreground" : pct >= 100 ? "text-emerald-500" : pct >= 80 ? "text-blue-500" : "text-red-500"}`}>
        {valido ? pctFmt(pct) : "—"}
      </span>
    </div>
  );


  return (
    <div translate="no">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between mb-1.5 group cursor-pointer">
        <span className="text-xs font-heading font-bold text-foreground uppercase tracking-wider">{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {kpi.hasMeta ? (
        <>
          {renderBar(
            "ACUMUL.",
            kpi.pctAcumulado,
            acumColor,
            `Progresso da Meta Acumulada até hoje`,
            soPct ? "" : `Realizado ${valueFmt(kpi.realizado)} / Meta acum. ${valueFmt(kpi.metaAcumulada)}`,
            acumValido,
          )}
          {renderBar(
            "TOTAL",
            kpi.pctTotal,
            totalColor,
            `Progresso Total do mês`,
            soPct ? "" : `Realizado ${valueFmt(kpi.realizado)} / Meta mensal ${valueFmt(kpi.metaMensal)}`,
            totalValido,
          )}
          {renderBar(
            "PROJ.",
            kpi.pctProjecao,
            projColor,
            `Projeção do mês`,
            soPct ? "" : `Realizado até ontem + metas até o fim do mês: ${valueFmt(kpi.projecao)}`,
            totalValido,
          )}
          {!soPct && (
            <p className="ml-[4.5rem] text-[10px] text-muted-foreground font-mono">
              Meta acum. {valueFmt(kpi.metaAcumulada)} · Meta mês {valueFmt(kpi.metaMensal)} · Realizado {valueFmt(kpi.realizado)} · Projeção {valueFmt(kpi.projecao)}
            </p>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-muted-foreground font-mono w-16 shrink-0">REALIZ.</span>
            <div className="flex-1 h-5 bg-muted/40 rounded-sm overflow-hidden relative">
              {kpi.realizado > 0 && (
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 1, ease: "easeOut" }}
                  className="h-full bg-blue-500 rounded-sm"
                />
              )}
            </div>
            <span className={`text-xs font-mono font-bold w-20 text-right ${kpi.realizado > 0 ? "text-blue-500" : "text-muted-foreground"}`}>
              {kpi.realizado > 0 ? (soPct ? "Real." : valueFmt(kpi.realizado)) : "—"}
            </span>
          </div>
          {kpi.realizado > 0 && (
            <p className="ml-[4.5rem] text-[10px] text-muted-foreground font-mono">sem meta cadastrada</p>
          )}
        </>
      )}


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
                const barColor = d.hasMeta ? d.pct >= 100 ? "bg-emerald-500" : d.pct >= 80 ? "bg-blue-500" : "bg-red-500" : "bg-blue-500";
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
                        animate={{ width: d.hasMeta ? `${Math.min(d.pct, 120)}%` : d.realizado > 0 ? "100%" : "0%" }}
                        transition={{ duration: 0.6, delay: i * 0.02 }}
                        className={`h-full ${barColor} rounded-sm`}
                        style={{ maxWidth: "100%" }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono w-20 text-right ${d.hasMeta ? d.pct >= 100 ? "text-emerald-500" : d.pct >= 80 ? "text-blue-500" : "text-red-500" : d.realizado > 0 ? "text-blue-500" : "text-muted-foreground"}`}>
                      {d.hasMeta ? pctFmt(d.pct) : d.realizado > 0 ? (soPct ? "Real." : valueFmt(d.realizado)) : "—"}
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
const FinishLineAnimation = ({ deptKpis, departments }: { deptKpis: Record<string, Record<string, KpiData>>; departments: string[] }) => {
  const rankings = useMemo(() => {
    return departments.map((dept) => {
      const kpis = deptKpis[dept] || {};
      const avg = (
        (kpis.faturamento?.pctAcumulado || 0) +
        (kpis.quantidade?.pctAcumulado || 0) +
        (kpis.arrecadacao?.pctAcumulado || 0) +
        (kpis.volume?.pctAcumulado || 0)
      ) / 4;
      return { dept, avg };
    }).sort((a, b) => b.avg - a.avg);
  }, [deptKpis, departments]);

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
