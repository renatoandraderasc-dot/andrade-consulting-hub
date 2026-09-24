import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, RefreshCw, AlertTriangle, CheckCircle2, XCircle, Database, Server, KeyRound } from "lucide-react";

const LIMITE_MS = 20000;

function comTempo<T>(p: PromiseLike<T>, ms = LIMITE_MS): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, rej) => window.setTimeout(() => rej(new Error("tempo esgotado")), ms)),
  ]);
}

interface Teste {
  nome: string;
  descricao: string;
  icone: typeof Database;
  ms?: number | null;
  erro?: string | null;
  rodando?: boolean;
}

interface Diag {
  em: string;
  conexoes: { total: number; ativas: number; ociosas: number; presas: number; maximo: number };
  geral: { banco_mb: number; cache_hit_pct: number | null; deadlocks: number; rollbacks: number };
  consultas_lentas: { consulta: string; chamadas: number; media_ms: number; total_ms: number; max_ms: number }[];
  consultas_em_execucao: { consulta: string; segundos: number; estado: string }[];
  tabelas: { tabela: string; tamanho_mb: number; linhas: number; leituras_sequenciais: number; leituras_indice: number | null }[];
}

const TESTES_BASE: Teste[] = [
  { nome: "Banco de dados", descricao: "Leitura simples na tabela de lojas", icone: Database },
  { nome: "Autenticação", descricao: "Validação da sessão do usuário", icone: KeyRound },
  { nome: "Funções do servidor", descricao: "Chamada de uma função da nuvem", icone: Server },
];

const cor = (ms?: number | null, erro?: string | null) => {
  if (erro) return "text-destructive";
  if (ms == null) return "text-muted-foreground";
  if (ms < 800) return "text-emerald-600";
  if (ms < 3000) return "text-amber-600";
  return "text-destructive";
};

const rotulo = (ms?: number | null, erro?: string | null) => {
  if (erro) return "Sem resposta";
  if (ms == null) return "—";
  if (ms < 800) return "Rápido";
  if (ms < 3000) return "Lento";
  return "Muito lento";
};

const AtualizarTodas = () => {
  const [rodando, setRodando] = useState(false);
  const [progresso, setProgresso] = useState<string | null>(null);

  const atualizar = async () => {
    setRodando(true);
    const { data: lojas } = await supabase
      .from("store_vr_config")
      .select("store_id, stores(name)")
      .eq("modo_sync", "diario_d1");
    const lista = (lojas ?? []) as { store_id: string; stores: { name: string } | null }[];
    let ok = 0;
    for (let i = 0; i < lista.length; i++) {
      const l = lista[i];
      setProgresso(`Atualizando ${l.stores?.name ?? "loja"} (${i + 1} de ${lista.length})...`);
      try {
        const { error } = await supabase.functions.invoke("sync-diario-d1", { body: { store_id: l.store_id } });
        if (!error) ok++;
      } catch { /* segue para a próxima loja */ }
    }
    setProgresso(`Concluído: ${ok} de ${lista.length} lojas atualizadas às ${new Date().toLocaleTimeString("pt-BR")}.`);
    setRodando(false);
  };

  return (
    <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="font-semibold">Atualizar números de todas as telas</h2>
        <p className="text-sm text-muted-foreground">
          Busca vendas e demais números nos sistemas das lojas e guarda no banco. Roda sozinho todo dia às 08:00;
          use o botão só se precisar antes.
        </p>
        {progresso && <p className="text-sm mt-1">{progresso}</p>}
      </div>
      <Button onClick={atualizar} disabled={rodando}>
        <RefreshCw className={`h-4 w-4 mr-2 ${rodando ? "animate-spin" : ""}`} />
        {rodando ? "Atualizando..." : "Atualizar tudo agora"}
      </Button>
    </Card>
  );
};

const Diagnostico = () => {
  const { user, isGlobalAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [testes, setTestes] = useState<Teste[]>(TESTES_BASE);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [erroDiag, setErroDiag] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isGlobalAdmin)) navigate("/login");
  }, [authLoading, user, isGlobalAdmin, navigate]);

  const medir = async (fn: () => PromiseLike<unknown>) => {
    const t0 = performance.now();
    try {
      await comTempo(fn());
      return { ms: Math.round(performance.now() - t0), erro: null as string | null };
    } catch (e) {
      return { ms: Math.round(performance.now() - t0), erro: (e as Error).message };
    }
  };

  const rodar = async () => {
    setCarregando(true);
    setErroDiag(null);
    setTestes(TESTES_BASE.map((t) => ({ ...t, rodando: true, ms: null, erro: null })));

    const fns: (() => PromiseLike<unknown>)[] = [
      () => supabase.from("stores").select("id").limit(1),
      () => supabase.auth.getSession(),
      () => supabase.functions.invoke("list-stores"),
    ];
    const res = await Promise.all(fns.map((f) => medir(f)));
    setTestes(TESTES_BASE.map((t, i) => ({ ...t, ...res[i], rodando: false })));

    try {
      const { data, error } = await comTempo(supabase.rpc("fn_diagnostico_sistema" as never));
      if (error) throw error;
      setDiag(data as unknown as Diag);
    } catch (e) {
      setDiag(null);
      setErroDiag((e as Error).message);
    }
    setCarregando(false);
  };

  useEffect(() => {
    if (!authLoading && user && isGlobalAdmin) void rodar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, isGlobalAdmin]);

  const conexoesPct = diag ? Math.round((diag.conexoes.total / Math.max(diag.conexoes.maximo, 1)) * 100) : 0;

  return (
    <ClientLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Diagnóstico do Sistema</h1>
              <p className="text-sm text-muted-foreground">
                Mede a velocidade de resposta e mostra o que está pesando no servidor.
              </p>
            </div>
          </div>
          <Button onClick={rodar} disabled={carregando}>
            <RefreshCw className={`h-4 w-4 mr-2 ${carregando ? "animate-spin" : ""}`} />
            {carregando ? "Medindo..." : "Medir agora"}
          </Button>
        </div>

        <AtualizarTodas />

        <div className="grid gap-4 md:grid-cols-3">
          {testes.map((t) => {
            const Icone = t.icone;
            return (
              <Card key={t.nome} className="p-4">
                <div className="flex items-start gap-3">
                  <Icone className="h-5 w-5 text-muted-foreground mt-1" />
                  <div className="flex-1">
                    <p className="font-medium">{t.nome}</p>
                    <p className="text-xs text-muted-foreground">{t.descricao}</p>
                    <div className={`mt-2 text-xl font-bold ${cor(t.ms, t.erro)}`}>
                      {t.rodando ? "medindo..." : t.erro ? "falhou" : t.ms != null ? `${(t.ms / 1000).toFixed(2)} s` : "—"}
                    </div>
                    <div className="flex items-center gap-1 text-xs mt-1">
                      {t.erro ? (
                        <XCircle className="h-3 w-3 text-destructive" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                      )}
                      <span className={cor(t.ms, t.erro)}>{t.rodando ? "" : rotulo(t.ms, t.erro)}</span>
                    </div>
                    {t.erro && <p className="text-xs text-destructive mt-1">{t.erro}</p>}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {erroDiag && (
          <Card className="p-4 border-amber-500/40">
            <div className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <p>
                Não foi possível ler os detalhes do banco agora ({erroDiag}). Isso normalmente acontece quando o
                servidor está sobrecarregado — tente novamente em alguns instantes.
              </p>
            </div>
          </Card>
        )}

        {diag && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Conexões em uso</p>
                <p className={`text-2xl font-bold ${conexoesPct > 80 ? "text-destructive" : conexoesPct > 60 ? "text-amber-600" : "text-emerald-600"}`}>
                  {diag.conexoes.total} / {diag.conexoes.maximo}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {diag.conexoes.ativas} trabalhando · {diag.conexoes.presas} presas
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Tamanho do banco</p>
                <p className="text-2xl font-bold">{diag.geral.banco_mb.toLocaleString("pt-BR")} MB</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Aproveitamento de memória</p>
                <p className={`text-2xl font-bold ${(diag.geral.cache_hit_pct ?? 0) < 95 ? "text-amber-600" : "text-emerald-600"}`}>
                  {diag.geral.cache_hit_pct ?? "—"}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">abaixo de 95% indica falta de memória</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-muted-foreground">Travas e erros</p>
                <p className="text-2xl font-bold">{diag.geral.deadlocks}</p>
                <p className="text-xs text-muted-foreground mt-1">{diag.geral.rollbacks} operações desfeitas</p>
              </Card>
            </div>

            <Card className="p-4">
              <h2 className="font-semibold mb-3">Consultas rodando agora</h2>
              {diag.consultas_em_execucao.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nada travado no momento.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-3">Tempo</th>
                        <th className="py-2 pr-3">Situação</th>
                        <th className="py-2">Consulta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diag.consultas_em_execucao.map((q, i) => (
                        <tr key={i} className="border-b last:border-0 align-top">
                          <td className={`py-2 pr-3 font-medium ${q.segundos > 10 ? "text-destructive" : "text-amber-600"}`}>
                            {q.segundos.toFixed(1)} s
                          </td>
                          <td className="py-2 pr-3">{q.estado}</td>
                          <td className="py-2 font-mono text-xs break-all">{q.consulta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold mb-1">Consultas que mais consomem tempo</h2>
              <p className="text-xs text-muted-foreground mb-3">
                Somatório desde o último reinício do servidor — as primeiras são as que mais pesam.
              </p>
              {diag.consultas_lentas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Medição indisponível neste servidor.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-3">Tempo total</th>
                        <th className="py-2 pr-3">Média</th>
                        <th className="py-2 pr-3">Pior caso</th>
                        <th className="py-2 pr-3">Vezes</th>
                        <th className="py-2">Consulta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diag.consultas_lentas.map((q, i) => (
                        <tr key={i} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-3 font-medium">{(q.total_ms / 1000).toFixed(1)} s</td>
                          <td className={`py-2 pr-3 ${q.media_ms > 1000 ? "text-destructive" : q.media_ms > 300 ? "text-amber-600" : ""}`}>
                            {q.media_ms.toFixed(0)} ms
                          </td>
                          <td className="py-2 pr-3">{(q.max_ms / 1000).toFixed(1)} s</td>
                          <td className="py-2 pr-3">{q.chamadas.toLocaleString("pt-BR")}</td>
                          <td className="py-2 font-mono text-xs break-all">{q.consulta}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <h2 className="font-semibold mb-1">Maiores tabelas</h2>
              <p className="text-xs text-muted-foreground mb-3">
                "Varreduras completas" muito altas indicam tabela lida inteira — candidata a índice.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-2 pr-3">Tabela</th>
                      <th className="py-2 pr-3 text-right">Tamanho</th>
                      <th className="py-2 pr-3 text-right">Registros</th>
                      <th className="py-2 pr-3 text-right">Varreduras completas</th>
                      <th className="py-2 text-right">Buscas por índice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diag.tabelas.map((t) => (
                      <tr key={t.tabela} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{t.tabela}</td>
                        <td className="py-2 pr-3 text-right">{t.tamanho_mb.toLocaleString("pt-BR")} MB</td>
                        <td className="py-2 pr-3 text-right">{Number(t.linhas).toLocaleString("pt-BR")}</td>
                        <td className={`py-2 pr-3 text-right ${t.leituras_sequenciais > 100000 ? "text-amber-600 font-medium" : ""}`}>
                          {Number(t.leituras_sequenciais).toLocaleString("pt-BR")}
                        </td>
                        <td className="py-2 text-right">{Number(t.leituras_indice ?? 0).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <p className="text-xs text-muted-foreground">
              Última medição: {new Date(diag.em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
            </p>
          </>
        )}
      </div>
    </ClientLayout>
  );
};

export default Diagnostico;
