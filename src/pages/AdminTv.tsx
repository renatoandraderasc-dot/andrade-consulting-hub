import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Pause, Pencil, Play, Plus, RefreshCw, Search, Trash2, Tv, Upload, X } from "lucide-react";
import { TV_TIPOS, TvItem, TvTela, TvTipo, listarItens, listarTelas, tvDb, urlMidia } from "@/lib/tv";
import { CatalogoItem, carregarBaseCatalogo, normalizarCodigo } from "@/lib/catalogoProdutos";
import TvDimensoesForm from "@/components/TvDimensoesForm";

const fmt = (v: number | null) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const MAX_PRODUTOS = 30;

type Form = { id?: string; tipo: TvTipo; titulo: string; duracao: number; codigos: string[]; descricoes: Record<string, string>; texto: string; arquivo: File | null; midia_path: string | null };
const vazio = (): Form => ({ tipo: "precos", titulo: "", duracao: 30, codigos: [], descricoes: {}, texto: "", arquivo: null, midia_path: null });

const AdminTv = () => {
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [loja, setLoja] = useState("");
  const [telas, setTelas] = useState<TvTela[]>([]);
  const [tela, setTela] = useState("");
  const [itens, setItens] = useState<TvItem[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [novaTela, setNovaTela] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);
  const [carregandoCat, setCarregandoCat] = useState(false);
  const [busca, setBusca] = useState("");
  const [colar, setColar] = useState("");
  const [previaKey, setPreviaKey] = useState(0);

  const telaAtual = telas.find((t) => t.id === tela);
  const modulos = Math.max(1, (telaAtual?.colunas || 1) * (telaAtual?.linhas || 1));

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
  useEffect(() => { carregarTelas(); setCatalogo([]); }, [loja]);

  const carregarItens = async () => {
    if (!tela) { setItens([]); return; }
    const lista = await listarItens(tela);
    setItens(lista);
    const u: Record<string, string> = {};
    for (const it of lista) if (it.midia_path && it.tipo !== "video") u[it.id] = await urlMidia(it.midia_path, 3600);
    setThumbs(u);
  };
  useEffect(() => { carregarItens(); }, [tela]);

  const atualizarPrevia = () => setPreviaKey((k) => k + 1);

  const garantirCatalogo = async () => {
    if (catalogo.length || carregandoCat || !loja) return;
    setCarregandoCat(true);
    try { setCatalogo(await carregarBaseCatalogo(loja, { fresco: true })); }
    catch { toast.error("Não foi possível buscar os produtos da loja"); }
    finally { setCarregandoCat(false); }
  };

  const mapa = useMemo(() => new Map(catalogo.map((c) => [normalizarCodigo(c.codigo), c])), [catalogo]);
  const resultados = useMemo(() => {
    const q = busca.trim().toUpperCase();
    if (q.length < 2) return [];
    const termos = q.split(/\s+/);
    return catalogo.filter((c) => c.codigo === q || termos.every((t) => c.descricao.toUpperCase().includes(t))).slice(0, 40);
  }, [busca, catalogo]);

  const ativos = itens.filter((i) => i.ativo);
  const moduloDe = (it: TvItem) => { const p = ativos.findIndex((x) => x.id === it.id); return p < 0 ? null : (p % modulos) + 1; };
  const proximoModulo = (ativos.length % modulos) + 1;

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

  const abrirNovo = () => { setForm(vazio()); setBusca(""); setColar(""); };
  const abrirEdicao = (it: TvItem) => {
    setForm({ id: it.id, tipo: it.tipo, titulo: it.titulo || "", duracao: it.duracao_seg, codigos: it.config.codigos || [], descricoes: it.config.descricoes || {}, texto: it.config.texto || "", arquivo: null, midia_path: it.midia_path });
    setBusca(""); setColar("");
    if (it.tipo === "precos") garantirCatalogo();
  };
  useEffect(() => { if (form?.tipo === "precos") garantirCatalogo(); }, [form?.tipo]);

  const addCodigo = (c: string) => setForm((f) => {
    if (!f || f.codigos.some((x) => normalizarCodigo(x) === normalizarCodigo(c))) return f;
    if (f.codigos.length >= MAX_PRODUTOS) { toast.error(`Máximo de ${MAX_PRODUTOS} produtos por tabela`); return f; }
    return { ...f, codigos: [...f.codigos, c] };
  });
  const moverCodigo = (i: number, d: -1 | 1) => setForm((f) => {
    if (!f) return f; const c = [...f.codigos]; const j = i + d; if (j < 0 || j >= c.length) return f;
    [c[i], c[j]] = [c[j], c[i]]; return { ...f, codigos: c };
  });

  const salvar = async () => {
    if (!form || !tela) return;
    const precisaArquivo = (form.tipo === "foto" || form.tipo === "video") && !form.arquivo && !form.midia_path;
    if (precisaArquivo) return toast.error("Escolha o arquivo");
    if (form.tipo === "precos" && form.codigos.length === 0) return toast.error("Escolha ao menos um produto");
    setSalvando(true);
    try {
      let midia_path = form.midia_path;
      if (form.arquivo) {
        const ext = form.arquivo.name.split(".").pop();
        const novo = `${loja}/${tela}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("tv-midia").upload(novo, form.arquivo, { contentType: form.arquivo.type });
        if (error) throw error;
        if (midia_path) await supabase.storage.from("tv-midia").remove([midia_path]);
        midia_path = novo;
      }
      const dados = {
        tipo: form.tipo, titulo: form.titulo || null, midia_path, duracao_seg: form.duracao,
        config: form.tipo === "precos" ? { codigos: form.codigos, descricoes: Object.fromEntries(Object.entries(form.descricoes).filter(([k, v]) => v.trim() && form.codigos.some((c) => normalizarCodigo(c) === k))) } : form.tipo === "texto" ? { texto: form.texto } : {},
      };
      const { error } = form.id
        ? await tvDb.from("tv_itens").update(dados).eq("id", form.id)
        : await tvDb.from("tv_itens").insert({ ...dados, tela_id: tela, ordem: itens.length ? Math.max(...itens.map((i) => i.ordem)) + 1 : 0 });
      if (error) throw error;
      toast.success(form.id ? "Alterações salvas" : "Adicionado à programação");
      setForm(null);
      await carregarItens();
      atualizarPrevia();
    } catch {
      toast.error("Não foi possível salvar");
    } finally {
      setSalvando(false);
    }
  };

  const atualizar = async (id: string, campos: Partial<TvItem>) => {
    await tvDb.from("tv_itens").update(campos).eq("id", id);
    await carregarItens(); atualizarPrevia();
  };

  const mover = async (idx: number, dir: -1 | 1) => {
    const a = itens[idx], b = itens[idx + dir];
    if (!a || !b) return;
    await tvDb.from("tv_itens").update({ ordem: b.ordem }).eq("id", a.id);
    await tvDb.from("tv_itens").update({ ordem: a.ordem }).eq("id", b.id);
    await carregarItens(); atualizarPrevia();
  };

  const remover = async (it: TvItem) => {
    if (!confirm("Remover da programação?")) return;
    if (it.midia_path) await supabase.storage.from("tv-midia").remove([it.midia_path]);
    await tvDb.from("tv_itens").delete().eq("id", it.id);
    await carregarItens(); atualizarPrevia();
  };

  // Proporção do telão para a prévia
  const col = Math.max(1, telaAtual?.colunas || 1), lin = Math.max(1, telaAtual?.linhas || 1);
  const modW = telaAtual?.resolucao_largura || (telaAtual?.largura_m ? telaAtual.largura_m * 1000 : 16);
  const modH = telaAtual?.resolucao_altura || (telaAtual?.altura_m ? telaAtual.altura_m * 1000 : 9);
  const razao = (col * modW) / (lin * modH);
  const resumo = (it: TvItem) => it.titulo || (it.tipo === "precos" ? `${it.config.codigos?.length || 0} produtos` : it.tipo === "texto" ? it.config.texto : it.midia_path?.split("/").pop());

  return (
    <ClientLayout>
      <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
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

        {tela && telaAtual && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Pré-visualização ao vivo · {col} × {lin} {modulos > 1 ? "telas" : "tela"}</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={atualizarPrevia}><RefreshCw className="w-4 h-4 mr-1" />Atualizar prévia</Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/tv/${tela}`} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4 mr-1" />Abrir na TV</a>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative w-full mx-auto rounded-lg overflow-hidden border-4 border-foreground/80 bg-background shadow-lg" style={{ aspectRatio: String(razao), maxHeight: "60vh", maxWidth: `calc(60vh * ${razao})` }}>
                  <iframe key={previaKey} src={`/tv/${tela}`} title="Prévia da TV" className="absolute inset-0 w-full h-full pointer-events-none" />
                  {modulos > 1 && (
                    <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${col}, 1fr)`, gridTemplateRows: `repeat(${lin}, 1fr)` }}>
                      {Array.from({ length: modulos }).map((_, i) => (
                        <div key={i} className="border border-dashed border-primary/60 relative">
                          <span className="absolute top-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary text-primary-foreground">Tela {i + 1}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2 text-center">É exatamente o que aparece no telão. Os preços vêm do sistema da loja.</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Programação por tela</CardTitle>
                <Button onClick={abrirNovo}><Plus className="w-4 h-4 mr-1" />Adicionar {modulos > 1 && `(vai para a Tela ${proximoModulo})`}</Button>
              </CardHeader>
              <CardContent>
                {itens.length === 0 && <p className="text-sm text-muted-foreground">Nada programado ainda. Clique em Adicionar.</p>}
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(Math.max(modulos, 3), 4)}, minmax(0, 1fr))` }}>
                  {Array.from({ length: modulos }).map((_, m) => {
                    const doModulo = itens.filter((it) => moduloDe(it) === m + 1);
                    return (
                      <div key={m} className="rounded-lg border bg-muted/30 p-2 space-y-2 min-w-0">
                        {modulos > 1 && <div className="text-xs font-bold text-primary">Tela {m + 1}</div>}
                        {doModulo.length === 0 && <p className="text-xs text-muted-foreground">Vazia</p>}
                        {doModulo.map((it) => {
                          const i = itens.findIndex((x) => x.id === it.id);
                          return (
                            <div key={it.id} className="rounded-md border bg-card overflow-hidden">
                              <div className="h-24 bg-muted grid place-items-center overflow-hidden">
                                {thumbs[it.id] ? <img src={thumbs[it.id]} alt="" className="w-full h-full object-cover" /> : <span className="text-xs text-muted-foreground">{TV_TIPOS.find((t) => t.value === it.tipo)?.label}</span>}
                              </div>
                              <div className="p-2 space-y-1">
                                <div className="text-sm font-semibold truncate">{resumo(it)}</div>
                                <div className="text-[11px] text-muted-foreground">{TV_TIPOS.find((t) => t.value === it.tipo)?.label} · {it.duracao_seg}s</div>
                                <div className="flex flex-wrap gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => abrirEdicao(it)}><Pencil className="w-3.5 h-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Subir" onClick={() => mover(i, -1)} disabled={i === 0}><ArrowUp className="w-3.5 h-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Descer" onClick={() => mover(i, 1)} disabled={i === itens.length - 1}><ArrowDown className="w-3.5 h-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Pausar" onClick={() => atualizar(it.id, { ativo: false })}><Pause className="w-3.5 h-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Remover" onClick={() => remover(it)}><Trash2 className="w-3.5 h-3.5" /></Button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
                {itens.some((i) => !i.ativo) && (
                  <div className="mt-4 space-y-1">
                    <div className="text-xs font-semibold text-muted-foreground">Pausados</div>
                    {itens.filter((i) => !i.ativo).map((it) => (
                      <div key={it.id} className="flex items-center gap-2 text-sm border rounded-md p-2 opacity-70">
                        <span className="flex-1 truncate">{resumo(it)}</span>
                        <Button size="sm" variant="outline" onClick={() => atualizar(it.id, { ativo: true })}><Play className="w-3.5 h-3.5 mr-1" />Ativar</Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => remover(it)}><Trash2 className="w-3.5 h-3.5" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                {modulos > 1 && <p className="text-xs text-muted-foreground mt-3">A ordem define a tela: 1º item na Tela 1, 2º na Tela 2… Com mais itens que telas, eles se revezam na mesma tela.</p>}
              </CardContent>
            </Card>

            <TvDimensoesForm key={tela} tela={telaAtual} onSaved={() => { carregarTelas(); atualizarPrevia(); }} />
          </>
        )}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? "Editar item" : "Adicionar à programação"}</DialogTitle></DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="text-xs text-muted-foreground">Tipo</label>
                  <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TvTipo })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{TV_TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Título</label>
                  <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Bovinos" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Tempo na tela (segundos)</label>
                  <Input type="number" min={3} value={form.duracao} onChange={(e) => setForm({ ...form, duracao: Math.max(3, Number(e.target.value) || 15) })} />
                </div>
              </div>

              {(form.tipo === "foto" || form.tipo === "video" || form.tipo === "precos") && (
                <label className="flex items-center gap-2 border border-dashed rounded-md p-3 cursor-pointer hover:bg-muted/40">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">
                    {form.arquivo ? form.arquivo.name : form.midia_path ? "Arquivo atual mantido — clique para trocar"
                      : form.tipo === "precos" ? "Arte de fundo (opcional) — quadrada com 12 faixas, ex.: Bovinos"
                      : `Escolher ${form.tipo === "foto" ? "foto" : "vídeo (MP4)"}`}
                  </span>
                  <input type="file" className="hidden" accept={form.tipo === "video" ? "video/*" : "image/*"} onChange={(e) => setForm({ ...form, arquivo: e.target.files?.[0] || null })} />
                </label>
              )}
              {form.tipo === "precos" && form.midia_path && !form.arquivo && (
                <button className="text-xs text-destructive underline" onClick={() => setForm({ ...form, midia_path: null })}>Remover arte de fundo</button>
              )}

              {form.tipo === "texto" && (
                <div>
                  <label className="text-xs text-muted-foreground">Texto do aviso</label>
                  <Textarea rows={3} value={form.texto} onChange={(e) => setForm({ ...form, texto: e.target.value })} />
                </div>
              )}

              {form.tipo === "precos" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Buscar produto</div>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-2 top-3 text-muted-foreground" />
                      <Input className="pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={carregandoCat ? "Carregando produtos da loja..." : "Nome ou código (ex.: picanha)"} disabled={carregandoCat} />
                    </div>
                    <div className="border rounded-md max-h-72 overflow-y-auto divide-y">
                      {busca.trim().length >= 2 && resultados.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum produto encontrado.</p>}
                      {resultados.map((p) => (
                        <button key={p.codigo} className="w-full flex items-center gap-2 p-2 text-left hover:bg-muted/50 text-sm" onClick={() => addCodigo(p.codigo)}>
                          <span className="text-xs text-muted-foreground w-14 shrink-0">{p.codigo}</span>
                          <span className="flex-1 truncate">{p.descricao}</span>
                          <span className="font-semibold shrink-0">{fmt(p.preco)}</span>
                          <Plus className="w-4 h-4 text-primary shrink-0" />
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <Input value={colar} onChange={(e) => setColar(e.target.value)} placeholder="Ou cole códigos: 313, 309, 526" />
                      <Button variant="outline" onClick={() => { colar.split(/[\s,;]+/).filter(Boolean).forEach(addCodigo); setColar(""); }}>Incluir</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm font-semibold">Na tabela ({form.codigos.length}/{MAX_PRODUTOS}) — nesta ordem</div>
                    <div className="border rounded-md divide-y">
                      {form.codigos.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum produto escolhido.</p>}
                      {form.codigos.map((c, i) => {
                        const p = mapa.get(normalizarCodigo(c));
                        return (
                          <div key={c} className="flex items-center gap-1 p-1.5 text-sm">
                            <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-xs text-muted-foreground">{p ? p.descricao : <span className="text-destructive">Código {c} não encontrado</span>}</div>
                              <Input className="h-7 text-sm" placeholder="Descrição 2 (opcional)" value={form.descricoes[normalizarCodigo(c)] || ""} onChange={(e) => setForm({ ...form, descricoes: { ...form.descricoes, [normalizarCodigo(c)]: e.target.value } })} />
                            </div>
                            <span className="font-semibold shrink-0">{p ? fmt(p.precoOferta && p.preco && p.precoOferta < p.preco ? p.precoOferta : p.preco) : ""}</span>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moverCodigo(i, -1)} disabled={i === 0}><ArrowUp className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => moverCodigo(i, 1)} disabled={i === form.codigos.length - 1}><ArrowDown className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setForm({ ...form, codigos: form.codigos.filter((x) => x !== c) })}><X className="w-3.5 h-3.5" /></Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
};

export default AdminTv;
