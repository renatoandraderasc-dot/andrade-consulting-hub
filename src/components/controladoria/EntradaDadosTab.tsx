import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  DialogTrigger, DialogClose,
} from "@/components/ui/dialog";
import {
  Upload, FileSpreadsheet, FileText, Plus, Trash2, Check, AlertCircle,
  Download, Calendar,
} from "lucide-react";
import { toast } from "sonner";

interface Lancamento {
  id: string;
  data: string;
  descricao: string;
  tipo: "entrada" | "saida";
  valor: number;
  classificacao: string;
  origem: "manual" | "xml";
  status: "classificado" | "pendente";
}

// Mock data
const mockLancamentos: Lancamento[] = [
  { id: "1", data: "2026-03-01", descricao: "VENDA CARTÃO CRÉDITO", tipo: "entrada", valor: 45230.50, classificacao: "RECEITA DE VENDAS", origem: "xml", status: "classificado" },
  { id: "2", data: "2026-03-01", descricao: "VENDA CARTÃO DÉBITO", tipo: "entrada", valor: 32100.00, classificacao: "RECEITA DE VENDAS", origem: "xml", status: "classificado" },
  { id: "3", data: "2026-03-02", descricao: "COMPRA FORNECEDOR AMBEV", tipo: "saida", valor: 18500.00, classificacao: "COMPRA DO MÊS", origem: "xml", status: "classificado" },
  { id: "4", data: "2026-03-02", descricao: "PAGTO ENERGIA ELÉTRICA", tipo: "saida", valor: 8920.30, classificacao: "SERVIÇOS PÚBLICOS", origem: "manual", status: "classificado" },
  { id: "5", data: "2026-03-03", descricao: "VENDA PIX", tipo: "entrada", valor: 12450.00, classificacao: "RECEITA DE VENDAS", origem: "manual", status: "classificado" },
  { id: "6", data: "2026-03-03", descricao: "TED RECEBIDA 9928", tipo: "entrada", valor: 5600.00, classificacao: "", origem: "xml", status: "pendente" },
  { id: "7", data: "2026-03-04", descricao: "FOLHA PAGAMENTO MAR/26", tipo: "saida", valor: 142500.00, classificacao: "DESPESAS DE PESSOAL", origem: "manual", status: "classificado" },
  { id: "8", data: "2026-03-04", descricao: "ALUGUEL LOJA", tipo: "saida", valor: 28500.00, classificacao: "ALUGUEL", origem: "manual", status: "classificado" },
  { id: "9", data: "2026-03-05", descricao: "DÉBITO AUTOMÁTICO 3842", tipo: "saida", valor: 1230.00, classificacao: "", origem: "xml", status: "pendente" },
  { id: "10", data: "2026-03-05", descricao: "PIX RECEBIDO - JOSÉ", tipo: "entrada", valor: 890.00, classificacao: "", origem: "xml", status: "pendente" },
];

interface EntradaDadosTabProps {
  storeId: string;
  storeName: string;
}

export const EntradaDadosTab = ({ storeId, storeName }: EntradaDadosTabProps) => {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(mockLancamentos);
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroOrigem, setFiltroOrigem] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [formData, setFormData] = useState({ data: "", descricao: "", tipo: "saida" as "entrada" | "saida", valor: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filtered = lancamentos.filter((l) => {
    if (filtroTipo !== "todos" && l.tipo !== filtroTipo) return false;
    if (filtroOrigem !== "todos" && l.origem !== filtroOrigem) return false;
    if (filtroStatus !== "todos" && l.status !== filtroStatus) return false;
    return true;
  });

  const totalEntradas = lancamentos.filter(l => l.tipo === "entrada").reduce((s, l) => s + l.valor, 0);
  const totalSaidas = lancamentos.filter(l => l.tipo === "saida").reduce((s, l) => s + l.valor, 0);
  const pendentes = lancamentos.filter(l => l.status === "pendente").length;
  const importados = lancamentos.filter(l => l.origem === "xml").length;

  const fmtCurrency = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleManualSave = () => {
    if (!formData.data || !formData.descricao || !formData.valor) {
      toast.error("Preencha todos os campos");
      return;
    }
    const newLanc: Lancamento = {
      id: String(Date.now()),
      data: formData.data,
      descricao: formData.descricao.toUpperCase(),
      tipo: formData.tipo,
      valor: parseFloat(formData.valor.replace(",", ".")),
      classificacao: "",
      origem: "manual",
      status: "pendente",
    };
    setLancamentos((prev) => [newLanc, ...prev]);
    setFormData({ data: "", descricao: "", tipo: "saida", valor: "" });
    setIsManualOpen(false);
    toast.success("Lançamento adicionado com sucesso");
  };

  const handleXmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".xml") && !file.name.endsWith(".XML")) {
      toast.error("Selecione um arquivo XML válido");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        // Try to parse NFe XML structure
        const infNFes = xmlDoc.getElementsByTagName("det");
        const newLancamentos: Lancamento[] = [];

        if (infNFes.length > 0) {
          // NFe format
          for (let i = 0; i < infNFes.length; i++) {
            const det = infNFes[i];
            const prod = det.getElementsByTagName("prod")[0];
            if (prod) {
              const desc = prod.getElementsByTagName("xProd")[0]?.textContent || "ITEM IMPORTADO";
              const valor = parseFloat(prod.getElementsByTagName("vProd")[0]?.textContent || "0");
              newLancamentos.push({
                id: String(Date.now() + i),
                data: new Date().toISOString().split("T")[0],
                descricao: desc.toUpperCase(),
                tipo: "saida",
                valor,
                classificacao: "",
                origem: "xml",
                status: "pendente",
              });
            }
          }
        }

        // Try OFX/generic format
        if (newLancamentos.length === 0) {
          const stmtTrns = xmlDoc.getElementsByTagName("STMTTRN");
          for (let i = 0; i < stmtTrns.length; i++) {
            const trn = stmtTrns[i];
            const memo = trn.getElementsByTagName("MEMO")[0]?.textContent || "LANÇAMENTO IMPORTADO";
            const trnAmt = parseFloat(trn.getElementsByTagName("TRNAMT")[0]?.textContent || "0");
            const dtPosted = trn.getElementsByTagName("DTPOSTED")[0]?.textContent || "";
            const dateStr = dtPosted.length >= 8
              ? `${dtPosted.slice(0, 4)}-${dtPosted.slice(4, 6)}-${dtPosted.slice(6, 8)}`
              : new Date().toISOString().split("T")[0];

            newLancamentos.push({
              id: String(Date.now() + i),
              data: dateStr,
              descricao: memo.toUpperCase(),
              tipo: trnAmt >= 0 ? "entrada" : "saida",
              valor: Math.abs(trnAmt),
              classificacao: "",
              origem: "xml",
              status: "pendente",
            });
          }
        }

        if (newLancamentos.length > 0) {
          setLancamentos((prev) => [...newLancamentos, ...prev]);
          toast.success(`${newLancamentos.length} lançamento(s) importado(s) com sucesso`);
        } else {
          toast.info("Nenhum lançamento encontrado no arquivo. Verifique o formato XML (NFe ou OFX).");
        }
      } catch {
        toast.error("Erro ao processar o arquivo XML");
      }
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = (id: string) => {
    setLancamentos((prev) => prev.filter((l) => l.id !== id));
    toast.success("Lançamento removido");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">
          Entrada de Dados
        </h2>
        <p className="text-sm text-muted-foreground">
          Cadastro manual ou importação de lançamentos via XML (NFe / OFX)
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Entradas</p>
            <p className="text-lg font-bold text-emerald-600">{fmtCurrency(totalEntradas)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Total Saídas</p>
            <p className="text-lg font-bold text-red-600">{fmtCurrency(totalSaidas)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Pendentes</p>
            <p className="text-lg font-bold text-amber-600">{pendentes}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Importados (XML)</p>
            <p className="text-lg font-bold text-foreground">{importados}</p>
          </CardContent>
        </Card>
      </div>

      {/* Actions Bar */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex flex-wrap gap-3">
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="entrada">Entradas</SelectItem>
                <SelectItem value="saida">Saídas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas origens</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="xml">XML</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos status</SelectItem>
                <SelectItem value="classificado">Classificados</SelectItem>
                <SelectItem value="pendente">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            {/* XML Upload */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xml,.XML"
              className="hidden"
              onChange={handleXmlUpload}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Importar</span> XML
            </Button>

            {/* Manual Entry */}
            <Dialog open={isManualOpen} onOpenChange={setIsManualOpen}>
              <DialogTrigger asChild>
                <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90 gap-1">
                  <Plus className="h-4 w-4" /> Manual
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo Lançamento Manual</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Data</Label>
                    <Input
                      type="date"
                      value={formData.data}
                      onChange={(e) => setFormData(p => ({ ...p, data: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Descrição</Label>
                    <Input
                      value={formData.descricao}
                      onChange={(e) => setFormData(p => ({ ...p, descricao: e.target.value }))}
                      placeholder="Ex: PAGTO ENERGIA ELÉTRICA"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Tipo</Label>
                    <Select value={formData.tipo} onValueChange={(v: "entrada" | "saida") => setFormData(p => ({ ...p, tipo: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="entrada">Entrada</SelectItem>
                        <SelectItem value="saida">Saída</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Valor (R$)</Label>
                    <Input
                      value={formData.valor}
                      onChange={(e) => setFormData(p => ({ ...p, valor: e.target.value }))}
                      placeholder="0,00"
                      className="mt-1"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancelar</Button>
                  </DialogClose>
                  <Button onClick={handleManualSave}>Salvar</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Lancamentos Table */}
      <Card className="bg-card border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/10">
                <TableHead className="font-semibold w-[100px]">Data</TableHead>
                <TableHead className="font-semibold">Descrição</TableHead>
                <TableHead className="font-semibold">Tipo</TableHead>
                <TableHead className="font-semibold text-right">Valor</TableHead>
                <TableHead className="font-semibold hidden md:table-cell">Classificação</TableHead>
                <TableHead className="font-semibold hidden sm:table-cell">Origem</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold text-right w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => (
                <TableRow
                  key={l.id}
                  className={l.status === "pendente" ? "bg-destructive/5" : ""}
                >
                  <TableCell className="font-mono text-xs">
                    {new Date(l.data + "T12:00:00").toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-medium text-foreground text-sm max-w-[200px] truncate">
                    {l.descricao}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        l.tipo === "entrada"
                          ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                          : "border-red-300 text-red-700 bg-red-50"
                      }
                    >
                      {l.tipo === "entrada" ? "Entrada" : "Saída"}
                    </Badge>
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm ${l.tipo === "entrada" ? "text-emerald-600" : "text-red-600"}`}>
                    {fmtCurrency(l.valor)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                    {l.classificacao || (
                      <span className="text-destructive italic">Não classificado</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant="outline" className="text-xs">
                      {l.origem === "xml" ? (
                        <><FileSpreadsheet className="h-3 w-3 mr-1" /> XML</>
                      ) : (
                        <><FileText className="h-3 w-3 mr-1" /> Manual</>
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={l.status === "classificado" ? "default" : "destructive"}
                      className={
                        l.status === "classificado"
                          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200"
                          : ""
                      }
                    >
                      {l.status === "classificado" ? <Check className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(l.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum lançamento encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Info Card */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Download className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">Formatos aceitos para importação XML:</p>
              <p>• <strong>NFe (Nota Fiscal Eletrônica)</strong> — extrai itens da nota com descrição e valor</p>
              <p>• <strong>OFX (Extrato Bancário)</strong> — extrai lançamentos com data, descrição e valor</p>
              <p>Após importar, classifique os lançamentos na aba <strong>Classificação</strong> para consolidar no painel <strong>Cont Rede</strong>.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
