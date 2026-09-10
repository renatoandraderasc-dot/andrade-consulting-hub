import { useCallback, useEffect, useMemo, useState } from "react";
import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ChevronLeft, ChevronRight, RefreshCw, ExternalLink, Plus, Trash2, CheckCheck, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CADENCIA_CLASS, CADENCIA_LABEL, Cadencia, JornadaStatus, STATUS_LABEL,
  hojeSP, navegar, periodoLabel, periodoRef,
} from "@/lib/jornada";

interface Perfil { id: string; chave: string; nome: string; cor: string; ativo: boolean }
interface Template {
  id: string; titulo: string; descricao: string | null; cadencia: Cadencia;
  rota_hub: string | null; ordem: number; perfil_id: string; ativo: boolean;
}
interface Exec {
  id: string; template_id: string; store_id: string; periodo_ref: string;
  avulsa: boolean; status: JornadaStatus; responsavel: string | null; observacoes: string | null;
}
interface Item { id: string; texto: string; ordem: number; feito: boolean }

const COLUNAS: JornadaStatus[] = ["a_fazer", "em_andamento", "concluida"];

const Jornada = () => {
  const { user, isAdmin, isGlobalAdmin } = useAuth();

  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [meusPerfis, setMeusPerfis] = useState<string[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [loja, setLoja] = useState<string>(() => sessionStorage.getItem("selectedStoreId") || "");
  const [cadencia, setCadencia] = useState<Cadencia | "todas">("diaria");
  const [perfil, setPerfil] = useState<string>("");
  const [ancora, setAncora] = useState<Date>(() => hojeSP());

  const [execs, setExecs] = useState<Exec[]>([]);
  const [contagens, setContagens] = useState<Record<string, { total: number; feitos: number }>>({});
  const [loading, setLoading] = useState(true);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [tick, setTick] = useState(0);
  const [colMobile, setColMobile] = useState<JornadaStatus>("a_fazer");

  const [aberta, setAberta] = useState<Exec | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [obs, setObs] = useState("");
  const [avulsaOpen, setAvulsaOpen] = useState(false);
  const [avulsaTpl, setAvulsaTpl] = useState("");
  const [confirmar, setConfirmar] = useState<null | { titulo: string; texto: string; acao: () => void }>(null);

  const refsPeriodo = useMemo(
    () => [periodoRef("diaria", ancora), periodoRef("semanal", ancora), periodoRef("mensal", ancora)],
    [ancora],
  );
  const cadLabel: Cadencia = cadencia === "todas" ? "diaria" : cadencia;

  /* ---------- carga de referências (1x) ---------- */
  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: t }, { data: mp }] = await Promise.all([
        supabase.from("jornada_perfis").select("id,chave,nome,cor,ativo").eq("ativo", true).order("ordem"),
        supabase.from("jornada_templates").select("id,titulo,descricao,cadencia,rota_hub,ordem,perfil_id,ativo").eq("ativo", true).order("ordem"),
        supabase.from("jornada_perfil_usuario").select("perfil_id").eq("user_id", user.id),
      ]);
      setPerfis((p || []) as Perfil[]);
      setTemplates((t || []) as Template[]);
      const meus = (mp || []).map((r) => r.perfil_id);
      setMeusPerfis(meus);
      setPerfil(meus[0] || "");

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

  /* ---------- carga do quadro: só na 1ª vez e no Atualizar ---------- */
  const carregar = useCallback(async () => {
    if (!loja) { setExecs([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("jornada_execucoes")
      .select("id,template_id,store_id,periodo_ref,avulsa,status,responsavel,observacoes")
      .eq("store_id", loja)
      .in("periodo_ref", refsPeriodo);
    const lista = (data || []) as Exec[];
    setExecs(lista);

    const ids = lista.map((e) => e.id);
    const mapa: Record<string, { total: number; feitos: number }> = {};
    for (let i = 0; i < ids.length; i += 200) {
      const { data: its } = await supabase
        .from("jornada_checklist_itens").select("execucao_id,feito").in("execucao_id", ids.slice(i, i + 200));
      (its || []).forEach((it) => {
        const c = (mapa[it.execucao_id] ||= { total: 0, feitos: 0 });
        c.total += 1;
        if (it.feito) c.feitos += 1;
      });
    }
    setContagens(mapa);
    setPendente(false);
    setLoading(false);
  }, [loja, refsPeriodo]);

  useEffect(() => {
    if (!bootstrapped) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapped, tick]);

  /* ---------- avulsas geram periodo_ref ISO: aceitar tudo do dia atual ---------- */
  const tplPorId = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const perfilPorId = useMemo(() => new Map(perfis.map((p) => [p.id, p])), [perfis]);

  const cards = useMemo(() => {
    return execs
      .map((e) => {
        const t = tplPorId.get(e.template_id);
        if (!t) return null;
        return { exec: e, tpl: t, perfil: perfilPorId.get(t.perfil_id) };
      })
      .filter(Boolean)
      .filter((c: any) => (cadencia === "todas" ? true : c.tpl.cadencia === cadencia))
      .filter((c: any) => (perfil ? c.tpl.perfil_id === perfil : true))
      .filter((c: any) => c.exec.periodo_ref === periodoRef(c.tpl.cadencia as Cadencia, ancora) || c.exec.avulsa)
      .sort((a: any, b: any) => a.tpl.ordem - b.tpl.ordem || a.tpl.titulo.localeCompare(b.tpl.titulo)) as any[];
  }, [execs, tplPorId, perfilPorId, cadencia, perfil, ancora]);

  const marcarPendente = () => setPendente(true);

  /* ---------- drawer ---------- */
  const abrir = async (exec: Exec) => {
    setAberta(exec);
    setObs(exec.observacoes || "");
    setItens([]);
    const { data } = await supabase
      .from("jornada_checklist_itens").select("id,texto,ordem,feito")
      .eq("execucao_id", exec.id).order("ordem");
    setItens((data || []) as Item[]);
  };

  const atualizarContagem = (execId: string, itensNovos: Item[]) => {
    setContagens((c) => ({
      ...c,
      [execId]: { total: itensNovos.length, feitos: itensNovos.filter((i) => i.feito).length },
    }));
    const feitos = itensNovos.filter((i) => i.feito).length;
    const status: JornadaStatus =
      itensNovos.length > 0 && feitos === itensNovos.length ? "concluida" : feitos > 0 ? "em_andamento" : "a_fazer";
    setExecs((lista) => lista.map((e) => (e.id === execId ? { ...e, status } : e)));
  };

  const alternarItem = async (item: Item, valor: boolean) => {
    if (!aberta) return;
    const { error } = await supabase
      .from("jornada_checklist_itens")
      .update({ feito: valor, feito_em: valor ? new Date().toISOString() : null, feito_por: valor ? user?.id : null })
      .eq("id", item.id);
    if (error) return toast.error("Não foi possível salvar o item.");
    const novos = itens.map((i) => (i.id === item.id ? { ...i, feito: valor } : i));
    setItens(novos);
    atualizarContagem(aberta.id, novos);
    toast.success(valor ? "Item concluído" : "Item reaberto");
  };

  const marcarTudo = async () => {
    if (!aberta) return;
    const { error } = await supabase
      .from("jornada_checklist_itens")
      .update({ feito: true, feito_em: new Date().toISOString(), feito_por: user?.id })
      .eq("execucao_id", aberta.id);
    if (error) return toast.error("Não foi possível concluir a tarefa.");
    const novos = itens.map((i) => ({ ...i, feito: true }));
    setItens(novos);
    atualizarContagem(aberta.id, novos);
    toast.success("Tarefa concluída");
  };

  const assumir = async () => {
    if (!aberta || !user) return;
    const { error } = await supabase
      .from("jornada_execucoes").update({ responsavel: user.id }).eq("id", aberta.id);
    if (error) return toast.error("Não foi possível assumir o card.");
    setExecs((l) => l.map((e) => (e.id === aberta.id ? { ...e, responsavel: user.id } : e)));
    setAberta({ ...aberta, responsavel: user.id });
    toast.success("Card assumido");
  };

  const excluir = async () => {
    if (!aberta) return;
    const { error } = await supabase.from("jornada_execucoes").delete().eq("id", aberta.id);
    if (error) return toast.error("Não foi possível excluir.");
    setExecs((l) => l.filter((e) => e.id !== aberta.id));
    setAberta(null);
    toast.success("Tarefa excluída");
  };

  // autosave das observações (1s)
  useEffect(() => {
    if (!aberta) return;
    if (obs === (aberta.observacoes || "")) return;
    const id = setTimeout(async () => {
      const { error } = await supabase.from("jornada_execucoes").update({ observacoes: obs }).eq("id", aberta.id);
      if (error) return toast.error("Não foi possível salvar a observação.");
      setExecs((l) => l.map((e) => (e.id === aberta.id ? { ...e, observacoes: obs } : e)));
      setAberta((a) => (a ? { ...a, observacoes: obs } : a));
      toast.success("Observação salva");
    }, 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obs]);

  const criarAvulsa = async () => {
    if (!avulsaTpl || !loja) return;
    const { data, error } = await supabase
      .from("jornada_execucoes")
      .insert({
        template_id: avulsaTpl, store_id: loja, avulsa: true,
        periodo_ref: new Date().toISOString(), responsavel: user?.id ?? null,
      })
      .select("id,template_id,store_id,periodo_ref,avulsa,status,responsavel,observacoes")
      .single();
    if (error || !data) return toast.error("Não foi possível criar a tarefa avulsa.");
    setExecs((l) => [...l, data as Exec]);
    setAvulsaOpen(false);
    setAvulsaTpl("");
    toast.success("Tarefa avulsa criada");
  };

  const templatesDoFiltro = templates.filter((t) => (perfil ? t.perfil_id === perfil : true));

  const Card = ({ c }: { c: any }) => {
    const cont = contagens[c.exec.id] || { total: 0, feitos: 0 };
    const pct = cont.total ? Math.round((cont.feitos / cont.total) * 100) : 0;
    return (
      <button
        onClick={() => abrir(c.exec)}
        className="w-full text-left rounded-lg border border-border bg-card p-3 hover:border-primary/60 transition-colors"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-medium text-foreground">{c.tpl.titulo}</span>
          {c.tpl.rota_hub && (
            <a
              href={c.tpl.rota_hub}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground hover:text-primary"
              aria-label="Abrir módulo"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${CADENCIA_CLASS[c.tpl.cadencia as Cadencia]}`}>
            {CADENCIA_LABEL[c.tpl.cadencia as Cadencia]}
          </span>
          {!perfil && c.perfil && (
            <span
              className="px-2 py-0.5 rounded text-[11px] font-medium text-white"
              style={{ backgroundColor: c.perfil.cor }}
            >
              {c.perfil.nome}
            </span>
          )}
          {c.exec.avulsa && <Badge variant="outline" className="text-[11px]">Avulsa</Badge>}
        </div>
        <div className="mt-2.5">
          <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
            <span>{cont.feitos} / {cont.total} itens</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "#CA3155" }} />
          </div>
        </div>
      </button>
    );
  };

  const Coluna = ({ status }: { status: JornadaStatus }) => {
    const lista = cards.filter((c) => c.exec.status === status);
    return (
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between px-1 pb-2">
          <h2 className="text-sm font-semibold text-foreground">{STATUS_LABEL[status]}</h2>
          <span className="text-xs text-muted-foreground">{lista.length}</span>
        </div>
        <div className="space-y-2">
          {loading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : lista.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Nenhuma tarefa por aqui hoje 🎉
            </p>
          ) : (
            lista.map((c) => <Card key={c.exec.id} c={c} />)
          )}
        </div>
      </div>
    );
  };

  return (
    <ClientLayout>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-6 rounded" style={{ backgroundColor: "#CA3155" }} />
          <h1 className="text-xl font-semibold text-foreground">Minha Jornada</h1>
        </div>

        {meusPerfis.length > 1 && (
          <div className="flex gap-1 mb-3 overflow-x-auto">
            {perfis.filter((p) => meusPerfis.includes(p.id)).map((p) => (
              <button
                key={p.id}
                onClick={() => setPerfil(p.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border ${
                  perfil === p.id ? "border-primary text-primary" : "border-border text-muted-foreground"
                }`}
              >
                {p.nome}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <select
            value={perfil}
            onChange={(e) => setPerfil(e.target.value)}
            className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs"
            aria-label="Perfil"
          >
            <option value="">Todos os perfis</option>
            {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
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
            value={loja}
            onChange={(e) => { setLoja(e.target.value); marcarPendente(); }}
            className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs max-w-[220px]"
            aria-label="Loja"
          >
            {lojas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => { setAncora((a) => navegar(cadLabel, a, -1)); marcarPendente(); }}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="px-3 py-1.5 rounded-md bg-secondary text-xs font-medium">
              {periodoLabel(cadLabel, ancora)}
            </span>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => { setAncora((a) => navegar(cadLabel, a, 1)); marcarPendente(); }}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <Button size="sm" variant="outline" onClick={() => setTick((t) => t + 1)}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Atualizar
          </Button>
          <Button size="sm" onClick={() => setAvulsaOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Rodar avulsa
          </Button>
        </div>

        {pendente && (
          <p className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Filtros alterados. Clique em <strong>Atualizar</strong> para buscar os dados.
          </p>
        )}

        {/* Mobile: colunas viram abas */}
        <div className="md:hidden">
          <div className="flex rounded-md border border-border overflow-hidden mb-3">
            {COLUNAS.map((s) => (
              <button
                key={s}
                onClick={() => setColMobile(s)}
                className={`flex-1 px-2 py-1.5 text-xs font-medium ${
                  colMobile === s ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          <Coluna status={colMobile} />
        </div>

        <div className="hidden md:flex gap-4 items-start">
          {COLUNAS.map((s) => <Coluna key={s} status={s} />)}
        </div>
      </div>

      {/* Drawer da tarefa */}
      <Sheet open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {aberta && (() => {
            const tpl = tplPorId.get(aberta.template_id);
            const p = tpl ? perfilPorId.get(tpl.perfil_id) : undefined;
            return (
              <>
                <SheetHeader>
                  <SheetTitle>{tpl?.titulo}</SheetTitle>
                  {tpl?.descricao && <SheetDescription>{tpl.descricao}</SheetDescription>}
                </SheetHeader>

                <div className="flex flex-wrap gap-1.5 mt-3">
                  {tpl && (
                    <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${CADENCIA_CLASS[tpl.cadencia]}`}>
                      {CADENCIA_LABEL[tpl.cadencia]}
                    </span>
                  )}
                  {p && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-medium text-white" style={{ backgroundColor: p.cor }}>
                      {p.nome}
                    </span>
                  )}
                  {aberta.avulsa && <Badge variant="outline" className="text-[11px]">Avulsa</Badge>}
                </div>

                {tpl?.rota_hub && (
                  <a href={tpl.rota_hub} target="_blank" rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary">
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir no módulo
                  </a>
                )}

                <div className="mt-5 space-y-2">
                  {itens.map((i) => (
                    <label key={i.id} className="flex items-start gap-2 text-sm cursor-pointer">
                      <Checkbox checked={i.feito} onCheckedChange={(v) => alternarItem(i, !!v)} className="mt-0.5" />
                      <span className={i.feito ? "line-through text-muted-foreground" : ""}>{i.texto}</span>
                    </label>
                  ))}
                  {itens.length === 0 && (
                    <p className="text-xs text-muted-foreground">Esta tarefa não tem checklist.</p>
                  )}
                </div>

                <div className="mt-5">
                  <label className="text-xs font-medium text-muted-foreground">Observações</label>
                  <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={4} className="mt-1" />
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={assumir}>
                    <UserCheck className="w-3.5 h-3.5 mr-1.5" /> Assumir card
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setConfirmar({
                      titulo: "Marcar tudo como concluído?",
                      texto: "Todos os itens do checklist serão marcados como feitos.",
                      acao: marcarTudo,
                    })}
                  >
                    <CheckCheck className="w-3.5 h-3.5 mr-1.5" /> Marcar tudo concluído
                  </Button>
                  {isAdmin && (
                    <Button
                      size="sm" variant="destructive"
                      onClick={() => setConfirmar({
                        titulo: "Excluir tarefa?",
                        texto: "A tarefa e seu checklist serão removidos.",
                        acao: excluir,
                      })}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Excluir
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* Modal avulsa */}
      <Dialog open={avulsaOpen} onOpenChange={setAvulsaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rodar tarefa avulsa</DialogTitle></DialogHeader>
          <select
            value={avulsaTpl}
            onChange={(e) => setAvulsaTpl(e.target.value)}
            className="w-full rounded-md border border-border bg-secondary px-2 py-2 text-sm"
          >
            <option value="">Selecione a tarefa…</option>
            {templatesDoFiltro.map((t) => (
              <option key={t.id} value={t.id}>
                {t.titulo} ({CADENCIA_LABEL[t.cadencia]})
              </option>
            ))}
          </select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAvulsaOpen(false)}>Cancelar</Button>
            <Button onClick={criarAvulsa} disabled={!avulsaTpl}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmar?.titulo}</AlertDialogTitle>
            <AlertDialogDescription>{confirmar?.texto}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { confirmar?.acao(); setConfirmar(null); }}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ClientLayout>
  );
};

export default Jornada;
