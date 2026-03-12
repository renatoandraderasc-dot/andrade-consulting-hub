import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Search, TrendingUp, TrendingDown, Minus,
  ArrowUpCircle, ArrowDownCircle, Clock, Package, DollarSign, BarChart3
} from "lucide-react";

interface ConcorrenteInfo {
  id: string;
  nome: string;
  url: string;
  plataforma: string;
}

interface ProdutoConcorrente {
  id: string;
  nomeConcorrente: string;
  precoConcorrente: number;
  categoria: string;
  meuCodigo: string | null;
  meuProduto: string | null;
  meuPreco: number | null;
  diferenca: number | null;
  diferencaPct: number | null;
  status: "mais_barato" | "mais_caro" | "igual" | "sem_match";
  confianca: number;
  ultimaAtualizacao: string;
}

// Mock data for competitor products
const generateMockProdutos = (concorrenteId: string): ProdutoConcorrente[] => {
  const produtos: ProdutoConcorrente[] = [
    { id: "p1", nomeConcorrente: "Arroz Tipo 1 Camil 5kg", precoConcorrente: 26.49, categoria: "Mercearia", meuCodigo: "10012", meuProduto: "Arroz Tipo 1 Camil 5kg", meuPreco: 27.99, diferenca: -1.50, diferencaPct: -5.36, status: "mais_caro", confianca: 95, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p2", nomeConcorrente: "Feijão Carioca Kicaldo 1kg", precoConcorrente: 8.99, categoria: "Mercearia", meuCodigo: "10015", meuProduto: "Feijão Carioca Kicaldo 1kg", meuPreco: 8.99, diferenca: 0, diferencaPct: 0, status: "igual", confianca: 98, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p3", nomeConcorrente: "Coca-Cola Original 2L", precoConcorrente: 8.99, categoria: "Bebidas", meuCodigo: "20034", meuProduto: "Coca-Cola Original 2L", meuPreco: 8.49, diferenca: 0.50, diferencaPct: 5.89, status: "mais_barato", confianca: 100, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p4", nomeConcorrente: "Cerveja Brahma Duplo Malte Lata 350ml", precoConcorrente: 3.49, categoria: "Bebidas", meuCodigo: "20041", meuProduto: "Cerveja Brahma Duplo Malte 350ml", meuPreco: 3.99, diferenca: -0.50, diferencaPct: -12.53, status: "mais_caro", confianca: 92, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p5", nomeConcorrente: "Sabonete Dove Original 90g", precoConcorrente: 3.99, categoria: "Higiene", meuCodigo: "30021", meuProduto: "Sabonete Dove Original 90g", meuPreco: 4.29, diferenca: -0.30, diferencaPct: -6.99, status: "mais_caro", confianca: 88, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p6", nomeConcorrente: "Detergente Ypê Neutro 500ml", precoConcorrente: 2.79, categoria: "Limpeza", meuCodigo: "40018", meuProduto: "Detergente Ypê 500ml", meuPreco: 2.99, diferenca: -0.20, diferencaPct: -6.69, status: "mais_caro", confianca: 90, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p7", nomeConcorrente: "Presunto Cozido Sadia Fatiado kg", precoConcorrente: 28.49, categoria: "Frios", meuCodigo: "50009", meuProduto: "Presunto Cozido Sadia kg", meuPreco: 29.99, diferenca: -1.50, diferencaPct: -5.00, status: "mais_caro", confianca: 85, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p8", nomeConcorrente: "Picanha Bovina Resfriada kg", precoConcorrente: 62.90, categoria: "Açougue", meuCodigo: "60005", meuProduto: "Picanha Bovina kg", meuPreco: 59.99, diferenca: 2.91, diferencaPct: 4.85, status: "mais_barato", confianca: 78, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p9", nomeConcorrente: "Leite Integral Italac UHT 1L", precoConcorrente: 5.29, categoria: "Laticínios", meuCodigo: "90007", meuProduto: "Leite Integral Italac 1L", meuPreco: 5.49, diferenca: -0.20, diferencaPct: -3.64, status: "mais_caro", confianca: 96, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p10", nomeConcorrente: "Pizza Sadia Mussarela 440g", precoConcorrente: 12.49, categoria: "Congelados", meuCodigo: "11002", meuProduto: "Pizza Sadia Mussarela 440g", meuPreco: 13.99, diferenca: -1.50, diferencaPct: -10.72, status: "mais_caro", confianca: 91, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p11", nomeConcorrente: "Azeite Extra Virgem Gallo 500ml", precoConcorrente: 32.99, categoria: "Mercearia", meuCodigo: null, meuProduto: null, meuPreco: null, diferenca: null, diferencaPct: null, status: "sem_match", confianca: 0, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p12", nomeConcorrente: "Açúcar Cristal União 1kg", precoConcorrente: 5.49, categoria: "Mercearia", meuCodigo: "10029", meuProduto: "Açúcar Cristal União 1kg", meuPreco: 5.49, diferenca: 0, diferencaPct: 0, status: "igual", confianca: 97, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p13", nomeConcorrente: "Óleo de Soja Liza 900ml", precoConcorrente: 7.49, categoria: "Mercearia", meuCodigo: "10033", meuProduto: "Óleo de Soja Liza 900ml", meuPreco: 7.99, diferenca: -0.50, diferencaPct: -6.26, status: "mais_caro", confianca: 93, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p14", nomeConcorrente: "Suco Del Valle Uva Integral 1L", precoConcorrente: 6.49, categoria: "Bebidas", meuCodigo: "20055", meuProduto: "Suco Del Valle Uva 1L", meuPreco: 6.99, diferenca: -0.50, diferencaPct: -7.15, status: "mais_caro", confianca: 87, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p15", nomeConcorrente: "Queijo Mussarela Fatiado kg", precoConcorrente: 39.90, categoria: "Laticínios", meuCodigo: "90014", meuProduto: "Queijo Mussarela Fatiado kg", meuPreco: 42.99, diferenca: -3.09, diferencaPct: -7.19, status: "mais_caro", confianca: 80, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p16", nomeConcorrente: "Papel Higiênico Neve Folha Dupla 12un", precoConcorrente: 17.99, categoria: "Higiene", meuCodigo: "30038", meuProduto: "Papel Higiênico Neve 12 rolos", meuPreco: 18.99, diferenca: -1.00, diferencaPct: -5.27, status: "mais_caro", confianca: 95, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p17", nomeConcorrente: "Biscoito Maizena Vitarella 400g", precoConcorrente: 4.29, categoria: "Mercearia", meuCodigo: null, meuProduto: null, meuPreco: null, diferenca: null, diferencaPct: null, status: "sem_match", confianca: 0, ultimaAtualizacao: "2026-03-12 08:00" },
    { id: "p18", nomeConcorrente: "Água Sanitária Qboa 1L", precoConcorrente: 3.79, categoria: "Limpeza", meuCodigo: "40025", meuProduto: "Água Sanitária Qboa 1L", meuPreco: 3.99, diferenca: -0.20, diferencaPct: -5.01, status: "mais_caro", confianca: 94, ultimaAtualizacao: "2026-03-12 08:00" },
  ];
  return produtos;
};

interface Props {
  concorrente: ConcorrenteInfo;
  onBack: () => void;
}

const ConcorrenteAnalise = ({ concorrente, onBack }: Props) => {
  const produtos = useMemo(() => generateMockProdutos(concorrente.id), [concorrente.id]);
  const [search, setSearch] = useState("");
  const [categoriaFilter, setCategoriaFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sortBy, setSortBy] = useState<"nome" | "preco" | "diferenca">("nome");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const categorias = useMemo(() => [...new Set(produtos.map(p => p.categoria))].sort(), [produtos]);

  const filtered = useMemo(() => {
    let list = produtos.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.nomeConcorrente.toLowerCase().includes(q) && !(p.meuProduto?.toLowerCase().includes(q))) return false;
      }
      if (categoriaFilter !== "todos" && p.categoria !== categoriaFilter) return false;
      if (statusFilter !== "todos" && p.status !== statusFilter) return false;
      return true;
    });

    list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "nome") cmp = a.nomeConcorrente.localeCompare(b.nomeConcorrente);
      else if (sortBy === "preco") cmp = a.precoConcorrente - b.precoConcorrente;
      else if (sortBy === "diferenca") cmp = (a.diferencaPct ?? 0) - (b.diferencaPct ?? 0);
      return sortDir === "desc" ? -cmp : cmp;
    });

    return list;
  }, [produtos, search, categoriaFilter, statusFilter, sortBy, sortDir]);

  // KPIs - from MY store perspective
  const matched = produtos.filter(p => p.status !== "sem_match");
  const maisBaratos = produtos.filter(p => p.status === "mais_barato").length; // EU sou mais barato
  const maisCaros = produtos.filter(p => p.status === "mais_caro").length; // EU sou mais caro
  const iguais = produtos.filter(p => p.status === "igual").length;
  const semMatch = produtos.filter(p => p.status === "sem_match").length;
  const diffMedia = matched.length
    ? (matched.reduce((s, p) => s + (p.diferencaPct ?? 0), 0) / matched.length)
    : 0;

  // Find extremes
  const matchedOnly = produtos.filter(p => p.status !== "sem_match" && p.diferencaPct !== null);
  const maisCaro = matchedOnly.length ? matchedOnly.reduce((a, b) => (b.diferencaPct! > a.diferencaPct! ? b : a)) : null;
  const maisBarato = matchedOnly.length ? matchedOnly.reduce((a, b) => (b.diferencaPct! < a.diferencaPct! ? b : a)) : null;

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("asc"); }
  };

  const statusBadge = (s: ProdutoConcorrente["status"]) => {
    if (s === "mais_barato") return <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/20 gap-1 text-[11px]"><TrendingDown className="w-3 h-3" /> Eu Mais Barato</Badge>;
    if (s === "mais_caro") return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1 text-[11px]"><TrendingUp className="w-3 h-3" /> Eu Mais Caro</Badge>;
    if (s === "igual") return <Badge variant="outline" className="bg-muted text-muted-foreground border-border gap-1 text-[11px]"><Minus className="w-3 h-3" /> Igual</Badge>;
    return <Badge variant="outline" className="bg-amber-500/10 text-amber-700 border-amber-500/20 text-[11px]">Sem Match</Badge>;
  };

  const handleExportExcel = () => {
    const header = ["Produto Concorrente", "Preço Concorrente", "Categoria", "Meu Código", "Meu Produto", "Meu Preço", "Diferença R$", "Diferença %", "Status", "Confiança %", "Última Atualização"];
    const rows = filtered.map(p => [
      p.nomeConcorrente,
      p.precoConcorrente.toFixed(2),
      p.categoria,
      p.meuCodigo ?? "",
      p.meuProduto ?? "",
      p.meuPreco?.toFixed(2) ?? "",
      p.diferenca?.toFixed(2) ?? "",
      p.diferencaPct?.toFixed(1) ?? "",
      p.status === "mais_barato" ? "Concorrente Mais Barato" : p.status === "mais_caro" ? "Concorrente Mais Caro" : p.status === "igual" ? "Igual" : "Sem Match",
      p.confianca.toString(),
      p.ultimaAtualizacao,
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analise-${concorrente.nome.replace(/\s+/g, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo exportado com sucesso (compatível com Excel)");
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
          <p className="text-xs text-muted-foreground">{concorrente.url}</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span>Atualização automática diária às 08:00</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Total Produtos</p>
          <p className="text-2xl font-bold text-foreground">{produtos.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><ArrowDownCircle className="w-3 h-3 text-green-600" /> Eu Mais Barato</p>
          <p className="text-2xl font-bold text-green-600">{maisBaratos}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground flex items-center gap-1"><ArrowUpCircle className="w-3 h-3 text-destructive" /> Mais Caros</p>
          <p className="text-2xl font-bold text-destructive">{maisCaros}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Preço Igual</p>
          <p className="text-2xl font-bold text-muted-foreground">{iguais}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Sem Match</p>
          <p className="text-2xl font-bold text-amber-600">{semMatch}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Diferença Média</p>
          <p className={`text-2xl font-bold ${diffMedia > 0 ? "text-green-600" : diffMedia < 0 ? "text-destructive" : "text-muted-foreground"}`}>
            {diffMedia > 0 ? "+" : ""}{diffMedia.toFixed(1)}%
          </p>
        </CardContent></Card>
      </div>

      {/* Highlights */}
      {(maisCaro || maisBarato) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {maisBarato && (
            <Card className="border-green-500/30 bg-green-500/5">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="rounded-full bg-green-500/10 p-2">
                  <TrendingDown className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs font-medium text-green-700">Maior Vantagem do Concorrente</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{maisBarato.nomeConcorrente}</p>
                  <p className="text-xs text-muted-foreground">
                    Concorrente: R$ {maisBarato.precoConcorrente.toFixed(2)} • Meu: R$ {maisBarato.meuPreco?.toFixed(2)} • 
                    <span className="text-green-700 font-medium"> {maisBarato.diferencaPct?.toFixed(1)}% mais barato</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {maisCaro && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 flex items-start gap-3">
                <div className="rounded-full bg-destructive/10 p-2">
                  <TrendingUp className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs font-medium text-destructive">Maior Oportunidade (Concorrente Mais Caro)</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">{maisCaro.nomeConcorrente}</p>
                  <p className="text-xs text-muted-foreground">
                    Concorrente: R$ {maisCaro.precoConcorrente.toFixed(2)} • Meu: R$ {maisCaro.meuPreco?.toFixed(2)} • 
                    <span className="text-destructive font-medium"> {Math.abs(maisCaro.diferencaPct ?? 0).toFixed(1)}% mais caro</span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={categoriaFilter} onValueChange={setCategoriaFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas Categorias</SelectItem>
            {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos Status</SelectItem>
            <SelectItem value="mais_barato">Mais Barato</SelectItem>
            <SelectItem value="mais_caro">Mais Caro</SelectItem>
            <SelectItem value="igual">Igual</SelectItem>
            <SelectItem value="sem_match">Sem Match</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExportExcel}>
          <Download className="w-4 h-4 mr-1" /> Exportar Excel
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Produtos do Concorrente ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="cursor-pointer select-none" onClick={() => handleSort("nome")}>
                    Produto Concorrente {sortBy === "nome" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("preco")}>
                    Preço Conc. {sortBy === "preco" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead>Meu Produto</TableHead>
                  <TableHead className="text-right">Meu Preço</TableHead>
                  <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("diferenca")}>
                    Diferença {sortBy === "diferenca" && (sortDir === "asc" ? "↑" : "↓")}
                  </TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Match %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const isHighlightGreen = p === maisBarato;
                  const isHighlightRed = p === maisCaro;
                  return (
                    <TableRow
                      key={p.id}
                      className={
                        isHighlightGreen ? "bg-green-500/5" :
                        isHighlightRed ? "bg-destructive/5" : ""
                      }
                    >
                      <TableCell className="font-medium text-sm max-w-[220px]">
                        <div className="flex items-center gap-1.5">
                          {isHighlightGreen && <TrendingDown className="w-3.5 h-3.5 text-green-600 shrink-0" />}
                          {isHighlightRed && <TrendingUp className="w-3.5 h-3.5 text-destructive shrink-0" />}
                          {p.nomeConcorrente}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[11px]">{p.categoria}</Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums font-medium">
                        R$ {p.precoConcorrente.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {p.meuProduto || <span className="italic text-amber-600">Sem correspondência</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {p.meuPreco != null ? `R$ ${p.meuPreco.toFixed(2)}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {p.diferenca != null ? (
                          <span className={p.diferenca > 0 ? "text-green-600" : p.diferenca < 0 ? "text-destructive" : "text-muted-foreground"}>
                            {p.diferenca > 0 ? "+" : ""}{p.diferenca.toFixed(2)} ({p.diferencaPct! > 0 ? "+" : ""}{p.diferencaPct!.toFixed(1)}%)
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="text-center">{statusBadge(p.status)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {p.confianca > 0 ? (
                          <span className={p.confianca >= 90 ? "text-green-600" : p.confianca >= 70 ? "text-amber-600" : "text-destructive"}>
                            {p.confianca}%
                          </span>
                        ) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      Nenhum produto encontrado
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
            <p className="text-sm font-medium text-foreground">Atualização Automática Programada</p>
            <p className="text-xs text-muted-foreground">
              Os preços deste concorrente são atualizados automaticamente todos os dias às <strong>08:00</strong>.
              A última coleta foi realizada em <strong>{produtos[0]?.ultimaAtualizacao || "—"}</strong>.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConcorrenteAnalise;
