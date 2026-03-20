import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Pencil, Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { SUBCONTAS_V2, TIPOS_LANCAMENTO_V2 } from "./contRedeStructure";

// We store classification overrides in localStorage since they're config-level
const STORAGE_KEY = "classificacoes_config";

interface ClassificacaoEntry {
  id: string;
  descricao: string;
  tipo: string;
  subtipo: string;
}

function loadClassificacoes(): ClassificacaoEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveClassificacoes(entries: ClassificacaoEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

// Import the DIRECT_MAP keys for display (we'll build from the structure)
import { classifyDeterministic } from "./contRedeStructure";

export function ClassificacoesConfigTab() {
  const [search, setSearch] = useState("");
  const [customEntries, setCustomEntries] = useState<ClassificacaoEntry[]>(loadClassificacoes);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<ClassificacaoEntry | null>(null);
  const [form, setForm] = useState({ descricao: "", tipo: "", subtipo: "" });

  // Build a merged list: built-in classifications + custom overrides
  const builtInEntries = useMemo(() => {
    // We'll generate entries from all known SUBCONTAS
    const entries: ClassificacaoEntry[] = [];
    for (const [tipo, subtipos] of Object.entries(SUBCONTAS_V2)) {
      for (const subtipo of subtipos) {
        entries.push({
          id: `builtin_${tipo}_${subtipo}`,
          descricao: subtipo,
          tipo,
          subtipo,
        });
      }
    }
    return entries;
  }, []);

  const allEntries = useMemo(() => {
    const customMap = new Map(customEntries.map(e => [e.descricao.toLowerCase(), e]));
    const merged = builtInEntries.map(e => {
      const override = customMap.get(e.descricao.toLowerCase());
      return override || e;
    });
    // Add custom entries that don't override built-ins
    for (const ce of customEntries) {
      if (!builtInEntries.find(b => b.descricao.toLowerCase() === ce.descricao.toLowerCase())) {
        merged.push(ce);
      }
    }
    return merged;
  }, [builtInEntries, customEntries]);

  const filtered = useMemo(() => {
    if (!search) return allEntries;
    const s = search.toLowerCase();
    return allEntries.filter(e =>
      e.descricao.toLowerCase().includes(s) ||
      e.tipo.toLowerCase().includes(s) ||
      e.subtipo.toLowerCase().includes(s)
    );
  }, [allEntries, search]);

  const openAdd = () => {
    setEditingEntry(null);
    setForm({ descricao: "", tipo: TIPOS_LANCAMENTO_V2[0], subtipo: "" });
    setDialogOpen(true);
  };

  const openEdit = (entry: ClassificacaoEntry) => {
    setEditingEntry(entry);
    setForm({ descricao: entry.descricao, tipo: entry.tipo, subtipo: entry.subtipo });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.descricao || !form.tipo || !form.subtipo) {
      toast.error("Preencha todos os campos");
      return;
    }
    const newEntry: ClassificacaoEntry = {
      id: editingEntry?.id || `custom_${Date.now()}`,
      descricao: form.descricao,
      tipo: form.tipo,
      subtipo: form.subtipo,
    };

    let updated: ClassificacaoEntry[];
    if (editingEntry) {
      updated = customEntries.map(e => e.id === editingEntry.id ? newEntry : e);
      if (!customEntries.find(e => e.id === editingEntry.id)) {
        updated = [...customEntries, newEntry];
      }
    } else {
      updated = [...customEntries, newEntry];
    }
    setCustomEntries(updated);
    saveClassificacoes(updated);
    setDialogOpen(false);
    toast.success("Classificação salva");
  };

  const handleDelete = (entry: ClassificacaoEntry) => {
    const updated = customEntries.filter(e => e.id !== entry.id);
    setCustomEntries(updated);
    saveClassificacoes(updated);
    toast.success("Classificação removida");
  };

  const subcontas = SUBCONTAS_V2[form.tipo] || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Classificações de Lançamentos</h2>
          <p className="text-sm text-muted-foreground">Gerencie o mapeamento de descrições para tipos e subtipos</p>
        </div>
        <Button onClick={openAdd} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> Nova Classificação
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar classificação..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Subtipo</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 100).map(entry => (
                  <TableRow key={entry.id} className="group hover:bg-muted/30">
                    <TableCell className="font-medium text-sm">{entry.descricao}</TableCell>
                    <TableCell>
                      <span className="text-xs bg-secondary/20 text-secondary-foreground px-2 py-0.5 rounded-full">
                        {entry.tipo}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.subtipo}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(entry)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {entry.id.startsWith("custom_") && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(entry)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      Nenhuma classificação encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filtered.length > 100 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Mostrando 100 de {filtered.length} resultados. Use a busca para filtrar.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingEntry ? "Editar Classificação" : "Nova Classificação"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label>Descrição (texto que será reconhecido)</Label>
              <Input value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} placeholder="Ex: salarios, fgts, aluguel..." />
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
              <Label>Subtipo</Label>
              <Select value={form.subtipo} onValueChange={v => setForm(p => ({ ...p, subtipo: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {subcontas.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} className="gap-2"><Save className="h-4 w-4" /> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
