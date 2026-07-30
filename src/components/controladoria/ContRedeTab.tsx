import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronRight, ChevronDown, Pencil, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Lancamento } from "./lancamentosTypes";
import { CompetenciasDisponiveis } from "./CompetenciasDisponiveis";
import { ImportarVrBlock } from "./ImportarVrBlock";
import {
  DRE_STRUCTURE_COMERCIAL, DRE_STRUCTURE_FINANCEIRO,
  calcularDRE, TIPOS_LANCAMENTO_V2, SUBCONTAS_V2,
  type DRENode,
} from "./contRedeStructure";

const mesesOptions = [
  { value: 1, label: "Janeiro" }, { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" }, { value: 4, label: "Abril" },
  { value: 5, label: "Maio" }, { value: 6, label: "Junho" },
  { value: 7, label: "Julho" }, { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" }, { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" }, { value: 12, label: "Dezembro" },
];
const anos = ["2024", "2025", "2026"];

const STORAGE_KEY_MES = "controladoria_mes";
const STORAGE_KEY_ANO = "controladoria_ano";

function getStoredMes(): number {
  const stored = sessionStorage.getItem(STORAGE_KEY_MES);
  return stored ? Number(stored) : new Date().getMonth() + 1;
}
function getStoredAno(): number {
  const stored = sessionStorage.getItem(STORAGE_KEY_ANO);
  return stored ? Number(stored) : new Date().getFullYear();
}

interface Props {
  storeId: string;
  onGoClassificacao?: () => void;
}


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

export const ContRedeTab = ({ storeId, onGoClassificacao }: Props) => {
  const [mes, setMes] = useState(getStoredMes);
  const [ano, setAno] = useState(getStoredAno);
  const [modo, setModo] = useState<"comercial" | "financeiro">("comercial");
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [detailFilter, setDetailFilter] = useState<{ tipo: string; subtipo?: string } | null>(null);

  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingLancamento, setEditingLancamento] = useState<Lancamento | null>(null);
  const [editForm, setEditForm] = useState({
    data: "", tipo: "", subtipo: "", descricao: "", valor: "", observacao: "", status: "ativo",
  });

  // Persist mes/ano
  useEffect(() => { sessionStorage.setItem(STORAGE_KEY_MES, String(mes)); }, [mes]);
  useEffect(() => { sessionStorage.setItem(STORAGE_KEY_ANO, String(ano)); }, [ano]);

  const fetchData = useCallback(() => {
    if (!storeId) return;
    setLoading(true);
    supabase
      .from("lancamentos")
      .select("*")
      .eq("store_id", storeId)
      .eq("competencia_mes", mes)
      .eq("competencia_ano", ano)
      .eq("status", "ativo")
      .then(({ data }) => {
        setLancamentos((data as any[]) || []);
        setLoading(false);
      });
  }, [storeId, mes, ano]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const structure = modo === "comercial" ? DRE_STRUCTURE_COMERCIAL : DRE_STRUCTURE_FINANCEIRO;

  const dreValues = useMemo(() => {
    return calcularDRE(structure, lancamentos.map(l => ({
      tipo: l.tipo,
      subtipo: l.subtipo,
      valor: Number(l.valor),
    })));
  }, [lancamentos, structure]);

  // For % calculation, use faturamento as base
  const faturamentoBase = dreValues.get("faturamento") || 1;

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleRowClick = (node: DRENode) => {
    if (node.isGroup) {
      toggle(node.id);
    }
    if (node.tipo) {
      setDetailFilter({ tipo: node.tipo });
    }
  };

  const handleChildClick = (tipo: string, subtipo: string) => {
    setDetailFilter({ tipo, subtipo });
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
      tipo: l.tipo,
      subtipo: l.subtipo,
      descricao: l.descricao || "",
      valor: String(l.valor),
      observacao: l.observacao || "",
      status: l.status,
    });
    setEditDialogOpen(true);
  };

  const isVr = (l: Lancamento | null) => (l as any)?.origem === "VR";

  const handleSaveEdit = async () => {
    if (!editingLancamento) return;
    const vr = isVr(editingLancamento);
    const payload: any = {
      tipo: editForm.tipo,
      subtipo: editForm.subtipo,
      descricao: editForm.descricao || null,
      observacao: editForm.observacao || null,
      status: editForm.status,
      updated_at: new Date().toISOString(),
    };
    if (!vr) {
      payload.data = editForm.data;
      payload.valor = Number(editForm.valor);
    }
    const { error } = await supabase
      .from("lancamentos")
      .update(payload)
      .eq("id", editingLancamento.id);


    if (error) { toast.error("Erro ao atualizar"); return; }
    toast.success("Lançamento atualizado");
    setEditDialogOpen(false);
    setEditingLancamento(null);
    fetchData();
  };

  const subcontas = SUBCONTAS_V2[editForm.tipo] || [];

  // Detect if a node name starts with a number (section header like "4.1 |")
  const isSectionHeader = (name: string) => /^\d/.test(name);

  const renderNode = (node: DRENode) => {
    const isExpanded = expanded.has(node.id);
    const value = dreValues.get(node.id) || 0;
    const pct = faturamentoBase !== 0 ? (value / faturamentoBase) * 100 : 0;
    const isClickable = !!node.tipo || !!node.calcPctOf;
    const isActive = detailFilter?.tipo === node.tipo && !detailFilter?.subtipo;
    const isSection = (node.isGroup || !!node.calcPctOf) && isSectionHeader(node.name);

    return (
      <div key={node.id}>
        <div
          className={`group grid grid-cols-[1fr_140px_80px] sm:grid-cols-[1fr_160px_100px] items-center px-4 border-b border-border text-sm transition-all duration-200
            ${node.isResult ? "bg-accent/20 font-bold text-foreground py-3" : ""}
            ${isSection ? "bg-secondary/10 font-semibold py-2.5" : "py-2"}
            ${!node.isResult && !isSection ? "hover:bg-orange-50 dark:hover:bg-orange-950/20" : "hover:bg-orange-50 dark:hover:bg-orange-950/20"}
            ${isClickable ? "cursor-pointer" : ""}
            ${isActive ? "bg-primary/10 border-l-2 border-l-primary" : ""}
          `}
          onClick={() => node.isGroup ? handleRowClick(node) : null}
        >
          <div className="flex items-center gap-2">
            {node.isGroup && (
              isExpanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            {!node.isGroup && <span className="w-4 shrink-0" />}
            <span className={`${node.isResult ? "text-foreground" : "text-foreground/90"} ${isSection ? "text-foreground" : ""} group-hover:font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-all duration-200`}>
              {node.name}
            </span>
          </div>
          <div className={`text-right font-mono text-sm group-hover:font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-all duration-200 ${value < 0 ? "text-red-600 group-hover:text-orange-600" : ""}`}>
            {fmtCurrency(value)}
          </div>
          <div className="text-right font-mono text-muted-foreground text-xs group-hover:font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-all duration-200">
            {pct.toFixed(2)}%
          </div>
        </div>

        {/* Children */}
        {node.isGroup && isExpanded && node.children?.map(child => {
          const childVal = dreValues.get(child.id) || 0;
          const childPct = faturamentoBase !== 0 ? (childVal / faturamentoBase) * 100 : 0;
          const isChildActive = detailFilter?.tipo === child.tipo && detailFilter?.subtipo === child.subtipo;

          return (
            <div
              key={child.id}
              className={`group grid grid-cols-[1fr_140px_80px] sm:grid-cols-[1fr_160px_100px] items-center px-4 py-1.5 border-b border-border/30 text-xs cursor-pointer transition-all duration-200
                ${isChildActive ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-orange-50 dark:hover:bg-orange-950/20"}
              `}
              onClick={() => child.tipo && child.subtipo && handleChildClick(child.tipo, child.subtipo)}
            >
              <div className="pl-8 text-foreground/75 group-hover:font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-all duration-200">{child.name}</div>
              <div className={`text-right font-mono group-hover:font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-all duration-200 ${childVal < 0 ? "text-red-600" : ""}`}>
                {fmtCurrency(childVal)}
              </div>
              <div className="text-right font-mono text-muted-foreground group-hover:font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-all duration-200">
                {childPct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">Cont Rede</h2>
        <p className="text-sm text-muted-foreground">
          Painel consolidado de controladoria — estrutura fixa, cálculos determinísticos
        </p>
      </div>

      <ImportarVrBlock
        storeId={storeId}
        onImported={fetchData}
        onGoClassificacao={onGoClassificacao}
      />



      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-wrap gap-3 items-center">
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {mesesOptions.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* Toggle Comercial / Financeiro */}
          <div className="flex gap-1 ml-auto">
            <Button
              size="sm"
              variant={modo === "comercial" ? "default" : "outline"}
              onClick={() => setModo("comercial")}
              className={modo === "comercial" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
            >
              Comercial
            </Button>
            <Button
              size="sm"
              variant={modo === "financeiro" ? "default" : "outline"}
              onClick={() => setModo("financeiro")}
              className={modo === "financeiro" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
            >
              Financeiro
            </Button>
          </div>
        </CardContent>
      </Card>

      <CompetenciasDisponiveis
        storeId={storeId}
        onSelect={(m, a) => { setMes(m); setAno(a); }}
      />

      {loading && <p className="text-muted-foreground text-sm">Carregando dados...</p>}

      {!loading && lancamentos.length === 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-4 text-sm">
          <p className="font-semibold text-foreground">
            Nenhum lançamento em {mesesOptions.find(m => m.value === mes)?.label}/{ano}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            A estrutura do DRE aparece zerada porque não há lançamentos desta loja nesta competência.
            Escolha outro mês/ano ou importe os lançamentos na aba de entrada de dados.
          </p>
        </div>
      )}

      {/* DRE Table */}
      <Card className="bg-card border-border overflow-hidden">
        <CardHeader className="pb-0">
          <CardTitle className="text-base font-semibold">
            {modo === "comercial" ? "DRE Comercial" : "DRE Financeiro"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Clique em uma linha para ver os lançamentos</p>
        </CardHeader>
        <CardContent className="p-0 mt-4">
          <div className="grid grid-cols-[1fr_140px_80px] sm:grid-cols-[1fr_160px_100px] items-center px-4 py-2.5 bg-secondary/10 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <div>Conta</div>
            <div className="text-right">Valor</div>
            <div className="text-right">% Fat.</div>
          </div>
          {structure.map(renderNode)}
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
                  {filteredLancamentos.length} lançamento(s) — clique para editar
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
                    <TableRow key={l.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openEditDialog(l)}>
                      <TableCell className="text-sm font-medium">
                        <span className="inline-flex items-center gap-2">
                          {l.descricao || "—"}
                          {isVr(l) && (
                            <span className="text-[10px] uppercase tracking-wide border border-border text-muted-foreground px-1.5 py-0.5 rounded">
                              VR
                            </span>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs bg-secondary/20 text-secondary-foreground px-2 py-0.5 rounded-full">
                          {l.subtipo}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(l.data)}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtCurrency(Number(l.valor))}</TableCell>
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
            <div>
              <Label>Tipo</Label>
              <Select value={editForm.tipo} onValueChange={v => setEditForm(p => ({ ...p, tipo: v, subtipo: (SUBCONTAS_V2[v] || [])[0] || "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_LANCAMENTO_V2.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subconta</Label>
              <Select value={editForm.subtipo} onValueChange={v => setEditForm(p => ({ ...p, subtipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {subcontas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={editForm.valor} onChange={e => setEditForm(p => ({ ...p, valor: e.target.value }))} />
            </div>
            <div>
              <Label>Descrição / Beneficiário</Label>
              <Input value={editForm.descricao} onChange={e => setEditForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea value={editForm.observacao} onChange={e => setEditForm(p => ({ ...p, observacao: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
