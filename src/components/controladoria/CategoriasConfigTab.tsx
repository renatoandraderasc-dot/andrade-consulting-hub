import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Pencil, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DRE_STRUCTURE_COMERCIAL, type DRENode } from "./contRedeStructure";

const STORAGE_KEY = "categorias_nomes_config";

interface CategoriaOverride {
  id: string;
  originalName: string;
  customName: string;
}

function loadOverrides(): CategoriaOverride[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveOverrides(overrides: CategoriaOverride[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

function flattenNodes(nodes: DRENode[]): { id: string; name: string; level: string }[] {
  const result: { id: string; name: string; level: string }[] = [];
  for (const node of nodes) {
    result.push({
      id: node.id,
      name: node.name,
      level: node.isResult ? "Resultado" : node.isGroup ? "Grupo" : node.calcPctOf ? "Calculado" : "Item",
    });
    if (node.children) {
      for (const child of node.children) {
        result.push({
          id: child.id,
          name: child.name,
          level: "Sub-item",
        });
      }
    }
  }
  return result;
}

export function CategoriasConfigTab() {
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState<CategoriaOverride[]>(loadOverrides);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string; originalName: string } | null>(null);
  const [newName, setNewName] = useState("");

  const allCategories = useMemo(() => flattenNodes(DRE_STRUCTURE_COMERCIAL), []);

  const overrideMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of overrides) map.set(o.id, o.customName);
    return map;
  }, [overrides]);

  const filtered = useMemo(() => {
    if (!search) return allCategories;
    const s = search.toLowerCase();
    return allCategories.filter(c => {
      const displayName = overrideMap.get(c.id) || c.name;
      return displayName.toLowerCase().includes(s) || c.name.toLowerCase().includes(s);
    });
  }, [allCategories, search, overrideMap]);

  const openEdit = (cat: { id: string; name: string }) => {
    setEditing({ id: cat.id, originalName: cat.name });
    setNewName(overrideMap.get(cat.id) || cat.name);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!editing || !newName.trim()) return;
    const existing = overrides.filter(o => o.id !== editing.id);
    if (newName.trim() !== editing.originalName) {
      existing.push({ id: editing.id, originalName: editing.originalName, customName: newName.trim() });
    }
    setOverrides(existing);
    saveOverrides(existing);
    setDialogOpen(false);
    toast.success("Nome da categoria atualizado");
  };

  const handleReset = (id: string) => {
    const updated = overrides.filter(o => o.id !== id);
    setOverrides(updated);
    saveOverrides(updated);
    toast.success("Nome restaurado ao original");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Nomes das Categorias</h2>
        <p className="text-sm text-muted-foreground">Edite os nomes exibidos nas linhas da DRE</p>
      </div>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar categoria..."
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
                  <TableHead>Nome Original</TableHead>
                  <TableHead>Nome Atual</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead className="w-[100px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(cat => {
                  const customName = overrideMap.get(cat.id);
                  const isOverridden = !!customName;
                  return (
                    <TableRow key={cat.id} className="group hover:bg-muted/30">
                      <TableCell className={`text-sm ${isOverridden ? "line-through text-muted-foreground" : "font-medium"}`}>
                        {cat.name}
                      </TableCell>
                      <TableCell className="text-sm font-medium">
                        {isOverridden ? (
                          <span className="text-primary">{customName}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          cat.level === "Grupo" ? "bg-secondary/20 text-secondary-foreground" :
                          cat.level === "Resultado" ? "bg-accent text-accent-foreground" :
                          cat.level === "Calculado" ? "bg-primary/10 text-primary" :
                          "bg-muted/20 text-muted-foreground"
                        }`}>
                          {cat.level}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(cat)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {isOverridden && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => handleReset(cat.id)}>
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Renomear Categoria</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div>
              <Label className="text-muted-foreground text-xs">Nome original</Label>
              <p className="text-sm font-medium">{editing?.originalName}</p>
            </div>
            <div>
              <Label>Novo nome</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} />
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
