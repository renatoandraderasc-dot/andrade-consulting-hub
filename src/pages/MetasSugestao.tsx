import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Legend, CartesianGrid,
} from "recharts";
import { Sparkles, ChevronLeft, ChevronRight, Lock, LockOpen, RefreshCw, Save, AlertTriangle, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { useToast } from "@/hooks/use-toast";
import { useSugestaoMetas, LOJA } from "@/hooks/useSugestaoMetas";
import {
  calcularCrescimentos, calcularCenarios, calcularPesosDiarios, distribuirMeta,
  feriadosDoMes, alertasFeriadosMoveis, proximoMes, ultimoMesFechado,
  fmtBRL, fmtPct, fmtNum, MESES, DOW_LABEL, diasNoMes,
  type AjusteDia, type MetaDia, type Crescimentos, type Cenarios,
} from "@/lib/metasSugestao";

interface Store { id: string; name: string }
type CenarioKey = "conservador" | "moderado" | "agressivo";

const PASSOS = ["Análise", "Cenários", "Distribuição diária", "Revisão"];

const parseNum = (raw: string) => parseFloat(String(raw).replace(/\./g, "").replace(",", ".")) || 0;
const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const MetasSugestao = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [passo, setPasso] = useState(0);

  const prox = proximoMes();
  const [ano, setAno] = useState(prox.ano);
  const [mes, setMes] = useState(prox.mes);

  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [cenario, setCenario] = useState<CenarioKey>("moderado");
  const [metas, setMetas] = useState<Record<string, number>>({});
  const [margens, setMargens] = useState<Record<string, number>>({});
  const [volumes, setVolumes] = useState<Record<string, number>>({});
  const [mixes, setMixes] = useState<Record<string, number>>({});
  const [visao, setVisao] = useState<"departamento" | "categoria">("departamento");
  const [ajustes, setAjustes] = useState<Record<string, Record<string, AjusteDia>>>({});
  const [abaDept, setAbaDept] = useState<string>(LOJA);
  const [salvando, setSalvando] = useState(false);
  const [existentes, setExistentes] = useState<number | null>(null);
  const [comentario, setComentario] = useState("");
  const [gerandoComentario, setGerandoComentario] = useState(false);

  const { data, isLoading, error } = useSugestaoMetas(storeId, { ano, mes });

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
    if (user && isAdmin) {
      supabase.from("stores").select("id, name").order("name").then(({ data }) => {
        if (!data?.length) return;
        setStores(data);
        const sid = sessionStorage.getItem("selectedStoreId");
        const p = data.find((s) => s.id === sid) || data[0];
        setStoreId(p.id); setStoreName(p.name);
      });
    }
  }, [user, isAdmin, authLoading]);

  // default: todos os departamentos (exceto o total da loja)
  useEffect(() => {
    if (!data) return;
    setSelecionados(data.departamentos.filter((d) => d !== LOJA));
  }, [data?.departamentos.join("|")]);

  // ---------- calculos por departamento ----------
  const analise = useMemo(() => {
    const out: Record<string, { cres: Crescimentos; cen: Cenarios }> = {};
    if (!data) return out;
    for (const dep of data.departamentos) {
      const h = data.porDept[dep];
      const cres = calcularCrescimentos(h.dias, { ano, mes }, h.ytdAtual, h.ytdAnterior);
      out[dep] = { cres, cen: calcularCenarios(cres.base, cres.gAno, cres.gRecente) };
    }
    return out;
  }, [data, ano, mes]);

  const analiseCategoria = useMemo(() => {
    if (!data) return [] as { nome: string; h: typeof data.porCategoria[string]; cres: Crescimentos }[];
    return data.categorias
      .filter((c) => c !== LOJA)
      .map((nome) => {
        const h = data.porCategoria[nome];
        return { nome, h, cres: calcularCrescimentos(h.dias, { ano, mes }, h.ytdAtual, h.ytdAnterior) };
      })
      .sort((a, b) => b.h.ytdAtual - a.h.ytdAtual);
  }, [data, ano, mes]);

  const deps = useMemo(
    () => (data ? data.departamentos.filter((d) => d !== LOJA && selecionados.includes(d)) : []),
    [data, selecionados],
  );

  // aplica cenario
  const aplicarCenario = (key: CenarioKey) => {
    setCenario(key);
    const novas: Record<string, number> = {};
    const novasMargens: Record<string, number> = { ...margens };
    const novosVolumes: Record<string, number> = { ...volumes };
    const novosMix: Record<string, number> = { ...mixes };
    for (const dep of deps) {
      const c = analise[dep]?.cres;
      const meta = analise[dep]?.cen[key] ?? 0;
      novas[dep] = meta;
      const cresc = (c?.base ?? 0) > 0 ? meta / (c!.base) - 1 : 0;
      if (novasMargens[dep] === undefined) novasMargens[dep] = c?.margemEspelhoPct ?? 0;
      novosVolumes[dep] = Math.max(0, (c?.volumeEspelho ?? 0) * (1 + cresc));
      if (novosMix[dep] === undefined) novosMix[dep] = Math.round(c?.mixEspelho ?? 0);
    }
    setMetas(novas);
    setMargens(novasMargens);
    setVolumes(novosVolumes);
    setMixes(novosMix);
  };

  useEffect(() => {
    if (deps.length && Object.keys(metas).length === 0) aplicarCenario(cenario);
  }, [deps.length]);

  const totalMeta = deps.reduce((a, d) => a + (metas[d] ?? 0), 0);

  // ---------- distribuicao diaria ----------
  const distribuicao = useMemo(() => {
    const out: Record<string, MetaDia[]> = {};
    if (!data) return out;
    for (const dep of deps) {
      const h = data.porDept[dep];
      const espelhoPrefixo = `${ano - 1}-${String(mes).padStart(2, "0")}`;
      const diasEspelho = h.dias.filter((d) => d.date.startsWith(espelhoPrefixo));
      const pesos = calcularPesosDiarios({ ano, mes }, diasEspelho, h.dias);
      out[dep] = distribuirMeta(pesos, metas[dep] ?? 0, ajustes[dep] ?? {});
    }
    return out;
  }, [data, deps, ano, mes, metas, ajustes]);

  const totalDiario = useMemo(() => {
    const total = diasNoMes(ano, mes);
    const linhas: { date: string; dia: number; dow: number; meta: number }[] = [];
    for (let d = 1; d <= total; d++) {
      const date = `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const meta = deps.reduce(
        (a, dep) => a + (distribuicao[dep]?.find((x) => x.date === date)?.meta ?? 0), 0,
      );
      const dow = distribuicao[deps[0]]?.find((x) => x.date === date)?.dow ?? 0;
      linhas.push({ date, dia: d, dow, meta });
    }
    return linhas;
  }, [distribuicao, deps, ano, mes]);

  useEffect(() => {
    if (deps.length && !deps.includes(abaDept) && abaDept !== LOJA) setAbaDept(deps[0] ?? LOJA);
  }, [deps.join("|")]);

  const setAjuste = (dep: string, date: string, patch: AjusteDia) =>
    setAjustes((prev) => ({
      ...prev,
      [dep]: { ...(prev[dep] ?? {}), [date]: { ...(prev[dep]?.[date] ?? {}), ...patch } },
    }));

  const recalcularCurva = (dep: string) =>
    setAjustes((prev) => {
      const atuais = prev[dep] ?? {};
      const mantidos: Record<string, AjusteDia> = {};
      for (const [date, a] of Object.entries(atuais)) if (a.travado) mantidos[date] = a;
      return { ...prev, [dep]: mantidos };
    });

  // ---------- metas existentes ----------
  useEffect(() => {
    if (!storeId || passo !== 3) return;
    const inicio = `${ano}-${String(mes).padStart(2, "0")}-01`;
    const fim = `${ano}-${String(mes).padStart(2, "0")}-${String(diasNoMes(ano, mes)).padStart(2, "0")}`;
    supabase.from("store_daily_metrics")
      .select("meta_vendas, department")
      .eq("store_id", storeId).gte("date", inicio).lte("date", fim)
      .then(({ data: rows }) => {
        const filtradas = (rows ?? []).filter((r) => deps.includes(r.department));
        setExistentes(filtradas.length ? filtradas.reduce((a, r) => a + (Number(r.meta_vendas) || 0), 0) : null);
      });
  }, [storeId, passo, ano, mes, deps.join("|")]);

  const salvar = async () => {
    if (existentes !== null && !confirm(
      `Já existem metas gravadas para ${MESES[mes]}/${ano}.\n\nTotal atual: ${fmtBRL(existentes)}\nNovo total: ${fmtBRL(totalMeta)}\n\nDeseja sobrescrever?`,
    )) return;
    setSalvando(true);
    try {
      const payload: any[] = [];
      for (const dep of deps) {
        const margem = margens[dep] ?? 0;
        const volumeMes = volumes[dep] ?? 0;
        const mixMes = mixes[dep] ?? 0;
        const metaDep = metas[dep] ?? 0;
        for (const d of distribuicao[dep] ?? []) {
          const partic = metaDep > 0 ? d.meta / metaDep : 0;
          payload.push({
            store_id: storeId,
            department: dep,
            date: d.date,
            meta_vendas: d.meta,
            meta_margem_pct: margem,
            meta_lucro: (d.meta * margem) / 100,
            ...(volumeMes > 0 ? { meta_volume: volumeMes * partic } : {}),
            ...(mixMes > 0 ? { meta_mix: mixMes * partic } : {}),
          });
        }
      }
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase.from("store_daily_metrics")
          .upsert(payload.slice(i, i + 500), { onConflict: "store_id,department,date" });
        if (error) throw error;
      }
      toast({
        title: "Metas gravadas",
        description: `${payload.length} dia(s) × departamento salvos para ${MESES[mes]}/${ano}.`,
        action: (
          <button className="text-xs underline" onClick={() => navigate("/pic")}>Ver no PIC</button>
        ) as any,
      });
    } catch (e: any) {
      toast({ title: "Erro ao gravar", description: e.message, variant: "destructive" });
    } finally { setSalvando(false); }
  };

  const gerarComentario = async () => {
    setGerandoComentario(true);
    try {
      const resumo = deps.map((d) => `${d}: meta ${fmtBRL(metas[d] ?? 0)} (espelho ${fmtBRL(analise[d]?.cres.base ?? 0)})`).join("; ");
      const { data: r, error } = await supabase.functions.invoke("agenda-financeira-ai", {
        body: {
          prompt: `Escreva um parágrafo curto em português justificando as metas de ${MESES[mes]}/${ano} da loja ${storeName}. Dados: ${resumo}. Não recalcule nada.`,
        },
      });
      if (error) throw error;
      setComentario(String((r as any)?.texto ?? (r as any)?.insight ?? "").trim() || "Não foi possível gerar o comentário.");
    } catch {
      setComentario("Não foi possível gerar o comentário agora.");
    } finally { setGerandoComentario(false); }
  };

  // ---------- graficos ----------
  const ultimoFechado = ultimoMesFechado();
  const serieLoja = data?.porDept[LOJA]?.serie ?? [];
  const grafico13 = useMemo(() => {
    const out: { label: string; atual: number; anterior: number }[] = [];
    for (let i = 12; i >= 0; i--) {
      const d = new Date(Date.UTC(ultimoFechado.ano, ultimoFechado.mes - 1 - i, 1));
      const a = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
      const atual = serieLoja.find((s) => s.ano === a && s.mes === m)?.vendas ?? 0;
      const anterior = serieLoja.find((s) => s.ano === a - 1 && s.mes === m)?.vendas ?? 0;
      out.push({ label: `${MESES[m].slice(0, 3)}/${String(a).slice(2)}`, atual, anterior });
    }
    return out;
  }, [serieLoja.length, ultimoFechado.ano, ultimoFechado.mes]);

  const feriados = feriadosDoMes(ano, mes);
  const alertasMoveis = alertasFeriadosMoveis(ano, mes);

  const card = "bg-card border border-border rounded-lg p-4";
  const inputCls = "bg-background border border-border rounded px-2 py-1 text-sm w-full";

  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-primary" />
          <div>
            <h1 className="font-heading text-xl font-bold">Sugestão Analítica de Metas</h1>
            <p className="text-xs text-muted-foreground">
              Cálculo determinístico a partir do histórico real da loja — sem inteligência artificial.
            </p>
          </div>
        </div>

        {/* passos */}
        <div className="flex flex-wrap gap-2">
          {PASSOS.map((p, i) => (
            <button
              key={p}
              onClick={() => setPasso(i)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                i === passo ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground"
              }`}
            >
              {i + 1}. {p}
            </button>
          ))}
        </div>

        {/* filtros */}
        <div className={`${card} grid gap-3 md:grid-cols-4`}>
          <label className="text-xs">
            Loja
            <select
              className={inputCls}
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setStoreName(stores.find((s) => s.id === e.target.value)?.name ?? "");
                setMetas({}); setAjustes({});
              }}
            >
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="text-xs">
            Mês-alvo
            <select className={inputCls} value={mes} onChange={(e) => { setMes(Number(e.target.value)); setMetas({}); setAjustes({}); }}>
              {MESES.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>
          <label className="text-xs">
            Ano
            <input type="number" className={inputCls} value={ano}
              onChange={(e) => { setAno(Number(e.target.value)); setMetas({}); setAjustes({}); }} />
          </label>
          <div className="text-xs">
            Departamentos
            <div className="max-h-20 overflow-auto border border-border rounded px-2 py-1">
              {(data?.departamentos ?? []).filter((d) => d !== LOJA).map((d) => (
                <label key={d} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selecionados.includes(d)}
                    onChange={(e) =>
                      setSelecionados((prev) => e.target.checked ? [...prev, d] : prev.filter((x) => x !== d))
                    }
                  />
                  {d}
                </label>
              ))}
            </div>
          </div>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando histórico da loja…</p>}
        {(data?.aviso || error) && (
          <div className="flex items-center gap-2 text-sm text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded p-3">
            <AlertTriangle className="w-4 h-4" /> Relatório não disponível para esta loja.
          </div>
        )}

        {/* ---------------- PASSO 1 ---------------- */}
        {passo === 0 && data && (
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              {(() => {
                const h = data.porDept[LOJA];
                const serie = h?.serie ?? [];
                const ant = serie.find((s) => s.ano === ultimoFechado.ano && s.mes === ultimoFechado.mes);
                const antAnoPassado = serie.find((s) => s.ano === ultimoFechado.ano - 1 && s.mes === ultimoFechado.mes);
                const varPct = antAnoPassado && antAnoPassado.vendas > 0
                  ? ((ant?.vendas ?? 0) / antAnoPassado.vendas - 1) * 100 : 0;
                const ytdPct = h && h.ytdAnterior > 0 ? (h.ytdAtual / h.ytdAnterior - 1) * 100 : 0;
                const esp = analise[LOJA]?.cres;
                return (
                  <>
                    <div className={card}>
                      <p className="text-xs text-muted-foreground">Mês anterior ({MESES[ultimoFechado.mes]}/{ultimoFechado.ano})</p>
                      <p className="text-lg font-bold">{fmtBRL(ant?.vendas ?? 0)}</p>
                      <p className={`text-xs ${varPct >= 0 ? "text-emerald-500" : "text-red-500"}`}>{fmtPct(varPct)} vs ano anterior</p>
                    </div>
                    <div className={card}>
                      <p className="text-xs text-muted-foreground">Acumulado do ano</p>
                      <p className="text-lg font-bold">{fmtBRL(h?.ytdAtual ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">
                        Ano anterior {fmtBRL(h?.ytdAnterior ?? 0)} ·{" "}
                        <span className={ytdPct >= 0 ? "text-emerald-500" : "text-red-500"}>{fmtPct(ytdPct)}</span>
                      </p>
                    </div>
                    <div className={card}>
                      <p className="text-xs text-muted-foreground">Espelho — {MESES[mes]}/{ano - 1}</p>
                      <p className="text-lg font-bold">{fmtBRL(esp?.espelho?.vendas ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">
                        Margem {fmtPct(esp?.margemEspelhoPct ?? 0)} · Volume {fmtNum(esp?.volumeEspelho ?? 0)}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className={card}>
              <p className="text-xs font-semibold mb-2">Evolução mensal (13 meses) — ano atual vs ano anterior</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={grafico13} margin={{ top: 20, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => fmtNum(v / 1000) + "k"} />
                  <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                  <Legend />
                  <Bar dataKey="anterior" name="Ano anterior" fill="#94a3b8">
                    <LabelList dataKey="anterior" position="top" formatter={(v: any) => fmtNum(Number(v) / 1000) + "k"} style={{ fontSize: 9 }} />
                  </Bar>
                  <Bar dataKey="atual" name="Ano atual" fill="hsl(var(--primary))">
                    <LabelList dataKey="atual" position="top" formatter={(v: any) => fmtNum(Number(v) / 1000) + "k"} style={{ fontSize: 9 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr><th className="text-left p-1">Departamento</th><th className="text-right p-1">Mês anterior</th>
                    <th className="text-right p-1">YTD atual</th><th className="text-right p-1">YTD anterior</th>
                    <th className="text-right p-1">Espelho</th><th className="text-right p-1">Margem %</th>
                    <th className="text-right p-1">Volume espelho</th><th className="text-right p-1">Mix espelho</th></tr>
                </thead>
                <tbody>
                  {deps.map((dep) => {
                    const h = data.porDept[dep];
                    const ant = h.serie.find((s) => s.ano === ultimoFechado.ano && s.mes === ultimoFechado.mes);
                    const c = analise[dep]?.cres;
                    return (
                      <tr key={dep} className="border-t border-border">
                        <td className="p-1">{dep}</td>
                        <td className="p-1 text-right">{fmtBRL(ant?.vendas ?? 0)}</td>
                        <td className="p-1 text-right">{fmtBRL(h.ytdAtual)}</td>
                        <td className="p-1 text-right">{fmtBRL(h.ytdAnterior)}</td>
                        <td className="p-1 text-right">{fmtBRL(c?.espelho?.vendas ?? 0)}</td>
                        <td className="p-1 text-right">{fmtPct(c?.margemEspelhoPct ?? 0)}</td>
                        <td className="p-1 text-right">{fmtNum(c?.volumeEspelho ?? 0)}</td>
                        <td className="p-1 text-right">{fmtNum(c?.mixEspelho ?? 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={`${card} overflow-x-auto`}>
              <p className="text-xs font-semibold mb-2">Por categoria (mercadológico) — {MESES[mes]}/{ano - 1} e ano corrente</p>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr><th className="text-left p-1">Categoria</th><th className="text-right p-1">YTD atual</th>
                    <th className="text-right p-1">YTD anterior</th><th className="text-right p-1">Espelho</th>
                    <th className="text-right p-1">Margem %</th><th className="text-right p-1">Volume espelho</th>
                    <th className="text-right p-1">Mix espelho</th></tr>
                </thead>
                <tbody>
                  {analiseCategoria.map(({ nome, h, cres }) => (
                    <tr key={nome} className="border-t border-border">
                      <td className="p-1">{nome}</td>
                      <td className="p-1 text-right">{fmtBRL(h.ytdAtual)}</td>
                      <td className="p-1 text-right">{fmtBRL(h.ytdAnterior)}</td>
                      <td className="p-1 text-right">{fmtBRL(cres.espelho?.vendas ?? 0)}</td>
                      <td className="p-1 text-right">{fmtPct(cres.margemEspelhoPct)}</td>
                      <td className="p-1 text-right">{fmtNum(cres.volumeEspelho)}</td>
                      <td className="p-1 text-right">{fmtNum(cres.mixEspelho)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- PASSO 2 ---------------- */}
        {passo === 1 && data && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["conservador", "moderado", "agressivo"] as CenarioKey[]).map((k) => (
                <button key={k} onClick={() => aplicarCenario(k)}
                  className={`px-3 py-1.5 rounded text-xs font-semibold border capitalize ${
                    cenario === k ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                  {k}
                </button>
              ))}
            </div>

            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left p-1">Departamento</th>
                    <th className="text-right p-1">Espelho</th>
                    <th className="text-right p-1">g_ano</th>
                    <th className="text-right p-1">g_recente</th>
                    <th className="text-right p-1">Conservador</th>
                    <th className="text-right p-1">Moderado</th>
                    <th className="text-right p-1">Agressivo</th>
                    <th className="text-right p-1">Meta escolhida</th>
                    <th className="text-right p-1">Margem-alvo %</th>
                    <th className="text-right p-1">Volume-alvo</th>
                    <th className="text-right p-1">Mix-alvo</th>
                  </tr>
                </thead>
                <tbody>
                  {deps.map((dep) => {
                    const a = analise[dep];
                    return (
                      <tr key={dep} className="border-t border-border">
                        <td className="p-1">
                          {dep}
                          {!a?.cres.temEspelho && (
                            <span className="ml-1 text-[10px] px-1 rounded bg-amber-500/20 text-amber-500">
                              sem histórico do ano anterior
                            </span>
                          )}
                        </td>
                        <td className="p-1 text-right">{fmtBRL(a?.cres.base ?? 0)}</td>
                        <td className="p-1 text-right">{fmtPct((a?.cres.gAno ?? 0) * 100)}</td>
                        <td className="p-1 text-right">{fmtPct((a?.cres.gRecente ?? 0) * 100)}</td>
                        <td className="p-1 text-right">{fmtBRL(a?.cen.conservador ?? 0)}</td>
                        <td className="p-1 text-right">{fmtBRL(a?.cen.moderado ?? 0)}</td>
                        <td className="p-1 text-right">{fmtBRL(a?.cen.agressivo ?? 0)}</td>
                        <td className="p-1 text-right">
                          <input
                            className={`${inputCls} text-right w-32`}
                            defaultValue={fmtNum(metas[dep] ?? 0, 2)}
                            key={`${dep}-${metas[dep]}`}
                            onBlur={(e) => {
                              const raw = e.target.value.trim();
                              const base = analise[dep]?.cres.base ?? 0;
                              const valor = raw.endsWith("%")
                                ? base * (1 + parseNum(raw.slice(0, -1)) / 100)
                                : parseNum(raw);
                              setMetas((p) => ({ ...p, [dep]: Math.max(0, valor) }));
                            }}
                          />
                        </td>
                        <td className="p-1 text-right">
                          <input
                            className={`${inputCls} text-right w-20`}
                            defaultValue={fmtNum(margens[dep] ?? a?.cres.margemEspelhoPct ?? 0, 2)}
                            key={`m-${dep}-${margens[dep]}`}
                            onBlur={(e) => setMargens((p) => ({ ...p, [dep]: parseNum(e.target.value) }))}
                          />
                        </td>
                        <td className="p-1 text-right">
                          <input
                            className={`${inputCls} text-right w-24`}
                            defaultValue={fmtNum(volumes[dep] ?? a?.cres.volumeEspelho ?? 0)}
                            key={`v-${dep}-${volumes[dep]}`}
                            onBlur={(e) => setVolumes((p) => ({ ...p, [dep]: parseNum(e.target.value) }))}
                          />
                        </td>
                        <td className="p-1 text-right">
                          <input
                            className={`${inputCls} text-right w-20`}
                            defaultValue={fmtNum(mixes[dep] ?? a?.cres.mixEspelho ?? 0)}
                            key={`mx-${dep}-${mixes[dep]}`}
                            onBlur={(e) => setMixes((p) => ({ ...p, [dep]: parseNum(e.target.value) }))}
                          />
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border font-bold">
                    <td className="p-1">TOTAL LOJA</td>
                    <td className="p-1 text-right">{fmtBRL(deps.reduce((a, d) => a + (analise[d]?.cres.base ?? 0), 0))}</td>
                    <td colSpan={5}></td>
                    <td className="p-1 text-right">{fmtBRL(totalMeta)}</td>
                    <td></td>
                    <td className="p-1 text-right">{fmtNum(deps.reduce((a, d) => a + (volumes[d] ?? 0), 0))}</td>
                    <td className="p-1 text-right">{fmtNum(deps.reduce((a, d) => a + (mixes[d] ?? 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-[10px] text-muted-foreground mt-2">
                Na meta você pode digitar o valor em reais (1234,56) ou um percentual sobre o espelho (ex.: 8%).
              </p>
            </div>
          </div>
        )}

        {/* ---------------- PASSO 3 ---------------- */}
        {passo === 2 && data && (
          <div className="space-y-4">
            {(feriados.length > 0 || alertasMoveis.length > 0) && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 text-xs space-y-1">
                {feriados.length > 0 && (
                  <p><b>Feriados em {MESES[mes]}:</b> {feriados.map((f) => `${dataBR(f.date)} ${f.nome}`).join(" · ")}</p>
                )}
                {alertasMoveis.map((m) => <p key={m}>⚠ {m}</p>)}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {deps.map((d) => (
                <button key={d} onClick={() => setAbaDept(d)}
                  className={`px-3 py-1 rounded text-xs border ${abaDept === d ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                  {d}
                </button>
              ))}
              <button onClick={() => setAbaDept(LOJA)}
                className={`px-3 py-1 rounded text-xs border ${abaDept === LOJA ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                TOTAL LOJA
              </button>
            </div>

            {(() => {
              const linhas = abaDept === LOJA
                ? totalDiario.map((l) => ({ ...l, peso: 0, fechado: false, travado: false, multiplicador: 1, origem: "espelho" as const }))
                : (distribuicao[abaDept] ?? []);
              const totalMesAba = linhas.reduce((a, b) => a + b.meta, 0);
              const chart = linhas.map((l) => ({
                nome: `${DOW_LABEL[l.dow]} ${dataBR(l.date)}`,
                meta: l.meta,
                pct: totalMesAba > 0 ? (l.meta / totalMesAba) * 100 : 0,
              }));
              return (
                <>
                  <div className={card}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold">
                        {abaDept} — total {fmtBRL(totalMesAba)}
                      </p>
                      {abaDept !== LOJA && (
                        <button onClick={() => recalcularCurva(abaDept)}
                          className="flex items-center gap-1 text-xs border border-border rounded px-2 py-1">
                          <RefreshCw className="w-3 h-3" /> Recalcular curva
                        </button>
                      )}
                    </div>
                    <ResponsiveContainer width="100%" height={Math.max(320, linhas.length * 22)}>
                      <BarChart data={chart} layout="vertical" margin={{ left: 10, right: 90, top: 5, bottom: 5 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="nome" width={80} tick={{ fontSize: 9 }} />
                        <Tooltip formatter={(v: any) => fmtBRL(Number(v))} />
                        <Bar dataKey="meta" fill="hsl(var(--primary))">
                          <LabelList
                            dataKey="meta"
                            position="right"
                            style={{ fontSize: 9 }}
                            formatter={(v: any, _n?: any, entry?: any) => fmtBRL(Number(v))}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className={`${card} overflow-x-auto`}>
                    <table className="w-full text-xs">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="text-left p-1">Dia</th><th className="text-left p-1">Semana</th>
                          <th className="text-right p-1">Peso %</th><th className="text-right p-1">Meta R$</th>
                          <th className="text-right p-1">Multiplicador</th><th className="p-1">Trava</th><th className="p-1">Fechado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map((l) => {
                          const aj = ajustes[abaDept]?.[l.date] ?? {};
                          const ro = abaDept === LOJA;
                          return (
                            <tr key={l.date} className="border-t border-border">
                              <td className="p-1">{dataBR(l.date)}</td>
                              <td className="p-1">{DOW_LABEL[l.dow]}</td>
                              <td className="p-1 text-right">{fmtPct(totalMesAba > 0 ? (l.meta / totalMesAba) * 100 : 0, 2)}</td>
                              <td className="p-1 text-right">
                                {ro ? fmtBRL(l.meta) : (
                                  <input className={`${inputCls} text-right w-28`}
                                    key={`v-${l.date}-${l.meta}`}
                                    defaultValue={fmtNum(l.meta, 2)}
                                    onBlur={(e) => setAjuste(abaDept, l.date, { travado: true, valor: parseNum(e.target.value) })} />
                                )}
                              </td>
                              <td className="p-1 text-right">
                                {ro ? "—" : (
                                  <input className={`${inputCls} text-right w-16`}
                                    defaultValue={fmtNum(aj.multiplicador ?? 1, 2)}
                                    key={`x-${l.date}-${aj.multiplicador ?? 1}`}
                                    onBlur={(e) => setAjuste(abaDept, l.date, { multiplicador: parseNum(e.target.value) || 1 })} />
                                )}
                              </td>
                              <td className="p-1 text-center">
                                {!ro && (
                                  <button onClick={() => setAjuste(abaDept, l.date, { travado: !aj.travado, valor: aj.valor ?? l.meta })}>
                                    {aj.travado ? <Lock className="w-3.5 h-3.5 text-primary" /> : <LockOpen className="w-3.5 h-3.5 text-muted-foreground" />}
                                  </button>
                                )}
                              </td>
                              <td className="p-1 text-center">
                                {!ro && (
                                  <input type="checkbox" checked={!!aj.fechado}
                                    onChange={(e) => setAjuste(abaDept, l.date, { fechado: e.target.checked })} />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ---------------- PASSO 4 ---------------- */}
        {passo === 3 && data && (
          <div className="space-y-4">
            <div className={`${card} overflow-x-auto`}>
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left p-1">Departamento</th><th className="text-right p-1">Meta do mês</th>
                    <th className="text-right p-1">% vs espelho</th><th className="text-right p-1">% vs mês anterior</th>
                    <th className="text-right p-1">Margem-alvo</th><th className="text-right p-1">Meta de lucro</th>
                    <th className="text-right p-1">Volume sugerido</th>
                    <th className="text-right p-1">Mix</th>
                  </tr>
                </thead>
                <tbody>
                  {deps.map((dep) => {
                    const c = analise[dep]?.cres;
                    const h = data.porDept[dep];
                    const ant = h.serie.find((s) => s.ano === ultimoFechado.ano && s.mes === ultimoFechado.mes)?.vendas ?? 0;
                    const meta = metas[dep] ?? 0;
                    const margem = margens[dep] ?? c?.margemEspelhoPct ?? 0;
                    const cresc = (c?.base ?? 0) > 0 ? meta / (c!.base) - 1 : 0;
                    const volSug = volumes[dep] ?? (c?.volumeEspelho ?? 0) * (1 + cresc);
                    return (
                      <tr key={dep} className="border-t border-border">
                        <td className="p-1">{dep}</td>
                        <td className="p-1 text-right">{fmtBRL(meta)}</td>
                        <td className="p-1 text-right">{fmtPct(cresc * 100)}</td>
                        <td className="p-1 text-right">{fmtPct(ant > 0 ? (meta / ant - 1) * 100 : 0)}</td>
                        <td className="p-1 text-right">{fmtPct(margem)}</td>
                        <td className="p-1 text-right">{fmtBRL((meta * margem) / 100)}</td>
                        <td className="p-1 text-right">
                          <input className={`${inputCls} text-right w-24`}
                            defaultValue={fmtNum(volSug, 0)}
                            key={`vol-${dep}-${volSug}`}
                            onBlur={(e) => setVolumes((p) => ({ ...p, [dep]: parseNum(e.target.value) }))} />
                        </td>
                        <td className="p-1 text-right">
                          <input className={`${inputCls} text-right w-20`}
                            defaultValue={fmtNum(mixes[dep] ?? c?.mixEspelho ?? 0)}
                            key={`mix4-${dep}-${mixes[dep]}`}
                            onBlur={(e) => setMixes((p) => ({ ...p, [dep]: parseNum(e.target.value) }))} />
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border font-bold">
                    <td className="p-1">TOTAL LOJA</td>
                    <td className="p-1 text-right">{fmtBRL(totalMeta)}</td>
                    <td colSpan={3}></td>
                    <td className="p-1 text-right">{fmtBRL(deps.reduce((a, d) => a + ((metas[d] ?? 0) * (margens[d] ?? analise[d]?.cres.margemEspelhoPct ?? 0)) / 100, 0))}</td>
                    <td className="p-1 text-right">{fmtNum(deps.reduce((a, d) => a + (volumes[d] ?? 0), 0))}</td>
                    <td className="p-1 text-right">{fmtNum(deps.reduce((a, d) => a + (mixes[d] ?? 0), 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {existentes !== null && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 text-xs">
                Já existem metas para {MESES[mes]}/{ano}: total atual {fmtBRL(existentes)} → novo total {fmtBRL(totalMeta)}.
                A gravação pedirá confirmação antes de sobrescrever.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button onClick={salvar} disabled={salvando || totalMeta <= 0}
                className="flex items-center gap-2 bg-primary text-primary-foreground rounded px-4 py-2 text-sm font-semibold disabled:opacity-50">
                <Save className="w-4 h-4" /> {salvando ? "Gravando…" : "Gravar metas"}
              </button>
              <button onClick={gerarComentario} disabled={gerandoComentario}
                className="flex items-center gap-2 border border-border rounded px-4 py-2 text-sm">
                <Wand2 className="w-4 h-4" /> {gerandoComentario ? "Gerando…" : "Gerar comentário"}
              </button>
            </div>
            {comentario && <div className={`${card} text-sm`}>{comentario}</div>}
          </div>
        )}

        {/* navegacao */}
        <div className="flex justify-between pt-2">
          <button onClick={() => setPasso((p) => Math.max(0, p - 1))} disabled={passo === 0}
            className="flex items-center gap-1 border border-border rounded px-3 py-1.5 text-sm disabled:opacity-40">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
          <button onClick={() => setPasso((p) => Math.min(3, p + 1))} disabled={passo === 3}
            className="flex items-center gap-1 bg-primary text-primary-foreground rounded px-3 py-1.5 text-sm disabled:opacity-40">
            Avançar <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </ClientLayout>
  );
};

export default MetasSugestao;
