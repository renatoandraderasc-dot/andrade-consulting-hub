import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUp, ArrowDown, Minus, Search, Download, ChevronUp, ChevronDown } from "lucide-react";
import * as XLSX from "xlsx";
import type { RepricingRow } from "./repricingTypes";

interface Props {
  rows: RepricingRow[];
}

const fmt = (v: number) => `R$ ${v.toFixed(2)}`;

const statusConfig = {
  acima: { label: "ACIMA", icon: ArrowUp, className: "bg-destructive/10 text-destructive border-destructive/20" },
  abaixo: { label: "ABAIXO", icon: ArrowDown, className: "bg-green-500/10 text-green-700 border-green-500/20" },
  igual: { label: "IGUAL", icon: Minus, className: "bg-muted text-muted-foreground border-border" },
};

type SortKey = "descricao" | "precoAtual" | "diferenca" | "novaMargem" | "status";

const RepricingResultTable = ({ rows }: Props) => {
  const [search, setSearch] = useState("");
  const [mercFilter, setMercFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [margemFilter, setMargemFilter] = useState("todos");
  const [sortKey, setSortKey] = useState<SortKey>("diferenca");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const perPage = 15;

  const mercadologicos = [...new Set(rows.map(r => r.mercadologico))].sort();

  const filtered = rows.filter(r => {
    if (search) {
      const q = search.toLowerCase();
      if (!r.descricao.toLowerCase().includes(q) && !r.ean.includes(q)) return false;
    }
    if (mercFilter !== "todos" && r.mercadologico !== mercFilter) return false;
    if (statusFilter !== "todos" && r.status !== statusFilter) return false;
    if (margemFilter !== "todos") {
      const [min, max] = margemFilter === "50+" ? [50, Infinity] : margemFilter.split("-").map(Number);
      if (r.novaMargem < min || r.novaMargem >= (max === Infinity ? Infinity : max)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "descricao") cmp = a.descricao.localeCompare(b.descricao);
    else if (sortKey === "precoAtual") cmp = a.precoAtual - b.precoAtual;
    else if (sortKey === "diferenca") cmp = a.diferenca - b.diferenca;
    else if (sortKey === "novaMargem") cmp = a.novaMargem - b.novaMargem;
    else cmp = a.status.localeCompare(b.status);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / perPage);
  const paged = sorted.slice(page * perPage, (page + 1) * perPage);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  // KPIs
  const total = filtered.length;
  const acima = filtered.filter(r => r.status === "acima").length;
  const abaixo = filtered.filter(r => r.status === "abaixo").length;
  const igual = filtered.filter(r => r.status === "igual").length;

  const handleExport = () => {
    const data = filtered.map(r => ({
      Produto: r.descricao,
      EAN: r.ean,
      Mercadológico: r.mercadologico,
      Custo: r.custo,
      "Preço Atual": r.precoAtual,
      Concorrente: r.precoConcorrente,
      Diferença: r.diferenca,
      Status: r.status.toUpperCase(),
      "Novo Preço": r.novoPreco,
      "Nova Margem %": r.novaMargem.toFixed(1),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Repricing");
    XLSX.writeFile(wb, `repricing-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Cruzados", value: total, color: "text-primary" },
          { label: "Acima", value: acima, color: "text-destructive" },
          { label: "Abaixo", value: abaixo, color: "text-green-600" },
          { label: "Igual", value: igual, color: "text-muted-foreground" },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-lg p-3">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar por produto ou EAN..." value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
        </div>
        <Select value={mercFilter} onValueChange={v => { setMercFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Mercadológico" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {mercadologicos.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            <SelectItem value="acima">Acima</SelectItem>
            <SelectItem value="abaixo">Abaixo</SelectItem>
            <SelectItem value="igual">Igual</SelectItem>
          </SelectContent>
        </Select>
        <Select value={margemFilter} onValueChange={v => { setMargemFilter(v); setPage(0); }}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Margem" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            <SelectItem value="0-20">0% - 20%</SelectItem>
            <SelectItem value="20-35">20% - 35%</SelectItem>
            <SelectItem value="35-50">35% - 50%</SelectItem>
            <SelectItem value="50+">50%+</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="w-4 h-4 mr-1" /> Exportar Excel
        </Button>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("descricao")}>Produto <SortIcon col="descricao" /></TableHead>
              <TableHead className="w-[120px]">EAN</TableHead>
              <TableHead className="text-right w-[90px]">Custo</TableHead>
              <TableHead className="text-right w-[100px] cursor-pointer select-none" onClick={() => toggleSort("precoAtual")}>Preço Atual <SortIcon col="precoAtual" /></TableHead>
              <TableHead className="text-right w-[100px]">Concorrente</TableHead>
              <TableHead className="text-right w-[90px] cursor-pointer select-none" onClick={() => toggleSort("diferenca")}>Diferença <SortIcon col="diferenca" /></TableHead>
              <TableHead className="w-[90px] text-center cursor-pointer select-none" onClick={() => toggleSort("status")}>Status <SortIcon col="status" /></TableHead>
              <TableHead className="text-right w-[100px]">Novo Preço</TableHead>
              <TableHead className="text-right w-[100px] cursor-pointer select-none" onClick={() => toggleSort("novaMargem")}>Nova Margem <SortIcon col="novaMargem" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map(r => {
              const sc = statusConfig[r.status];
              const Icon = sc.icon;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-sm">{r.descricao}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.ean}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{fmt(r.custo)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">{fmt(r.precoAtual)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{fmt(r.precoConcorrente)}</TableCell>
                  <TableCell className={`text-right text-sm tabular-nums font-semibold ${r.diferenca > 0 ? "text-destructive" : r.diferenca < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                    {r.diferenca > 0 ? "+" : ""}{fmt(r.diferenca)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={`text-[10px] gap-1 ${sc.className}`}>
                      <Icon className="w-3 h-3" /> {sc.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{fmt(r.novoPreco)}</TableCell>
                  <TableCell className={`text-right text-sm tabular-nums font-semibold ${r.novaMargem < 15 ? "text-destructive" : r.novaMargem > 35 ? "text-green-600" : "text-foreground"}`}>
                    {r.novaMargem.toFixed(1)}%
                  </TableCell>
                </TableRow>
              );
            })}
            {paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Nenhum produto encontrado com os filtros aplicados.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{filtered.length} produtos • Página {page + 1} de {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RepricingResultTable;
