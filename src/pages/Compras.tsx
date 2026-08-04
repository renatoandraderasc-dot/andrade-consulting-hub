import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart, TrendingUp, TrendingDown, Wallet, Target, Download, Wand2, Save, RefreshCw, Info,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LabelList, LineChart, Line, Legend, CartesianGrid,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Store { id: string; name: string }

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const NIVEL_LABEL: Record<string, string> = {
  nivel1: "Nível 1 (Departamento)",
  nivel2: "Nível 2 (Grupo)",
  nivel3: "Nível 3 (Subgrupo)",
  produto: "Produto",
};

const fmtBRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtPct = (v: number, d = 1) => `${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d })}%`;
const fmtNum = (v: number, d = 0) => (Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

const monthRange = (year: number, month: number) => {
  const inicio = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const fim = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { inicio, fim };
};

const Compras = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  // Aba 1
  const [metas, setMetas] = useState<any[]>([]);
  const [realizadoDep, setRealizadoDep] = useState<Record<string, { compra: number; venda: number; cmv: number }>>({});
  const [loadingPainel, setLoadingPainel] = useState(false);

  // Aba 2
  const [cvInicio, setCvInicio] = useState("");
  const [cvFim, setCvFim] = useState("");
  const [cvLinhas, setCvLinhas] = useState<any[]>([]);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvNivel, setCvNivel] = useState<"nivel1" | "nivel2" | "nivel3" | "produto">("nivel1");
  const [fN1, setFN1] = useState("__all__");
  const [fN2, setFN2] = useState("__all__");
  const [fN3, setFN3] = useState("__all__");
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [fornLoading, setFornLoading] = useState(false);

  // Aba 3
  const [cfg, setCfg] = useState<any>({
    meta_venda_mes: 0, parcelas_excesso: 3, hist_inicio: "", hist_fim: "",
  });
  const [deptos, setDeptos] = useState<any[]>([]);
  const [savingCfg, setSavingCfg] = useState(false);
  const [importando, setImportando] = useState(false);
  const [gerando, setGerando] = useState(false);

  // Aba 4
  const [historico, setHistorico] = useState<any[]>([]);
  const [historicoDep, setHistoricoDep] = useState<string>("__all__");

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
    if (user) fetchStores();
  }, [user, authLoading]);

  useEffect(() => {
    if (!storeId) return;
    fetchMetas();
    fetchConfig();
    fetchDeptos();
    fetchHistorico();
    fetchRealizadoMesAtual();
  }, [storeId, year, month]);

  useEffect(() => {
    if (!cvInicio) {
      const { inicio, fim } = monthRange(year, month);
      setCvInicio(inicio);
      setCvFim(fim);
    }
  }, [year, month]);

  const fetchStores = async () => {
    const sid = sessionStorage.getItem("selectedStoreId");
    if (isAdmin) {
      const { data } = await supabase.from("stores").select("id, name").order("name");
      if (data && data.length) {
        setStores(data);
        const pick = data.find((s) => s.id === sid) || data[0];
        setStoreId(pick.id); setStoreName(pick.name);
      }
    } else {
      const { data } = await supabase.from("user_store_access").select("stores(id, name)").eq("user_id", user!.id).eq("approved", true);
      const lojas = (data || []).map((r: any) => r.stores).filter(Boolean);
      setStores(lojas);
      if (lojas.length) {
        const pick = lojas.find((s: Store) => s.id === sid) || lojas[0];
        setStoreId(pick.id); setStoreName(pick.name);
      }
    }
  };

  const fetchMetas = async () => {
    const { data } = await supabase.from("compras_meta")
      .select("*").eq("store_id", storeId).eq("ano", year).eq("mes", month);
    setMetas(data || []);
  };

  const fetchConfig = async () => {
    const { data } = await supabase.from("compras_config")
      .select("*").eq("store_id", storeId).eq("ano", year).eq("mes", month).maybeSingle();
    if (data) setCfg(data);
    else {
      // padrao: histórico = mesmo mês do ano anterior
      const y = year - 1;
      const { inicio, fim } = monthRange(y, month);
      setCfg({ meta_venda_mes: 0, parcelas_excesso: 3, hist_inicio: inicio, hist_fim: fim });
    }
  };

  const fetchDeptos = async () => {
    const { data } = await supabase.from("compras_departamento")
      .select("*").eq("store_id", storeId).order("departamento");
    setDeptos(data || []);
  };

  const fetchHistorico = async () => {
    const { data } = await supabase.from("compras_historico")
      .select("*").eq("store_id", storeId).order("ano").order("mes").order("departamento");
    setHistorico(data || []);
  };

  const fetchRealizadoMesAtual = async () => {
    if (!storeId) return;
    setLoadingPainel(true);
    try {
      const { inicio, fim } = monthRange(year, month);
      const { data, error } = await supabase.functions.invoke("vr-proxy", {
        body: { store_id: storeId, relatorio: "compras_vendas_periodo", params: { inicio, fim } },
      });
      if (error) throw error;
      const linhas: any[] = data?.dados || [];
      // agrupa por departamento via vr_secao_departamento
      const { data: mapas } = await supabase.from("vr_secao_departamento")
        .select("secao_vr, department").eq("store_id", storeId);
      const norm = (s: string) => (s || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
      const mapa = new Map<string, string>();
      for (const m of mapas ?? []) mapa.set(norm(m.secao_vr), m.department);
      const acc: Record<string, { compra: number; venda: number; cmv: number }> = {};
      for (const l of linhas) {
        // departamento nivel 1 vindo do relatorio; mapeamento so como fallback
        const dep = String(l.departamento ?? "").trim() || mapa.get(norm(l.secao)) || "SEM DEPARTAMENTO";
        const cur = acc[dep] || { compra: 0, venda: 0, cmv: 0 };
        cur.compra += parseFloat(String(l.total_compra)) || 0;
        cur.venda += parseFloat(String(l.total_venda)) || 0;
        cur.cmv += parseFloat(String(l.cmv)) || 0;
        acc[dep] = cur;
      }

      setRealizadoDep(acc);
    } catch (err: any) {
      toast({ title: "Falha ao consultar o sistema da loja", description: err.message, variant: "destructive" });
      setRealizadoDep({});
    } finally { setLoadingPainel(false); }
  };

  const buscarComprasVendas = async () => {
    if (!storeId || !cvInicio || !cvFim) return;
    setCvLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("vr-proxy", {
        body: { store_id: storeId, relatorio: "compras_vendas_periodo", params: { inicio: cvInicio, fim: cvFim } },
      });
      if (error) throw error;
      setCvLinhas(data?.dados || []);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setCvLoading(false); }
  };

  const buscarFornecedores = async () => {
    if (!storeId || !cvInicio || !cvFim) return;
    setFornLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("vr-proxy", {
        body: { store_id: storeId, relatorio: "compras_por_fornecedor", params: { inicio: cvInicio, fim: cvFim } },
      });
      if (error) throw error;
      const linhas: any[] = data?.dados || [];
      linhas.sort((a, b) => (parseFloat(String(b.total_compra)) || 0) - (parseFloat(String(a.total_compra)) || 0));
      setFornecedores(linhas.slice(0, 20));
    } catch (err: any) {
      toast({ title: "Erro fornecedores", description: err.message, variant: "destructive" });
    } finally { setFornLoading(false); }
  };

  const salvarConfig = async () => {
    if (!isAdmin) return;
    setSavingCfg(true);
    try {
      const payload = {
        store_id: storeId, ano: year, mes: month,
        meta_venda_mes: Number(cfg.meta_venda_mes) || 0,
        parcelas_excesso: Number(cfg.parcelas_excesso) || 1,
        hist_inicio: cfg.hist_inicio, hist_fim: cfg.hist_fim,
      };
      const { error } = await supabase.from("compras_config").upsert(payload, { onConflict: "store_id,ano,mes" });
      if (error) throw error;
      toast({ title: "Configuração salva" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setSavingCfg(false); }
  };

  const salvarDepto = async (row: any) => {
    if (!isAdmin) return;
    try {
      if (row.id) {
        const { error } = await supabase.from("compras_departamento")
          .update({ tx_perdas: row.tx_perdas, tx_recuperacao: row.tx_recuperacao, ativo: row.ativo })
          .eq("id", row.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("compras_departamento").insert({
          store_id: storeId, departamento: row.departamento,
          tx_perdas: row.tx_perdas, tx_recuperacao: row.tx_recuperacao, ativo: row.ativo,
        });
        if (error) throw error;
      }
      toast({ title: "Salvo" });
      fetchDeptos();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const importarHistorico = async () => {
    if (!isAdmin) return;
    setImportando(true);
    try {
      const { data, error } = await supabase.functions.invoke("importar-compras-vr", {
        body: { store_id: storeId, inicio: cfg.hist_inicio, fim: cfg.hist_fim },
      });
      if (error) throw error;
      toast({ title: "Histórico importado", description: `${data?.gravadas ?? 0} linhas em ${data?.meses ?? 0} mês(es).` });
      fetchHistorico();
    } catch (err: any) {
      toast({ title: "Erro na importação", description: err.message, variant: "destructive" });
    } finally { setImportando(false); }
  };

  const gerarMetas = async () => {
    if (!isAdmin) return;
    setGerando(true);
    try {
      const { data, error } = await supabase.rpc("gerar_metas_compra", {
        p_store_id: storeId, p_ano: year, p_mes: month,
      });
      if (error) throw error;
      const r = data?.[0];
      toast({
        title: "Metas de compra geradas",
        description: `${r?.departamentos ?? 0} deptos · Venda ${fmtBRL(Number(r?.meta_venda_total ?? 0))} · Compra ${fmtBRL(Number(r?.meta_compra_total ?? 0))}`,
      });
      fetchMetas();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setGerando(false); }
  };

  // ============ Derived (Aba 1) ============
  const painelRows = useMemo(() => {
    return metas.map((m) => {
      const real = realizadoDep[m.departamento] || { compra: 0, venda: 0, cmv: 0 };
      const meta_compra = Number(m.meta_compra) || 0;
      const saldo = meta_compra - real.compra;
      const consumido = meta_compra > 0 ? (real.compra / meta_compra) * 100 : 0;
      return {
        departamento: m.departamento,
        meta_venda: Number(m.meta_venda) || 0,
        meta_compra,
        compra_sobre_venda: (Number(m.compra_sobre_venda) || 0) * 100,
        realizado: real.compra,
        saldo,
        consumido,
      };
    }).sort((a, b) => b.meta_compra - a.meta_compra);
  }, [metas, realizadoDep]);

  const totais = useMemo(() => {
    const meta_venda = painelRows.reduce((s, r) => s + r.meta_venda, 0);
    const meta_compra = painelRows.reduce((s, r) => s + r.meta_compra, 0);
    const realizado = painelRows.reduce((s, r) => s + r.realizado, 0);
    const saldo = meta_compra - realizado;
    const consumido = meta_compra > 0 ? (realizado / meta_compra) * 100 : 0;
    return { meta_venda, meta_compra, realizado, saldo, consumido };
  }, [painelRows]);

  // ============ Derived (Aba 2) ============
  // Normaliza cada linha na hierarquia Nivel 1 / Nivel 2 / Nivel 3 / Produto
  const cvItens = useMemo(() => {
    return cvLinhas.map((l: any) => {
      const partes = String(l.secao ?? "").split("/").map((s: string) => s.trim());
      const n1 = String(l.nivel1 ?? l.departamento ?? partes[0] ?? "").trim() || "SEM DEPARTAMENTO";
      const n2 = String(l.nivel2 ?? partes[1] ?? "").trim() || "SEM GRUPO";
      const n3 = String(l.nivel3 ?? partes[2] ?? "").trim() || "SEM SUBGRUPO";
      const prod = String(l.produto ?? l.descricao ?? "").trim() || "SEM PRODUTO";
      return {
        nivel1: n1, nivel2: n2, nivel3: n3, produto: prod,
        qtde_venda: parseFloat(String(l.qtde_venda ?? l.qtde_vendida ?? 0)) || 0,
        venda: parseFloat(String(l.total_venda)) || 0,
        cmv: parseFloat(String(l.cmv)) || 0,
        qtde_compra: parseFloat(String(l.qtde_compra ?? l.qtde_comprada ?? 0)) || 0,
        compra: parseFloat(String(l.total_compra)) || 0,
      };
    });
  }, [cvLinhas]);

  const cvOpcoes = useMemo(() => {
    const n1 = new Set<string>(), n2 = new Set<string>(), n3 = new Set<string>();
    for (const i of cvItens) {
      n1.add(i.nivel1);
      if (fN1 === "__all__" || i.nivel1 === fN1) n2.add(i.nivel2);
      if ((fN1 === "__all__" || i.nivel1 === fN1) && (fN2 === "__all__" || i.nivel2 === fN2)) n3.add(i.nivel3);
    }
    const ord = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { n1: ord(n1), n2: ord(n2), n3: ord(n3) };
  }, [cvItens, fN1, fN2]);

  const cvRows = useMemo(() => {
    const filtrados = cvItens.filter((i) =>
      (fN1 === "__all__" || i.nivel1 === fN1) &&
      (fN2 === "__all__" || i.nivel2 === fN2) &&
      (fN3 === "__all__" || i.nivel3 === fN3));

    const acc = new Map<string, { secao: string; qtde_venda: number; venda: number; cmv: number; qtde_compra: number; compra: number }>();
    for (const i of filtrados) {
      const chave = i[cvNivel];
      const cur = acc.get(chave) ?? { secao: chave, qtde_venda: 0, venda: 0, cmv: 0, qtde_compra: 0, compra: 0 };
      cur.qtde_venda += i.qtde_venda;
      cur.venda += i.venda;
      cur.cmv += i.cmv;
      cur.qtde_compra += i.qtde_compra;
      cur.compra += i.compra;
      acc.set(chave, cur);
    }
    return [...acc.values()].map((r) => ({
      ...r,
      margem: r.venda > 0 ? ((r.venda - r.cmv) / r.venda) * 100 : 0,
      saldo_cmv: r.cmv - r.compra,
      cv: r.venda > 0 ? (r.compra / r.venda) * 100 : 0,
      ccmv: r.cmv > 0 ? (r.compra / r.cmv) * 100 : 0,
    })).sort((a, b) => b.venda - a.venda);
  }, [cvItens, cvNivel, fN1, fN2, fN3]);


  const cvTotais = useMemo(() => {
    return cvRows.reduce((acc, r) => ({
      venda: acc.venda + r.venda, cmv: acc.cmv + r.cmv, compra: acc.compra + r.compra,
    }), { venda: 0, cmv: 0, compra: 0 });
  }, [cvRows]);

  // ============ Derived (Aba 4) ============
  const historicoFiltrado = useMemo(() => {
    const rows = historicoDep === "__all__"
      ? Object.values(historico.reduce((acc: any, r: any) => {
          const k = `${r.ano}-${r.mes}`;
          const cur = acc[k] || { ano: r.ano, mes: r.mes, departamento: "TODOS", venda: 0, cmv: 0, compra: 0 };
          cur.venda += Number(r.venda) || 0;
          cur.cmv += Number(r.cmv) || 0;
          cur.compra += Number(r.compra) || 0;
          acc[k] = cur;
          return acc;
        }, {}))
      : historico.filter((r: any) => r.departamento === historicoDep);
    return (rows as any[]).sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  }, [historico, historicoDep]);

  const deptOptions = useMemo(() => {
    const set = new Set<string>(historico.map((r: any) => r.departamento));
    return Array.from(set).sort();
  }, [historico]);

  const inputCls = "w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40";
  const btnPrimary = "flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50";
  const btnGhost = "flex items-center gap-2 border border-border bg-card px-4 py-2 rounded-lg text-sm font-medium hover:bg-muted disabled:opacity-50";

  if (authLoading) return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Carregando…</div>;

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-6 py-8 max-w-7xl">
        <div className="flex items-center gap-3 mb-6">
          <ShoppingCart className="w-7 h-7 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Gerenciamento de Compras</h1>
            <p className="text-sm text-muted-foreground">Meta de compra, execução e histórico por departamento</p>
          </div>
        </div>

        {/* Filtros topo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Loja</label>
            <select value={storeId} onChange={(e) => { setStoreId(e.target.value); setStoreName(stores.find(s => s.id === e.target.value)?.name || ""); sessionStorage.setItem("selectedStoreId", e.target.value); }} className={inputCls}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Mês</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className={inputCls}>
              {MONTHS.slice(1).map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Ano</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={inputCls}>
              {[2023, 2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <Tabs defaultValue="painel" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="painel">Painel</TabsTrigger>
            <TabsTrigger value="cv">Compras × Vendas</TabsTrigger>
            <TabsTrigger value="config">Configuração</TabsTrigger>
            <TabsTrigger value="hist">Histórico</TabsTrigger>
          </TabsList>

          {/* ================= ABA 1 - PAINEL ================= */}
          <TabsContent value="painel">
            <div className="flex justify-end mb-4">
              <button onClick={fetchRealizadoMesAtual} disabled={loadingPainel} className={btnGhost}>
                <RefreshCw className={`w-4 h-4 ${loadingPainel ? "animate-spin" : ""}`} /> Atualizar realizado
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
              <KpiCard icon={<Target className="w-4 h-4" />} label="Meta de venda" value={fmtBRL(totais.meta_venda)} />
              <KpiCard icon={<ShoppingCart className="w-4 h-4" />} label="Meta de compra" value={fmtBRL(totais.meta_compra)} />
              <KpiCard icon={<TrendingUp className="w-4 h-4" />} label="Compra realizada" value={fmtBRL(totais.realizado)} />
              <KpiCard icon={<TrendingDown className="w-4 h-4" />} label="% consumido" value={fmtPct(totais.consumido)} />
              <KpiCard
                icon={<Wallet className="w-4 h-4" />}
                label="Saldo disponível"
                value={fmtBRL(totais.saldo)}
                tone={totais.saldo >= 0 ? "success" : "danger"}
                emphasis
              />
            </div>

            <div className="bg-card border border-border rounded-xl p-5 overflow-x-auto mb-6">
              <h3 className="text-sm font-semibold mb-3">Por departamento</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2">Departamento</th>
                    <th className="text-right py-2 px-2">Meta venda</th>
                    <th className="text-right py-2 px-2">Meta compra</th>
                    <th className="text-right py-2 px-2">C/V %</th>
                    <th className="text-right py-2 px-2">Realizado</th>
                    <th className="text-right py-2 px-2">Saldo</th>
                    <th className="text-left py-2 px-2 min-w-[160px]">% consumido</th>
                  </tr>
                </thead>
                <tbody>
                  {painelRows.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma meta gerada para este mês. Vá em Configuração.</td></tr>
                  )}
                  {painelRows.map((r) => (
                    <tr key={r.departamento} className="border-b border-border/50">
                      <td className="py-2 font-medium">{r.departamento}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.meta_venda)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.meta_compra)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtPct(r.compra_sobre_venda)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.realizado)}</td>
                      <td className={`py-2 px-2 text-right tabular-nums font-medium ${r.saldo < 0 ? "text-red-500" : "text-emerald-500"}`}>{fmtBRL(r.saldo)}</td>
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden">
                            <div className={`h-full ${r.consumido > 100 ? "bg-red-500" : r.consumido > 85 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${Math.min(r.consumido, 100)}%` }} />
                          </div>
                          <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">{fmtPct(r.consumido, 0)}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {painelRows.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4">Saldo disponível por departamento</h3>
                <ResponsiveContainer width="100%" height={Math.max(220, painelRows.length * 34)}>
                  <BarChart data={painelRows} layout="vertical" margin={{ left: 30, right: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tickFormatter={(v) => fmtBRL(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis type="category" dataKey="departamento" stroke="hsl(var(--muted-foreground))" fontSize={11} width={110} />
                    <Tooltip formatter={(v: any) => fmtBRL(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="saldo" radius={[0, 4, 4, 0]}>
                      {painelRows.map((r, i) => (
                        <Cell key={i} fill={r.saldo < 0 ? "#ef4444" : "#2D7FF9"} />
                      ))}
                      <LabelList dataKey="saldo" position="right" formatter={(v: any) => fmtBRL(v)} style={{ fontSize: 11, fill: "hsl(var(--foreground))" }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </TabsContent>

          {/* ================= ABA 2 - COMPRAS x VENDAS ================= */}
          <TabsContent value="cv">
            <div className="bg-card border border-border rounded-xl p-5 mb-6">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Início</label>
                  <input type="date" value={cvInicio} onChange={(e) => setCvInicio(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Fim</label>
                  <input type="date" value={cvFim} onChange={(e) => setCvFim(e.target.value)} className={inputCls} />
                </div>
                <button onClick={buscarComprasVendas} disabled={cvLoading} className={btnPrimary}>
                  <RefreshCw className={`w-4 h-4 ${cvLoading ? "animate-spin" : ""}`} /> Consultar
                </button>
                <button onClick={buscarFornecedores} disabled={fornLoading} className={btnGhost}>
                  <RefreshCw className={`w-4 h-4 ${fornLoading ? "animate-spin" : ""}`} /> Top fornecedores
                </button>
              </div>

              {cvItens.length > 0 && (
                <div className="flex flex-wrap items-end gap-4 mt-4 pt-4 border-t border-border">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Agrupar por</label>
                    <select value={cvNivel} onChange={(e) => setCvNivel(e.target.value as any)} className={inputCls}>
                      <option value="nivel1">Nível 1 (Departamento)</option>
                      <option value="nivel2">Nível 2 (Grupo)</option>
                      <option value="nivel3">Nível 3 (Subgrupo)</option>
                      <option value="produto">Produto</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nível 1</label>
                    <select value={fN1} onChange={(e) => { setFN1(e.target.value); setFN2("__all__"); setFN3("__all__"); }} className={inputCls}>
                      <option value="__all__">Todos</option>
                      {cvOpcoes.n1.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nível 2</label>
                    <select value={fN2} onChange={(e) => { setFN2(e.target.value); setFN3("__all__"); }} className={inputCls}>
                      <option value="__all__">Todos</option>
                      {cvOpcoes.n2.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Nível 3</label>
                    <select value={fN3} onChange={(e) => setFN3(e.target.value)} className={inputCls}>
                      <option value="__all__">Todos</option>
                      {cvOpcoes.n3.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                  {(fN1 !== "__all__" || fN2 !== "__all__" || fN3 !== "__all__") && (
                    <button onClick={() => { setFN1("__all__"); setFN2("__all__"); setFN3("__all__"); }} className={btnGhost}>
                      Limpar filtros
                    </button>
                  )}
                </div>
              )}
            </div>

            {cvRows.length > 0 && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <KpiCard label="Total venda" value={fmtBRL(cvTotais.venda)} />
                  <KpiCard label="CMV" value={fmtBRL(cvTotais.cmv)} />
                  <KpiCard label="Total compra" value={fmtBRL(cvTotais.compra)} />
                  <KpiCard label="Compra/Venda" value={fmtPct(cvTotais.venda > 0 ? (cvTotais.compra / cvTotais.venda) * 100 : 0)} />
                </div>

                <div className="bg-card border border-border rounded-xl p-5 overflow-x-auto mb-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2">{NIVEL_LABEL[cvNivel]}</th>
                        <th className="text-right py-2 px-2">Qtd venda</th>
                        <th className="text-right py-2 px-2">Venda</th>
                        <th className="text-right py-2 px-2">CMV</th>
                        <th className="text-right py-2 px-2">Margem %</th>
                        <th className="text-right py-2 px-2">Qtd compra</th>
                        <th className="text-right py-2 px-2">Compra</th>
                        <th className="text-right py-2 px-2">CMV − Compra</th>
                        <th className="text-right py-2 px-2">C/V %</th>
                        <th className="text-right py-2 px-2">C/CMV %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cvRows.map((r, i) => {
                        const cvTone = r.cv > 100 ? "text-red-500" : r.cv < 60 ? "text-amber-500" : "";
                        return (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2">{r.secao}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtNum(r.qtde_venda)}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.venda)}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.cmv)}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtPct(r.margem)}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtNum(r.qtde_compra)}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.compra)}</td>
                            <td className={`py-2 px-2 text-right tabular-nums ${r.saldo_cmv < 0 ? "text-red-500" : ""}`}>{fmtBRL(r.saldo_cmv)}</td>
                            <td className={`py-2 px-2 text-right tabular-nums font-medium ${cvTone}`}>{fmtPct(r.cv)}</td>
                            <td className="py-2 px-2 text-right tabular-nums">{fmtPct(r.ccmv)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-4">Venda × Compra por {NIVEL_LABEL[cvNivel].toLowerCase()}</h3>
                  <ResponsiveContainer width="100%" height={Math.max(260, Math.min(cvRows.length, 25) * 26)}>
                    <BarChart data={cvRows.slice(0, 25)} layout="vertical" margin={{ left: 20, right: 30 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => fmtBRL(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis type="category" dataKey="secao" stroke="hsl(var(--muted-foreground))" fontSize={11} width={140} />
                      <Tooltip formatter={(v: any) => fmtBRL(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="venda" name="Venda" fill="#2D7FF9" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="compra" name="Compra" fill="#f59e0b" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}

            {fornecedores.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5 mt-6 overflow-x-auto">
                <h3 className="text-sm font-semibold mb-3">Top fornecedores do período</h3>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left py-2">Fornecedor</th>
                      <th className="text-right py-2 px-2">Notas</th>
                      <th className="text-right py-2 px-2">Total comprado</th>
                      <th className="text-right py-2 px-2">Última entrada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fornecedores.map((f, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2">{f.fornecedor || f.nome || "—"}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtNum(parseFloat(String(f.notas ?? f.qtde_notas ?? 0)))}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(parseFloat(String(f.total_compra ?? 0)))}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{f.ultima_entrada ? String(f.ultima_entrada).slice(0, 10).split("-").reverse().join("/") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* ================= ABA 3 - CONFIGURAÇÃO ================= */}
          <TabsContent value="config">
            <div className="bg-card border border-border rounded-xl p-5 mb-6 flex gap-3 items-start">
              <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                A meta de compra de cada departamento é o CMV projetado (percentual histórico aplicado à meta de venda)
                mais a parcela do excesso de compras anterior e a provisão de perdas.
              </p>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 mb-6">
              <h3 className="text-sm font-semibold mb-4">Parâmetros do mês</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Meta de venda do mês</label>
                  <input type="number" step="0.01" disabled={!isAdmin} value={cfg.meta_venda_mes || ""} onChange={(e) => setCfg({ ...cfg, meta_venda_mes: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Parcelas p/ diluir excesso</label>
                  <input type="number" min={1} disabled={!isAdmin} value={cfg.parcelas_excesso || 1} onChange={(e) => setCfg({ ...cfg, parcelas_excesso: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Histórico — início</label>
                  <input type="date" disabled={!isAdmin} value={cfg.hist_inicio || ""} onChange={(e) => setCfg({ ...cfg, hist_inicio: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Histórico — fim</label>
                  <input type="date" disabled={!isAdmin} value={cfg.hist_fim || ""} onChange={(e) => setCfg({ ...cfg, hist_fim: e.target.value })} className={inputCls} />
                </div>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-3 mt-4">
                  <button onClick={salvarConfig} disabled={savingCfg} className={btnPrimary}>
                    <Save className="w-4 h-4" /> Salvar
                  </button>
                  <button onClick={importarHistorico} disabled={importando || !cfg.hist_inicio} className={btnGhost}>
                    <Download className={`w-4 h-4 ${importando ? "animate-pulse" : ""}`} /> Importar histórico
                  </button>
                  <button onClick={gerarMetas} disabled={gerando} className={btnPrimary}>
                    <Wand2 className="w-4 h-4" /> Gerar metas de compra
                  </button>
                </div>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5 overflow-x-auto">
              <h3 className="text-sm font-semibold mb-3">Departamentos</h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2">Departamento</th>
                    <th className="text-right py-2 px-2">Perdas %</th>
                    <th className="text-right py-2 px-2">Recuperação %</th>
                    <th className="text-center py-2 px-2">Ativo</th>
                    {isAdmin && <th className="py-2 px-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {deptos.map((d, idx) => (
                    <tr key={d.id} className="border-b border-border/50">
                      <td className="py-2 font-medium">{d.departamento}</td>
                      <td className="py-2 px-2 text-right">
                        <input type="number" step="0.001" disabled={!isAdmin} value={d.tx_perdas ?? 0} onChange={(e) => { const c = [...deptos]; c[idx] = { ...c[idx], tx_perdas: parseFloat(e.target.value) || 0 }; setDeptos(c); }} className="w-24 bg-transparent border border-border rounded px-2 py-1 text-right tabular-nums" />
                      </td>
                      <td className="py-2 px-2 text-right">
                        <input type="number" step="0.001" disabled={!isAdmin} value={d.tx_recuperacao ?? 1} onChange={(e) => { const c = [...deptos]; c[idx] = { ...c[idx], tx_recuperacao: parseFloat(e.target.value) || 0 }; setDeptos(c); }} className="w-24 bg-transparent border border-border rounded px-2 py-1 text-right tabular-nums" />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <input type="checkbox" disabled={!isAdmin} checked={!!d.ativo} onChange={(e) => { const c = [...deptos]; c[idx] = { ...c[idx], ativo: e.target.checked }; setDeptos(c); }} />
                      </td>
                      {isAdmin && (
                        <td className="py-2 px-2 text-right">
                          <button onClick={() => salvarDepto(d)} className="text-xs text-primary hover:underline">Salvar</button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {deptos.length === 0 && (
                    <tr><td colSpan={isAdmin ? 5 : 4} className="py-6 text-center text-muted-foreground">Nenhum departamento cadastrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ================= ABA 4 - HISTÓRICO ================= */}
          <TabsContent value="hist">
            <div className="bg-card border border-border rounded-xl p-5 mb-6 flex items-end gap-4">
              <div className="min-w-[220px]">
                <label className="text-xs text-muted-foreground mb-1 block">Departamento</label>
                <select value={historicoDep} onChange={(e) => setHistoricoDep(e.target.value)} className={inputCls}>
                  <option value="__all__">Todos (consolidado)</option>
                  {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-5 overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2">Período</th>
                    <th className="text-left py-2 px-2">Departamento</th>
                    <th className="text-right py-2 px-2">Venda</th>
                    <th className="text-right py-2 px-2">CMV</th>
                    <th className="text-right py-2 px-2">Compra</th>
                    <th className="text-right py-2 px-2">CMV/V %</th>
                    <th className="text-right py-2 px-2">C/V %</th>
                    <th className="text-right py-2 px-2">Saldo (CMV−Compra)</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoFiltrado.length === 0 && (
                    <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Sem dados. Importe o histórico na aba Configuração.</td></tr>
                  )}
                  {historicoFiltrado.map((r: any, i) => {
                    const cmvv = r.venda > 0 ? (r.cmv / r.venda) * 100 : 0;
                    const cv = r.venda > 0 ? (r.compra / r.venda) * 100 : 0;
                    const saldo = r.cmv - r.compra;
                    return (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2">{String(r.mes).padStart(2, "0")}/{r.ano}</td>
                        <td className="py-2 px-2">{r.departamento}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.venda)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.cmv)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtBRL(r.compra)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtPct(cmvv)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{fmtPct(cv)}</td>
                        <td className={`py-2 px-2 text-right tabular-nums ${saldo < 0 ? "text-red-500" : "text-emerald-500"}`}>{fmtBRL(saldo)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {historicoFiltrado.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4">Evolução mensal — Compra × CMV</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={historicoFiltrado.map((r: any) => ({ periodo: `${String(r.mes).padStart(2, "0")}/${String(r.ano).slice(2)}`, compra: r.compra, cmv: r.cmv }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="periodo" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis tickFormatter={(v) => fmtBRL(v)} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip formatter={(v: any) => fmtBRL(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="compra" name="Compra" stroke="#f59e0b" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="cmv" name="CMV" stroke="#2D7FF9" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
};

const KpiCard = ({ icon, label, value, tone, emphasis }: {
  icon?: React.ReactNode; label: string; value: string;
  tone?: "success" | "danger"; emphasis?: boolean;
}) => {
  const toneCls = tone === "success" ? "text-emerald-500" : tone === "danger" ? "text-red-500" : "text-foreground";
  return (
    <div className={`bg-card border rounded-xl p-4 ${emphasis ? "border-primary/40 ring-1 ring-primary/20" : "border-border"}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
        {icon} {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
};

export default Compras;
