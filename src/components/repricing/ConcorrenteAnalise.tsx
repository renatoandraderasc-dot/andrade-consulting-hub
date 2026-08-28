import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { cabecalhoCsv, nomeArquivo as nomeArquivoMarca } from "@/lib/exportBranding";
import {
  ArrowLeft, Download, Search, TrendingUp, TrendingDown, Minus,
  ArrowUpCircle, ArrowDownCircle, Clock, Package, Tag, Barcode, Image as ImageIcon
} from "lucide-react";
import { type ScrapedProduct } from "@/lib/api/firecrawl";

interface ConcorrenteInfo {
  id: string;
  nome: string;
  url: string;
  plataforma: string;
}

interface Props {
  concorrente: ConcorrenteInfo;
  scrapedProducts?: ScrapedProduct[];
  onBack: () => void;
}

const ConcorrenteAnalise = ({ concorrente, scrapedProducts = [], onBack }: Props) => {
  const [search, setSearch] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("todos");
  const [promoFilter, setPromoFilter] = useState("todos");
  const [sortBy, setSortBy] = useState<"nome" | "preco" | "categoria">("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const categorias = useMemo(() => {
    const cats = [...new Set(scrapedProducts.map(p => p.category).filter(Boolean))] as string[];
    return cats.sort();
  }, [scrapedProducts]);

  const filtered = useMemo(() => {
    let list = scrapedProducts.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !(p.brand?.toLowerCase().includes(q)) && !(p.barcode?.includes(q)) && !(p.sku?.includes(q))) return false;
      }
      if (categoriaFilter !== "todos" && p.category !== categoriaFilter) return false;
      if (promoFilter === "promo" && !p.isPromotion) return false;
      if (promoFilter === "normal" && p.isPromotion) return false;
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "nome") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "preco") cmp = a.price - b.price;
      else if (sortBy === "categoria") cmp = (a.category || 'zzz').localeCompare(b.category || 'zzz');
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [scrapedProducts, search, categoriaFilter, promoFilter, sortBy, sortDir]);

  // KPIs
  const totalProducts = scrapedProducts.length;
  const promoCount = scrapedProducts.filter(p => p.isPromotion).length;
  const withBarcode = scrapedProducts.filter(p => p.barcode).length;
  const withBrand = scrapedProducts.filter(p => p.brand).length;
  const avgPrice = totalProducts > 0
    ? scrapedProducts.reduce((s, p) => s + p.price, 0) / totalProducts
    : 0;
  const minPrice = totalProducts > 0 ? Math.min(...scrapedProducts.map(p => p.price)) : 0;
  const maxPrice = totalProducts > 0 ? Math.max(...scrapedProducts.map(p => p.price)) : 0;

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const handleExport = () => {
    const header = ["Produto", "Preço", "Preço Original", "Em Promoção", "Categoria", "Marca", "Unidade", "Cód. Barras", "SKU", "URL Origem"];
    const rows = filtered.map(p => [
      p.name,
      p.price.toFixed(2),
      p.originalPrice?.toFixed(2) ?? "",
      p.isPromotion ? "Sim" : "Não",
      p.category ?? "",
      p.brand ?? "",
      p.unit ?? "",
      p.barcode ?? "",
      p.sku ?? "",
      p.sourceUrl,
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const titulo = `Produtos - ${concorrente.nome}`;
    const blob = new Blob(["\uFEFF" + cabecalhoCsv(titulo) + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivoMarca(titulo, "csv");
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo exportado com sucesso");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-foreground">{concorrente.nome}</h2>
          <p className="text-xs text-muted-foreground">{concorrente.url} • {totalProducts} produtos coletados</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Produtos</p>
          <p className="text-2xl font-bold text-foreground">{totalProducts}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><Tag className="w-3 h-3 text-green-600" /> Em Promoção</p>
          <p className="text-2xl font-bold text-green-600">{promoCount}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Com Cód. Barras</p>
          <p className="text-2xl font-bold text-foreground">{withBarcode}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Com Marca</p>
          <p className="text-2xl font-bold text-foreground">{withBrand}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Preço Médio</p>
          <p className="text-2xl font-bold text-primary">R$ {avgPrice.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Menor Preço</p>
          <p className="text-2xl font-bold text-green-600">R$ {minPrice.toFixed(2)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Maior Preço</p>
          <p className="text-2xl font-bold text-destructive">R$ {maxPrice.toFixed(2)}</p>
        </CardContent></Card>
      </div>

      {/* Categorias breakdown */}
      {categorias.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Categorias Encontradas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {categorias.map(cat => {
                const count = scrapedProducts.filter(p => p.category === cat).length;
                return (
                  <Badge key={cat} variant="secondary" className="text-xs cursor-pointer hover:bg-primary/20"
                    onClick={() => setCategoriaFilter(cat === categoriaFilter ? "todos" : cat)}>
                    {cat} ({count})
                  </Badge>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por nome, marca, código de barras ou SKU..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas Categorias</SelectItem>
            {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={promoFilter} onValueChange={setPromoFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="promo">Em Promoção</SelectItem>
            <SelectItem value="normal">Preço Normal</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="w-4 h-4 mr-1" /> Exportar
        </Button>
      </div>

      {/* Products Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="w-4 h-4" />
            Produtos do Concorrente ({filtered.length} de {totalProducts})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead className="cursor-pointer select-none min-w-[220px]" onClick={() => handleSort("nome")}>
                    Produto {sortBy === "nome" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("categoria")}>
                    Categoria {sortBy === "categoria" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Unidade</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("preco")}>
                    Preço {sortBy === "preco" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead className="text-right">Preço Original</TableHead>
                  <TableHead className="text-center">Promoção</TableHead>
                  <TableHead>Cód. Barras</TableHead>
                  <TableHead>SKU</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p, idx) => (
                  <TableRow key={idx} className={p.isPromotion ? "bg-green-500/5" : ""}>
                    <TableCell className="p-1">
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.name} className="w-8 h-8 object-contain rounded" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                          <ImageIcon className="w-3 h-3 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm max-w-[280px]">
                      <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors" title={p.sourceUrl}>
                        {p.name}
                      </a>
                    </TableCell>
                    <TableCell>
                      {p.category ? (
                        <Badge variant="secondary" className="text-[11px]">{p.category}</Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{p.brand || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-sm">{p.unit || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-semibold">
                      R$ {p.price.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {p.originalPrice ? (
                        <span className="line-through text-muted-foreground">R$ {p.originalPrice.toFixed(2)}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {p.isPromotion ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20 text-[11px] gap-1">
                          <Tag className="w-3 h-3" /> Promo
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {p.barcode || "—"}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {p.sku || "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      {totalProducts === 0
                        ? "Nenhum produto coletado ainda. Clique no botão ▶ para iniciar a coleta."
                        : "Nenhum produto encontrado com os filtros aplicados"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Schedule info */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Coleta Completa</p>
            <p className="text-xs text-muted-foreground">
              O sistema visita <strong>todas as páginas</strong> do site do concorrente, incluindo departamentos, categorias e páginas de produto individuais.
              Informações como <strong>promoção, código de barras, SKU, marca e unidade</strong> são extraídas automaticamente quando disponíveis.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConcorrenteAnalise;
