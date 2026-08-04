import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Target, Wand2, Download, Sprout, RotateCcw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Store { id: string; name: string; }

const DEPARTMENTS_PIC = ["PADARIA", "AÇOUGUE", "HORTIFRUTI"];
const DEPARTMENTS = [...DEPARTMENTS_PIC, "LOJA"];
const deptLabel = (d: string) => (d === "LOJA" ? "Supermercado — Total" : d);
const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEM: [string, string][] = [
  ["SEG", "D"], ["TER", "D"], ["QUA", "D"], ["QUI", "D"], ["SEX", "D"], ["SAB", "F"], ["DOM", "F"],
];
const TIPO_OPTIONS = [
  // por semana do mês: SEG 1, TER 1, ... SEG 2, TER 2 ...
  ...[1, 2, 3, 4, 5, 6].flatMap((s) => DIAS_SEM.map(([d, suf]) => `${d} ${s} ${suf}`)),
  // genéricos e dias especiais
  "SEG D","TER D","QUA D","QUI D","SEX D","SAB F","DOM F",
  "PRIMEIRO DIA D","PRIMEIRO DIA F","ULTIMO DIA D","ULTIMO DIA F",
  "4o DIA UTIL D","5o DIA UTIL D","VALE D","VALE F","FERIADO D","FERIADO F",
];

const fmtBRL = (v: number) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtNum = (v: number, d = 2) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const monthRange = (year: number, month: number) => {
  const inicio = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const fim = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { inicio, fim };
};
const baseMonth = (year: number, month: number, base: "ano_anterior" | "mes_anterior") => {
  if (base === "mes_anterior") {
    const d = new Date(year, month - 2, 1);
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  }
  return { year: year - 1, month };
};

const MetasGerador = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const storeIdParam = searchParams.get("store");

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [base, setBase] = useState<"ano_anterior" | "mes_anterior">("ano_anterior");

  const [loading, setLoading] = useState(false);
  const [metasRows, setMetasRows] = useState<any[]>([]);
  const [dirtyDates, setDirtyDates] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [calRows, setCalRows] = useState<any[]>([]);
  const [taxasRows, setTaxasRows] = useState<any[]>([]);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
    if (user && isAdmin) fetchStores();
  }, [user, isAdmin, authLoading]);

  useEffect(() => {
    if (storeId) {
      fetchMetas();
      fetchCalendario();
      fetchTaxas();
    }
  }, [storeId, department, year, month]);

  const fetchStores = async () => {
    const { data } = await supabase.from("stores").select("id, name").order("name");
    if (data) {
      setStores(data);
      if (data.length && !storeId) {
        const preferred = storeIdParam && data.find((s) => s.id === storeIdParam);
        const pick = preferred || data[0];
        setStoreId(pick.id);
        setStoreName(pick.name);
      }
    }
  };

  const fetchMetas = async () => {
    const { inicio, fim } = monthRange(year, month);
    const { data } = await supabase
      .from("store_daily_metrics")
      .select("date, tipo_dia, meta_vendas, meta_margem_pct, meta_lucro, meta_volume, meta_mix, realizado_vendas")
      .eq("store_id", storeId)
      .eq("department", department)
      .gte("date", inicio)
      .lte("date", fim)
      .order("date");
    setMetasRows(data || []);
    setDirtyDates(new Set());
  };

  // Dia sem operação: meta e realizado zerados — ignorado em médias e projeções
  const isSemOperacao = (r: any) =>
    (Number(r.meta_vendas) || 0) === 0 && (Number(r.realizado_vendas) || 0) === 0;


  // Aviso ao sair da página com alterações não salvas
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyDates.size === 0) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyDates]);

  const confirmDiscardIfDirty = () => {
    if (dirtyDates.size === 0) return true;
    return window.confirm("Existem alterações de metas não salvas. Deseja descartá-las?");
  };

  const handleEditMeta = (date: string, field: "meta_vendas" | "meta_margem_pct", raw: string) => {
    const num = parseFloat(raw.replace(/\./g, "").replace(",", ".")) || 0;
    setMetasRows((rows) =>
      rows.map((r) => {
        if (r.date !== date) return r;
        const next = { ...r, [field]: num };
        next.meta_lucro = (Number(next.meta_vendas) || 0) * (Number(next.meta_margem_pct) || 0) / 100;
        return next;
      }),
    );
    setDirtyDates((s) => new Set(s).add(date));
  };

  const handleSaveMetas = async () => {
    if (dirtyDates.size === 0) return;
    setSaving(true);
    try {
      const changed = metasRows.filter((r) => dirtyDates.has(r.date));
      const payload = changed.map((r) => ({
        store_id: storeId,
        department,
        date: r.date,
        meta_vendas: Number(r.meta_vendas) || 0,
        meta_margem_pct: Number(r.meta_margem_pct) || 0,
        meta_lucro: ((Number(r.meta_vendas) || 0) * (Number(r.meta_margem_pct) || 0)) / 100,
      }));
      const { error } = await supabase
        .from("store_daily_metrics")
        .upsert(payload, { onConflict: "store_id,department,date" });
      if (error) throw error;
      toast({ title: "Metas salvas", description: `${payload.length} dia(s) atualizado(s).` });
      setDirtyDates(new Set());
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const fetchCalendario = async () => {
    const { inicio, fim } = monthRange(year, month);
    const { data } = await supabase
      .from("vr_calendario")
      .select("id, data, tipo, dia_sem, semana, editado")
      .eq("store_id", storeId)
      .gte("data", inicio)
      .lte("data", fim)
      .order("data");
    setCalRows(data || []);
  };

  const fetchTaxas = async () => {
    const { data } = await supabase
      .from("meta_taxas")
      .select("id, tipo, tx_venda, tx_margem, tx_volume")
      .eq("store_id", storeId)
      .eq("department", department)
      .order("tipo");
    setTaxasRows(data || []);
  };

  const handleImportarHistorico = async () => {
    setLoading(true);
    try {
      const bm = baseMonth(year, month, base);
      const { inicio, fim } = monthRange(bm.year, bm.month);
      const { data, error } = await supabase.functions.invoke("importar-historico-vr", {
        body: { store_id: storeId, inicio, fim },
      });
      if (error) throw error;
      toast({
        title: "Histórico importado",
        description: `${data?.linhas_gravadas ?? data?.upserted ?? 0} linhas gravadas (${fmtDate(inicio)} → ${fmtDate(fim)}).`,
      });
    } catch (err: any) {
      toast({ title: "Erro na importação", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleGerarMetas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("gerar_metas", {
        p_store_id: storeId, p_department: department, p_ano: year, p_mes: month, p_base: base,
      });
      if (error) throw error;
      const r = data?.[0];
      toast({
        title: "Metas geradas",
        description: `${r?.dias_gerados ?? 0} dias · Total: ${fmtBRL(Number(r?.total_meta ?? 0))}`,
      });
      fetchMetas();
    } catch (err: any) {
      toast({ title: "Erro ao gerar metas", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleGerarCalendario = async () => {
    setLoading(true);
    try {
      const { inicio, fim } = monthRange(year, month);
      const { data, error } = await supabase.rpc("gerar_calendario", {
        p_store_id: storeId, p_inicio: inicio, p_fim: fim,
      });
      if (error) throw error;
      toast({ title: "Calendário gerado", description: `${data} dias processados.` });
      fetchCalendario();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleUpdateTipoDia = async (id: string, tipo: string) => {
    const { error } = await supabase.from("vr_calendario").update({ tipo, editado: true }).eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    setCalRows((rows) => rows.map((r) => r.id === id ? { ...r, tipo, editado: true } : r));
  };

  const handleResetDia = async (id: string) => {
    const { error } = await supabase.from("vr_calendario").update({ editado: false }).eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    const { inicio, fim } = monthRange(year, month);
    await supabase.rpc("gerar_calendario", { p_store_id: storeId, p_inicio: inicio, p_fim: fim });
    fetchCalendario();
  };

  const handleSemearTaxas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("semear_taxas_padrao", {
        p_store_id: storeId, p_department: department,
      });
      if (error) throw error;
      toast({ title: "Taxas semeadas", description: `${data} novas linhas.` });
      fetchTaxas();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const handleSaveTaxa = async (row: any) => {
    const { error } = await supabase.from("meta_taxas").update({
      tx_venda: row.tx_venda, tx_margem: row.tx_margem, tx_volume: row.tx_volume,
    }).eq("id", row.id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Taxa salva" });
  };

  const exportExcel = () => {
    const header = "Data\tTipo\tMeta Vendas\tMeta Margem %\tMeta Lucro\n";
    const rows = metasRows.map(r =>
      `${fmtDate(r.date)}\t${r.tipo_dia}\t${fmtNum(Number(r.meta_vendas))}\t${fmtNum(Number(r.meta_margem_pct))}\t${fmtNum(Number(r.meta_lucro))}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/tab-separated-values;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `metas_${department}_${year}_${month}.xls`;
    a.click(); URL.revokeObjectURL(url);
  };

  const totals = useMemo(() => {
    const operantes = metasRows.filter((r) => !isSemOperacao(r));
    const t = operantes.reduce((acc, r) => ({
      vendas: acc.vendas + Number(r.meta_vendas || 0),
      lucro: acc.lucro + Number(r.meta_lucro || 0),
    }), { vendas: 0, lucro: 0 });
    const dias = operantes.length;
    return {
      ...t,
      dias,
      diasIgnorados: metasRows.length - dias,
      mediaVendas: dias > 0 ? t.vendas / dias : 0,
      mediaLucro: dias > 0 ? t.lucro / dias : 0,
    };
  }, [metasRows]);


  if (authLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground font-body">Carregando...</p>
    </div>
  );

  const btnPrimary = "flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl font-body font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50";
  const btnGhost = "flex items-center gap-2 border border-border bg-card px-4 py-2 rounded-xl font-body font-semibold text-sm hover:bg-muted transition-colors disabled:opacity-50";
  const selectCls = "w-full bg-card border border-border rounded-lg px-3 py-2.5 font-body text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-6 py-10 max-w-6xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Target className="w-8 h-8 text-primary" />
            <h1 className="font-display text-3xl md:text-4xl font-bold">
              Gerador de <span className="text-gradient-gold">Metas</span>
            </h1>
          </div>
          <p className="text-muted-foreground font-body">Geração automática de metas com base no histórico VR</p>
        </motion.div>

        {/* Filtros */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div>
            <label className="font-body text-xs text-muted-foreground mb-1 block">Loja</label>
            <select value={storeId} onChange={(e) => { if (!confirmDiscardIfDirty()) return; setStoreId(e.target.value); setStoreName(stores.find(s => s.id === e.target.value)?.name || ""); }} className={selectCls}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground mb-1 block">Departamento</label>
            <select value={department} onChange={(e) => { if (!confirmDiscardIfDirty()) return; setDepartment(e.target.value); }} className={selectCls}>
              {DEPARTMENTS_PIC.map((d) => <option key={d} value={d}>{d}</option>)}
              <option disabled>──────────</option>
              <option value="LOJA">{deptLabel("LOJA")}</option>
            </select>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground mb-1 block">Mês</label>
            <select value={month} onChange={(e) => { if (!confirmDiscardIfDirty()) return; setMonth(Number(e.target.value)); }} className={selectCls}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="font-body text-xs text-muted-foreground mb-1 block">Ano</label>
            <select value={year} onChange={(e) => { if (!confirmDiscardIfDirty()) return; setYear(Number(e.target.value)); }} className={selectCls}>
              {[2023, 2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <Tabs defaultValue="metas" className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="metas">Gerar Metas</TabsTrigger>
            <TabsTrigger value="calendario">Calendário</TabsTrigger>
            <TabsTrigger value="taxas">Taxas</TabsTrigger>
          </TabsList>

          {/* ABA 1 */}
          <TabsContent value="metas">
            <div className="bg-card border border-border rounded-2xl p-6 mb-6">
              <div className="flex flex-wrap items-end gap-4">
                <div className="min-w-[220px]">
                  <label className="font-body text-xs text-muted-foreground mb-1 block">Base histórica</label>
                  <select value={base} onChange={(e) => setBase(e.target.value as any)} className={selectCls}>
                    <option value="ano_anterior">Mesmo mês do ano anterior</option>
                    <option value="mes_anterior">Mês anterior</option>
                  </select>
                </div>
                <button onClick={handleImportarHistorico} disabled={loading} className={btnGhost}>
                  <Download className="w-4 h-4" /> Importar histórico do VR
                </button>
                <button onClick={handleGerarMetas} disabled={loading} className={btnPrimary}>
                  <Wand2 className="w-4 h-4" /> Gerar metas
                </button>
                {metasRows.length > 0 && (
                  <button onClick={exportExcel} className={btnGhost}>
                    <Download className="w-4 h-4" /> Exportar Excel
                  </button>
                )}
                <button
                  onClick={handleSaveMetas}
                  disabled={saving || dirtyDates.size === 0}
                  className={btnPrimary}
                >
                  <Save className="w-4 h-4" />
                  {dirtyDates.size > 0 ? `Salvar (${dirtyDates.size})` : "Salvar"}
                </button>
                {dirtyDates.size > 0 && (
                  <span className="text-xs font-body text-amber-500 self-center">
                    Alterações não salvas
                  </span>
                )}
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-body text-muted-foreground">Data</th>
                    <th className="text-left py-2 px-2 font-body text-muted-foreground">Tipo</th>
                    <th className="text-right py-2 px-2 font-body text-muted-foreground">Meta Vendas</th>
                    <th className="text-right py-2 px-2 font-body text-muted-foreground">Margem %</th>
                    <th className="text-right py-2 pl-2 font-body text-muted-foreground">Meta Lucro</th>
                  </tr>
                </thead>
                <tbody>
                  {metasRows.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground font-body">Nenhuma meta gerada ainda.</td></tr>
                  )}
                  {metasRows.map((r) => {
                    const isDirty = dirtyDates.has(r.date);
                    const semOp = isSemOperacao(r);
                    const inputCls = `w-32 bg-background border rounded-lg px-2 py-1.5 text-right font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 ${isDirty ? "border-amber-500" : "border-border"}`;
                    return (
                      <tr key={r.date} className={`border-b border-border/50 ${semOp ? "opacity-50" : ""}`}>
                        <td className="py-2 pr-4 font-body">{fmtDate(r.date)}</td>
                        <td className="py-2 px-2 font-body">
                          {r.tipo_dia}
                          {semOp && (
                            <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground border border-border rounded px-1 py-0.5">
                              sem operação
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={fmtNum(Number(r.meta_vendas) || 0, 2)}
                            onChange={(e) => handleEditMeta(r.date, "meta_vendas", e.target.value)}
                            className={inputCls}
                          />
                        </td>
                        <td className="py-2 px-2 text-right">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={fmtNum(Number(r.meta_margem_pct) || 0, 2)}
                            onChange={(e) => handleEditMeta(r.date, "meta_margem_pct", e.target.value)}
                            className={inputCls + " w-24"}
                          />
                        </td>
                        <td className="py-2 pl-2 text-right font-body">{fmtBRL(Number(r.meta_lucro))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                {metasRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-border font-semibold">
                      <td className="py-3 pr-4 font-body" colSpan={2}>Totais</td>
                      <td className="py-3 px-2 text-right font-body">{fmtBRL(totals.vendas)}</td>
                      <td></td>
                      <td className="py-3 pl-2 text-right font-body">{fmtBRL(totals.lucro)}</td>
                    </tr>
                    <tr className="text-muted-foreground">
                      <td className="py-2 pr-4 font-body text-xs" colSpan={2}>
                        Média diária ({totals.dias} dias com operação
                        {totals.diasIgnorados > 0 ? ` · ${totals.diasIgnorados} ignorado(s)` : ""})
                      </td>
                      <td className="py-2 px-2 text-right font-body text-xs">{fmtBRL(totals.mediaVendas)}</td>
                      <td></td>
                      <td className="py-2 pl-2 text-right font-body text-xs">{fmtBRL(totals.mediaLucro)}</td>
                    </tr>
                  </tfoot>
                )}

              </table>
            </div>
          </TabsContent>

          {/* ABA 2 */}
          <TabsContent value="calendario">
            <div className="bg-card border border-border rounded-2xl p-6 mb-6 flex flex-wrap gap-4">
              <button onClick={handleGerarCalendario} disabled={loading} className={btnPrimary}>
                <Wand2 className="w-4 h-4" /> Gerar calendário (mês selecionado)
              </button>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-body text-muted-foreground">Data</th>
                    <th className="text-left py-2 px-2 font-body text-muted-foreground">Dia</th>
                    <th className="text-left py-2 px-2 font-body text-muted-foreground">Semana</th>
                    <th className="text-left py-2 px-2 font-body text-muted-foreground">Tipo</th>
                    <th className="text-left py-2 px-2 font-body text-muted-foreground">Editado</th>
                    <th className="text-left py-2 pl-2 font-body text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {calRows.length === 0 && (
                    <tr><td colSpan={6} className="py-6 text-center text-muted-foreground font-body">Nenhum dia gerado ainda.</td></tr>
                  )}
                  {calRows.map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-body">{fmtDate(r.data)}</td>
                      <td className="py-2 px-2 font-body">{r.dia_sem}</td>
                      <td className="py-2 px-2 font-body">{r.semana}</td>
                      <td className="py-2 px-2">
                        <select value={r.tipo} onChange={(e) => handleUpdateTipoDia(r.id, e.target.value)} className={selectCls}>
                          {TIPO_OPTIONS.includes(r.tipo) ? null : <option value={r.tipo}>{r.tipo}</option>}
                          {TIPO_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td className="py-2 px-2 font-body">{r.editado ? "Sim" : "—"}</td>
                      <td className="py-2 pl-2">
                        {r.editado && (
                          <button onClick={() => handleResetDia(r.id)} className={btnGhost + " !py-1 !px-2 text-xs"}>
                            <RotateCcw className="w-3 h-3" /> Reverter
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* ABA 3 */}
          <TabsContent value="taxas">
            <div className="bg-card border border-border rounded-2xl p-6 mb-6">
              <p className="text-sm text-muted-foreground font-body mb-4">
                A meta de vendas é calculada como <span className="font-mono">venda_base / (1 − tx_venda)</span>.
                A margem é aditiva: <span className="font-mono">margem_base + tx_margem</span>.
              </p>
              <button onClick={handleSemearTaxas} disabled={loading} className={btnPrimary}>
                <Sprout className="w-4 h-4" /> Semear taxas padrão
              </button>
            </div>
            <div className="bg-card border border-border rounded-2xl p-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 font-body text-muted-foreground">Tipo</th>
                    <th className="text-right py-2 px-2 font-body text-muted-foreground">tx_venda (%)</th>
                    <th className="text-right py-2 px-2 font-body text-muted-foreground">tx_margem (%)</th>
                    <th className="text-right py-2 px-2 font-body text-muted-foreground">tx_volume (%)</th>
                    <th className="text-right py-2 pl-2 font-body text-muted-foreground">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {taxasRows.length === 0 && (
                    <tr><td colSpan={5} className="py-6 text-center text-muted-foreground font-body">Nenhuma taxa cadastrada. Clique em "Semear taxas padrão".</td></tr>
                  )}
                  {taxasRows.map((r, idx) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-2 pr-4 font-body font-medium">{r.tipo}</td>
                      {(["tx_venda","tx_margem","tx_volume"] as const).map((f) => (
                        <td key={f} className="py-2 px-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            defaultValue={fmtNum(Number(r[f]) * 100, 3)}
                            onBlur={(e) => {
                              const num = parseFloat(e.target.value.replace(/\./g, "").replace(",", ".")) / 100;
                              const next = [...taxasRows];
                              next[idx] = { ...next[idx], [f]: isNaN(num) ? 0 : num };
                              setTaxasRows(next);
                            }}
                            className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-right font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                          />
                        </td>
                      ))}
                      <td className="py-2 pl-2 text-right">
                        <button onClick={() => handleSaveTaxa(taxasRows[idx])} className={btnPrimary + " !py-1 !px-3 text-xs"}>
                          <Save className="w-3 h-3" /> Salvar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
};

export default MetasGerador;
