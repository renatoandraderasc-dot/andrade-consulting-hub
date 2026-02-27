import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import DashboardKPIs from "@/components/dashboard/DashboardKPIs";
import DailyMetricsTable, { DailyRow } from "@/components/dashboard/DailyMetricsTable";
import ProductComparison, { ProductCompRow } from "@/components/dashboard/ProductComparison";
import CategoryChart, { CategoryChartData } from "@/components/dashboard/CategoryChart";

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [dailyData, setDailyData] = useState<DailyRow[]>([]);
  const [storeMetrics, setStoreMetrics] = useState<any>(null);
  const [productData, setProductData] = useState<ProductCompRow[]>([]);
  const [categoryData, setCategoryData] = useState<CategoryChartData[]>([]);

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
    const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
    const endDate = selectedMonth === 12
      ? `${selectedYear + 1}-01-01`
      : `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-01`;

    const { data } = await supabase
      .from("store_daily_metrics")
      .select("*")
      .eq("store_id", storeId)
      .eq("department", selectedDept)
      .gte("date", startDate)
      .lt("date", endDate)
      .order("date");

    if (data) {
      setDailyData(
        data.map((d) => ({
          date: new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR"),
          tipoDia: d.tipo_dia,
          metaVendas: Number(d.meta_vendas) || 0,
          realizadoVendas: Number(d.realizado_vendas) || 0,
          projecaoVendas: Number(d.projecao_vendas) || 0,
          metaLucro: Number(d.meta_lucro) || 0,
          realizadoLucro: Number(d.realizado_lucro) || 0,
          projecaoLucro: Number(d.projecao_lucro) || 0,
          metaMargemPct: Number(d.meta_margem_pct) || 0,
          realizadoMargemPct: Number(d.realizado_margem_pct) || 0,
          projecaoMargemPct: Number(d.projecao_margem_pct) || 0,
          metaVolume: Number(d.meta_volume) || 0,
          realizadoVolume: Number(d.realizado_volume) || 0,
          projecaoVolume: Number(d.projecao_volume) || 0,
        }))
      );
    } else {
      setDailyData([]);
    }
  };

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

    // Average margin percentages
    const avgMetaMargemPct = dailyData.length > 0 ? dailyData.reduce((s, d) => s + d.metaMargemPct, 0) / dailyData.length : 0;
    const avgRealMargemPct = dailyData.length > 0 ? dailyData.reduce((s, d) => s + d.realizadoMargemPct, 0) / dailyData.length : 0;
    const avgProjMargemPct = dailyData.length > 0 ? dailyData.reduce((s, d) => s + d.projecaoMargemPct, 0) / dailyData.length : 0;

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
        metaPct: avgMetaMargemPct,
        realizadoPct: avgRealMargemPct,
        projecaoPct: avgProjMargemPct,
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

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-4 py-6 max-w-[1400px]">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-7 h-7 text-primary" />
              <div>
                <h1 className="font-display text-2xl font-bold">
                  Dashboard <span className="text-gradient-gold">{storeName}</span>
                </h1>
                <p className="text-muted-foreground font-body text-xs">
                  {MONTHS[selectedMonth]} {selectedYear}
                  {selectedDept ? ` — ${selectedDept}` : ""}
                </p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {departments.length > 0 && (
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="bg-card border border-border rounded-lg px-3 py-1.5 font-body text-xs"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              )}
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-card border border-border rounded-lg px-3 py-1.5 font-body text-xs"
              >
                {MONTHS.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-card border border-border rounded-lg px-3 py-1.5 font-body text-xs"
              >
                {[2024, 2025, 2026].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* KPI Cards */}
        <DashboardKPIs {...kpiData} />

        {/* Daily Metrics Table */}
        <div className="mb-2">
          <h2 className="font-display text-sm font-semibold mb-3">
            Faturamento x Margem por Dia {selectedDept ? `— ${selectedDept}` : ""}
          </h2>
        </div>
        <DailyMetricsTable data={dailyData} />

        {/* Product Comparison */}
        <ProductComparison
          data={productData}
          title={`Comparativo de Produtos — ${MONTHS[selectedMonth]} ${selectedYear}`}
        />

        {/* Category Chart */}
        <div className="mt-6">
          <CategoryChart
            data={categoryData}
            title="Distribuição de Vendas por Categoria (vs Mês Anterior e Ano Anterior)"
          />
        </div>
      </div>
    </ClientLayout>
  );
};

export default Dashboard;
