import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, RefreshCw, Trash2, GripVertical, Save } from "lucide-react";
import { CADENCIA_LABEL, Cadencia } from "@/lib/jornada";

interface Perfil {
  id?: string; chave: string; nome: string; descricao: string | null;
  cor: string; icone: string; ordem: number; ativo: boolean; store_id: string | null;
}
interface ItemCk { texto: string; ordem: number }
interface Template {
  id?: string; perfil_id: string; cadencia: Cadencia; titulo: string; descricao: string | null;
  ordem: number; rota_hub: string | null; checklist_padrao: ItemCk[]; ativo: boolean;
}

const perfilVazio: Perfil = {
  chave: "", nome: "", descricao: "", cor: "#CA3155", icone: "ClipboardList", ordem: 0, ativo: true,
  store_id: null,
};
const templateVazio = (perfil_id: string): Template => ({
  perfil_id, cadencia: "diaria", titulo: "", descricao: "", ordem: 0,
  rota_hub: "", checklist_padrao: [], ativo: true,
});

const AdminJornada = () => {
  const { isAdmin, loading } = useAuth();

  const [perfis, setPerfis] = useState<Perfil[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [usuarios, setUsuarios] = useState<{ user_id: string; full_name: string | null }[]>([]);
  const [vinculos, setVinculos] = useState<{ user_id: string; perfil_id: string }[]>([]);
  const [fPerfil, setFPerfil] = useState("");
  const [fCadencia, setFCadencia] = useState("");

  const [perfilEdit, setPerfilEdit] = useState<Perfil | null>(null);
  const [tplEdit, setTplEdit] = useState<Template | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [renovando, setRenovando] = useState(false);
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [lojaAtual] = useState<string>(() => sessionStorage.getItem("selectedStoreId") || "");
  const [usuariosDaLoja, setUsuariosDaLoja] = useState<string[]>([]);
  const [lojasPorTpl, setLojasPorTpl] = useState<Record<string, string[]>>({});
  const [tplLojas, setTplLojas] = useState<string[]>([]);

  const carregar = async () => {
    const [{ data: p }, { data: t }, { data: u }, { data: v }, { data: l }, { data: tl }] = await Promise.all([
      supabase.from("jornada_perfis").select("*").order("ordem"),
      supabase.from("jornada_templates").select("*").order("ordem"),
      supabase.from("profiles").select("user_id, full_name").order("full_name"),
      supabase.from("jornada_perfil_usuario").select("user_id, perfil_id"),
      supabase.from("stores").select("id, name").order("name"),
      supabase.from("jornada_template_loja").select("template_id, store_id"),
    ]);
    const mapaTl: Record<string, string[]> = {};
    (tl || []).forEach((r) => { (mapaTl[r.template_id] ||= []).push(r.store_id); });
    setLojasPorTpl(mapaTl);
    setPerfis((p || []) as Perfil[]);
    setTemplates(((t || []) as any[]).map((x) => ({
      ...x,
      checklist_padrao: Array.isArray(x.checklist_padrao) ? x.checklist_padrao : [],
    })) as Template[]);
    setUsuarios(u || []);
    setVinculos(v || []);
    setLojas(l || []);

    if (lojaAtual) {
      const { data: acc } = await supabase
        .from("user_store_access").select("user_id")
        .eq("store_id", lojaAtual).eq("approved", true);
      setUsuariosDaLoja((acc || []).map((a) => a.user_id));
    } else {
      setUsuariosDaLoja([]);
    }
  };

  useEffect(() => { if (isAdmin) carregar(); }, [isAdmin]);

  const templatesFiltrados = useMemo(
    () => templates.filter((t) =>
      (!fPerfil || t.perfil_id === fPerfil) && (!fCadencia || t.cadencia === fCadencia)),
    [templates, fPerfil, fCadencia],
  );

  /** Vínculos: só perfis da rede + da loja do header, e só usuários dessa loja. */
  const perfisVinculo = useMemo(
    () => perfis.filter((p) => !p.store_id || p.store_id === lojaAtual),
    [perfis, lojaAtual],
  );
  const usuariosVinculo = useMemo(
    () => (lojaAtual ? usuarios.filter((u) => usuariosDaLoja.includes(u.user_id)) : usuarios),
    [usuarios, usuariosDaLoja, lojaAtual],
  );


  const salvarPerfil = async () => {
    if (!perfilEdit) return;
    const { id, ...campos } = perfilEdit;
    const { error } = id
      ? await supabase.from("jornada_perfis").update(campos).eq("id", id)
      : await supabase.from("jornada_perfis").insert(campos);
    if (error) return toast.error(error.message);
    toast.success("Perfil salvo");
    setPerfilEdit(null);
    carregar();
  };

  /** Abre o editor de tarefa já com as lojas onde ela vale. */
  const abrirTemplate = (t: Template | null) => {
    if (!t) return;
    setTplLojas(t.id ? lojasPorTpl[t.id] || [] : []);
    setTplEdit(t);
  };

  const salvarTemplate = async () => {
    if (!tplEdit) return;
    const { id, ...campos } = tplEdit;
    const payload = {
      ...campos,
      checklist_padrao: campos.checklist_padrao.map((i, idx) => ({ texto: i.texto, ordem: idx + 1 })),
    } as any;
    const { data: salvo, error } = id
      ? await supabase.from("jornada_templates").update(payload).eq("id", id).select("id").single()
      : await supabase.from("jornada_templates").insert(payload).select("id").single();
    if (error) return toast.error(error.message);

    // lojas onde a tarefa vale (nenhuma marcada = rede inteira)
    const tplId = (salvo as any)?.id || id;
    if (tplId) {
      await supabase.from("jornada_template_loja").delete().eq("template_id", tplId);
      if (tplLojas.length) {
        const { error: eL } = await supabase
          .from("jornada_template_loja")
          .insert(tplLojas.map((s) => ({ template_id: tplId, store_id: s })));
        if (eL) return toast.error(eL.message);
      }
    }
    toast.success("Tarefa salva");
    setTplEdit(null);
    carregar();
  };

  const excluirTemplate = async (id: string) => {
    const { error } = await supabase.from("jornada_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Tarefa excluída");
    carregar();
  };

  const alternarVinculo = async (user_id: string, perfil_id: string, ligado: boolean) => {
    const { error } = ligado
      ? await supabase.from("jornada_perfil_usuario").insert({ user_id, perfil_id })
      : await supabase.from("jornada_perfil_usuario").delete().eq("user_id", user_id).eq("perfil_id", perfil_id);
    if (error) return toast.error(error.message);
    setVinculos((l) => ligado
      ? [...l, { user_id, perfil_id }]
      : l.filter((x) => !(x.user_id === user_id && x.perfil_id === perfil_id)));
    toast.success("Vínculo atualizado");
  };

  const renovar = async () => {
    setRenovando(true);
    const { data, error } = await supabase.functions.invoke("jornada-renovar", { body: {} });
    setRenovando(false);
    if (error) return toast.error("Não foi possível renovar agora.");
    toast.success(`Renovado: ${(data as any)?.execucoes_novas ?? 0} tarefas criadas`);
  };

  if (loading) return <div className="min-h-screen bg-background" />;
  if (!isAdmin) {
    return (
      <ClientLayout>
        <div className="max-w-md mx-auto py-20 text-center space-y-3">
          <p className="text-sm text-muted-foreground">Acesso negado.</p>
          <Link to="/jornada" className="text-sm text-primary underline">Voltar para Minha Jornada</Link>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-6 rounded" style={{ backgroundColor: "#CA3155" }} />
            <h1 className="text-xl font-semibold">Admin da Jornada</h1>
          </div>
          <Button size="sm" onClick={renovar} disabled={renovando}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${renovando ? "animate-spin" : ""}`} /> Renovar agora
          </Button>
        </div>

        <Tabs defaultValue="perfis">
          <TabsList>
            <TabsTrigger value="perfis">Perfis</TabsTrigger>
            <TabsTrigger value="templates">Tarefas</TabsTrigger>
            <TabsTrigger value="vinculos">Vínculos</TabsTrigger>
          </TabsList>

          {/* PERFIS */}
          <TabsContent value="perfis" className="mt-4 space-y-3">
            <Button size="sm" onClick={() => setPerfilEdit({
              ...perfilVazio, ordem: perfis.length + 1, store_id: lojaAtual || null,
            })}>
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo perfil
            </Button>
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Nome</th><th className="text-left p-2">Chave</th>
                    <th className="text-left p-2">Cor</th><th className="text-left p-2">Loja</th>
                    <th className="text-left p-2">Ordem</th>
                    <th className="text-left p-2">Ativo</th><th />
                  </tr>
                </thead>
                <tbody>
                  {perfis.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="p-2">{p.nome}</td>
                      <td className="p-2 text-muted-foreground">{p.chave}</td>
                      <td className="p-2"><span className="inline-block w-5 h-5 rounded" style={{ backgroundColor: p.cor }} /></td>
                      <td className="p-2 text-muted-foreground">
                        {p.store_id ? (lojas.find((s) => s.id === p.store_id)?.name || "—") : "Rede inteira"}
                      </td>
                      <td className="p-2">{p.ordem}</td>
                      <td className="p-2">{p.ativo ? "Sim" : "Não"}</td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => setPerfilEdit(p)}>Editar</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* TEMPLATES */}
          <TabsContent value="templates" className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-center">
              <select value={fPerfil} onChange={(e) => setFPerfil(e.target.value)}
                className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs">
                <option value="">Todos os perfis</option>
                {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <select value={fCadencia} onChange={(e) => setFCadencia(e.target.value)}
                className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs">
                <option value="">Todas as cadências</option>
                {(["diaria", "semanal", "mensal"] as Cadencia[]).map((c) => (
                  <option key={c} value={c}>{CADENCIA_LABEL[c]}</option>
                ))}
              </select>
              <Button size="sm" onClick={() => abrirTemplate(templateVazio(fPerfil || perfis[0]?.id || ""))}>
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Nova tarefa
              </Button>
            </div>

            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Título</th><th className="text-left p-2">Perfil</th>
                    <th className="text-left p-2">Cadência</th><th className="text-left p-2">Ordem</th>
                    <th className="text-left p-2">Rota</th><th className="text-left p-2">Lojas</th>
                    <th className="text-left p-2">Ativo</th><th />
                  </tr>
                </thead>
                <tbody>
                  {templatesFiltrados.map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="p-2">{t.titulo}</td>
                      <td className="p-2 text-muted-foreground">{perfis.find((p) => p.id === t.perfil_id)?.nome}</td>
                      <td className="p-2">{CADENCIA_LABEL[t.cadencia]}</td>
                      <td className="p-2">{t.ordem}</td>
                      <td className="p-2 text-muted-foreground">{t.rota_hub || "—"}</td>
                      <td className="p-2 text-muted-foreground">
                        {(lojasPorTpl[t.id!] || []).length
                          ? `${lojasPorTpl[t.id!].length} loja(s)`
                          : "Todas as lojas"}
                      </td>
                      <td className="p-2">{t.ativo ? "Sim" : "Não"}</td>
                      <td className="p-2 text-right whitespace-nowrap">
                        <Button size="sm" variant="outline" onClick={() => abrirTemplate(t)}>Editar</Button>
                        <Button size="sm" variant="ghost" onClick={() => excluirTemplate(t.id!)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          {/* VÍNCULOS */}
          <TabsContent value="vinculos" className="mt-4">
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left p-2">Usuário</th>
                    {perfisVinculo.map((p) => <th key={p.id} className="p-2 text-center">{p.nome}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {usuariosVinculo.map((u) => (
                    <tr key={u.user_id} className="border-t border-border">
                      <td className="p-2">{u.full_name || u.user_id.slice(0, 8)}</td>
                      {perfisVinculo.map((p) => {
                        const on = vinculos.some((v) => v.user_id === u.user_id && v.perfil_id === p.id);
                        return (
                          <td key={p.id} className="p-2 text-center">
                            <Switch checked={on} onCheckedChange={(v) => alternarVinculo(u.user_id, p.id!, v)} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* editor de perfil */}
      <Dialog open={!!perfilEdit} onOpenChange={(o) => !o && setPerfilEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{perfilEdit?.id ? "Editar perfil" : "Novo perfil"}</DialogTitle></DialogHeader>
          {perfilEdit && (
            <div className="space-y-3">
              <Input placeholder="Nome" value={perfilEdit.nome}
                onChange={(e) => setPerfilEdit({ ...perfilEdit, nome: e.target.value })} />
              <Input placeholder="Chave (ex.: comprador)" value={perfilEdit.chave}
                onChange={(e) => setPerfilEdit({ ...perfilEdit, chave: e.target.value })} />
              <Textarea placeholder="Descrição" value={perfilEdit.descricao || ""}
                onChange={(e) => setPerfilEdit({ ...perfilEdit, descricao: e.target.value })} />
              <div className="flex gap-2">
                <Input type="color" className="w-20 p-1" value={perfilEdit.cor}
                  onChange={(e) => setPerfilEdit({ ...perfilEdit, cor: e.target.value })} />
                <Input placeholder="Ícone (lucide)" value={perfilEdit.icone}
                  onChange={(e) => setPerfilEdit({ ...perfilEdit, icone: e.target.value })} />
                <Input type="number" className="w-24" value={perfilEdit.ordem}
                  onChange={(e) => setPerfilEdit({ ...perfilEdit, ordem: Number(e.target.value) })} />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Loja do perfil</p>
                <select
                  value={perfilEdit.store_id || ""}
                  onChange={(e) => setPerfilEdit({ ...perfilEdit, store_id: e.target.value || null })}
                  className="w-full rounded-md border border-border bg-secondary px-2 py-2 text-sm"
                >
                  <option value="">Rede inteira (todas as lojas)</option>
                  {lojas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={perfilEdit.ativo}
                  onCheckedChange={(v) => setPerfilEdit({ ...perfilEdit, ativo: v })} /> Ativo
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerfilEdit(null)}>Cancelar</Button>
            <Button onClick={salvarPerfil}><Save className="w-3.5 h-3.5 mr-1.5" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* editor de tarefa */}
      <Dialog open={!!tplEdit} onOpenChange={(o) => !o && setTplEdit(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{tplEdit?.id ? "Editar tarefa" : "Nova tarefa"}</DialogTitle></DialogHeader>
          {tplEdit && (
            <div className="space-y-3">
              <Input placeholder="Título" value={tplEdit.titulo}
                onChange={(e) => setTplEdit({ ...tplEdit, titulo: e.target.value })} />
              <Textarea placeholder="Descrição" value={tplEdit.descricao || ""}
                onChange={(e) => setTplEdit({ ...tplEdit, descricao: e.target.value })} />
              <div className="flex gap-2">
                <select value={tplEdit.perfil_id}
                  onChange={(e) => setTplEdit({ ...tplEdit, perfil_id: e.target.value })}
                  className="flex-1 rounded-md border border-border bg-secondary px-2 py-2 text-sm">
                  {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
                <select value={tplEdit.cadencia}
                  onChange={(e) => setTplEdit({ ...tplEdit, cadencia: e.target.value as Cadencia })}
                  className="rounded-md border border-border bg-secondary px-2 py-2 text-sm">
                  {(["diaria", "semanal", "mensal"] as Cadencia[]).map((c) => (
                    <option key={c} value={c}>{CADENCIA_LABEL[c]}</option>
                  ))}
                </select>
                <Input type="number" className="w-20" value={tplEdit.ordem}
                  onChange={(e) => setTplEdit({ ...tplEdit, ordem: Number(e.target.value) })} />
              </div>
              <Input placeholder="Rota no Hub (ex.: /pic)" value={tplEdit.rota_hub || ""}
                onChange={(e) => setTplEdit({ ...tplEdit, rota_hub: e.target.value })} />

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground">Lojas onde esta tarefa vale</p>
                  <button type="button" className="text-[11px] text-primary underline"
                    onClick={() => setTplLojas([])}>
                    Todas as lojas da rede
                  </button>
                </div>
                <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2 space-y-1">
                  {lojas.map((s) => (
                    <label key={s.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={tplLojas.includes(s.id)}
                        onChange={(e) => setTplLojas((l) =>
                          e.target.checked ? [...l, s.id] : l.filter((x) => x !== s.id))}
                      />
                      {s.name}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {tplLojas.length
                    ? `${tplLojas.length} loja(s) selecionada(s)`
                    : "Nenhuma marcada — a tarefa vale para todas as lojas."}
                </p>
              </div>


              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Checklist</p>
                <div className="space-y-1">
                  {tplEdit.checklist_padrao.map((i, idx) => (
                    <div
                      key={idx}
                      draggable
                      onDragStart={() => setDrag(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (drag === null || drag === idx) return;
                        const lista = [...tplEdit.checklist_padrao];
                        const [mov] = lista.splice(drag, 1);
                        lista.splice(idx, 0, mov);
                        setTplEdit({ ...tplEdit, checklist_padrao: lista });
                        setDrag(null);
                      }}
                      className="flex items-center gap-1.5"
                    >
                      <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                      <Input value={i.texto} onChange={(e) => {
                        const lista = [...tplEdit.checklist_padrao];
                        lista[idx] = { ...lista[idx], texto: e.target.value };
                        setTplEdit({ ...tplEdit, checklist_padrao: lista });
                      }} />
                      <Button size="icon" variant="ghost" onClick={() => setTplEdit({
                        ...tplEdit,
                        checklist_padrao: tplEdit.checklist_padrao.filter((_, k) => k !== idx),
                      })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => setTplEdit({
                  ...tplEdit,
                  checklist_padrao: [...tplEdit.checklist_padrao, { texto: "", ordem: tplEdit.checklist_padrao.length + 1 }],
                })}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Item
                </Button>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Switch checked={tplEdit.ativo} onCheckedChange={(v) => setTplEdit({ ...tplEdit, ativo: v })} /> Ativa
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTplEdit(null)}>Cancelar</Button>
            <Button onClick={salvarTemplate}><Save className="w-3.5 h-3.5 mr-1.5" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
};

export default AdminJornada;
