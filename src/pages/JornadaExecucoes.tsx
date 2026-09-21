import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import {
  CADENCIA_CLASS, CADENCIA_LABEL, Cadencia, JornadaStatus, STATUS_LABEL,
  hojeSP, navegar, periodoLabel, periodoRef,
} from "@/lib/jornada";

interface Perfil { id: string; nome: string; cor: string; store_id: string | null }
interface Template {
  id: string; titulo: string; cadencia: Cadencia; perfil_id: string; ordem: number;
}
interface Exec {
  id: string; template_id: string; store_id: string; periodo_ref: string; avulsa: boolean;
  status: JornadaStatus; responsavel: string | null; updated_at: string | null; concluida_em: string | null;
}

const STATUS_CLASS: Record<JornadaStatus, string> = {
  a_fazer: "text-muted-foreground",
  em_andamento: "text-warning",
  concluida: "text-success",
};

const JornadaExecucoes = () => {
  const { user, isGlobalAdmin } = useAuth();
  const navigate = useNavigate();

  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [meusPerfis, setMeusPerfis] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [loja, setLoja] = useState(() => sessionStorage.getItem("selectedStoreId") || "");
  const [perfil, setPerfil] = useState("");
  const [cadencia, setCadencia] = useState<Cadencia | "todas">("diaria");
  const [status, setStatus] = useState<JornadaStatus | "todos">("todos");
  const [ancora, setAncora] = useState<Date>(() => hojeSP());

  const [execs, setExecs] = useState<Exec[]>([]);
  const [contagens, setContagens] = useState<Record<string, { total: number; feitos: number }>>({});
  const [nomes, setNomes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [tick, setTick] = useState(0);

  const cadLabel: Cadencia = cadencia === "todas" ? "diaria" : cadencia;
  const refsPeriodo = useMemo(
    () => [periodoRef("diaria", ancora), periodoRef("semanal", ancora), periodoRef("mensal", ancora)],
    [ancora],
  );

  /* referências (1x) */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: t }, { data: mp }, { data: pr }] = await Promise.all([
        supabase.from("jornada_perfis").select("id,nome,cor,store_id").eq("ativo", true).order("ordem"),
        supabase.from("jornada_templates").select("id,titulo,cadencia,perfil_id,ordem").eq("ativo", true).order("ordem"),
        supabase.from("jornada_perfil_usuario").select("perfil_id").eq("user_id", user.id),
        supabase.from("profiles").select("user_id, full_name"),
      ]);
      setPerfis((p || []) as Perfil[]);
      setTemplates((t || []) as Template[]);
      setMeusPerfis((mp || []).map((r) => r.perfil_id));
      const mapa: Record<string, string> = {};
      (pr || []).forEach((r: any) => { if (r.full_name) mapa[r.user_id] = r.full_name; });
      setNomes(mapa);

      let list: { id: string; name: string }[] = [];
      if (isGlobalAdmin) {
        const { data } = await supabase.from("stores").select("id,name").order("name");
        list = data || [];
      } else {
        const { data: acc } = await supabase
          .from("user_store_access").select("store_id").eq("user_id", user.id).eq("approved", true);
        const ids = (acc || []).map((a) => a.store_id);
        if (ids.length) {
          const { data } = await supabase.from("stores").select("id,name").in("id", ids).order("name");
          list = data || [];
        }
      }
      setLojas(list);
      setLoja((atual) => (atual && list.some((s) => s.id === atual) ? atual : list[0]?.id || ""));
      setBootstrapped(true);
    })();
  }, [user, isGlobalAdmin]);

  const carregar = useCallback(async () => {
    if (!loja) { setExecs([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("jornada_execucoes")
      .select("id,template_id,store_id,periodo_ref,avulsa,status,responsavel,updated_at,concluida_em")
      .eq("store_id", loja)
      .in("periodo_ref", refsPeriodo);
    const lista = (data || []) as Exec[];
    setExecs(lista);

    const ids = lista.map((e) => e.id);
    const mapa: Record<string, { total: number; feitos: number }> = {};
    for (let i = 0; i < ids.length; i += 200) {
      const { data: its } = await supabase
        .from("jornada_checklist_itens").select("execucao_id,feito").in("execucao_id", ids.slice(i, i + 200));
      (its || []).forEach((it: any) => {
        const c = (mapa[it.execucao_id] ||= { total: 0, feitos: 0 });
        c.total += 1;
        if (it.feito) c.feitos += 1;
      });
    }
    setContagens(mapa);
    setPendente(false);
    setLoading(false);
  }, [loja, refsPeriodo]);

  // Recarrega na 1a carga, no Atualizar e quando o usuario troca de loja/periodo.
  useEffect(() => {
    if (!bootstrapped) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped, tick, loja, refsPeriodo]);

  /** Perfis da rede ou da loja. Sem vínculos marcados, mostra todos os perfis da loja. */
  const semVinculos = meusPerfis.length === 0;
  const perfisVisiveis = useMemo(
    () => perfis
      .filter((p) => !p.store_id || p.store_id === loja)
      .filter((p) => isGlobalAdmin || semVinculos || meusPerfis.includes(p.id)),
    [perfis, loja, isGlobalAdmin, semVinculos, meusPerfis],
  );

  useEffect(() => {
    if (perfil && !perfisVisiveis.some((p) => p.id === perfil)) setPerfil("");
  }, [perfil, perfisVisiveis]);

  const tplPorId = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const perfilPorId = useMemo(() => new Map(perfis.map((p) => [p.id, p])), [perfis]);

  const linhas = useMemo(() => {
    return execs
      .filter((e) => e.store_id === loja)
      .map((e) => {
        const tpl = tplPorId.get(e.template_id);
        if (!tpl) return null;
        const p = perfilPorId.get(tpl.perfil_id);
        if (!p || !perfisVisiveis.some((v) => v.id === p.id)) return null;
        return { exec: e, tpl, perfil: p };
      })
      .filter(Boolean)
      .filter((l: any) => (cadencia === "todas" ? true : l.tpl.cadencia === cadencia))
      .filter((l: any) => (perfil ? l.tpl.perfil_id === perfil : true))
      .filter((l: any) => (status === "todos" ? true : l.exec.status === status))
      .filter((l: any) => l.exec.avulsa || l.exec.periodo_ref === periodoRef(l.tpl.cadencia as Cadencia, ancora))
      .sort((a: any, b: any) => a.tpl.ordem - b.tpl.ordem || a.tpl.titulo.localeCompare(b.tpl.titulo)) as any[];
  }, [execs, tplPorId, perfilPorId, perfisVisiveis, cadencia, perfil, status, ancora]);

  const resumo = useMemo(() => {
    const total = linhas.length;
    const conc = linhas.filter((l) => l.exec.status === "concluida").length;
    return {
      total,
      a_fazer: linhas.filter((l) => l.exec.status === "a_fazer").length,
      em_andamento: linhas.filter((l) => l.exec.status === "em_andamento").length,
      concluida: conc,
      pct: total ? Math.round((conc / total) * 100) : 0,
    };
  }, [linhas]);

  const dataLabel = (e: Exec, cad: Cadencia) =>
    e.avulsa ? new Date(e.periodo_ref).toLocaleDateString("pt-BR") : periodoLabel(cad, ancora);

  const quando = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

  return (
    <ClientLayout>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-6 rounded" style={{ backgroundColor: "#CA3155" }} />
            <h1 className="text-xl font-semibold text-foreground">Execuções da Jornada</h1>
          </div>
          <Button size="sm" variant={pendente ? "default" : "outline"} onClick={() => setTick((t) => t + 1)}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Atualizar
          </Button>
        </div>

        {/* filtros */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select
            value={loja}
            onChange={(e) => { setLoja(e.target.value); setPendente(true); }}
            className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs max-w-[240px]"
            aria-label="Loja"
          >
            {lojas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <select
            value={perfil}
            onChange={(e) => setPerfil(e.target.value)}
            className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs"
            aria-label="Perfil"
          >
            <option value="">Todos os perfis</option>
            {perfisVisiveis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>

          <div className="flex rounded-md border border-border overflow-hidden">
            {(["diaria", "semanal", "mensal", "todas"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCadencia(c)}
                className={`px-3 py-1.5 text-xs font-medium ${
                  cadencia === c ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {c === "todas" ? "Todas" : CADENCIA_LABEL[c]}
              </button>
            ))}
          </div>

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs"
            aria-label="Status"
          >
            <option value="todos">Todos os status</option>
            {(["a_fazer", "em_andamento", "concluida"] as JornadaStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => { setAncora((a) => navegar(cadLabel, a, -1)); setPendente(true); }}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 py-1.5 rounded-md bg-secondary text-xs font-medium">
              {periodoLabel(cadLabel, ancora)}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => { setAncora((a) => navegar(cadLabel, a, 1)); setPendente(true); }}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {[
            { k: "Tarefas", v: resumo.total, c: "text-foreground" },
            { k: STATUS_LABEL.a_fazer, v: resumo.a_fazer, c: STATUS_CLASS.a_fazer },
            { k: STATUS_LABEL.em_andamento, v: resumo.em_andamento, c: STATUS_CLASS.em_andamento },
            { k: `${STATUS_LABEL.concluida} (${resumo.pct}%)`, v: resumo.concluida, c: STATUS_CLASS.concluida },
          ].map((b) => (
            <div key={b.k} className="rounded-lg border border-border bg-card p-3">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{b.k}</p>
              <p className={`text-xl font-semibold ${b.c}`}>{b.v}</p>
            </div>
          ))}
        </div>

        {/* tabela */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Tarefa</th>
                <th className="text-left p-2">Perfil</th>
                <th className="text-left p-2">Cadência</th>
                <th className="text-left p-2">Período</th>
                <th className="text-left p-2">Status</th>
                <th className="text-left p-2 min-w-[150px]">Avanço</th>
                <th className="text-left p-2">Responsável</th>
                <th className="text-left p-2">Atualizado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [0, 1, 2].map((i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2" colSpan={8}><Skeleton className="h-6 w-full" /></td>
                  </tr>
                ))
              ) : linhas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">
                    Nenhuma execução neste período para os filtros escolhidos.
                  </td>
                </tr>
              ) : (
                linhas.map((l) => {
                  const cont = contagens[l.exec.id] || { total: 0, feitos: 0 };
                  const pct = cont.total ? Math.round((cont.feitos / cont.total) * 100) : 0;
                  return (
                    <tr
                      key={l.exec.id}
                      className="border-t border-border hover:bg-muted/40 cursor-pointer"
                      onClick={() => navigate("/jornada")}
                    >
                      <td className="p-2 font-medium">
                        {l.tpl.titulo}
                        {l.exec.avulsa && <Badge variant="outline" className="ml-2 text-[10px]">Avulsa</Badge>}
                      </td>
                      <td className="p-2">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium text-white"
                          style={{ backgroundColor: l.perfil.cor }}>
                          {l.perfil.nome}
                        </span>
                      </td>
                      <td className="p-2">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${CADENCIA_CLASS[l.tpl.cadencia as Cadencia]}`}>
                          {CADENCIA_LABEL[l.tpl.cadencia as Cadencia]}
                        </span>
                      </td>
                      <td className="p-2 text-muted-foreground">{dataLabel(l.exec, l.tpl.cadencia)}</td>
                      <td className={`p-2 font-medium ${STATUS_CLASS[l.exec.status as JornadaStatus]}`}>
                        {STATUS_LABEL[l.exec.status as JornadaStatus]}
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#CA3155" }} />
                          </div>
                          <span className="text-[11px] text-muted-foreground">{cont.feitos}/{cont.total} · {pct}%</span>
                        </div>
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {l.exec.responsavel ? nomes[l.exec.responsavel] || "—" : "—"}
                      </td>
                      <td className="p-2 text-muted-foreground">{quando(l.exec.concluida_em || l.exec.updated_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </ClientLayout>
  );
};

export default JornadaExecucoes;
