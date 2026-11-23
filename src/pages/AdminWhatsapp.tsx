import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { ImagePlus, Send, Trash2, UserPlus, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { carregarLojasPermitidas, type LojaSimples } from "@/lib/lojasPermitidas";
import { RELATORIOS_WHATSAPP, catalogoPrints } from "@/lib/whatsappRelatorios";
import { capturarTela, CONFIG_PRINT_PADRAO, type ConfigPrint } from "@/lib/capturarTela";
import ConfigPrintsTab from "@/components/whatsapp/ConfigPrintsTab";
import StatusDiarioTab from "@/components/whatsapp/StatusDiarioTab";

type Contato = { id: string; nome: string; telefone: string; grupo: string | null; ativo: boolean; store_id: string | null; relatorios: string[] };
type Campanha = { id: string; titulo: string; mensagem: string; imagens: string[]; contato_ids: string[]; status: string; created_at: string };
type Envio = { id: string; telefone: string; status: string; erro: string | null; enviado_em: string | null };

export const ehGrupo = (t: string) => /@g\.us$|-group$|@/.test(t.trim());
export const normalizarTelefone = (t: string) => {
  if (ehGrupo(t)) return t.trim().replace(/\s+/g, "");
  const d = t.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return "55" + d;
  return d;
};

const erroFn = async (error: unknown) => (error instanceof FunctionsHttpError ? await error.context.text() : String((error as Error)?.message || error));

const AdminWhatsapp = () => {
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [novo, setNovo] = useState({ nome: "", telefone: "", grupo: "" });
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [teste, setTeste] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);
  const [envios, setEnvios] = useState<Envio[]>([]);
  const { user, isGlobalAdmin } = useAuth();
  const [lojas, setLojas] = useState<LojaSimples[]>([]);
  const [comPrints, setComPrints] = useState(true);
  const [progresso, setProgresso] = useState("");
  const [catalogo, setCatalogo] = useState(RELATORIOS_WHATSAPP);
  useEffect(() => { supabase.from("whatsapp_print_config").select("*").then(({ data }) => setCatalogo(catalogoPrints(data))); }, []);
  useEffect(() => { carregarLojasPermitidas(user?.id, !!isGlobalAdmin).then(setLojas); }, [user?.id, isGlobalAdmin]);
  const atualizarContato = async (id: string, campos: Partial<Contato>) => {
    setContatos((cs) => cs.map((c) => (c.id === id ? { ...c, ...campos } : c)));
    const { error } = await supabase.from("whatsapp_contatos").update(campos).eq("id", id);
    if (error) toast.error(error.message);
  };

  const carregar = async () => {
    const [c, k] = await Promise.all([
      supabase.from("whatsapp_contatos").select("*").order("nome"),
      supabase.from("whatsapp_campanhas").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setContatos((c.data as Contato[]) || []);
    setCampanhas((k.data as Campanha[]) || []);
  };
  useEffect(() => { carregar(); }, []);

  const verEnvios = async (id: string) => {
    setAberta(id);
    const { data } = await supabase.from("whatsapp_envios").select("id,telefone,status,erro,enviado_em").eq("campanha_id", id).order("created_at");
    setEnvios((data as Envio[]) || []);
  };

  const addContato = async () => {
    const tel = normalizarTelefone(novo.telefone);
    if (!novo.nome.trim() || tel.length < 12) return toast.error("Informe nome e WhatsApp com DDD ou o ID do grupo (termina em @g.us)");
    const { error } = await supabase.from("whatsapp_contatos").insert({ nome: novo.nome.trim(), telefone: tel, grupo: novo.grupo.trim() || null });
    if (error) return toast.error(error.message);
    setNovo({ nome: "", telefone: "", grupo: "" });
    carregar();
  };

  const grupos = Array.from(new Set(contatos.map((c) => c.grupo).filter(Boolean))) as string[];
  const toggle = (id: string) => setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const salvarCampanha = async () => {
    const temPrints = comPrints && contatos.some((c) => selecionados.includes(c.id) && c.relatorios?.length);
    if (!titulo.trim() || (!mensagem.trim() && !arquivos.length && !temPrints)) { toast.error("Informe título e mensagem, imagem ou prints"); return null; }
    const paths: string[] = [];
    for (const f of arquivos) {
      const path = `${crypto.randomUUID()}-${f.name.replace(/[^\w.-]/g, "_")}`;
      const { error } = await supabase.storage.from("whatsapp-midia").upload(path, f);
      if (error) { toast.error(error.message); return null; }
      paths.push(path);
    }
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("whatsapp_campanhas").insert({ titulo, mensagem, imagens: paths, contato_ids: selecionados, created_by: u.user?.id }).select().single();
    if (error) { toast.error(error.message); return null; }
    return data as Campanha;
  };

  const enviarTeste = async () => {
    if (normalizarTelefone(teste).length < 12) return toast.error("Informe o número de teste");
    setOcupado(true);
    const camp = await salvarCampanha();
    if (camp) {
      const { data, error } = await supabase.functions.invoke("whatsapp-enviar", { body: { campanha_id: camp.id, teste_telefone: normalizarTelefone(teste) } });
      if (error) toast.error("Falha no teste: " + (await erroFn(error)));
      else if (data?.ok === false) toast.error("Falha no teste: " + data.error);
      else toast.success("Teste enviado");
      await supabase.from("whatsapp_campanhas").update({ status: "teste" }).eq("id", camp.id);
    }
    setOcupado(false);
    carregar();
  };

  const processar = async (id: string) => {
    setOcupado(true);
    try {
      for (let i = 0; i < 200; i++) {
        const { data, error } = await supabase.functions.invoke("whatsapp-enviar", { body: { campanha_id: id } });
        if (error) { toast.error(await erroFn(error)); break; }
        if (data?.ok === false) { toast.error(data.error); break; }
        await verEnvios(id);
        if (!data?.pendentes) { toast.success("Envio concluído"); break; }
      }
    } finally { setOcupado(false); carregar(); }
  };

  const disparar = async () => {
    if (!selecionados.length) return toast.error("Selecione os contatos");
    setOcupado(true);
    const camp = await salvarCampanha();
    setOcupado(false);
    if (!camp) return;
    const alvo = contatos.filter((c) => selecionados.includes(c.id) && c.ativo);
    if (comPrints && alvo.some((c) => c.relatorios?.length)) {
      if (alvo.some((c) => c.relatorios?.length && !c.store_id)) { toast.error("Escolha a loja dos contatos que recebem prints (aba Contatos)"); return; }
      setOcupado(true);
      try {
        const { data: cfgs } = await supabase.from("whatsapp_print_config").select("*");
        const cfgDe = (rid: string) => ({ ...CONFIG_PRINT_PADRAO, ...((cfgs || []).find((x: any) => x.relatorio_id === rid) as Partial<ConfigPrint> | undefined) }) as ConfigPrint;
        const cache = new Map<string, string[]>();
        const linhas = [];
        for (const c of alvo) {
          const paths: string[] = [];
          for (const rid of c.relatorios || []) {
            const rel = catalogoPrints(cfgs).find((r) => r.id === rid);
            if (!rel || !c.store_id || !user) continue;
            const k = `${c.store_id}:${rid}`;
            if (!cache.has(k)) {
              setProgresso(`Tirando print: ${rel.nome} · ${lojas.find((l) => l.id === c.store_id)?.name ?? ""}`);
              const cfg = cfgDe(rid);
              const blobs = await capturarTela(rel, c.store_id, user.id, cfg);
              const ext = cfg.formato === "jpeg" ? "jpg" : "png";
              const ps: string[] = [];
              for (let i = 0; i < blobs.length; i++) {
                const path = `prints/${camp.id}/${c.store_id}-${rid}-${i + 1}.${ext}`;
                const { error } = await supabase.storage.from("whatsapp-midia").upload(path, blobs[i], { contentType: `image/${cfg.formato}`, upsert: true });
                if (error) throw error;
                ps.push(path);
              }
              cache.set(k, ps);
            }
            paths.push(...cache.get(k)!);
          }
          linhas.push({ campanha_id: camp.id, contato_id: c.id, telefone: normalizarTelefone(c.telefone), imagens: paths });
        }
        const { error } = await supabase.from("whatsapp_envios").insert(linhas);
        if (error) throw error;
        await supabase.from("whatsapp_campanhas").update({ status: "enviando" }).eq("id", camp.id);
      } catch (e) {
        toast.error("Falha ao preparar os prints: " + String((e as Error)?.message || e));
        setOcupado(false); setProgresso(""); return;
      }
      setProgresso("");
    }
    setTitulo(""); setMensagem(""); setArquivos([]); setSelecionados([]);
    processar(camp.id);
  };

  const cor = (s: string) => (s === "enviado" || s === "concluida" ? "default" : s === "erro" ? "destructive" : "secondary");

  return (
    <ClientLayout>
      <div className="space-y-6 p-4 md:p-6">
        <div>
          <h1 className="font-display text-3xl font-bold">Mensagens automáticas</h1>
          <p className="text-muted-foreground">Envio pelo WhatsApp (Z-API), com intervalo entre contatos para proteger o número.</p>
        </div>
        <Tabs defaultValue="nova">
          <TabsList>
            <TabsTrigger value="nova">Nova mensagem</TabsTrigger>
            <TabsTrigger value="contatos">Contatos ({contatos.length})</TabsTrigger>
            <TabsTrigger value="status">Status diário</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
            <TabsTrigger value="prints">Configurar prints</TabsTrigger>
          </TabsList>

          <TabsContent value="nova" className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Mensagem</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <Input placeholder="Título (uso interno)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
                <Textarea rows={7} placeholder="Texto da mensagem" value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
                <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  <ImagePlus className="h-4 w-4" /> Adicionar imagens
                  <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => setArquivos((a) => [...a, ...Array.from(e.target.files || [])])} />
                </label>
                <div className="flex flex-wrap gap-2">
                  {arquivos.map((f, i) => (
                    <div key={i} className="relative">
                      <img src={URL.createObjectURL(f)} alt={f.name} className="h-20 w-20 rounded object-cover" />
                      <button aria-label="Remover imagem" className="absolute -right-1 -top-1 rounded-full bg-destructive p-0.5 text-destructive-foreground" onClick={() => setArquivos((a) => a.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input placeholder="Número para teste" value={teste} onChange={(e) => setTeste(e.target.value)} />
                  <Button variant="outline" disabled={ocupado} onClick={enviarTeste}>Enviar teste</Button>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Para quem ({selecionados.length})</CardTitle>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setSelecionados(contatos.filter((c) => c.ativo).map((c) => c.id))}>Todos</Button>
                  {grupos.map((g) => (
                    <Button key={g} size="sm" variant="ghost" onClick={() => setSelecionados(contatos.filter((c) => c.ativo && c.grupo === g).map((c) => c.id))}>{g}</Button>
                  ))}
                  <Button size="sm" variant="ghost" onClick={() => setSelecionados([])}>Limpar</Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-96 space-y-1 overflow-auto">
                {contatos.filter((c) => c.ativo).map((c) => (
                  <label key={c.id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-muted">
                    <Checkbox checked={selecionados.includes(c.id)} onCheckedChange={() => toggle(c.id)} />
                    <span className="flex-1">{c.nome}</span>
                    <span className="text-xs text-muted-foreground">{c.telefone}</span>
                    {c.grupo && <Badge variant="secondary">{c.grupo}</Badge>}
                    {comPrints && (c.relatorios?.length ?? 0) > 0 && <Badge variant="outline">{c.relatorios.length} prints</Badge>}
                  </label>
                ))}
                {!contatos.length && <p className="text-sm text-muted-foreground">Cadastre contatos na aba Contatos.</p>}
              </CardContent>
              <div className="space-y-2 p-4 pt-0">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={comPrints} onCheckedChange={(v) => setComPrints(!!v)} />Incluir os prints escolhidos para cada contato</label>
                {progresso && <p className="text-sm text-muted-foreground">{progresso}</p>}
                <Button className="w-full" disabled={ocupado} onClick={disparar}><Send className="mr-2 h-4 w-4" />{ocupado ? "Enviando..." : "Enviar agora"}</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="contatos">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="grid gap-2 md:grid-cols-4">
                  <Input placeholder="Nome" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
                  <Input placeholder="WhatsApp com DDD ou ID do grupo (…@g.us)" value={novo.telefone} onChange={(e) => setNovo({ ...novo, telefone: e.target.value })} />
                  <Input placeholder="Grupo (ex.: Diretoria)" value={novo.grupo} onChange={(e) => setNovo({ ...novo, grupo: e.target.value })} />
                  <Button onClick={addContato}><UserPlus className="mr-2 h-4 w-4" />Adicionar</Button>
                </div>
                <div className="divide-y">
                  {contatos.map((c) => (
                    <div key={c.id} className="space-y-2 py-3">
                    <div className="flex items-center gap-3">
                      <Checkbox checked={c.ativo} onCheckedChange={async (v) => { await supabase.from("whatsapp_contatos").update({ ativo: !!v }).eq("id", c.id); carregar(); }} />
                      <span className="flex-1">{c.nome}</span>
                      <span className="text-sm text-muted-foreground">{c.telefone}</span>
                      {c.grupo && <Badge variant="secondary">{c.grupo}</Badge>}
                      <Button size="icon" variant="ghost" aria-label="Excluir contato" onClick={async () => { if (confirm(`Excluir ${c.nome}?`)) { await supabase.from("whatsapp_contatos").delete().eq("id", c.id); carregar(); } }}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pl-7 text-sm">
                      <Select value={c.store_id ?? ""} onValueChange={(v) => atualizarContato(c.id, { store_id: v })}>
                        <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Loja dos prints" /></SelectTrigger>
                        <SelectContent>{lojas.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                      </Select>
                      {catalogo.map((r) => (
                        <label key={r.id} className="flex items-center gap-1.5">
                          <Checkbox checked={c.relatorios?.includes(r.id)} onCheckedChange={(v) => atualizarContato(c.id, { relatorios: v ? [...(c.relatorios || []), r.id] : (c.relatorios || []).filter((x) => x !== r.id) })} />
                          {r.nome}
                        </label>
                      ))}
                    </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="status"><StatusDiarioTab lojas={lojas} /></TabsContent>

          <TabsContent value="prints"><ConfigPrintsTab lojas={lojas} /></TabsContent>

          <TabsContent value="historico" className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="divide-y pt-6">
                {campanhas.map((k) => (
                  <button key={k.id} className="flex w-full items-center gap-3 py-2 text-left hover:bg-muted" onClick={() => verEnvios(k.id)}>
                    <span className="flex-1">{k.titulo}</span>
                    <span className="text-xs text-muted-foreground">{new Date(k.created_at).toLocaleString("pt-BR")}</span>
                    <Badge variant={cor(k.status)}>{k.status}</Badge>
                  </button>
                ))}
              </CardContent>
            </Card>
            {aberta && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Envios</CardTitle>
                  <Button size="sm" variant="outline" disabled={ocupado} onClick={async () => {
                    await supabase.from("whatsapp_envios").update({ status: "pendente", erro: null }).eq("campanha_id", aberta).eq("status", "erro");
                    processar(aberta);
                  }}>Retomar / reenviar falhas</Button>
                </CardHeader>
                <CardContent className="max-h-[32rem] divide-y overflow-auto">
                  {envios.map((e) => (
                    <div key={e.id} className="py-2 text-sm">
                      <div className="flex justify-between"><span>{contatos.find((c) => normalizarTelefone(c.telefone) === e.telefone)?.nome || e.telefone}</span><Badge variant={cor(e.status)}>{e.status}</Badge></div>
                      {e.erro && <p className="text-xs text-destructive">{e.erro}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
};
export default AdminWhatsapp;
