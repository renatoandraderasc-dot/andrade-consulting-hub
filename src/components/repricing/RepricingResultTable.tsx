import { Fragment, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUp, ArrowDown, Minus, Search, Download, ChevronUp, ChevronDown } from "lucide-react";
import * as XLSX from "xlsx";
import type { RepricingRow, RepricingAvaliada, ConcorrenteMeta } from "./repricingTypes";

interface Props {
  rows: RepricingRow[];
  concorrentesMeta: ConcorrenteMeta[];
}

const fmt = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "" : `R$ ${v.toFixed(2)}`;

const fmtData = (v: string | null) => {
  if (!v) return "sem data";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "sem data" : d.toLocaleDateString("pt-BR");
};

const statusConfig = {
  acima: { label: "ACIMA", icon: ArrowUp, className: "bg-destructive/10 text-destructive border-destructive/20" },
  abaixo: { label: "ABAIXO", icon: ArrowDown, className: "bg-green-500/10 text-green-700 border-green-500/20" },
  igual: { label: "IGUAL", icon: Minus, className: "bg-muted text-muted-foreground border-border" },
  sem_ref: { label: "—", icon: Minus, className: "bg-muted text-muted-foreground border-border" },
};

type SortKey = "descricao" | "precoAtual" | "diferenca" | "status";

const RepricingResultTable = ({ rows, concorrentesMeta }: Props) => {
  const [search, setSearch] = useState("");
  const [mercFilter, setMercFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [baseRef, setBaseRef] = useState("geral");
  const [sortKey, setSortKey] = useState<SortKey>("diferenca");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);
  const perPage = 15;

  const refNome =
    baseRef === "geral"
      ? "menor preço entre concorrentes e base interna da rede"
      : baseRef === "menor"
        ? "menor preço entre todos os concorrentes"
        : baseRef === "maior"
          ? "maior preço entre todas as pesquisas"
          : baseRef === "interna"
            ? "menor preço da base interna da rede"
            : concorrentesMeta.find((c) => c.id === baseRef)?.nome ?? "concorrente";

  const avaliadas = useMemo<(RepricingAvaliada & { maiorPesquisa: number | null })[]>(() => {
    return rows.map((r) => {
      const precosConc = Object.values(r.concorrentes).map((c) => c.preco).filter((p) => p > 0);
      const precoInterna = r.interna && r.interna.min > 0 ? r.interna.min : null;
      const internaMax = r.interna && r.interna.max > 0 ? r.interna.max : null;
      const todosPrecos = [...precosConc, ...(internaMax != null ? [internaMax] : [])];
      const maiorPesquisa = todosPrecos.length ? Math.max(...todosPrecos) : null;
      let precoRef: number | null = null;
      if (baseRef === "geral") {
        const todos = [...precosConc, ...(precoInterna != null ? [precoInterna] : [])];
        precoRef = todos.length ? Math.min(...todos) : null;
      } else if (baseRef === "menor") {
        precoRef = precosConc.length ? Math.min(...precosConc) : null;
      } else if (baseRef === "maior") {
        precoRef = maiorPesquisa;
      } else if (baseRef === "interna") {
        precoRef = precoInterna;
      } else {
        precoRef = r.concorrentes[baseRef]?.preco ?? null;
      }

      if (precoRef == null) {
        return { ...r, maiorPesquisa, precoRef: null, refNome, diferenca: 0, diferencaPct: 0, status: "sem_ref" as const, novoPreco: null, novaMargem: null };
      }
      const diferenca = r.precoAtual - precoRef;
      const diferencaPct = r.precoAtual > 0 ? (diferenca / r.precoAtual) * 100 : 0;
      const novoPreco = Math.max(precoRef - 0.01, 0);
      const novaMargem = novoPreco > 0 ? ((novoPreco - r.custo) / novoPreco) * 100 : null;
      return {
        ...r,
        maiorPesquisa,
        precoRef,
        refNome,
        diferenca,
        diferencaPct,
        status: diferenca > 0.005 ? ("acima" as const) : diferenca < -0.005 ? ("abaixo" as const) : ("igual" as const),
        novoPreco,
        novaMargem,
      };
    });
  }, [rows, baseRef, refNome]);

  const mercadologicos = useMemo(
    () => [...new Set(rows.map((r) => r.mercadologico))].filter(Boolean).sort(),
    [rows],
  );

  const filtered = avaliadas.filter((r) => {
    if (search) {
      const q = search.toLowerCase();
      if (!r.descricao.toLowerCase().includes(q) && !r.ean.includes(q)) return false;
    }
    if (mercFilter !== "todos" && r.mercadologico !== mercFilter) return false;
    if (statusFilter !== "todos" && r.status !== statusFilter) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "descricao") cmp = a.descricao.localeCompare(b.descricao);
    else if (sortKey === "precoAtual") cmp = a.precoAtual - b.precoAtual;
    else if (sortKey === "diferenca") cmp = a.diferenca - b.diferenca;
    else cmp = a.status.localeCompare(b.status);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / perPage);
  const paged = sorted.slice(page * perPage, (page + 1) * perPage);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />;
  };

  const total = filtered.length;
  const acima = filtered.filter((r) => r.status === "acima").length;
  const abaixo = filtered.filter((r) => r.status === "abaixo").length;
  const igual = filtered.filter((r) => r.status === "igual").length;
  const semRef = filtered.filter((r) => r.status === "sem_ref").length;


  const handleExport = () => {
    const data = filtered.map((r) => {
      const linha: Record<string, unknown> = {
        Produto: r.descricao,
        EAN: r.ean,
        Mercadológico: r.mercadologico,
        Custo: r.custo,
        "Preço Atual": r.precoAtual,
        "Rede — Menor": r.interna?.min ?? "",
        "Rede — Maior": r.interna?.max ?? "",
        "Rede — Médio": r.interna ? Number(r.interna.media.toFixed(2)) : "",
        "Rede — Lojas": r.interna?.lojas ?? "",
        "Maior preço (todas pesquisas)": r.maiorPesquisa ?? "",
      };
      for (const c of concorrentesMeta) {
        const cell = r.concorrentes[c.id];
        linha[`${c.nome} — Preço`] = cell?.preco ?? "";
        linha[`${c.nome} — Dif R$`] = cell ? Number((r.precoAtual - cell.preco).toFixed(2)) : "";
        linha[`${c.nome} — Dif %`] =
          cell && r.precoAtual > 0 ? Number((((r.precoAtual - cell.preco) / r.precoAtual) * 100).toFixed(1)) : "";
      }
      linha["Base de comparação"] = refNome;
      linha["Status"] = r.status === "sem_ref" ? "" : r.status.toUpperCase();
      return linha;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Repricing");
    XLSX.writeFile(wb, `repricing-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const colCount = 4 + 4 + concorrentesMeta.length * 3 + 1;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: "Total Cruzados", value: total, color: "text-primary" },
            { label: "Acima", value: acima, color: "text-destructive" },
            { label: "Abaixo", value: abaixo, color: "text-green-600" },
            { label: "Igual", value: igual, color: "text-muted-foreground" },
            { label: "Sem referência", value: semRef, color: "text-muted-foreground" },
          ].map((k) => (
            <div key={k.label} className="bg-card border border-border rounded-lg p-3">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
              <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">vs. {refNome}</p>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Buscar por produto ou código de barras..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9" />
          </div>
          <Select value={baseRef} onValueChange={(v) => { setBaseRef(v); setPage(0); }}>
            <SelectTrigger className="w-[290px]"><SelectValue placeholder="Base de comparação" /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="geral">Menor preço (concorrentes + base interna)</SelectItem>
              <SelectItem value="menor">Menor preço entre concorrentes</SelectItem>
              <SelectItem value="interna">Menor preço da base interna da rede</SelectItem>
              {concorrentesMeta.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={mercFilter} onValueChange={(v) => { setMercFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Mercadológico" /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="todos">Todos</SelectItem>
              {mercadologicos.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="acima">Acima</SelectItem>
              <SelectItem value="abaixo">Abaixo</SelectItem>
              <SelectItem value="igual">Igual</SelectItem>
              <SelectItem value="sem_ref">Sem referência</SelectItem>

            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> Exportar Excel
          </Button>
        </div>

        {/* Tabela */}
        <div className="border border-border rounded-lg overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead colSpan={4} className="text-[11px] uppercase tracking-wide">Loja</TableHead>
                <TableHead colSpan={4} className="text-center text-[11px] uppercase tracking-wide border-l border-border">
                  Base interna da rede
                </TableHead>
                {concorrentesMeta.map((c) => (
                  <TableHead key={c.id} colSpan={3} className="text-center text-[11px] uppercase tracking-wide border-l border-border">
                    {c.nome}
                    <span className="block normal-case text-[10px] text-muted-foreground font-normal">
                      coleta {fmtData(c.coletadoEm)}
                    </span>
                  </TableHead>
                ))}
                <TableHead className="border-l border-border" />
              </TableRow>
              <TableRow className="bg-muted/20">
                <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("descricao")}>Produto <SortIcon col="descricao" /></TableHead>
                <TableHead className="w-[110px]">Código de barras</TableHead>
                <TableHead className="text-right w-[85px]">Custo</TableHead>
                <TableHead className="text-right w-[95px] cursor-pointer select-none" onClick={() => toggleSort("precoAtual")}>Preço <SortIcon col="precoAtual" /></TableHead>
                <TableHead className="text-right w-[85px] border-l border-border">Menor</TableHead>
                <TableHead className="text-right w-[85px]">Maior</TableHead>
                <TableHead className="text-right w-[85px]">Médio</TableHead>
                <TableHead className="text-right w-[60px]">Lojas</TableHead>
                {concorrentesMeta.map((c) => (
                  <Fragment key={c.id}>
                    <TableHead className="text-right w-[85px] border-l border-border">Preço</TableHead>
                    <TableHead className="text-right w-[85px]">Dif R$</TableHead>
                    <TableHead className="text-right w-[75px]">Dif %</TableHead>
                  </Fragment>
                ))}
                <TableHead className="w-[90px] text-center cursor-pointer select-none border-l border-border" onClick={() => toggleSort("status")}>
                  Status <SortIcon col="status" />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paged.map((r) => {
                const sc = statusConfig[r.status];
                const Icon = sc.icon;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-sm">{r.descricao}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.ean}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{fmt(r.custo)}</TableCell>
                    <TableCell className="text-right text-sm font-semibold tabular-nums">{fmt(r.precoAtual)}</TableCell>

                    {r.interna ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <TableCell className="text-right text-sm tabular-nums border-l border-border cursor-help">{fmt(r.interna.min)}</TableCell>
                        </TooltipTrigger>
                        <TooltipContent className="bg-popover z-50 max-h-72 overflow-auto">
                          <p className="text-xs font-semibold mb-1">Preços nas outras lojas</p>
                          {r.interna.detalhe.map((d) => (
                            <p key={d.loja} className="text-xs tabular-nums">{d.loja} · {fmt(d.preco)}</p>
                          ))}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <TableCell className="border-l border-border" />
                    )}
                    <TableCell className="text-right text-sm tabular-nums">{r.interna ? fmt(r.interna.max) : ""}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums">{r.interna ? fmt(r.interna.media) : ""}</TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">{r.interna ? r.interna.lojas : ""}</TableCell>

                    {concorrentesMeta.map((c) => {
                      const cell = r.concorrentes[c.id];
                      const dif = cell ? r.precoAtual - cell.preco : null;
                      const difPct = cell && r.precoAtual > 0 ? (dif! / r.precoAtual) * 100 : null;
                      const cor = dif == null ? "" : dif > 0 ? "text-destructive" : dif < 0 ? "text-green-600" : "text-muted-foreground";
                      return (
                        <Fragment key={`${r.id}-${c.id}`}>
                          <TableCell className="text-right text-sm tabular-nums border-l border-border">
                            {cell ? fmt(cell.preco) : ""}
                          </TableCell>
                          <TableCell className={`text-right text-sm tabular-nums font-semibold ${cor}`}>
                            {dif == null ? "" : `${dif > 0 ? "+" : ""}${fmt(dif)}`}
                          </TableCell>
                          <TableCell className={`text-right text-sm tabular-nums ${cor}`}>
                            {difPct == null ? "" : `${difPct > 0 ? "+" : ""}${difPct.toFixed(1)}%`}
                          </TableCell>
                        </Fragment>
                      );
                    })}

                    <TableCell className="text-center border-l border-border">
                      {r.status === "sem_ref" ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="outline" className={`text-[10px] gap-1 ${sc.className}`}>
                          <Icon className="w-3 h-3" /> {sc.label}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {paged.length === 0 && (
                <TableRow>
                  <TableCell colSpan={colCount} className="text-center py-8 text-muted-foreground">
                    Nenhum produto encontrado com os filtros aplicados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{filtered.length} produtos • Página {page + 1} de {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
};

export default RepricingResultTable;
