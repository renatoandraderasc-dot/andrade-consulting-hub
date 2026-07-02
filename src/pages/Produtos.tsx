import { useState, useEffect, useRef, ChangeEvent } from "react";
import ClientLayout from "@/components/ClientLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import Papa from "papaparse";
import { Upload, Search, ImageIcon, Loader2, Pencil, Check, X, Camera } from "lucide-react";
import { parseBRNumber, formatBRL } from "@/lib/formatters";
import { Produto } from "@/lib/encarteTypes";

const PAGE_SIZE = 25;

const Produtos = () => {
  const [rows, setRows] = useState<Produto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [secaoFilter, setSecaoFilter] = useState<string>("__all__");
  const [secoes, setSecoes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Record<string, Partial<Produto>>>({});
  const [importOpen, setImportOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [csvAll, setCsvAll] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [bulkFetching, setBulkFetching] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("produtos").select("*", { count: "exact" });
    if (search.trim()) {
      const s = search.trim();
      q = q.or(`descricao.ilike.%${s}%,codigo_interno.ilike.%${s}%,ean.ilike.%${s}%`);
    }
    if (secaoFilter !== "__all__") q = q.eq("secao", secaoFilter);
    q = q.order("descricao").range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    const { data, count, error } = await q;
    if (error) toast.error(error.message);
    setRows((data as Produto[]) || []);
    setTotal(count || 0);
    setLoading(false);
  };

  const loadSecoes = async () => {
    const { data } = await supabase.from("produtos").select("secao").not("secao", "is", null).limit(1000);
    const uniq = Array.from(new Set(((data || []) as any[]).map((r) => r.secao).filter(Boolean))).sort();
    setSecoes(uniq);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [page, search, secaoFilter]);
  useEffect(() => { loadSecoes(); }, []);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    Papa.parse(file, {
      header: true,
      delimiter: ";",
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (result) => {
        setCsvAll(result.data as any[]);
        setCsvPreview((result.data as any[]).slice(0, 5));
        setImportOpen(true);
      },
      error: (err) => toast.error("Erro no CSV: " + err.message),
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const confirmImport = async () => {
    setImporting(true);
    const mapped = csvAll.map((r) => ({
      codigo_interno: (r.codigo_interno || "").toString().trim() || null,
      ean: (r.ean || "").toString().trim() || null,
      descricao: (r.descricao || "").toString().trim(),
      secao: (r.secao || "").toString().trim() || null,
      categoria: (r.categoria || "").toString().trim() || null,
      subcategoria: (r.subcategoria || "").toString().trim() || null,
      unidade: (r.unidade || "un").toString().trim() || "un",
      preco_regular: parseBRNumber(r.preco_regular || ""),
    })).filter((r) => r.descricao);

    let ok = 0, fail = 0;
    for (let i = 0; i < mapped.length; i += 500) {
      const batch = mapped.slice(i, i + 500);
      const { error } = await supabase.from("produtos").upsert(batch, { onConflict: "codigo_interno", ignoreDuplicates: false });
      if (error) { fail += batch.length; console.error(error); } else ok += batch.length;
    }
    setImporting(false);
    setImportOpen(false);
    setCsvAll([]); setCsvPreview([]);
    toast.success(`Importados: ${ok}${fail ? ` · Falhas: ${fail}` : ""}`);
    load(); loadSecoes();
  };

  const fetchImageByEAN = async (produto: Produto) => {
    if (!produto.ean) { toast.error("Produto sem EAN"); return; }
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${produto.ean}.json`);
      const j = await r.json();
      const url = j?.product?.image_front_url;
      if (!url) { toast.warning("Nenhuma foto encontrada para esse EAN"); return; }
      await supabase.from("produtos").update({ imagem_url: url }).eq("id", produto.id);
      toast.success("Foto atualizada");
      load();
    } catch (e: any) { toast.error("Falha na busca: " + e.message); }
  };

  const bulkFetch = async () => {
    const { data } = await supabase.from("produtos").select("*").is("imagem_url", null).not("ean", "is", null).limit(1000);
    const items = (data || []) as Produto[];
    if (!items.length) { toast.info("Todos os produtos com EAN já têm imagem"); return; }
    setBulkFetching(true);
    setBulkProgress({ done: 0, total: items.length });
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      try {
        const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${p.ean}.json`);
        const j = await r.json();
        const url = j?.product?.image_front_url;
        if (url) await supabase.from("produtos").update({ imagem_url: url }).eq("id", p.id);
      } catch { /* ignore */ }
      setBulkProgress({ done: i + 1, total: items.length });
      await new Promise((res) => setTimeout(res, 500));
    }
    setBulkFetching(false);
    toast.success("Busca em massa concluída");
    load();
  };

  const uploadFoto = async (produto: Produto, file: File) => {
    const path = `produtos/${produto.id}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("imagens").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data } = await supabase.storage.from("imagens").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    if (data?.signedUrl) {
      await supabase.from("produtos").update({ imagem_url: data.signedUrl }).eq("id", produto.id);
      toast.success("Foto enviada");
      load();
    }
  };

  const saveEdit = async (id: string) => {
    const patch = editing[id];
    if (!patch) return;
    const { error } = await supabase.from("produtos").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Salvo"); setEditing((s) => { const n = { ...s }; delete n[id]; return n; }); load(); }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ClientLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div>
            <h1 className="text-2xl font-bold">Produtos</h1>
            <p className="text-sm text-muted-foreground">Base de produtos para uso no Gerador de Encartes</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleFile} />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload className="w-4 h-4 mr-2" /> Importar CSV
            </Button>
            <Button variant="outline" onClick={bulkFetch} disabled={bulkFetching}>
              {bulkFetching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-2" />}
              {bulkFetching ? `Buscando ${bulkProgress.done}/${bulkProgress.total}` : "Buscar fotos (em massa)"}
            </Button>
          </div>
        </div>

        <Card className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por descrição, código ou EAN..." value={search} onChange={(e) => { setPage(0); setSearch(e.target.value); }} />
            </div>
            <Select value={secaoFilter} onValueChange={(v) => { setPage(0); setSecaoFilter(v); }}>
              <SelectTrigger className="w-full md:w-64"><SelectValue placeholder="Filtrar por seção" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as seções</SelectItem>
                {secoes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 w-16">Foto</th>
                <th className="p-3">Código</th>
                <th className="p-3">EAN</th>
                <th className="p-3">Descrição</th>
                <th className="p-3">Seção</th>
                <th className="p-3">Un.</th>
                <th className="p-3">Preço</th>
                <th className="p-3 w-40">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Carregando...</td></tr>}
              {!loading && rows.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nenhum produto</td></tr>}
              {rows.map((p) => {
                const e = editing[p.id];
                const isEditing = !!e;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">
                      {p.imagem_url ? <img src={p.imagem_url} alt="" className="w-12 h-12 object-contain rounded bg-white" /> : <div className="w-12 h-12 bg-muted rounded" />}
                    </td>
                    <td className="p-3">{p.codigo_interno}</td>
                    <td className="p-3 text-xs">{p.ean}</td>
                    <td className="p-3">
                      {isEditing ? (
                        <Input value={e.descricao ?? p.descricao} onChange={(ev) => setEditing((s) => ({ ...s, [p.id]: { ...s[p.id], descricao: ev.target.value } }))} />
                      ) : p.descricao}
                    </td>
                    <td className="p-3">{p.secao}</td>
                    <td className="p-3">
                      {isEditing ? (
                        <Input className="w-20" value={e.unidade ?? p.unidade} onChange={(ev) => setEditing((s) => ({ ...s, [p.id]: { ...s[p.id], unidade: ev.target.value } }))} />
                      ) : p.unidade}
                    </td>
                    <td className="p-3">
                      {isEditing ? (
                        <Input className="w-28" type="number" step="0.01" defaultValue={p.preco_regular ?? ""} onChange={(ev) => setEditing((s) => ({ ...s, [p.id]: { ...s[p.id], preco_regular: ev.target.value ? Number(ev.target.value) : null } }))} />
                      ) : formatBRL(p.preco_regular)}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        {isEditing ? (
                          <>
                            <Button size="icon" variant="ghost" onClick={() => saveEdit(p.id)}><Check className="w-4 h-4 text-green-600" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => setEditing((s) => { const n = { ...s }; delete n[p.id]; return n; })}><X className="w-4 h-4" /></Button>
                          </>
                        ) : (
                          <>
                            <Button size="icon" variant="ghost" title="Editar" onClick={() => setEditing((s) => ({ ...s, [p.id]: {} }))}><Pencil className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" title="Buscar foto por EAN" onClick={() => fetchImageByEAN(p)}><ImageIcon className="w-4 h-4" /></Button>
                            <label className="cursor-pointer">
                              <Button size="icon" variant="ghost" title="Upload foto" asChild><span><Camera className="w-4 h-4" /></span></Button>
                              <input hidden type="file" accept="image/*" onChange={(ev) => ev.target.files?.[0] && uploadFoto(p, ev.target.files[0])} />
                            </label>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between p-3 border-t text-sm">
            <div className="text-muted-foreground">Total: {total.toLocaleString("pt-BR")}</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span>Página {page + 1} de {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        </Card>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Preview da importação ({csvAll.length} linhas)</DialogTitle></DialogHeader>
          <div className="overflow-auto max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-muted"><tr>{csvPreview[0] && Object.keys(csvPreview[0]).map((k) => <th key={k} className="p-2 text-left">{k}</th>)}</tr></thead>
              <tbody>
                {csvPreview.map((r, i) => (
                  <tr key={i} className="border-t">{Object.values(r).map((v, j) => <td key={j} className="p-2">{String(v)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button>
            <Button onClick={confirmImport} disabled={importing}>
              {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar importação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientLayout>
  );
};

export default Produtos;
