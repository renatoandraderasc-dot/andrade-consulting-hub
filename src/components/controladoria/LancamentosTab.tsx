import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Copy, Search, CheckSquare } from "lucide-react";
import { ImportLancamentos } from "./ImportLancamentos";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { TIPOS_LANCAMENTO_V2, SUBCONTAS_V2 } from "./contRedeStructure";
import type { Lancamento } from "./lancamentosTypes";

const meses = [
  { value: 1, label: "Janeiro" }, { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" }, { value: 4, label: "Abril" },
  { value: 5, label: "Maio" }, { value: 6, label: "Junho" },
  { value: 7, label: "Julho" }, { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" }, { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" }, { value: 12, label: "Dezembro" },
];

const STORAGE_KEY_MES = "controladoria_mes";
const STORAGE_KEY_ANO = "controladoria_ano";

interface Props {
  storeId: string;
  storeName: string;
}

export const LancamentosTab = ({ storeId, storeName }: Props) => {
  const { user, isAdmin } = useAuth();
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Persist month/year via sessionStorage
  const [filterMes, setFilterMes] = useState(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY_MES);
    return stored ? Number(stored) : new Date().getMonth() + 1;
  });
  const [filterAno, setFilterAno] = useState(() => {
    const stored = sessionStorage.getItem(STORAGE_KEY_ANO);
    return stored ? Number(stored) : new Date().getFullYear();
  });
  const [filterTipo, setFilterTipo] = useState("Todos");
  const [filterBusca, setFilterBusca] = useState("");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => { sessionStorage.setItem(STORAGE_KEY_MES, String(filterMes)); }, [filterMes]);
  useEffect(() => { sessionStorage.setItem(STORAGE_KEY_ANO, String(filterAno)); }, [filterAno]);

  // Form state
  const [form, setForm] = useState({
    data: new Date().toISOString().split("T")[0],
    competencia_mes: filterMes,
    competencia_ano: filterAno,
    tipo: "Faturamento" as string,
    subtipo: "Venda Bruta",
    descricao: "",
    valor: "",
    observacao: "",
    status: "ativo",
  });

  const subcontas = SUBCONTAS_V2[form.tipo] || [];

  useEffect(() => {
    if (storeId) fetchLancamentos();
  }, [storeId, filterMes, filterAno]);

  const fetchLancamentos = async () => {
    setLoading(true);
    setSelectedIds(new Set());
    const { data, error } = await supabase
      .from("lancamentos")
      .select("*")
      .eq("store_id", storeId)
      .eq("competencia_mes", filterMes)
      .eq("competencia_ano", filterAno)
      .order("data", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar lançamentos");
    } else {
      setLancamentos((data as any[]) || []);
    }
    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = lancamentos;
    if (filterTipo !== "Todos") result = result.filter(l => l.tipo === filterTipo);
    if (filterBusca) {
      const q = filterBusca.toLowerCase();
      result = result.filter(l =>
        (l.descricao || "").toLowerCase().includes(q) ||
        l.subtipo.toLowerCase().includes(q)
      );
    }
    return result;
  }, [lancamentos, filterTipo, filterBusca]);

  const totaisPorTipo = useMemo(() => {
    const map: Record<string, number> = {};
    lancamentos.forEach(l => { map[l.tipo] = (map[l.tipo] || 0) + Number(l.valor); });
    return map;
  }, [lancamentos]);

  const resetForm = () => {
    setForm({
      data: new Date().toISOString().split("T")[0],
      competencia_mes: filterMes,
      competencia_ano: filterAno,
      tipo: "Faturamento",
      subtipo: "Venda Bruta",
      descricao: "",
      valor: "",
      observacao: "",
      status: "ativo",
    });
    setEditingId(null);
  };

  const openNew = () => { resetForm(); setDialogOpen(true); };

  const openEdit = (l: Lancamento) => {
    setForm({
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
    setEditingId(l.id);
    setDialogOpen(true);
  };

  const duplicar = (l: Lancamento) => {
    setForm({
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
    setEditingId(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.valor || Number(form.valor) === 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!storeId || !user) return;

    const payload = {
      store_id: storeId,
      user_id: user.id,
      data: form.data,
      competencia_mes: form.competencia_mes,
      competencia_ano: form.competencia_ano,
      tipo: form.tipo,
      subtipo: form.subtipo,
      descricao: form.descricao || null,
      valor: Number(form.valor),
      observacao: form.observacao || null,
      status: form.status,
      updated_at: new Date().toISOString(),
    };

    if (editingId) {
      const { error } = await supabase.from("lancamentos").update(payload as any).eq("id", editingId);
      if (error) { toast.error("Erro ao atualizar"); return; }
      toast.success("Lançamento atualizado");
    } else {
      const { error } = await supabase.from("lancamentos").insert(payload as any);
      if (error) { toast.error("Erro ao salvar"); return; }
      toast.success("Lançamento criado");
    }
    setDialogOpen(false);
    resetForm();
    fetchLancamentos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este lançamento?")) return;
    const { error } = await supabase.from("lancamentos").delete().eq("id", id);
    if (error) { toast.error("Erro ao excluir"); return; }
    toast.success("Lançamento excluído");
    fetchLancamentos();
  };

  // Bulk selection
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(l => l.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Excluir ${selectedIds.size} lançamento(s) selecionado(s)?`)) return;

    const ids = Array.from(selectedIds);
    const { error } = await supabase.from("lancamentos").delete().in("id", ids);
    if (error) { toast.error("Erro ao excluir em massa"); return; }
    toast.success(`${ids.length} lançamento(s) excluído(s)`);
    setSelectedIds(new Set());
    fetchLancamentos();
  };

  const fmtCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  // Admin check
  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-center py-16">
          <Card className="bg-card border-border max-w-md">
            <CardContent className="p-8 text-center">
              <p className="text-lg font-semibold text-foreground mb-2">Acesso Restrito</p>
              <p className="text-sm text-muted-foreground">
                A aba de Lançamentos é restrita a administradores.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-foreground">Lançamentos</h2>
          <p className="text-sm text-muted-foreground">Cadastre e gerencie os lançamentos financeiros (Admin)</p>
        </div>
        <div className="flex gap-2">
          <ImportLancamentos storeId={storeId} userId={user?.id || ""} onImportComplete={fetchLancamentos} />
          <Button onClick={openNew} className="gap-2">
            <Plus className="h-4 w-4" /> Novo Lançamento
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-wrap gap-3 items-end">
          <div>
            <Label className="text-xs text-muted-foreground">Mês</Label>
            <Select value={String(filterMes)} onValueChange={v => setFilterMes(Number(v))}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {meses.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Ano</Label>
            <Select value={String(filterAno)} onValueChange={v => setFilterAno(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tipo</Label>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Todos">Todos</SelectItem>
                {TIPOS_LANCAMENTO_V2.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-muted-foreground">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por descrição ou conta..."
                value={filterBusca}
                onChange={e => setFilterBusca(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-3 flex items-center gap-4">
            <CheckSquare className="h-5 w-5 text-destructive" />
            <span className="text-sm font-medium">{selectedIds.size} selecionado(s)</span>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-2">
              <Trash2 className="h-4 w-4" /> Excluir Selecionados
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelectedIds(new Set())}>
              Limpar Seleção
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Totals per type */}
      {Object.keys(totaisPorTipo).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(totaisPorTipo).map(([tipo, total]) => (
            <Card key={tipo} className="bg-card border-border">
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{tipo}</p>
                <p className="text-sm font-bold text-foreground">{fmtCurrency(total)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      <Card className="bg-card border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={filtered.length > 0 && selectedIds.size === filtered.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Carregando...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum lançamento encontrado</TableCell>
                </TableRow>
              ) : (
                filtered.map(l => (
                  <TableRow key={l.id} className={selectedIds.has(l.id) ? "bg-primary/5" : ""}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(l.id)}
                        onCheckedChange={() => toggleSelect(l.id)}
                      />
                    </TableCell>
                    <TableCell className="text-sm">{new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>
                      <span className="text-xs bg-secondary/20 text-secondary-foreground px-2 py-0.5 rounded-full">
                        {l.tipo}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{l.subtipo}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{l.descricao || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmtCurrency(Number(l.valor))}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(l)} title="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => duplicar(l)} title="Duplicar">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(l.id)} title="Excluir">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog Form */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data</Label>
                <Input type="date" value={form.data} onChange={e => setForm(p => ({ ...p, data: e.target.value }))} />
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
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
                <Select value={String(form.competencia_mes)} onValueChange={v => setForm(p => ({ ...p, competencia_mes: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {meses.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Competência Ano</Label>
                <Select value={String(form.competencia_ano)} onValueChange={v => setForm(p => ({ ...p, competencia_ano: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2024, 2025, 2026].map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm(p => ({ ...p, tipo: v, subtipo: (SUBCONTAS_V2[v] || [])[0] || "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS_LANCAMENTO_V2.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subconta</Label>
              <Select value={form.subtipo} onValueChange={v => setForm(p => ({ ...p, subtipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {subcontas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" placeholder="0,00" value={form.valor} onChange={e => setForm(p => ({ ...p, valor: e.target.value }))} />
            </div>
            <div>
              <Label>Descrição / Beneficiário</Label>
              <Input placeholder="Descrição do lançamento" value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} />
            </div>
            <div>
              <Label>Observação</Label>
              <Textarea placeholder="Observações adicionais..." value={form.observacao} onChange={e => setForm(p => ({ ...p, observacao: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editingId ? "Salvar" : "Criar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
