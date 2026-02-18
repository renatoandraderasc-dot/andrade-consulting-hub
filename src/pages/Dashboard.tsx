import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, Target, ShoppingCart, Users, AlertTriangle, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Cell, Line } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";

const faturamentoMargem = [
  { mes: "Jan", faturamento: 320000, margem: 89600 },
  { mes: "Fev", faturamento: 280000, margem: 78400 },
  { mes: "Mar", faturamento: 350000, margem: 98000 },
  { mes: "Abr", faturamento: 310000, margem: 86800 },
  { mes: "Mai", faturamento: 370000, margem: 103600 },
  { mes: "Jun", faturamento: 340000, margem: 95200 },
];

const faturamentoDept = [
  { dept: "Mercearia", valor: 145000 },
  { dept: "Açougue", valor: 98000 },
  { dept: "Horti", valor: 62000 },
  { dept: "Padaria", valor: 55000 },
  { dept: "Bebidas", valor: 48000 },
  { dept: "Limpeza", valor: 32000 },
];

const produtosMaisVendidos = [
  { nome: "Arroz 5kg", qtd: 1200 },
  { nome: "Feijão Carioca 1kg", qtd: 980 },
  { nome: "Leite Integral 1L", qtd: 870 },
  { nome: "Açúcar 5kg", qtd: 750 },
  { nome: "Óleo de Soja 900ml", qtd: 680 },
];

const produtosMenorMargem = [
  { nome: "Cerveja Lata 350ml", margem: 3.2 },
  { nome: "Refrigerante 2L", margem: 4.5 },
  { nome: "Água Mineral 500ml", margem: 5.1 },
  { nome: "Cigarro Maço", margem: 5.8 },
  { nome: "Leite UHT 1L", margem: 6.2 },
];

const curvaABC = [
  { cat: "A", percentual: 70, acumulado: 70 },
  { cat: "B", percentual: 20, acumulado: 90 },
  { cat: "C", percentual: 10, acumulado: 100 },
];

const fatPromocao = [
  { dept: "Mercearia", valor: 42000 },
  { dept: "Açougue", valor: 28000 },
  { dept: "Bebidas", valor: 22000 },
  { dept: "Horti", valor: 15000 },
  { dept: "Padaria", valor: 12000 },
  { dept: "Limpeza", valor: 8000 },
];

const COLORS = ["hsl(45,93%,47%)", "hsl(45,93%,60%)", "hsl(45,93%,35%)"];

const Dashboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState("");
  const metaAtingimento = 78;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    if (user) fetchStoreName();
  }, [user, authLoading]);

  const fetchStoreName = async () => {
    const { data } = await supabase
      .from("user_store_access")
      .select("stores(name)")
      .eq("user_id", user!.id)
      .eq("approved", true)
      .limit(1);
    if (data && data.length > 0) {
      setStoreName((data[0] as any).stores?.name || "");
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-6 py-10 max-w-7xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-3">
            <BarChart3 className="w-8 h-8 text-primary" />
            <h1 className="font-display text-3xl md:text-4xl font-bold">Dashboard <span className="text-gradient-gold">{storeName || "Comercial"}</span></h1>
          </div>
          <p className="text-muted-foreground font-body">Indicadores comerciais com dados de exemplo</p>
        </motion.div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <Target className="w-5 h-5 text-primary" />
              <span className="font-body text-sm text-muted-foreground">Atingimento de Meta</span>
            </div>
            <p className="font-display text-3xl font-bold">{metaAtingimento}%</p>
            <div className="w-full bg-muted rounded-full h-2 mt-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${metaAtingimento}%` }} />
            </div>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-primary" />
              <span className="font-body text-sm text-muted-foreground">Clientes</span>
            </div>
            <p className="font-display text-3xl font-bold">4.230</p>
            <p className="font-body text-xs text-green-400 mt-1">+12% vs mês anterior</p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <span className="font-body text-sm text-muted-foreground">Faturamento Mensal</span>
            </div>
            <p className="font-display text-3xl font-bold">R$ 340k</p>
            <p className="font-body text-xs text-green-400 mt-1">+8% vs mês anterior</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold mb-4">Faturamento x Margem</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={faturamentoMargem}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="mes" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="faturamento" fill="hsl(45,93%,47%)" radius={[4, 4, 0, 0]} name="Faturamento" />
                <Bar dataKey="margem" fill="hsl(45,93%,67%)" radius={[4, 4, 0, 0]} name="Margem" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold mb-4">Faturamento por Departamento</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={faturamentoDept} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis dataKey="dept" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={80} />
                <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="valor" fill="hsl(45,93%,47%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2"><ShoppingCart className="w-5 h-5 text-primary" /> Produtos Mais Vendidos</h3>
            <div className="space-y-3">
              {produtosMaisVendidos.map((p, i) => (
                <div key={p.nome} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-display text-sm font-bold text-primary w-6">{i + 1}º</span>
                    <span className="font-body text-sm">{p.nome}</span>
                  </div>
                  <span className="font-body text-xs text-muted-foreground">{p.qtd} un</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-400" /> Produtos com Menor Margem</h3>
            <div className="space-y-3">
              {produtosMenorMargem.map((p) => (
                <div key={p.nome} className="flex items-center justify-between">
                  <span className="font-body text-sm">{p.nome}</span>
                  <span className="font-body text-xs font-semibold text-red-400">{p.margem}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold mb-4">Curva ABC por Categoria</h3>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={curvaABC}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="cat" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="percentual" name="%" radius={[4, 4, 0, 0]}>
                  {curvaABC.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
                <Line type="monotone" dataKey="acumulado" stroke="hsl(var(--foreground))" strokeWidth={2} name="Acumulado %" dot={{ fill: "hsl(var(--foreground))" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6">
            <h3 className="font-display text-lg font-semibold mb-4">Faturamento Promoção por Dept.</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={fatPromocao}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dept" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="valor" fill="hsl(45,93%,55%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
};

export default Dashboard;
