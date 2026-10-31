import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, RefreshCw, Wifi, Loader2, Store } from "lucide-react";

interface Cliente {
  store_id: string;
  nome: string;
  sistema: string;
  modo_sync: string | null;
  enabled: boolean | null;
  max_dias: number | null;
  last_sync_at: string | null;
  last_error: string | null;
  cache_qtd: number | null;
  cache_ultimo: string | null;
  teste?: { rodando: boolean; online?: boolean; ms?: number | null; erro?: string | null };
  sync?: { rodando: boolean; msg?: string; erro?: boolean };
}

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

const horasDesde = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 3600000 : Infinity);

async function infoCache(storeId: string) {
  const { data, count } = await supabase
    .from("relatorio_cache")
    .select("atualizado_em", { count: "exact" })
    .eq("store_id", storeId)
    .order("atualizado_em", { ascending: false })
    .limit(1);
  return { cache_qtd: count ?? 0, cache_ultimo: (data?.[0]?.atualizado_em as string | undefined) ?? null };
}

const DiagnosticoClientes = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [carregando, setCarregando] = useState(true);

  const patch = (id: string, p: Partial<Cliente>) =>
    setClientes((cs) => cs.map((c) => (c.store_id === id ? { ...c, ...p } : c)));

  const testar = useCallback(async (id: string) => {
    patch(id, { teste: { rodando: true } });
    try {
      const { data, error } = await supabase.functions.invoke("vr-health", { body: { store_id: id } });
      if (error) throw error;
      const d = data as { online?: boolean; latency_ms?: number; erro?: string };
      patch(id, { teste: { rodando: false, online: !!d.online, ms: d.latency_ms ?? null, erro: d.erro ?? null } });
    } catch (e) {
      patch(id, { teste: { rodando: false, online: false, erro: (e as Error).message } });
    }
  }, []);

  const testarTodos = useCallback(async (lista: Cliente[]) => {
    let i = 0;
    const worker = async () => {
      while (i < lista.length) await testar(lista[i++].store_id);
    };
    await Promise.all([worker(), worker(), worker()]);
  }, [testar]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const { data } = await supabase
      .from("store_vr_config")
      .select("store_id, sistema, modo_sync, enabled, max_dias_consulta, last_sync_at, last_error, stores(name)");
    const base = ((data ?? []) as unknown as {
      store_id: string; sistema: string | null; modo_sync: string | null; enabled: boolean | null;
      max_dias_consulta: number | null; last_sync_at: string | null; last_error: string | null;
      stores: { name: string } | null;
    }[]).map((r) => ({
      store_id: r.store_id,
      nome: r.stores?.name ?? "Loja",
      sistema: (r.sistema ?? "VR").toUpperCase(),
      modo_sync: r.modo_sync,
      enabled: r.enabled,
      max_dias: r.max_dias_consulta,
      last_sync_at: r.last_sync_at,
      last_error: r.last_error,
      cache_qtd: null,
      cache_ultimo: null,
    })) as Cliente[];
    base.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    const caches = await Promise.all(base.map((c) => infoCache(c.store_id)));
    const lista = base.map((c, i) => ({ ...c, ...caches[i] }));
    setClientes(lista);
    setCarregando(false);
    void testarTodos(lista.filter((c) => c.enabled !== false));
  }, [testarTodos]);

  useEffect(() => { void carregar(); }, [carregar]);

  const atualizar = async (c: Cliente) => {
    patch(c.store_id, { sync: { rodando: true, msg: "Buscando todos os números na loja… pode levar alguns minutos." } });
    try {
      const { data, error } = await supabase.functions.invoke("sync-diario-d1", { body: { store_id: c.store_id } });
      if (error) throw error;
      const r = (data as { lojas?: { ok: number; falhas: number; consultas: number; segundos: number }[] })?.lojas?.[0];
      localStorage.removeItem(`sync_status_${c.store_id}`);
      const cache = await infoCache(c.store_id);
      patch(c.store_id, {
        ...cache,
        sync: r
          ? { rodando: false, erro: r.falhas > 0, msg: `${r.ok} de ${r.consultas} relatórios atualizados${r.falhas ? `, ${r.falhas} falharam` : ""} (${r.segundos}s)` }
          : { rodando: false, erro: true, msg: "A loja não retornou nenhum relatório (conexão desligada?)" },
      });
    } catch (e) {
      const cache = await infoCache(c.store_id);
      patch(c.store_id, { ...cache, sync: { rodando: false, erro: true, msg: `Interrompido: ${(e as Error).message}. O que já foi buscado ficou salvo.` } });
    }
  };

  const statusGeral = (c: Cliente) => {
    if (c.enabled === false) return { txt: "Desligada", cls: "bg-muted text-muted-foreground" };
    if (c.teste?.rodando || !c.teste) return { txt: "Testando…", cls: "bg-muted text-muted-foreground" };
    if (!c.teste.online) return { txt: "Fora do ar", cls: "bg-destructive/15 text-destructive" };
    if (horasDesde(c.cache_ultimo) > 30) return { txt: "Dados atrasados", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
    if ((c.teste.ms ?? 0) > 5000) return { txt: "Lenta", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" };
    return { txt: "OK", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" };
  };

  const online = clientes.filter((c) => c.teste?.online).length;
  const fora = clientes.filter((c) => c.teste && !c.teste.rodando && !c.teste.online && c.enabled !== false).length;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><Store className="h-4 w-4" /> Diagnóstico por cliente</h2>
          <p className="text-sm text-muted-foreground">
            Conexão com o sistema de cada loja e quando os números foram salvos pela última vez.
            {!carregando && ` ${online} no ar · ${fora} fora do ar.`}
          </p>
        </div>
        <Button variant="outline" onClick={() => void carregar()} disabled={carregando}>
          <RefreshCw className={`h-4 w-4 mr-2 ${carregando ? "animate-spin" : ""}`} /> Testar todos
        </Button>
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando clientes…</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {clientes.map((c) => {
            const st = statusGeral(c);
            const atrasado = horasDesde(c.cache_ultimo) > 30;
            return (
              <div key={c.store_id} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium leading-tight">{c.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.sistema} · {c.modo_sync === "diario_d1" ? "atualização diária" : "consulta ao vivo"}
                      {c.max_dias ? ` · até ${c.max_dias} dias por consulta` : ""}
                    </p>
                  </div>
                  <Badge variant="outline" className={`border-0 ${st.cls}`}>{st.txt}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Conexão</p>
                    <p className="flex items-center gap-1 font-medium">
                      {c.teste?.rodando || !c.teste ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> testando</>
                      ) : c.teste.online ? (
                        <><CheckCircle2 className="h-3 w-3 text-emerald-600" /> {((c.teste.ms ?? 0) / 1000).toFixed(1)} s</>
                      ) : (
                        <><XCircle className="h-3 w-3 text-destructive" /> sem resposta</>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Últimos números salvos</p>
                    <p className={`font-medium ${atrasado ? "text-amber-600" : ""}`}>{fmtData(c.cache_ultimo)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Relatórios guardados</p>
                    <p className="font-medium">{(c.cache_qtd ?? 0).toLocaleString("pt-BR")}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Última sincronização</p>
                    <p className="font-medium">{fmtData(c.last_sync_at)}</p>
                  </div>
                </div>

                {c.teste?.erro && !c.teste.online && (
                  <p className="text-xs text-destructive break-words">{c.teste.erro}</p>
                )}
                {c.sync?.msg && (
                  <p className={`text-xs ${c.sync.rodando ? "text-muted-foreground" : c.sync.erro ? "text-amber-600" : "text-emerald-600"}`}>
                    {c.sync.msg}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => void testar(c.store_id)} disabled={c.teste?.rodando}>
                    <Wifi className="h-3.5 w-3.5 mr-1" /> Testar
                  </Button>
                  <Button size="sm" className="flex-1" onClick={() => void atualizar(c)} disabled={c.sync?.rodando || c.enabled === false}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1 ${c.sync?.rodando ? "animate-spin" : ""}`} />
                    {c.sync?.rodando ? "Atualizando…" : "Atualizar tudo deste cliente"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default DiagnosticoClientes;
