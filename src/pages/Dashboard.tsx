import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { BarChart3, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import DashboardKPIs from "@/components/dashboard/DashboardKPIs";
import DailyMetricsTable, { DailyRow } from "@/components/dashboard/DailyMetricsTable";
import ProductComparison, { ProductCompRow } from "@/components/dashboard/ProductComparison";
import CategoryChart, { CategoryChartData } from "@/components/dashboard/CategoryChart";
import VendasLojaSection from "@/components/dashboard/VendasLojaSection";
import DashboardFilterBar, { Periodo, periodoFromPreset, TODA_LOJA } from "@/components/dashboard/DashboardFilterBar";
import HierarquiaVendasTable from "@/components/relatorios/HierarquiaVendasTable";

import VrOfflineNotice from "@/components/VrOfflineNotice";
import { useVrRealizado } from "@/hooks/useVrRealizado";
import MascotPersona from "@/components/poster/MascotPersona";
import CouponDivider from "@/components/poster/CouponDivider";

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const PERIODO_KEY = "dashboardPeriodo";
const CATEGORIA_KEY = "dashboardCategoria";

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState("");
  const [metaRows, setMetaRows] = useState<any[]>([]);
  const [storeMetrics, setStoreMetrics] = useState<any>(null);
  const [productData, setProductData] = useState<ProductCompRow[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryChartData[]>([]);

  // Filtros globais da tela (persistem entre abas/navegação)
  const [periodo, setPeriodo] = useState<Periodo>(() => {
    try {
      const s = sessionStorage.getItem(PERIODO_KEY);
      if (s) return JSON.parse(s) as Periodo;
    } catch { /* ignore */ }
    return periodoFromPreset("mes");
  });
  const [categoria, setCategoria] = useState<string>(
    () => sessionStorage.getItem(CATEGORIA_KEY) || TODA_LOJA,
  );

  useEffect(() => {
    sessionStorage.setItem(PERIODO_KEY, JSON.stringify(periodo));
  }, [periodo]);
  useEffect(() => {
    sessionStorage.setItem(CATEGORIA_KEY, categoria);
  }, [categoria]);

  const periodStart = periodo.inicio;
  const periodEnd = periodo.fim;
  const selectedMonth = Number(periodStart.slice(5, 7));
  const selectedYear = Number(periodStart.slice(0, 4));
  const catFiltro = categoria === TODA_LOJA ? null : categoria;

  // Realizado ao vivo do VR (nada e lido de realizado_* do banco)
  const {
    data: vr,
    categorias,
    loading: loadingVr,
    offline,
    errorMsg,
    updatedAt,
    refresh,
  } = useVrRealizado(storeId, periodStart, periodEnd, catFiltro);



  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    if (user) fetchStoreInfo();
  }, [user, authLoading]);

  useEffect(() => {
    if (storeId) {
      fetchDepartments();
    }
  }, [storeId]);

  useEffect(() => {
    if (storeId && selectedDept) {
      fetchDailyData();
    }
  }, [storeId, selectedDept, selectedMonth, selectedYear]);

  useEffect(() => {
    if (storeId) {
      fetchStoreMetrics();
      fetchProductData();
      fetchCategoryData();
    }
  }, [storeId, selectedMonth, selectedYear]);

  useEffect(() => {
    if (!storeId) return;
    const channel = supabase
      .channel(`dash-sdm-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_daily_metrics", filter: `store_id=eq.${storeId}` },
        () => {
          if (selectedDept) fetchDailyData();
          fetchStoreMetrics();
          fetchCategoryData();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [storeId, selectedDept, selectedMonth, selectedYear]);


  const fetchStoreInfo = async () => {
    const sid = sessionStorage.getItem("selectedStoreId");
    if (sid) {
      const { data } = await supabase.from("stores").select("id, name").eq("id", sid).single();
      if (data) {
        setStoreName(data.name);
        setStoreId(data.id);
      }
    } else {
      const { data } = await supabase
        .from("user_store_access")
        .select("stores(id, name)")
        .eq("user_id", user!.id)
        .eq("approved", true)
        .limit(1);
      if (data && data.length > 0) {
        const store = (data[0] as any).stores;
        if (store) {
          setStoreName(store.name);
          setStoreId(store.id);
        }
      }
    }
  };

  const fetchDepartments = async () => {
    const { data } = await supabase
      .from("store_daily_metrics")
      .select("department")
      .eq("store_id", storeId);
    if (data) {
      const unique = [...new Set(data.map((d) => d.department))].sort();
      setDepartments(unique);
      if (unique.length > 0 && !selectedDept) setSelectedDept(unique[0]);
    }

    // Also check store_department_metrics for departments
    if (!data || data.length === 0) {
      const { data: deptData } = await supabase
        .from("store_department_metrics")
        .select("department")
        .eq("store_id", storeId);
      if (deptData) {
        const unique = [...new Set(deptData.map((d) => d.department))].sort();
        setDepartments(unique);
        if (unique.length > 0 && !selectedDept) setSelectedDept(unique[0]);
      }
    }
  };

  const fetchDailyData = async () => {
    const { data } = await supabase
      .from("store_daily_metrics")
      .select("date, tipo_dia, meta_vendas, meta_lucro, meta_margem_pct, meta_volume, projecao_vendas, projecao_lucro, projecao_margem_pct, projecao_volume")
      .eq("store_id", storeId)
      .eq("department", selectedDept)
      .gte("date", periodStart)
      .lte("date", periodEnd)
      .order("date");

    setMetaRows(data || []);
  };

  // Metas (banco) + realizado ao vivo (VR)
  const dailyData: DailyRow[] = useMemo(() => {
    if (!vr) return [];
    const real = new Map((vr[selectedDept] || []).map((r) => [r.date, r]));
    const dates = [...new Set<string>([...metaRows.map((m: any) => m.date), ...real.keys()])].sort();
    return dates.map((date) => {
      const d: any = metaRows.find((m: any) => m.date === date) || {};
      const r = real.get(date);
      return {
        date: new Date(date + "T12:00:00").toLocaleDateString("pt-BR"),
        tipoDia: d.tipo_dia,
        metaVendas: Number(d.meta_vendas) || 0,
        realizadoVendas: r?.vendas || 0,
        projecaoVendas: Number(d.projecao_vendas) || 0,
        metaLucro: Number(d.meta_lucro) || 0,
        realizadoLucro: r?.lucro || 0,
        projecaoLucro: Number(d.projecao_lucro) || 0,
        metaMargemPct: Number(d.meta_margem_pct) || 0,
        realizadoMargemPct: r?.margemPct || 0,
        projecaoMargemPct: Number(d.projecao_margem_pct) || 0,
        metaVolume: Number(d.meta_volume) || 0,
        realizadoVolume: r?.volume || 0,
        projecaoVolume: Number(d.projecao_volume) || 0,
      };
    });
  }, [metaRows, vr, selectedDept]);


  const fetchStoreMetrics = async () => {
    const { data } = await supabase
      .from("store_metrics")
      .select("*")
      .eq("store_id", storeId)
      .eq("month", selectedMonth)
      .eq("year", selectedYear)
      .single();
    setStoreMetrics(data);
  };

  const fetchProductData = async () => {
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevMonthYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

    const [{ data: current }, { data: prevMo }, { data: prevYr }] = await Promise.all([
      supabase.from("store_product_metrics").select("*").eq("store_id", storeId).eq("month", selectedMonth).eq("year", selectedYear),
      supabase.from("store_product_metrics").select("*").eq("store_id", storeId).eq("month", prevMonth).eq("year", prevMonthYear),
      supabase.from("store_product_metrics").select("*").eq("store_id", storeId).eq("month", selectedMonth).eq("year", selectedYear - 1),
    ]);

    if (current && current.length > 0) {
      const prevMoMap = new Map((prevMo || []).map((p) => [p.product_name, p]));
      const prevYrMap = new Map((prevYr || []).map((p) => [p.product_name, p]));

      setProductData(
        current.map((p) => ({
          name: p.product_name,
          valorAtual: Number(p.vendas_valor) || 0,
          valorMesAnterior: Number(prevMoMap.get(p.product_name)?.vendas_valor) || 0,
          valorAnoAnterior: Number(prevYrMap.get(p.product_name)?.vendas_valor) || 0,
          volumeAtual: Number(p.vendas_volume) || 0,
          volumeMesAnterior: Number(prevMoMap.get(p.product_name)?.vendas_volume) || 0,
          volumeAnoAnterior: Number(prevYrMap.get(p.product_name)?.vendas_volume) || 0,
        }))
      );
    } else {
      setProductData([]);
    }
  };

  const fetchCategoryData = async () => {
    const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1;
    const prevMonthYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear;

    const [{ data: current }, { data: prevMo }, { data: prevYr }] = await Promise.all([
      supabase.from("store_department_metrics").select("*").eq("store_id", storeId).eq("month", selectedMonth).eq("year", selectedYear),
      supabase.from("store_department_metrics").select("*").eq("store_id", storeId).eq("month", prevMonth).eq("year", prevMonthYear),
      supabase.from("store_department_metrics").select("*").eq("store_id", storeId).eq("month", selectedMonth).eq("year", selectedYear - 1),
    ]);

    if (current && current.length > 0) {
      const prevMoMap = new Map((prevMo || []).map((d) => [d.department, d]));
      const prevYrMap = new Map((prevYr || []).map((d) => [d.department, d]));

      setCategoryData(
        current.map((d) => ({
          category: d.department,
          atual: Number(d.faturamento) || 0,
          mesAnterior: Number(prevMoMap.get(d.department)?.faturamento) || 0,
          anoAnterior: Number(prevYrMap.get(d.department)?.faturamento) || 0,
        }))
      );
    } else {
      setCategoryData([]);
    }
  };

  const kpiData = useMemo(() => {
    const m = storeMetrics;
    const fat = Number(m?.faturamento) || 0;
    const metaFat = Number(m?.meta_faturamento) || 0;
    const margem = Number(m?.margem) || 0;
    const clientes = Number(m?.clientes) || 0;
    const ticket = Number(m?.ticket_medio) || 0;

    // Calculate accumulated from daily data
    const metaAcumVendas = dailyData.reduce((s, d) => s + d.metaVendas, 0);
    const realVendas = dailyData.reduce((s, d) => s + d.realizadoVendas, 0);
    const projVendas = dailyData.reduce((s, d) => s + d.projecaoVendas, 0);
    const metaAcumLucro = dailyData.reduce((s, d) => s + d.metaLucro, 0);
    const realLucro = dailyData.reduce((s, d) => s + d.realizadoLucro, 0);
    const projLucro = dailyData.reduce((s, d) => s + d.projecaoLucro, 0);
    const metaAcumVol = dailyData.reduce((s, d) => s + d.metaVolume, 0);
    const realVol = dailyData.reduce((s, d) => s + d.realizadoVolume, 0);
    const projVol = dailyData.reduce((s, d) => s + d.projecaoVolume, 0);

    // Standardized margin: realized profit ÷ realized revenue (same rule everywhere in the app)
    const metaMargemPct = metaAcumVendas > 0 ? (metaAcumLucro / metaAcumVendas) * 100 : 0;
    const realMargemPct = realVendas > 0 ? (realLucro / realVendas) * 100 : 0;
    const projMargemPct = projVendas > 0 ? (projLucro / projVendas) * 100 : 0;

    return {
      vendas: {
        metaMensal: metaFat || metaAcumVendas,
        metaAcumulada: metaAcumVendas || fat,
        realizado: realVendas || fat,
        realizadoPct: metaAcumVendas > 0 ? (realVendas / metaAcumVendas) * 100 : metaFat > 0 ? (fat / metaFat) * 100 : 0,
        projecao: projVendas,
        projecaoPct: metaFat > 0 ? (projVendas / metaFat) * 100 : 0,
      },
      lucro: {
        metaMensal: metaAcumLucro,
        metaAcumulada: metaAcumLucro,
        realizado: realLucro,
        realizadoPct: metaAcumLucro > 0 ? (realLucro / metaAcumLucro) * 100 : 0,
        projecao: projLucro,
        projecaoPct: metaAcumLucro > 0 ? (projLucro / metaAcumLucro) * 100 : 0,
      },
      margem: {
        metaPct: metaMargemPct,
        realizadoPct: realMargemPct,
        projecaoPct: projMargemPct,
      },
      volume: {
        metaMensal: metaAcumVol,
        metaAcumulada: metaAcumVol,
        realizado: realVol,
        realizadoPct: metaAcumVol > 0 ? (realVol / metaAcumVol) * 100 : 0,
        projecao: projVol,
        projecaoPct: metaAcumVol > 0 ? (projVol / metaAcumVol) * 100 : 0,
      },
    };
  }, [dailyData, storeMetrics]);

  // Lojas Nascimento: exibir apenas o bloco "Vendas da Loja"
  const soLoja = /nascimento/i.test(storeName);

  if (authLoading) {

    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-6 py-6 max-w-[1400px]">
        {/* Barra de filtros global da tela */}
        <DashboardFilterBar
          periodo={periodo}
          onPeriodoChange={setPeriodo}
          categoria={categoria}
          onCategoriaChange={setCategoria}
          categorias={categorias}
          onRefresh={refresh}
          loading={loadingVr}
        />

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-secondary text-primary flex items-center justify-center border border-border">
                <BarChart3 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-foreground leading-tight">
                  {storeName || "Dashboard"}
                </h1>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {new Date(periodStart + "T12:00:00").toLocaleDateString("pt-BR")} a{" "}
                  {new Date(periodEnd + "T12:00:00").toLocaleDateString("pt-BR")}
                  {" · "}
                  {categoria === TODA_LOJA ? "Loja toda" : categoria}
                  {selectedDept ? ` · ${selectedDept}` : ""}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!soLoja && departments.length > 0 && (
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="bg-card text-foreground border border-border rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
              {!offline && updatedAt && (
                <span className="text-[11px] text-muted-foreground">
                  VR ao vivo · {updatedAt.toLocaleTimeString("pt-BR")}
                </span>
              )}
            </div>
          </div>
        </motion.div>

        {offline && <VrOfflineNotice message={errorMsg} className="mb-6" />}

        {/* KPI Cards */}
        {!soLoja && !offline && <DashboardKPIs {...kpiData} />}

        {/* Vendas da Loja (department = LOJA) */}
        {storeId && (
          <VendasLojaSection
            storeId={storeId}
            startDate={periodStart}
            endDate={periodEnd}
            categoria={catFiltro}
          />
        )}

        {!soLoja && (
          <>
            <CouponDivider label={`Faturamento x margem por dia${selectedDept ? ` — ${selectedDept}` : ""}`} />
            {offline ? <VrOfflineNotice message={errorMsg} /> : <DailyMetricsTable data={dailyData} />}

            {/* Product Comparison */}
            <ProductComparison
              data={productData}
              title={`Comparativo de produtos — ${MONTHS[selectedMonth]} ${selectedYear}`}
            />
          </>
        )}

        {/* Mercadológico com abertura até produto (todos os clientes) */}
        {storeId && (
          <div className="mt-6">
            <HierarquiaVendasTable storeId={storeId} inicio={periodStart} fim={periodEnd} />
          </div>
        )}

        {!soLoja && categoryData.length > 0 && (
          <div className="mt-6">
            <CategoryChart
              data={categoryData}
              title="Vendas por seção (comparado com mês anterior e ano anterior)"
            />
          </div>
        )}

      </div>
    </ClientLayout>
  );
};


export default Dashboard;
