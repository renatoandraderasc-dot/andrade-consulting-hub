import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Search, Plus, Pencil, ListChecks, AlertTriangle, CheckCircle2, BarChart3,
} from "lucide-react";
import { classificacoesMock, type Classificacao } from "./mockData";

export const ClassificacaoTab = () => {
  const [data, setData] = useState<Classificacao[]>(classificacoesMock);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [editItem, setEditItem] = useState<Classificacao | null>(null);
  const [isNewOpen, setIsNewOpen] = useState(false);
  const [formEntrada, setFormEntrada] = useState("");
  const [formClassificacao, setFormClassificacao] = useState("");

  const filtered = useMemo(() => {
    return data.filter((item) => {
      const matchSearch =
        item.entradaOriginal.toLowerCase().includes(search.toLowerCase()) ||
        item.classificacaoGerencial.toLowerCase().includes(search.toLowerCase());
      const matchStatus =
        statusFilter === "todos" ||
        (statusFilter === "classificados" && item.status === "classificado") ||
        (statusFilter === "pendentes" && item.status === "pendente");
      return matchSearch && matchStatus;
    });
  }, [data, search, statusFilter]);

  const totalEntradas = data.length;
  const classificados = data.filter((d) => d.status === "classificado").length;
  const pendentes = totalEntradas - classificados;
  const cobertura = totalEntradas > 0 ? Math.round((classificados / totalEntradas) * 100) : 0;

  const handleSave = () => {
    if (editItem) {
      setData((prev) =>
        prev.map((d) =>
          d.id === editItem.id
            ? {
                ...d,
                entradaOriginal: formEntrada,
                classificacaoGerencial: formClassificacao,
                status: formClassificacao ? "classificado" : "pendente",
                updatedAt: new Date().toISOString().split("T")[0],
              }
            : d
        )
      );
      setEditItem(null);
    } else {
      const newItem: Classificacao = {
        id: String(Date.now()),
        entradaOriginal: formEntrada,
        classificacaoGerencial: formClassificacao,
        status: formClassificacao ? "classificado" : "pendente",
        updatedAt: new Date().toISOString().split("T")[0],
      };
      setData((prev) => [newItem, ...prev]);
      setIsNewOpen(false);
    }
    setFormEntrada("");
    setFormClassificacao("");
  };

  const openEdit = (item: Classificacao) => {
    setEditItem(item);
    setFormEntrada(item.entradaOriginal);
    setFormClassificacao(item.classificacaoGerencial);
  };

  const kpis = [
    { label: "Total de Entradas", value: totalEntradas, icon: ListChecks, color: "text-blue-600" },
    { label: "Classificadas", value: classificados, icon: CheckCircle2, color: "text-emerald-600" },
    { label: "Pendentes", value: pendentes, icon: AlertTriangle, color: "text-amber-600" },
    { label: "Cobertura", value: `${cobertura}%`, icon: BarChart3, color: "text-indigo-600" },
  ];

  const ClassificacaoForm = (
    <div className="space-y-4">
      <div>
        <Label>Entrada Original</Label>
        <Input
          value={formEntrada}
          onChange={(e) => setFormEntrada(e.target.value)}
          placeholder="Ex: COMPRA DE MERCADORIAS"
          className="mt-1"
        />
      </div>
      <div>
        <Label>Classificação Gerencial</Label>
        <Input
          value={formClassificacao}
          onChange={(e) => setFormClassificacao(e.target.value)}
          placeholder="Ex: COMPRA DO MÊS"
          className="mt-1"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">
          Classificação de Lançamentos
        </h2>
        <p className="text-sm text-muted-foreground">
          Padronização gerencial das entradas e despesas
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg bg-muted/30 ${kpi.color}`}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold text-foreground">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters & Actions */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-col sm:flex-row gap-3 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar entrada..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="classificados">Classificados</SelectItem>
                <SelectItem value="pendentes">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Dialog open={isNewOpen} onOpenChange={setIsNewOpen}>
            <DialogTrigger asChild>
              <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90">
                <Plus className="h-4 w-4 mr-1" /> Nova Classificação
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Classificação</DialogTitle>
              </DialogHeader>
              {ClassificacaoForm}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancelar</Button>
                </DialogClose>
                <Button onClick={handleSave} disabled={!formEntrada}>
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="font-semibold">Entrada Original</TableHead>
                <TableHead className="font-semibold">Classificação Gerencial</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold hidden sm:table-cell">Última Atualização</TableHead>
                <TableHead className="font-semibold text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((item) => (
                <TableRow
                  key={item.id}
                  className={item.status === "pendente" ? "bg-destructive/5" : ""}
                >
                  <TableCell className="font-medium text-foreground">
                    {item.entradaOriginal}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.classificacaoGerencial || (
                      <span className="text-destructive italic text-xs">
                        Não classificado
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={item.status === "classificado" ? "default" : "destructive"}
                      className={
                        item.status === "classificado"
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                          : ""
                      }
                    >
                      {item.status === "classificado" ? "Classificado" : "Pendente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {item.updatedAt}
                  </TableCell>
                  <TableCell className="text-right">
                    <Dialog
                      open={editItem?.id === item.id}
                      onOpenChange={(open) => {
                        if (!open) {
                          setEditItem(null);
                          setFormEntrada("");
                          setFormClassificacao("");
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEdit(item)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Editar Classificação</DialogTitle>
                        </DialogHeader>
                        {ClassificacaoForm}
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button variant="outline">Cancelar</Button>
                          </DialogClose>
                          <Button onClick={handleSave} disabled={!formEntrada}>
                            Salvar
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    Nenhum registro encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};
