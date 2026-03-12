import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUp, ArrowDown, Minus, ChevronUp, ChevronDown } from "lucide-react";
import type { Product } from "./mockData";

interface Props {
  products: Product[];
  onSimulacaoChange: (id: string, value: number | null) => void;
  onSelectProduct: (p: Product) => void;
}

type SortKey = "descricao" | "precoAtual" | "margem" | "status";
type SortDir = "asc" | "desc";

const fmt = (v: number | null) => v != null ? `R$ ${v.toFixed(2)}` : "—";

const statusConfig = {
  maior: { label: "Acima", icon: ArrowUp, className: "bg-destructive/10 text-destructive border-destructive/20" },
  menor: { label: "Abaixo", icon: ArrowDown, className: "bg-green-500/10 text-green-700 border-green-500/20" },
  igual: { label: "Igual", icon: Minus, className: "bg-muted text-muted-foreground border-border" },
};

const RepricingTable = ({ products, onSimulacaoChange, onSelectProduct }: Props) => {
  const [sortKey, setSortKey] = useState<SortKey>("descricao");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(0);
  const perPage = 10;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const sorted = [...products].sort((a, b) => {
    let cmp = 0;
    if (sortKey === "descricao") cmp = a.descricao.localeCompare(b.descricao);
    else if (sortKey === "precoAtual") cmp = a.precoAtual - b.precoAtual;
    else if (sortKey === "margem") cmp = a.margem - b.margem;
    else cmp = a.status.localeCompare(b.status);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const totalPages = Math.ceil(sorted.length / perPage);
  const paged = sorted.slice(page * perPage, (page + 1) * perPage);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />;
  };

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-lg overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-[100px]">Categoria</TableHead>
              <TableHead className="w-[70px]">Cód</TableHead>
              <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("descricao")}>Descrição <SortIcon col="descricao" /></TableHead>
              <TableHead className="text-right w-[90px]">Custo</TableHead>
              <TableHead className="text-right w-[90px] cursor-pointer select-none" onClick={() => toggleSort("precoAtual")}>Preço Atual <SortIcon col="precoAtual" /></TableHead>
              <TableHead className="text-right w-[70px] cursor-pointer select-none" onClick={() => toggleSort("margem")}>Margem <SortIcon col="margem" /></TableHead>
              <TableHead className="text-right w-[90px]">Ampla</TableHead>
              <TableHead className="text-right w-[90px]">Baixa</TableHead>
              <TableHead className="text-right w-[90px]">Direto</TableHead>
              <TableHead className="text-right w-[100px]">Simulação</TableHead>
              <TableHead className="w-[90px] cursor-pointer select-none text-center" onClick={() => toggleSort("status")}>Status <SortIcon col="status" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.map(p => {
              const sc = statusConfig[p.status];
              const Icon = sc.icon;
              return (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover:bg-accent/40 transition-colors"
                  onClick={() => onSelectProduct(p)}
                >
                  <TableCell className="text-xs text-muted-foreground">{p.categoria}</TableCell>
                  <TableCell className="text-xs font-mono">{p.codigo}</TableCell>
                  <TableCell className="font-medium text-sm">{p.descricao}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{fmt(p.custo)}</TableCell>
                  <TableCell className="text-right text-sm font-semibold tabular-nums">{fmt(p.precoAtual)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{p.margem.toFixed(1)}%</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{fmt(p.amplaConcorrente)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{fmt(p.baixaConcorrencia)}</TableCell>
                  <TableCell className="text-right text-sm tabular-nums">{fmt(p.direto)}</TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="—"
                      className="h-7 w-[90px] text-right text-sm"
                      value={p.simulacao ?? ""}
                      onChange={e => {
                        const v = e.target.value ? parseFloat(e.target.value) : null;
                        onSimulacaoChange(p.id, v);
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className={`text-[11px] gap-1 ${sc.className}`}>
                      <Icon className="w-3 h-3" /> {sc.label}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{sorted.length} produtos • Página {page + 1} de {totalPages}</span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Próxima</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default RepricingTable;
