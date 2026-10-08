import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Trash2, Tv, Upload } from "lucide-react";
import { TV_TIPOS, TvItem, TvTela, TvTipo, listarItens, listarTelas, tvDb } from "@/lib/tv";

const AdminTv = () => {
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [loja, setLoja] = useState("");
  const [telas, setTelas] = useState<TvTela[]>([]);
  const [tela, setTela] = useState("");
  const [itens, setItens] = useState<TvItem[]>([]);
  const [novaTela, setNovaTela] = useState("");
  const [tipo, setTipo] = useState<TvTipo>("foto");
  const [titulo, setTitulo] = useState("");
  const [duracao, setDuracao] = useState(15);
  const [codigos, setCodigos] = useState("");
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.from("stores").select("id,name").order("name").then(({ data }) => {
      setLojas(data || []);
      const sel = sessionStorage.getItem("selectedStoreId");
      setLoja(sel && data?.some((l) => l.id === sel) ? sel : data?.[0]?.id || "");
    });
  }, []);

  const carregarTelas = async (l = loja) => {
    if (!l) return;
    const t = await listarTelas(l);
    setTelas(t);
    setTela((atual) => (t.some((x) => x.id === atual) ? atual : t[0]?.id || ""));
  };
  useEffect(() => { carregarTelas(); }, [loja]);

  const carregarItens = async () => { if (tela) setItens(await listarItens(tela)); else setItens([]); };
  useEffect(() => { carregarItens(); }, [tela]);

  const criarTela = async () => {
    if (!novaTela.trim() || !loja) return;
    const { data, error } = await tvDb.from("tv_telas").insert({ store_id: loja, nome: novaTela.trim() }).select().single();
    if (error) return toast.error("Não foi possível criar a TV");
    setNovaTela("");
    await carregarTelas();
    setTela(data.id);
  };

  const excluirTela = async () => {
    if (!tela || !confirm("Excluir esta TV e toda a programação dela?")) return;
    await tvDb.from("tv_telas").delete().eq("id", tela);
    carregarTelas();
  };

  const adicionar = async () => {
    if (!tela) return;
    if ((tipo === "foto" || tipo === "video") && !arquivo) return toast.error("Escolha o arquivo");
    const listaCodigos = codigos.split(/[\s,;]+/).map((c) => c.trim()).filter(Boolean);
    if (tipo === "precos" && listaCodigos.length === 0) return toast.error("Informe os códigos dos produtos");
    setSalvando(true);
    try {
      let midia_path: string | null = null;
      if (arquivo) {
        const ext = arquivo.name.split(".").pop();
        midia_path = `${loja}/${tela}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("tv-midia").upload(midia_path, arquivo, { contentType: arquivo.type });
        if (error) throw error;
      }
      const ordem = itens.length ? Math.max(...itens.map((i) => i.ordem)) + 1 : 0;
      const { error } = await tvDb.from("tv_itens").insert({
        tela_id: tela, ordem, tipo, titulo: titulo || null, midia_path,
        duracao_seg: duracao, config: tipo === "precos" ? { codigos: listaCodigos } : tipo === "texto" ? { texto } : {},
      });
      if (error) throw error;
      setTitulo(""); setCodigos(""); setTexto(""); setArquivo(null);
      toast.success("Adicionado à programação");
      carregarItens();
    } catch {
      toast.error("Não foi possível adicionar");
    } finally {
      setSalvando(false);
    }
  };

  const atualizar = async (id: string, campos: Partial<TvItem>) => {
    await tvDb.from("tv_itens").update(campos).eq("id", id);
    carregarItens();
  };

  const mover = async (idx: number, dir: -1 | 1) => {
    const a = itens[idx], b = itens[idx + dir];
    if (!a || !b) return;
    await tvDb.from("tv_itens").update({ ordem: b.ordem }).eq("id", a.id);
    await tvDb.from("tv_itens").update({ ordem: a.ordem }).eq("id", b.id);
    carregarItens();
  };

  const remover = async (it: TvItem) => {
    if (!confirm("Remover da programação?")) return;
    if (it.midia_path) await supabase.storage.from("tv-midia").remove([it.midia_path]);
    await tvDb.from("tv_itens").delete().eq("id", it.id);
    carregarItens();
  };

  const totalSeg = itens.filter((i) => i.ativo).reduce((s, i) => s + i.duracao_seg, 0);

  return (
    <ClientLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <Tv className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Gerenciador de TV</h1>
        </div>

        <Card>
          <CardContent className="pt-6 grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground">Loja</label>
              <Select value={loja} onValueChange={setLoja}>
                <SelectTrigger><SelectValue placeholder="Loja" /></SelectTrigger>
                <SelectContent>{lojas.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">TV</label>
              <div className="flex gap-2">
                <Select value={tela} onValueChange={setTela}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma TV" /></SelectTrigger>
                  <SelectContent>{telas.map((t) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent>
                </Select>
                {tela && <Button variant="outline" size="icon" onClick={excluirTela} title="Excluir TV"><Trash2 className="w-4 h-4" /></Button>}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Nova TV (ex.: Entrada, Açougue)</label>
              <div className="flex gap-2">
                <Input value={novaTela} onChange={(e) => setNovaTela(e.target.value)} placeholder="Nome da TV" />
                <Button onClick={criarTela}><Plus className="w-4 h-4" /></Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {tela && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Adicionar à programação</CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/tv/${tela}`} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-1" />Abrir na TV</a>
                </Button>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-4">
                <div>
                  <label className="text-xs text-muted-foreground">Tipo</label>
                  <Select value={tipo} onValueChange={(v) => setTipo(v as TvTipo)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TV_TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Título (opcional)</label>
                  <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Tempo na tela (segundos)</label>
                  <Input type="number" min={3} value={duracao} onChange={(e) => setDuracao(Math.max(3, Number(e.target.value) || 15))} />
                  {tipo === "video" && <p className="text-[10px] text-muted-foreground mt-1">Vídeo passa até o fim, se terminar antes.</p>}
                </div>
                <div className="flex items-end">
                  <Button className="w-full" onClick={adicionar} disabled={salvando}><Plus className="w-4 h-4 mr-1" />{salvando ? "Enviando..." : "Adicionar"}</Button>
                </div>
                {(tipo === "foto" || tipo === "video") && (
                  <div className="md:col-span-4">
                    <label className="flex items-center gap-2 border border-dashed rounded-md p-4 cursor-pointer hover:bg-muted/40">
                      <Upload className="w-4 h-4" />
                      <span className="text-sm">{arquivo ? arquivo.name : `Escolher ${tipo === "foto" ? "foto" : "vídeo (MP4)"}`}</span>
                      <input type="file" className="hidden" accept={tipo === "foto" ? "image/*" : "video/*"} onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
                    </label>
                  </div>
                )}
                {tipo === "precos" && (
                  <div className="md:col-span-4">
                    <label className="text-xs text-muted-foreground">Códigos dos produtos (separados por vírgula ou um por linha). Preço vem do sistema da loja.</label>
                    <Textarea rows={3} value={codigos} onChange={(e) => setCodigos(e.target.value)} placeholder="90643, 1234, 5678" />
                  </div>
                )}
                {tipo === "texto" && (
                  <div className="md:col-span-4">
                    <label className="text-xs text-muted-foreground">Texto do aviso</label>
                    <Textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Programação ({itens.length} itens · uma volta ≈ {Math.round(totalSeg / 60)} min {totalSeg % 60}s)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {itens.length === 0 && <p className="text-sm text-muted-foreground">Nada programado ainda.</p>}
                {itens.map((it, i) => (
                  <div key={it.id} className={`flex flex-wrap items-center gap-2 border rounded-md p-2 ${it.ativo ? "" : "opacity-50"}`}>
                    <span className="w-6 text-center text-xs text-muted-foreground">{i + 1}</span>
                    <span className="text-xs font-semibold px-2 py-1 rounded bg-muted">{TV_TIPOS.find((t) => t.value === it.tipo)?.label}</span>
                    <span className="flex-1 min-w-[160px] text-sm truncate">
                      {it.titulo || (it.tipo === "precos" ? `${it.config.codigos?.length || 0} produtos` : it.tipo === "texto" ? it.config.texto : it.midia_path?.split("/").pop())}
                    </span>
                    <Input type="number" className="w-20 h-8" defaultValue={it.duracao_seg} min={3}
                      onBlur={(e) => atualizar(it.id, { duracao_seg: Math.max(3, Number(e.target.value) || 15) })} />
                    <span className="text-xs text-muted-foreground">s</span>
                    <Button size="sm" variant="outline" onClick={() => atualizar(it.id, { ativo: !it.ativo })}>{it.ativo ? "Pausar" : "Ativar"}</Button>
                    <Button size="icon" variant="ghost" onClick={() => mover(i, -1)} disabled={i === 0}><ArrowUp className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => mover(i, 1)} disabled={i === itens.length - 1}><ArrowDown className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remover(it)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ClientLayout>
  );
};

export default AdminTv;
