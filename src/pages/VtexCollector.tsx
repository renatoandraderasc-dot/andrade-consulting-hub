import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ClientLayout from "@/components/ClientLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Play, Loader2, Download, Search, Package, AlertTriangle,
  CheckCircle2, BarChart3, Filter, RefreshCw, Database
} from "lucide-react";

interface VtexProduct {
  id_produto: string;
  id_sku: string;
  nome_produto: string;
  nome_completo: string;
  slug: string;
  marca: string;
  cod_barras: string;
  referencia: string;
  departamento: string;
  categoria: string;
  subcategoria: string;
  mercadologico: string;
  arvore_completa: string;
  preco_regular: number;
  preco_promocional: number;
  preco_pix: number | null;
  seller: string;
  disponibilidade: boolean;
  unidade_venda: string;
  status_preco: "PROMO" | "REGULAR";
  imagem_url: string;
  data_hora_coleta: string;
}

interface CollectorLog {
  total_capturado: number;
  paginas_lidas: number;
  erros: { item: string; erro: string }[];
  itens_ignorados: number;
  duplicados_removidos: number;
  estrategia_usada: string[];
  tempo_execucao: string;
}

const formatBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const VtexCollector = () => {
  const [searchParams] = useSearchParams();
  const storeId = searchParams.get("store") || "";
  const [storeName, setStoreName] = useState("");

  const [products, setProducts] = useState<VtexProduct[]>([]);
  const [log, setLog] = useState<CollectorLog | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("todos");
  const [filterCat, setFilterCat] = useState("todos");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterMarca, setFilterMarca] = useState("todos");

  const departments = useMemo(() => [...new Set(products.map(p => p.departamento).filter(Boolean))].sort(), [products]);
  const categories = useMemo(() => {
    const filtered = filterDept !== "todos" ? products.filter(p => p.departamento === filterDept) : products;
    return [...new Set(filtered.map(p => p.categoria).filter(Boolean))].sort();
  }, [products, filterDept]);
  const brands = useMemo(() => [...new Set(products.map(p => p.marca).filter(Boolean))].sort(), [products]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !p.nome_produto.toLowerCase().includes(q) &&
          !p.nome_completo.toLowerCase().includes(q) &&
          !p.cod_barras.includes(q) &&
          !p.referencia.toLowerCase().includes(q) &&
          !p.marca.toLowerCase().includes(q) &&
          !p.id_sku.includes(q)
        ) return false;
      }
      if (filterDept !== "todos" && p.departamento !== filterDept) return false;
      if (filterCat !== "todos" && p.categoria !== filterCat) return false;
      if (filterStatus !== "todos" && p.status_preco !== filterStatus) return false;
      if (filterMarca !== "todos" && p.marca !== filterMarca) return false;
      return true;
    });
  }, [products, search, filterDept, filterCat, filterStatus, filterMarca]);

  const stats = useMemo(() => {
    const promos = products.filter(p => p.status_preco === "PROMO").length;
    const withEan = products.filter(p => p.cod_barras).length;
    const avgPrice = products.length ? products.reduce((s, p) => s + p.preco_promocional, 0) / products.length : 0;
    return { total: products.length, promos, withEan, avgPrice, departments: departments.length, brands: brands.length };
  }, [products, departments, brands]);

  const handleCollect = async (mode: "full" | "incremental" = "full") => {
    setLoading(true);
    toast.info(`Iniciando coleta ${mode === "full" ? "completa" : "incremental"}... Aguarde, pode levar alguns minutos.`);

    try {
      const { data, error } = await supabase.functions.invoke("vtex-collector", {
        body: { mode, url: "https://www.santoantonioemcasa.com.br" },
      });

      if (error) {
        toast.error(`Erro: ${error.message}`);
        return;
      }

      if (data?.success && data.data) {
        setProducts(data.data.products);
        setLog(data.data.log);
        toast.success(`Coleta finalizada! ${data.data.log.total_capturado} SKUs capturados em ${data.data.log.tempo_execucao}`);
      } else {
        if (data?.data?.log) setLog(data.data.log);
        toast.error(data?.error || "Erro desconhecido na coleta");
      }
    } catch (err) {
      toast.error("Falha na comunicação com o servidor");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = (format: "csv" | "xlsx") => {
    const data = filtered.length > 0 ? filtered : products;
    if (data.length === 0) { toast.error("Nenhum produto para exportar"); return; }

    const header = [
      "ID Produto", "ID SKU", "Nome Produto", "Nome Completo", "Link",
      "Marca", "EAN", "Referência", "Departamento", "Categoria",
      "Subcategoria", "Mercadológico", "Árvore Completa",
      "Preço Regular", "Preço Promocional", "Preço Pix", "Seller",
      "Disponível", "Unidade", "Status Preço", "Data Coleta"
    ];
    const rows = data.map(p => [
      p.id_produto, p.id_sku, p.nome_produto, p.nome_completo, p.slug,
      p.marca, p.cod_barras, p.referencia, p.departamento, p.categoria,
      p.subcategoria, p.mercadologico, p.arvore_completa,
      p.preco_regular.toFixed(2), p.preco_promocional.toFixed(2),
      p.preco_pix?.toFixed(2) ?? "", p.seller,
      p.disponibilidade ? "Sim" : "Não", p.unidade_venda, p.status_preco,
      p.data_hora_coleta
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vtex-santo-antonio-${new Date().toISOString().slice(0, 10)}.${format === "csv" ? "csv" : "csv"}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${data.length} produtos exportados em ${format.toUpperCase()}`);
  };

  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Database className="w-6 h-6 text-primary" />
              Coletor VTEX – Santo Antônio em Casa
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Extração completa do catálogo com paginação automática e deduplicação
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => handleCollect("full")} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {loading ? "Coletando..." : "Coleta Completa"}
            </Button>
            <Button variant="outline" onClick={() => handleCollect("incremental")} disabled={loading} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Incremental
            </Button>
          </div>
        </div>

        {loading && (
          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                Varrendo catálogo VTEX... Estratégias: Search API → Categorias → Marcas → Sitemap
              </div>
              <Progress value={33} className="h-2" />
            </CardContent>
          </Card>
        )}

        {/* KPIs */}
        {products.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <Card><CardContent className="p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Total SKUs</p>
              <p className="text-xl font-bold text-foreground">{stats.total.toLocaleString("pt-BR")}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Em Promoção</p>
              <p className="text-xl font-bold text-amber-600">{stats.promos.toLocaleString("pt-BR")}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Com EAN</p>
              <p className="text-xl font-bold text-green-600">{stats.withEan.toLocaleString("pt-BR")}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Preço Médio</p>
              <p className="text-xl font-bold text-primary">{formatBRL(stats.avgPrice)}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Departamentos</p>
              <p className="text-xl font-bold text-foreground">{stats.departments}</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Marcas</p>
              <p className="text-xl font-bold text-foreground">{stats.brands}</p>
            </CardContent></Card>
          </div>
        )}

        <Tabs defaultValue="produtos" className="space-y-4">
          <TabsList>
            <TabsTrigger value="produtos" className="gap-1.5"><Package className="w-4 h-4" /> Produtos ({filtered.length})</TabsTrigger>
            <TabsTrigger value="log" className="gap-1.5"><BarChart3 className="w-4 h-4" /> Log de Execução</TabsTrigger>
            <TabsTrigger value="erros" className="gap-1.5"><AlertTriangle className="w-4 h-4" /> Erros {log && log.erros.length > 0 ? `(${log.erros.length})` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="produtos" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar por nome, EAN, SKU, marca, referência..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterDept} onValueChange={v => { setFilterDept(v); setFilterCat("todos"); }}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Departamento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos Depts.</SelectItem>
                  {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCat} onValueChange={setFilterCat}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas Categorias</SelectItem>
                  {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterMarca} onValueChange={setFilterMarca}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Marca" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas Marcas</SelectItem>
                  {brands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Preço" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="PROMO">Promoção</SelectItem>
                  <SelectItem value="REGULAR">Regular</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => handleExport("csv")} disabled={products.length === 0}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleExport("xlsx")} disabled={products.length === 0}>
                <Download className="w-4 h-4 mr-1" /> XLSX
              </Button>
            </div>

            {/* Products Table */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40 sticky top-0 z-10">
                        <TableHead className="w-[50px]">#</TableHead>
                        <TableHead className="w-[70px]">Img</TableHead>
                        <TableHead className="min-w-[250px]">Produto</TableHead>
                        <TableHead className="w-[120px]">EAN</TableHead>
                        <TableHead className="w-[80px]">SKU</TableHead>
                        <TableHead className="w-[120px]">Marca</TableHead>
                        <TableHead className="min-w-[200px]">Mercadológico</TableHead>
                        <TableHead className="w-[100px] text-right">Preço Regular</TableHead>
                        <TableHead className="w-[100px] text-right">Preço Promo</TableHead>
                        <TableHead className="w-[90px] text-right">Pix</TableHead>
                        <TableHead className="w-[70px] text-center">Status</TableHead>
                        <TableHead className="w-[60px] text-center">Disp.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.slice(0, 500).map((p, i) => (
                        <TableRow key={`${p.id_sku}-${i}`} className="text-xs">
                          <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                          <TableCell>
                            {p.imagem_url ? (
                              <img src={p.imagem_url} alt="" className="w-10 h-10 object-contain rounded" loading="lazy" />
                            ) : (
                              <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                                <Package className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <a href={p.slug} target="_blank" rel="noreferrer" className="font-medium text-foreground hover:text-primary transition-colors line-clamp-2">
                              {p.nome_produto}
                            </a>
                            {p.referencia && <span className="text-[10px] text-muted-foreground block">Ref: {p.referencia}</span>}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{p.cod_barras || "—"}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">{p.id_sku}</TableCell>
                          <TableCell className="text-muted-foreground">{p.marca || "—"}</TableCell>
                          <TableCell className="text-muted-foreground">
                            <span className="line-clamp-2">{p.mercadologico || "—"}</span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{formatBRL(p.preco_regular)}</TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {p.status_preco === "PROMO" ? (
                              <span className="text-green-600">{formatBRL(p.preco_promocional)}</span>
                            ) : formatBRL(p.preco_promocional)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {p.preco_pix ? formatBRL(p.preco_pix) : "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={p.status_preco === "PROMO" ? "default" : "secondary"} className="text-[10px]">
                              {p.status_preco}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {p.disponibilidade ? (
                              <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                            ) : (
                              <AlertTriangle className="w-4 h-4 text-destructive mx-auto" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {filtered.length === 0 && products.length > 0 && (
                        <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">Nenhum produto encontrado com os filtros atuais</TableCell></TableRow>
                      )}
                      {products.length === 0 && (
                        <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-12">
                          Clique em "Coleta Completa" para iniciar a extração do catálogo
                        </TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filtered.length > 500 && (
                  <div className="p-3 text-center text-xs text-muted-foreground border-t border-border">
                    Mostrando 500 de {filtered.length.toLocaleString("pt-BR")} produtos. Exporte em CSV para ver todos.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="log" className="space-y-4">
            {log ? (
              <Card>
                <CardHeader><CardTitle className="text-base">Log de Execução</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><span className="text-muted-foreground">Total capturado:</span> <strong>{log.total_capturado.toLocaleString("pt-BR")}</strong></div>
                    <div><span className="text-muted-foreground">Páginas lidas:</span> <strong>{log.paginas_lidas}</strong></div>
                    <div><span className="text-muted-foreground">Erros:</span> <strong className="text-destructive">{log.erros.length}</strong></div>
                    <div><span className="text-muted-foreground">Ignorados (dupl.):</span> <strong>{log.itens_ignorados + log.duplicados_removidos}</strong></div>
                    <div><span className="text-muted-foreground">Tempo:</span> <strong>{log.tempo_execucao}</strong></div>
                    <div className="col-span-2 md:col-span-3">
                      <span className="text-muted-foreground">Estratégias: </span>
                      {log.estrategia_usada.map(s => (
                        <Badge key={s} variant="secondary" className="mr-1 text-[11px]">{s}</Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">Execute uma coleta para ver os logs</CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="erros" className="space-y-4">
            {log && log.erros.length > 0 ? (
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-destructive" /> Erros na Coleta ({log.erros.length})</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead>#</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Erro</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {log.erros.map((e, i) => (
                          <TableRow key={i} className="text-xs">
                            <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                            <TableCell className="font-medium">{e.item}</TableCell>
                            <TableCell className="text-destructive">{e.erro}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                {log ? "Nenhum erro registrado na última coleta ✓" : "Execute uma coleta para ver os erros"}
              </CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
};

export default VtexCollector;
