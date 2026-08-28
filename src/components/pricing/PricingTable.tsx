import { Fragment, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronDown, ChevronUp, AlertTriangle, ImageOff, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { salvarWorkbook } from "@/lib/exportBranding";
import type { ConcorrenteInfo, PricingRow } from "./pricingTypes";

const PAGE_SIZE = 50;

const brl = (v: number | null | undefined) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pct = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : `${v.toFixed(1)}%`;

const diasDesde = (iso: string | null) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null;

const dataBR = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "sem coleta";

interface Props {
  rows: PricingRow[];
  concorrentes: ConcorrenteInfo[];
  semEanTotal: number;
}

type SortKey = string;

const PricingTable = ({ rows, concorrentes, semEanTotal }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("vlrVendas");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(0);

  const valorDe = (r: PricingRow, key: string): number | string => {
    if (key.includes(":")) {
      const [cid, campo] = key.split(":");
      const c = r.concorrentes[cid];
      const preco = c?.disponivel ? c.preco : null;
      if (preco == null) return campo === "preco" ? -1 : -Infinity;
      if (campo === "preco") return preco;
      if (campo === "venda") return preco * r.qtdVendas;
      if (campo === "lucro") return (preco - r.custo) * r.qtdVendas;
      if (campo === "margem") return preco > 0 ? ((preco - r.custo) / preco) * 100 : 0;
      if (campo === "dif") return r.meuPreco - preco;
      return 0;
    }
    const v = (r as unknown as Record<string, unknown>)[key];
    return typeof v === "number" ? v : String(v ?? "");
  };

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const va = valorDe(a, sortKey);
      const vb = valorDe(b, sortKey);
      let cmp = 0;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "pt-BR");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageIdx = Math.min(page, totalPages - 1);
  const paged = sorted.slice(pageIdx * PAGE_SIZE, (pageIdx + 1) * PAGE_SIZE);

  const toggle = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
    setPage(0);
  };

  const Th = ({ k, children, className = "" }: { k: string; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none whitespace-nowrap ${className}`} onClick={() => toggle(k)}>
      {children}
      {sortKey === k &&
        (sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />)}
    </TableHead>
  );

  const exportar = () => {
    const data = sorted.map((r) => {
      const base: Record<string, unknown> = {
        Cód: r.codigo,
        Produto: r.descricao,
        "Cód. Barras": r.ean,
        "Meu Preço": r.meuPreco,
        Custo: r.custo,
        "Qtd Vendas": r.qtdVendas,
        "Vlr Vendas": r.vlrVendas,
        Curva: r.curva,
      };
      for (const c of concorrentes) {
        const cel = r.concorrentes[c.id];
        const preco = cel?.disponivel ? cel.preco : null;
        base[`${c.nome} - Preço`] = preco ?? (cel ? "sem estoque" : "");
        base[`${c.nome} - Venda simulada`] = preco != null ? preco * r.qtdVendas : "";
        base[`${c.nome} - Lucro simulado`] = preco != null ? (preco - r.custo) * r.qtdVendas : "";
        base[`${c.nome} - Margem simulada %`] =
          preco != null && preco > 0 ? (((preco - r.custo) / preco) * 100).toFixed(1) : "";
        base[`${c.nome} - Diferença R$`] = preco != null ? r.meuPreco - preco : "";
        base[`${c.nome} - Diferença %`] =
          preco != null && preco > 0 ? (((r.meuPreco - preco) / preco) * 100).toFixed(1) : "";
      }
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pricing");
    salvarWorkbook(wb, "Pricing");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {sorted.length.toLocaleString("pt-BR")} produtos • página {pageIdx + 1} de {totalPages}
        </p>
        <Button variant="outline" size="sm" onClick={exportar}>
          <Download className="w-4 h-4 mr-1" /> Exportar Excel
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[52px]">Imagem</TableHead>
              <Th k="codigo">Cód</Th>
              <Th k="descricao">Produto</Th>
              <Th k="ean">Cód. Barras</Th>
              <Th k="meuPreco" className="text-right">Meu Preço</Th>
              <Th k="custo" className="text-right">Custo</Th>
              <Th k="qtdVendas" className="text-right">Qtd Vendas</Th>
              <Th k="vlrVendas" className="text-right">Vlr Vendas</Th>
              <Th k="curva" className="text-center">Curva</Th>
              {concorrentes.map((c) => {
                const d = diasDesde(c.coletadoEm);
                const velho = d != null && d > 7;
                return (
                  <TableHead
                    key={c.id}
                    colSpan={5}
                    className="text-center border-l border-border bg-muted/60 whitespace-nowrap"
                  >
                    <div className="font-semibold">{c.nome}</div>
                    <div className={`text-[10px] font-normal ${velho ? "text-amber-600" : "text-muted-foreground"}`}>
                      {velho ? `coleta de ${d} dias atrás` : `coleta ${dataBR(c.coletadoEm)}`}
                    </div>
                  </TableHead>
                );
              })}
            </TableRow>
            <TableRow className="bg-muted/20">
              <TableHead colSpan={9} />
              {concorrentes.map((c) => (
                <Fragment key={c.id}>
                  <Th k={`${c.id}:preco`} className="text-right border-l border-border text-[11px]">Preço</Th>
                  <Th k={`${c.id}:venda`} className="text-right text-[11px]">Venda sim.</Th>
                  <Th k={`${c.id}:lucro`} className="text-right text-[11px]">Lucro sim.</Th>
                  <Th k={`${c.id}:margem`} className="text-right text-[11px]">Margem sim.</Th>
                  <Th k={`${c.id}:dif`} className="text-right text-[11px]">Diferença</Th>
                </Fragment>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map((r) => (
              <TableRow key={`${r.codigo}-${r.ean}`}>
                <TableCell>
                  {r.imagem ? (
                    <img src={r.imagem} alt={r.descricao} loading="lazy" className="w-9 h-9 object-contain rounded bg-muted" />
                  ) : (
                    <div className="w-9 h-9 rounded bg-muted flex items-center justify-center">
                      <ImageOff className="w-4 h-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.codigo}</TableCell>
                <TableCell className="text-sm font-medium max-w-[260px] truncate" title={r.descricao}>{r.descricao}</TableCell>
                <TableCell className="font-mono text-[11px] text-muted-foreground">{r.ean || "—"}</TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">{brl(r.meuPreco)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{brl(r.custo)}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{r.qtdVendas.toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right text-sm tabular-nums">{brl(r.vlrVendas)}</TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className="text-[10px]">{r.curva}</Badge>
                </TableCell>
                {concorrentes.map((c) => {
                  const cel = r.concorrentes[c.id];
                  const preco = cel?.disponivel ? cel.preco : null;
                  const dif = preco != null ? r.meuPreco - preco : null;
                  const difPct = preco != null && preco > 0 ? ((r.meuPreco - preco) / preco) * 100 : null;
                  const cor = dif == null ? "" : dif < 0 ? "text-green-600" : dif > 0 ? "text-destructive" : "text-muted-foreground";
                  return (
                    <Fragment key={c.id}>
                      <TableCell className="text-right text-sm tabular-nums border-l border-border">
                        {preco != null ? (
                          <span className="inline-flex items-center gap-1 justify-end">
                            {brl(preco)}
                            {cel.promocaoMultipla.length > 0 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                </TooltipTrigger>
                                <TooltipContent>
                                  Promoção múltipla: {cel.promocaoMultipla.join(", ")}. O preço unitário da API ignora esse desconto.
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </span>
                        ) : cel ? (
                          <span className="text-[10px] text-muted-foreground">sem estoque</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {preco != null ? brl(preco * r.qtdVendas) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {preco != null ? brl((preco - r.custo) * r.qtdVendas) : "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {preco != null && preco > 0 ? pct(((preco - r.custo) / preco) * 100) : "—"}
                      </TableCell>
                      <TableCell className={`text-right text-sm tabular-nums font-semibold ${cor}`}>
                        {dif != null ? `${dif > 0 ? "+" : ""}${brl(dif)}` : "—"}
                        {difPct != null && <div className="text-[10px] font-normal">{difPct > 0 ? "+" : ""}{difPct.toFixed(1)}%</div>}
                      </TableCell>
                    </Fragment>
                  );
                })}
              </TableRow>
            ))}
            {paged.length === 0 && (
              <TableRow>
                <TableCell colSpan={9 + concorrentes.length * 5} className="text-center py-8 text-muted-foreground">
                  Nenhum produto para os filtros aplicados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{semEanTotal.toLocaleString("pt-BR")} produtos do concorrente sem EAN utilizável</span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" disabled={pageIdx === 0} onClick={() => setPage(pageIdx - 1)}>Anterior</Button>
          <Button variant="outline" size="sm" disabled={pageIdx >= totalPages - 1} onClick={() => setPage(pageIdx + 1)}>Próxima</Button>
        </div>
      </div>
    </div>
  );
};

export default PricingTable;
