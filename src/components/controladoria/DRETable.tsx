import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { DRELine } from "./mockData";

const fmtCurrency = (v: number) => {
  const neg = v < 0;
  const abs = Math.abs(v);
  const str = abs.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return neg ? `(${str})` : str;
};

interface Props {
  data: DRELine[];
}

const highlightRows = new Set(["receita", "receita_liq_imp", "resultado_op", "ebitda", "resultado", "resultado_op_ex", "resultado_fin_ex"]);

export const DRETable = ({ data }: Props) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const renderRow = (item: DRELine) => {
    const isExpanded = expanded.has(item.id);
    const isHighlight = highlightRows.has(item.id);
    const isNegativeResult = item.id === "resultado" && item.valor < 0;

    return (
      <div key={item.id}>
        <div
          className={`grid grid-cols-[1fr_120px_80px_80px] sm:grid-cols-[1fr_150px_100px_100px] items-center px-4 py-2.5 border-b border-border text-sm transition-colors
            ${isHighlight ? "bg-secondary/10 font-bold" : "hover:bg-muted/20"}
            ${item.isGroup ? "cursor-pointer" : ""}
            ${isNegativeResult ? "text-destructive" : ""}
          `}
          onClick={() => item.isGroup && toggle(item.id)}
        >
          <div className="flex items-center gap-2">
            {item.isGroup && (
              isExpanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            {!item.isGroup && <span className="w-4 shrink-0" />}
            <span className={isHighlight ? "text-foreground" : "text-foreground/90"}>
              {item.name}
            </span>
          </div>
          <div className={`text-right font-mono ${item.valor < 0 && !isHighlight ? "text-red-600" : ""}`}>
            {fmtCurrency(item.valor)}
          </div>
          <div className="text-right font-mono text-muted-foreground">
            {item.percentual.toFixed(1)}%
          </div>
          <div className={`text-right font-mono text-xs ${item.variacao >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {item.variacao >= 0 ? "▲" : "▼"} {Math.abs(item.variacao).toFixed(1)}%
          </div>
        </div>

        {/* Children */}
        {item.isGroup && isExpanded && item.children?.map((child) => (
          <div
            key={child.id}
            className="grid grid-cols-[1fr_120px_80px_80px] sm:grid-cols-[1fr_150px_100px_100px] items-center px-4 py-2 border-b border-border/50 text-sm bg-muted/5 hover:bg-muted/15 transition-colors"
          >
            <div className="pl-10 text-foreground/80">{child.name}</div>
            <div className={`text-right font-mono ${child.valor < 0 ? "text-red-600" : ""}`}>
              {fmtCurrency(child.valor)}
            </div>
            <div className="text-right font-mono text-muted-foreground">
              {child.percentual.toFixed(1)}%
            </div>
            <div className={`text-right font-mono text-xs ${child.variacao >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {child.variacao >= 0 ? "▲" : "▼"} {Math.abs(child.variacao).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardHeader className="pb-0">
        <CardTitle className="text-base font-semibold">
          Demonstrativo de Resultado (DRE)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0 mt-4">
        {/* Header */}
        <div className="grid grid-cols-[1fr_120px_80px_80px] sm:grid-cols-[1fr_150px_100px_100px] items-center px-4 py-2.5 bg-secondary/10 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <div>Conta</div>
          <div className="text-right">Valor</div>
          <div className="text-right">% Receita</div>
          <div className="text-right">Var.</div>
        </div>
        {data.map(renderRow)}
      </CardContent>
    </Card>
  );
};
