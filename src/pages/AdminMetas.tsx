import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Target, Save, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { useToast } from "@/hooks/use-toast";

interface Store {
  id: string;
  name: string;
}

interface StoreMetric {
  id?: string;
  store_id: string;
  month: number;
  year: number;
  faturamento: number;
  margem: number;
  meta_faturamento: number;
  clientes: number;
  ticket_medio: number;
}

interface DeptMetric {
  id?: string;
  store_id: string;
  department: string;
  month: number;
  year: number;
  faturamento: number;
  margem: number;
  faturamento_promocao: number;
}

const DEPARTMENTS = ["Mercearia", "Açougue", "Horti", "Padaria", "Bebidas", "Limpeza"];
const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

const AdminMetas = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [metrics, setMetrics] = useState<StoreMetric | null>(null);
  const [deptMetrics, setDeptMetrics] = useState<DeptMetric[]>([]);
  const [saving, setSaving] = useState(false);
  const [storeName, setStoreName] = useState("");

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate("/login");
      return;
    }
    if (user) fetchStores();
  }, [user, authLoading, isAdmin]);

  useEffect(() => {
    if (selectedStore && selectedMonth && selectedYear) {
      fetchMetrics();
    }
  }, [selectedStore, selectedMonth, selectedYear]);

  const fetchStores = async () => {
    const { data } = await supabase.from("stores").select("id, name").order("name");
    if (data) {
      setStores(data);
      if (data.length > 0 && !selectedStore) {
        setSelectedStore(data[0].id);
        setStoreName(data[0].name);
      }
    }
  };

  const fetchMetrics = async () => {
    // Fetch store-level metrics
    const { data: storeData } = await supabase
      .from("store_metrics")
      .select("*")
      .eq("store_id", selectedStore)
      .eq("month", selectedMonth)
      .eq("year", selectedYear)
      .maybeSingle();

    if (storeData) {
      setMetrics({
        id: storeData.id,
        store_id: storeData.store_id,
        month: storeData.month,
        year: storeData.year,
        faturamento: Number(storeData.faturamento),
        margem: Number(storeData.margem),
        meta_faturamento: Number(storeData.meta_faturamento),
        clientes: storeData.clientes ?? 0,
        ticket_medio: Number(storeData.ticket_medio),
      });
    } else {
      setMetrics({
        store_id: selectedStore,
        month: selectedMonth,
        year: selectedYear,
        faturamento: 0,
        margem: 0,
        meta_faturamento: 0,
        clientes: 0,
        ticket_medio: 0,
      });
    }

    // Fetch department metrics
    const { data: deptData } = await supabase
      .from("store_department_metrics")
      .select("*")
      .eq("store_id", selectedStore)
      .eq("month", selectedMonth)
      .eq("year", selectedYear);

    if (deptData && deptData.length > 0) {
      setDeptMetrics(
        deptData.map((d) => ({
          id: d.id,
          store_id: d.store_id,
          department: d.department,
          month: d.month,
          year: d.year,
          faturamento: Number(d.faturamento),
          margem: Number(d.margem),
          faturamento_promocao: Number(d.faturamento_promocao),
        }))
      );
    } else {
      setDeptMetrics(
        DEPARTMENTS.map((dept) => ({
          store_id: selectedStore,
          department: dept,
          month: selectedMonth,
          year: selectedYear,
          faturamento: 0,
          margem: 0,
          faturamento_promocao: 0,
        }))
      );
    }
  };

  const handleStoreChange = (storeId: string) => {
    setSelectedStore(storeId);
    const store = stores.find((s) => s.id === storeId);
    setStoreName(store?.name || "");
  };

  const handleSave = async () => {
    if (!metrics) return;
    setSaving(true);

    try {
      // Upsert store metrics
      const { error: metricsError } = await supabase
        .from("store_metrics")
        .upsert(
          {
            store_id: metrics.store_id,
            month: metrics.month,
            year: metrics.year,
            faturamento: metrics.faturamento,
            margem: metrics.margem,
            meta_faturamento: metrics.meta_faturamento,
            clientes: metrics.clientes,
            ticket_medio: metrics.ticket_medio,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "store_id,month,year" }
        );

      if (metricsError) throw metricsError;

      // Upsert department metrics
      for (const dept of deptMetrics) {
        const { error: deptError } = await supabase
          .from("store_department_metrics")
          .upsert(
            {
              store_id: dept.store_id,
              department: dept.department,
              month: dept.month,
              year: dept.year,
              faturamento: dept.faturamento,
              margem: dept.margem,
              faturamento_promocao: dept.faturamento_promocao,
            },
            { onConflict: "store_id,department,month,year" }
          );
        if (deptError) throw deptError;
      }

      toast({ title: "Salvo!", description: "Metas e números atualizados com sucesso." });
      fetchMetrics();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateMetric = (field: keyof StoreMetric, value: number) => {
    if (!metrics) return;
    setMetrics({ ...metrics, [field]: value });
  };

  const updateDeptMetric = (index: number, field: keyof DeptMetric, value: number) => {
    const updated = [...deptMetrics];
    (updated[index] as any)[field] = value;
    setDeptMetrics(updated);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  const formatCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-6 py-10 max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Target className="w-8 h-8 text-primary" />
            <h1 className="font-display text-3xl md:text-4xl font-bold">
              Metas e <span className="text-gradient-gold">Números</span>
            </h1>
          </div>
          <p className="text-muted-foreground font-body">Insira os indicadores mensais por loja</p>
        </motion.div>

        {/* Filters */}
        <div className="flex flex-wrap gap-4 mb-8">
          <div className="flex-1 min-w-[200px]">
            <label className="font-body text-xs text-muted-foreground mb-1 block">Loja</label>
            <select
              value={selectedStore}
              onChange={(e) => handleStoreChange(e.target.value)}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="font-body text-xs text-muted-foreground mb-1 block">Mês</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[100px]">
            <label className="font-body text-xs text-muted-foreground mb-1 block">Ano</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="w-full bg-card border border-border rounded-lg px-3 py-2.5 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Store-level metrics */}
        {metrics && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border rounded-2xl p-6 mb-6">
            <h2 className="font-display text-lg font-semibold mb-4">Indicadores Gerais</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <InputField
                label="Meta Faturamento (R$)"
                value={metrics.meta_faturamento}
                onChange={(v) => updateMetric("meta_faturamento", v)}
              />
              <InputField
                label="Faturamento Real (R$)"
                value={metrics.faturamento}
                onChange={(v) => updateMetric("faturamento", v)}
              />
              <InputField
                label="Margem (R$)"
                value={metrics.margem}
                onChange={(v) => updateMetric("margem", v)}
              />
              <InputField
                label="Clientes"
                value={metrics.clientes}
                onChange={(v) => updateMetric("clientes", v)}
                integer
              />
              <InputField
                label="Ticket Médio (R$)"
                value={metrics.ticket_medio}
                onChange={(v) => updateMetric("ticket_medio", v)}
              />
              <div className="flex items-end">
                <div className="bg-muted/50 rounded-lg px-4 py-3 w-full">
                  <p className="font-body text-xs text-muted-foreground">Atingimento</p>
                  <p className="font-display text-xl font-bold text-primary">
                    {metrics.meta_faturamento > 0
                      ? ((metrics.faturamento / metrics.meta_faturamento) * 100).toFixed(1)
                      : "0"}%
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Department metrics */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.1 } }} className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h2 className="font-display text-lg font-semibold mb-4">Números por Departamento</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left font-body font-semibold text-muted-foreground py-2 pr-4">Departamento</th>
                  <th className="text-right font-body font-semibold text-muted-foreground py-2 px-2">Faturamento</th>
                  <th className="text-right font-body font-semibold text-muted-foreground py-2 px-2">Margem</th>
                  <th className="text-right font-body font-semibold text-muted-foreground py-2 pl-2">Fat. Promoção</th>
                </tr>
              </thead>
              <tbody>
                {deptMetrics.map((dept, i) => (
                  <tr key={dept.department} className="border-b border-border/50">
                    <td className="py-3 pr-4 font-body font-medium">{dept.department}</td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        value={dept.faturamento || ""}
                        onChange={(e) => updateDeptMetric(i, "faturamento", Number(e.target.value))}
                        className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-right font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="0,00"
                      />
                    </td>
                    <td className="py-3 px-2">
                      <input
                        type="number"
                        value={dept.margem || ""}
                        onChange={(e) => updateDeptMetric(i, "margem", Number(e.target.value))}
                        className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-right font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="0,00"
                      />
                    </td>
                    <td className="py-3 pl-2">
                      <input
                        type="number"
                        value={dept.faturamento_promocao || ""}
                        onChange={(e) => updateDeptMetric(i, "faturamento_promocao", Number(e.target.value))}
                        className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-right font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                        placeholder="0,00"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-3 rounded-xl font-body font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Salvando..." : "Salvar Metas"}
          </button>
        </div>
      </div>
    </ClientLayout>
  );
};

const InputField = ({
  label,
  value,
  onChange,
  integer = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  integer?: boolean;
}) => (
  <div>
    <label className="font-body text-xs text-muted-foreground mb-1 block">{label}</label>
    <input
      type="number"
      value={value || ""}
      onChange={(e) => onChange(integer ? parseInt(e.target.value) || 0 : Number(e.target.value))}
      className="w-full bg-background border border-border rounded-lg px-3 py-2.5 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
      placeholder="0"
      step={integer ? 1 : 0.01}
    />
  </div>
);

export default AdminMetas;
