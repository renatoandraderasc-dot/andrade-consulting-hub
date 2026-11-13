import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Plug, Database, Search, Clock3, Wifi } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { iniciarSync, acompanharSync, fmtSync, syncAtiva, syncInterrompida, type SyncJob, type SyncSummary } from "@/lib/storeSync";

interface Row {
  store_id: string;
  name: string;
  api_url: string | null;
  api_key: string | null;
  sistema: string | null;
  enabled: boolean | null;
  codigo_loja: string | null;
  online?: boolean | null;
  latency?: number | null;
  erro?: string | null;
  checking?: boolean;
  relatorios?: { nome: string; ok: boolean; msg?: string }[];
  last_sync_at: string | null;
  last_error: string | null;
  modo_sync: string | null;
  summary?: SyncSummary;
  job?: SyncJob;
  syncing?: boolean;
  sync_error?: string | null;
}

// relatórios essenciais por sistema (cada ERP publica nomes diferentes)
const RELATORIOS_VR = [
  { nome: "kpis_periodo", uso: "Faturamento / Controladoria" },
  { nome: "dre_periodo", uso: "DRE / CMV" },
  { nome: "vendas_secao_periodo", uso: "PIC e Análise Anual" },
  { nome: "ranking_produtos", uso: "Nível produto / Sem giro" },
  { nome: "pagamentos_periodo", uso: "Lançamentos financeiros" },
  { nome: "contas_a_pagar", uso: "Lançamentos (alternativo)" },
];

const RELATORIOS_WEBSAC = [
  { nome: "kpis_periodo", uso: "Faturamento / Controladoria" },
  { nome: "dre_periodo", uso: "DRE / CMV" },
  { nome: "vendas_secao_periodo", uso: "PIC e Análise Anual" },
  { nome: "vendas_hierarquia_periodo", uso: "Nível produto / Sem giro" },
  { nome: "pagamentos_periodo", uso: "Lançamentos financeiros" },
];

const relatoriosDoSistema = (sistema?: string | null) =>
  (sistema ?? "VR").toUpperCase() === "WEBSAC" ? RELATORIOS_WEBSAC : RELATORIOS_VR;


const pendencias = (r: Row): string[] => {
  const out: string[] = [];
  if (!r.api_url && !r.api_key && !r.sistema) return ["Conexão não cadastrada (sem ERP configurado)"];
  if (!r.sistema) out.push("Definir o sistema (VR / ORACLE / WEBSAC / DIRECTOR / SISCOMP)");
  if (!r.api_url || /SEU-DOMINIO|SEU_DOMINIO|example/i.test(r.api_url))
    out.push("Informar a URL real do conector (URL ainda é placeholder)");
  if (!r.api_key) out.push("Informar a chave de acesso da API");
  if ((r.sistema ?? "").toUpperCase() === "ORACLE" && r.codigo_loja == null)
    out.push("Informar o código da loja (obrigatório no Oracle)");
  if (r.enabled === false) out.push("Conexão desativada — ativar o conector");
  const lista = relatoriosDoSistema(r.sistema);
  const semRel = (r.relatorios ?? []).filter((x) => !x.ok);
  if (r.online === true && r.relatorios && semRel.length === lista.length)
    out.push("Conector online, porém sem NENHUM relatório publicado — cadastrar as consultas SQL no conector da loja");
  else if (r.online === true && semRel.length > 0)
    out.push(
      "Relatórios faltando no conector: " +
        semRel.map((x) => `${x.nome} (${lista.find((y) => y.nome === x.nome)?.uso ?? "-"})`).join(", "),
    );
  if (r.online === false && out.length === 0)
    out.push(r.erro?.includes("tunel") || r.erro?.includes("túnel")
      ? "Servidor/túnel da loja fora do ar — ligar o conector na loja"
      : `Servidor não respondeu: ${r.erro ?? "sem resposta"}`);
  return out;
};

const AdminConexoes = () => {
  const { user, isGlobalAdmin: isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingAll, setTestingAll] = useState(false);
  const [busca, setBusca] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const acompanhando = useRef(new Set<string>());
  const patchRow = (id: string, patch: Partial<Row>) => setRows(prev => prev.map(r => r.store_id === id ? { ...r, ...patch } : r));

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate("/login"); return; }
    if (isAdmin) return;
    // Role hydration finishes after the session. Do not redirect an admin
    // before the server's role read has resolved.
    let active = true;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      if (active && !data?.some(r => r.role === "admin")) navigate("/login");
    });
    return () => { active = false; };
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    const [{ data: stores, error: storesError }, { data: cfgs, error: cfgError }, { data: summaries, error: summaryError }, { data: jobs, error: jobsError }] = await Promise.all([
      supabase.from("stores").select("id, name").order("name"),
      supabase.from("store_vr_config").select("*"),
      supabase.rpc("admin_store_sync_summary"),
      supabase.from("store_sync_jobs").select("id, store_id, status, started_at, updated_at, finished_at, d1, total, processed, succeeded, failed, unavailable, current_report, last_error").order("started_at", { ascending: false }).limit(500),
    ]);
    if (storesError || cfgError || summaryError || jobsError) {
      setLoadError("Não foi possível carregar todas as informações. Atualize a lista para tentar novamente.");
    }
    const map = new Map((cfgs || []).map((c: any) => [c.store_id, c]));
    const summaryMap = new Map((summaries ?? []).map(s => [s.store_id, s]));
    const jobMap = new Map<string, SyncJob>();
    for (const j of jobs ?? []) if (!jobMap.has(j.store_id)) jobMap.set(j.store_id, j);
    setRows(
      (stores || []).map((s) => {
        const c: any = map.get(s.id) || {};
        return {
          store_id: s.id,
          name: s.name,
          api_url: c.api_url ?? null,
          api_key: c.api_key ?? null,
          sistema: c.sistema ?? null,
          enabled: c.enabled ?? null,
          codigo_loja: c.codigo_loja ?? null,
          online: c.online ?? null,
          latency: c.latency_ms ?? null,
          erro: c.health_error ?? null,
          last_sync_at: c.last_sync_at ?? null,
          last_error: c.last_error ?? null,
          modo_sync: c.modo_sync ?? null,
          summary: summaryMap.get(s.id),
          job: jobMap.get(s.id),
        } as Row;
      }),
    );
    setLoading(false);
  };

  const atualizarDadosSalvos = async (storeId: string) => {
    const [{ data: summaries }, { data: config }] = await Promise.all([
      supabase.rpc("admin_store_sync_summary"),
      supabase.from("store_vr_config").select("last_sync_at, last_error").eq("store_id", storeId).maybeSingle(),
    ]);
    patchRow(storeId, { summary: summaries?.find(s => s.store_id === storeId), last_sync_at: config?.last_sync_at ?? null, last_error: config?.last_error ?? null });
  };

  const sincronizar = async (r: Row) => {
    if (acompanhando.current.has(r.store_id)) return;
    acompanhando.current.add(r.store_id);
    patchRow(r.store_id, { syncing: true, sync_error: null });
    try {
      const id = await iniciarSync(r.store_id, r.job);
      await acompanharSync(id, job => patchRow(r.store_id, { job }));
      localStorage.removeItem(`sync_status_${r.store_id}`);
    } catch (e) {
      patchRow(r.store_id, { sync_error: e instanceof Error ? e.message : "Não foi possível sincronizar esta loja." });
    } finally {
      await atualizarDadosSalvos(r.store_id);
      patchRow(r.store_id, { syncing: false });
      acompanhando.current.delete(r.store_id);
    }
  };

  const sondarRelatorios = async (storeId: string, sistema?: string | null) => {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
    const fim = hoje.toISOString().slice(0, 10);
    const res = [];
    for (const rel of relatoriosDoSistema(sistema)) {
        const { data, error } = await supabase.functions.invoke("vr-proxy", {
          body: {
            store_id: storeId,
            relatorio: rel.nome,
            params: { inicio, fim, data_inicio: inicio, data_fim: fim, limite: 100 },
          },
        });
        const msg = error ? error.message : (data?.erro as string | undefined);
        res.push({ nome: rel.nome, ok: !msg, msg });
    }
    setRows((prev) => prev.map((r) => (r.store_id === storeId ? { ...r, relatorios: res } : r)));
  };

  const testar = async (storeId: string) => {
    setRows((prev) => prev.map((r) => (r.store_id === storeId ? { ...r, checking: true } : r)));
    const { data, error } = await supabase.functions.invoke("vr-health", { body: { store_id: storeId } });
    setRows((prev) =>
      prev.map((r) =>
        r.store_id === storeId
          ? {
              ...r,
              checking: false,
              online: error ? false : !!data?.online,
              latency: data?.latency_ms ?? null,
              erro: error ? error.message : data?.erro ?? null,
            }
          : r,
      ),
    );
    if (!error && data?.online) {
      const loja = rows.find((r) => r.store_id === storeId);
      const disp: string[] | undefined = Array.isArray(data?.disponiveis) ? data.disponiveis : undefined;
      if (disp) {
        // ponte informa o que esta publicado: nao roda as consultas (evita derrubar a loja)
        const res = relatoriosDoSistema(loja?.sistema).map((rel) => ({
          nome: rel.nome,
          ok: disp.includes(rel.nome),
          msg: disp.includes(rel.nome) ? undefined : "não publicado na ponte",
        }));
        setRows((prev) => prev.map((r) => (r.store_id === storeId ? { ...r, relatorios: res } : r)));
      } else {
        await sondarRelatorios(storeId, loja?.sistema);
      }
    }
  };

  const testarTodos = async () => {
    setTestingAll(true);
    for (const r of rows) {
      if (r.api_url || r.sistema) await testar(r.store_id);
    }
    setTestingAll(false);
  };

  if (authLoading || !user || !isAdmin || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  const conectadas = rows.filter((r) => r.online === true).length;
  const comProblema = rows.filter((r) => r.online === false).length;
  const semCadastro = rows.filter((r) => !r.api_url && !r.sistema).length;
  const filtradas = rows.filter(r => `${r.name} ${r.sistema ?? ""}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
  const sincronizando = rows.filter(r => syncAtiva(r.job)).length;

  return (
    <ClientLayout>
      <div className="w-full p-3 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold flex items-center gap-3">
              <Plug className="w-7 h-7 text-primary shrink-0" /> Conexões e Dados
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={load} disabled={loading || rows.some(r => r.syncing)}><RefreshCw className="w-4 h-4" /> Atualizar lista</Button>
            <Button variant="outline" onClick={testarTodos} disabled={testingAll || rows.some(r => r.syncing)}>
              <Wifi className="w-4 h-4" /> {testingAll ? "Testando…" : "Testar conexões"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Clientes", value: rows.length },
            { label: "Conectados", value: conectadas },
            { label: "Com problema", value: comProblema },
            { label: "Sincronizando", value: sincronizando },
          ].map((k) => (
            <div key={k.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground font-body">{k.label}</p>
              <p className="text-2xl font-heading font-bold">{k.value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
            <Input aria-label="Buscar loja" placeholder="Buscar loja ou sistema" className="pl-9" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <span className="text-sm text-muted-foreground">{filtradas.length} lojas · {semCadastro} sem cadastro</span>
        </div>
        {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}

        <div className="space-y-3">
          {filtradas.map((r) => {
            const faltas = pendencias(r);
            const status =
              r.checking ? "checking" : r.online === true ? "on" : r.online === false ? "off" : "unknown";
            return (
              <section key={r.store_id} aria-label={r.name} className="rounded-lg border border-border bg-card p-4 sm:p-5 space-y-4 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {status === "on" ? (
                      <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                    ) : status === "off" ? (
                      <XCircle className="w-5 h-5 text-destructive shrink-0" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="font-heading font-semibold">{r.name}</p>
                      <p className="text-xs text-muted-foreground font-body break-all">
                        {(r.sistema ?? "sem sistema").toUpperCase()} ·{" "}
                        {r.modo_sync === "diario_d1" ? "Dados até D-1" : "Consulta ao sistema"}
                        {r.latency != null && status === "on" ? ` · ${r.latency} ms` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-body px-2.5 py-1 rounded-full border ${
                        status === "on"
                          ? "border-success/30 bg-success/10 text-success"
                          : status === "off"
                          ? "border-destructive/30 bg-destructive/10 text-destructive"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {status === "on"
                        ? "Conectado"
                        : status === "off"
                        ? "Sem conexão"
                        : status === "checking"
                        ? "Testando..."
                        : "Não testado"}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => testar(r.store_id)} disabled={r.checking || r.syncing || syncAtiva(r.job)}>
                      <Wifi /> Testar
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 grid-cols-1 min-[440px]:grid-cols-2 lg:grid-cols-4 border-t border-border pt-4">
                  <div><p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Clock3 className="w-3.5 h-3.5" /> Última sincronização completa</p><p className="font-semibold text-sm tabular-nums">{fmtSync(r.last_sync_at)}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Últimos dados salvos</p><p className="font-semibold text-sm tabular-nums">{r.summary?.last_saved_at ? fmtSync(r.summary.last_saved_at) : "Sem dados salvos"}</p></div>
                  <div><p className="text-xs text-muted-foreground mb-1">Relatórios salvos</p><p className="font-semibold text-sm tabular-nums">{(r.summary?.saved_reports ?? 0).toLocaleString("pt-BR")}</p></div>
                  <div className="flex items-end"><Button className="w-full" onClick={() => sincronizar(r)} disabled={r.syncing || r.enabled === false || !r.sistema || (!r.api_url && r.sistema !== "WEBSAC") || r.checking}>
                    <Database className={r.syncing ? "animate-pulse motion-reduce:animate-none" : ""} />
                    {r.syncing ? "Sincronizando…" : syncAtiva(r.job) ? "Retomar sincronização" : "Sincronizar loja"}
                  </Button></div>
                </div>
                {r.job && <div aria-live="polite" className="space-y-2 text-sm">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className={r.job.status === "completed" ? "text-success" : r.job.status === "failed" ? "text-destructive" : "text-muted-foreground"}>
                      {syncInterrompida(r.job) ? "Interrompida — dados já salvos preservados" : r.job.status === "completed" ? "Sincronização concluída" : r.job.status === "partial" ? "Sincronização parcial" : r.job.status === "failed" ? "Falha na sincronização" : r.job.status === "pending" ? "Aguardando início" : "Sincronização em andamento"}
                    </span>
                    <span className="tabular-nums">{r.job.processed} / {r.job.total} consultas · {r.job.succeeded} salvas{r.job.failed > 0 ? ` · ${r.job.failed} falhas` : ""}{r.job.unavailable > 0 ? ` · ${r.job.unavailable} indisponíveis` : ""}</span>
                  </div>
                  {syncAtiva(r.job) && <Progress aria-label="Progresso da sincronização" className="h-2 rounded" value={r.job.total ? r.job.processed / r.job.total * 100 : 0} />}
                  {r.job.finished_at && <p className="text-xs text-muted-foreground">Última tentativa: {fmtSync(r.job.finished_at)}</p>}
                </div>}
                {(r.sync_error || r.job?.last_error) && <p role="alert" className="text-xs text-destructive break-words">{r.sync_error || r.job?.last_error}</p>}

                {faltas.length > 0 && (
                  <ul className="mt-3 pl-8 space-y-1">
                    {faltas.map((f) => (
                      <li key={f} className="text-xs font-body text-warning flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                )}
                {r.relatorios && r.relatorios.length > 0 && (
                  <div className="mt-3 pl-8 flex flex-wrap gap-2">
                    {r.relatorios.map((rel) => (
                      <span
                        key={rel.nome}
                        title={rel.msg || undefined}
                        className={`text-[11px] font-body px-2 py-0.5 rounded-full border ${
                          rel.ok
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-destructive/30 bg-destructive/10 text-destructive"
                        }`}
                      >
                        {rel.nome}
                      </span>
                    ))}
                  </div>
                )}
                {faltas.length === 0 && status === "on" && (
                  <p className="mt-3 pl-8 text-xs font-body text-success">Conexão completa e respondendo.</p>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </ClientLayout>
  );
};

export default AdminConexoes;
