import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ChevronRight, ChevronDown, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TIPOS_LANCAMENTO, SUBCONTAS, type Lancamento } from "./lancamentosTypes";
import type { DRELine } from "./mockData";

const fmtCurrency = (v: number) => {
  const neg = v < 0;
  const abs = Math.abs(v);
  const str = abs.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return neg ? `(${str})` : str;
};

const fmtDate = (d: string) => {
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("pt-BR");
  } catch {
    return d;
  }
};

const meses = [
  { value: 1, label: "Janeiro" }, { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" }, { value: 4, label: "Abril" },
  { value: 5, label: "Maio" }, { value: 6, label: "Junho" },
  { value: 7, label: "Julho" }, { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" }, { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" }, { value: 12, label: "Dezembro" },
];

interface Props {
  data: DRELine[];
  lancamentos: Lancamento[];
  onLancamentoUpdated?: () => void;
}

const highlightRows = new Set(["receita", "receita_liq_imp", "resultado_op", "ebitda", "resultado", "resultado_op_ex", "resultado_fin_ex"]);

export const DRETable = ({ data, lancamentos, onLancamentoUpdated }: Props) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailFilter, setDetailFilter] = useState<{ tipo: string; subtipo?: string } | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingLancamento, setEditingLancamento] = useState<Lancamento | null>(null);
  const [editForm, setEditForm] = useState({
    data: "",
    competencia_mes: 1,
    competencia_ano: 2026,
    tipo: "Vendas",
    subtipo: "Venda Bruta",
    descricao: "",
    valor: "",
    observacao: "",
    status: "ativo",
  });

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Map DRE row ids back to tipo names
  const idToTipo: Record<string, string> = {
    impostos: "Impostos",
    cmv: "CMV",
    despesas: "Despesas",
    receita: "Vendas",
    ebitda: "EBITDA",
    resultado: "Lucro / Prejuízo",
  };

  const handleRowClick = (item: DRELine) => {
    const tipo = idToTipo[item.id];
    if (tipo) {
      if (item.isGroup) {
        toggle(item.id);
      }
      setDetailFilter({ tipo });
    }
  };

  const handleChildClick = (parentId: string, childName: string) => {
    const tipo = idToTipo[parentId];
    if (tipo) {
      setDetailFilter({ tipo, subtipo: childName });
    }
  };

  const filteredLancamentos = detailFilter
    ? lancamentos.filter(l => {
        if (l.tipo !== detailFilter.tipo) return false;
        if (detailFilter.subtipo && l.subtipo !== detailFilter.subtipo) return false;
        return true;
      })
    : [];

  const openEditDialog = (l: Lancamento) => {
    setEditingLancamento(l);
    setEditForm({
      data: l.data,
      competencia_mes: l.competencia_mes,
      competencia_ano: l.competencia_ano,
      tipo: l.tipo,
      subtipo: l.subtipo,
      descricao: l.descricao || "",
      valor: String(l.valor),
      observacao: l.observacao || "",
      status: l.status,
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingLancamento) return;
    const { error } = await supabase
      .from("lancamentos")
      .update({
        data: editForm.data,
        competencia_mes: editForm.competencia_mes,
        competencia_ano: editForm.competencia_ano,
        tipo: editForm.tipo,
        subtipo: editForm.subtipo,
        descricao: editForm.descricao || null,
        valor: Number(editForm.valor),
        observacao: editForm.observacao || null,
        status: editForm.status,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", editingLancamento.id);

    if (error) {
      toast.error("Erro ao atualizar lançamento");
      return;
    }
    toast.success("Lançamento atualizado");
    setEditDialogOpen(false);
    setEditingLancamento(null);
    onLancamentoUpdated?.();
  };

  const subcontas = SUBCONTAS[editForm.tipo] || [];

  const renderRow = (item: DRELine) => {
    const isExpanded = expanded.has(item.id);
    const isHighlight = highlightRows.has(item.id);
    const isNegativeResult = item.id === "resultado" && item.valor < 0;
    const isClickable = !!idToTipo[item.id];
    const isActive = detailFilter?.tipo === idToTipo[item.id] && !detailFilter?.subtipo;

    return (
      <div key={item.id}>
        <div
          className={`grid grid-cols-[1fr_120px_80px_80px] sm:grid-cols-[1fr_150px_100px_100px] items-center px-4 py-2.5 border-b border-border text-sm transition-colors
            ${isHighlight ? "bg-secondary/10 font-bold" : "hover:bg-muted/20"}
            ${isClickable ? "cursor-pointer" : ""}
            ${isActive ? "bg-primary/10 border-l-2 border-l-primary" : ""}
            ${isNegativeResult ? "text-destructive" : ""}
          `}
          onClick={() => isClickable && handleRowClick(item)}
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
        {item.isGroup && isExpanded && item.children?.map((child) => {
          const isChildActive = detailFilter?.tipo === idToTipo[item.id] && detailFilter?.subtipo === child.name;
          return (
            <div
              key={child.id}
              className={`grid grid-cols-[1fr_120px_80px_80px] sm:grid-cols-[1fr_150px_100px_100px] items-center px-4 py-2 border-b border-border/50 text-sm cursor-pointer transition-colors
                ${isChildActive ? "bg-primary/10 border-l-2 border-l-primary" : "bg-muted/5 hover:bg-muted/15"}
              `}
              onClick={() => handleChildClick(item.id, child.name)}
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
          );
        })}
      </div>
    );
  };

  return (
    <>
      <Card className="bg-card border-border overflow-hidden">
        <CardHeader className="pb-0">
          <CardTitle className="text-base font-semibold">
            Demonstrativo de Resultado (DRE)
          </CardTitle>
          <p className="text-xs text-muted-foreground">Clique em uma linha para ver os lançamentos</p>
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

      {/* Detail Panel */}
      {detailFilter && (
        <Card className="bg-card border-border overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-semibold">
                  Lançamentos: {detailFilter.tipo}
                  {detailFilter.subtipo && ` → ${detailFilter.subtipo}`}
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {filteredLancamentos.length} lançamento(s) encontrado(s) — clique para editar
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setDetailFilter(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Beneficiário</TableHead>
                  <TableHead>Subtipo</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right w-[60px]">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLancamentos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                      Nenhum lançamento nesta categoria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLancamentos.map(l => (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => openEditDialog(l)}
                    >
                      <TableCell className="text-sm font-medium">{l.descricao || "—"}</TableCell>
                      <TableCell>
                        <span className="text-xs bg-secondary/20 text-secondary-foreground px-2 py-0.5 rounded-full">
                          {l.subtipo}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(l.data)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {fmtCurrency(Number(l.valor))}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEditDialog(l); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Editar Lançamento</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={editForm.data} onChange={e => setEditForm(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={v => setEditForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Competência Mês</Label>
                <Select value={String(editForm.competencia_mes)} onValueChange={v => setEditForm(p => ({ ...p, competencia_mes: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {meses.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Competência Ano</Label>
                <Select value={String(editForm.competencia_ano)} onValueChange={v => setEditForm(p => ({ ...p, competencia_ano: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026].map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Tipo de Lançamento</Label>
              <Select value={editForm.tipo} onValueChange={v => setEditForm(p => ({ ...p, tipo: v, subtipo: (SUBCONTAS[v] || [])[0] || "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_LANCAMENTO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Conta / Subtipo</Label>
              <Select value={editForm.subtipo} onValueChange={v => setEditForm(p => ({ ...p, subtipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {subcontas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={editForm.valor}
                onChange={e => setEditForm(p => ({ ...p, valor: e.target.value }))}
              />
            </div>
            <div>
              <Label>Descrição / Beneficiário</Label>
              <Input
                value={editForm.descricao}
                onChange={e => setEditForm(p => ({ ...p, descricao: e.target.value }))}
              />
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea
                value={editForm.observacao}
                onChange={e => setEditForm(p => ({ ...p, observacao: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
