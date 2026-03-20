import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload, Download, AlertCircle, CheckCircle2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TIPOS_LANCAMENTO, SUBCONTAS } from "./lancamentosTypes";
import Papa from "papaparse";
import * as XLSX from "xlsx";

interface Props {
  storeId: string;
  userId: string;
  onImportComplete: () => void;
}

interface ParsedRow {
  data: string;
  competencia_mes: number;
  competencia_ano: number;
  tipo: string;
  subtipo: string;
  descricao: string;
  valor: number;
  observacao: string;
  status: string;
  error?: string;
}

const EXPECTED_HEADERS = ["data", "competencia_mes", "competencia_ano", "tipo", "subtipo", "descricao", "valor", "observacao", "status"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function parseNumber(val: any): number {
  if (val == null || val === "") return 0;
  const s = String(val).replace(/\s/g, "").replace("R$", "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function validateRow(row: any, index: number): ParsedRow {
  const errors: string[] = [];
  const tipo = String(row.tipo || "").trim();
  const subtipo = String(row.subtipo || "").trim();
  const valor = parseNumber(row.valor);

  if (!tipo) errors.push("tipo vazio");
  else if (!TIPOS_LANCAMENTO.includes(tipo as any)) errors.push(`tipo "${tipo}" inválido`);

  if (!subtipo) errors.push("subtipo vazio");
  else if (SUBCONTAS[tipo] && !SUBCONTAS[tipo].includes(subtipo)) errors.push(`subtipo "${subtipo}" não pertence a "${tipo}"`);

  if (valor === 0 && !row.valor) errors.push("valor vazio");

  const mes = parseInt(row.competencia_mes);
  const ano = parseInt(row.competencia_ano);
  if (!mes || mes < 1 || mes > 12) errors.push("mês inválido");
  if (!ano || ano < 2020 || ano > 2030) errors.push("ano inválido");

  let data = String(row.data || "").trim();
  if (!data) {
    data = new Date().toISOString().split("T")[0];
  } else {
    // Try dd/mm/yyyy format
    const ddmmyyyy = data.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyy) {
      data = `${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2, "0")}-${ddmmyyyy[1].padStart(2, "0")}`;
    }
  }

  return {
    data,
    competencia_mes: mes || 1,
    competencia_ano: ano || new Date().getFullYear(),
    tipo,
    subtipo,
    descricao: String(row.descricao || "").trim(),
    valor,
    observacao: String(row.observacao || "").trim(),
    status: String(row.status || "ativo").trim(),
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

function parseFile(file: File): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "csv" || ext === "txt") {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: normalizeHeader,
        complete: (results) => resolve(results.data),
        error: (err: any) => reject(err),
      });
    } else if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const wb = XLSX.read(e.target?.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const normalized = rawData.map((row: any) => {
          const out: any = {};
          Object.keys(row).forEach(k => { out[normalizeHeader(k)] = row[k]; });
          return out;
        });
        resolve(normalized);
      };
      reader.onerror = () => reject(new Error("Erro ao ler arquivo"));
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error("Formato não suportado. Use CSV ou XLSX."));
    }
  });
}

export const ImportLancamentos = ({ storeId, userId, onImportComplete }: Props) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter(r => !r.error);
  const errorRows = rows.filter(r => r.error);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const raw = await parseFile(file);
      const parsed = raw.map((r, i) => validateRow(r, i));
      setRows(parsed);
      if (parsed.length === 0) toast.error("Nenhuma linha encontrada no arquivo");
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setProgress(0);

    const batchSize = 50;
    let imported = 0;
    let errors = 0;

    for (let i = 0; i < validRows.length; i += batchSize) {
      const batch = validRows.slice(i, i + batchSize).map(r => ({
        store_id: storeId,
        user_id: userId,
        data: r.data,
        competencia_mes: r.competencia_mes,
        competencia_ano: r.competencia_ano,
        tipo: r.tipo,
        subtipo: r.subtipo,
        descricao: r.descricao || null,
        valor: r.valor,
        observacao: r.observacao || null,
        status: r.status || "ativo",
      }));

      const { error } = await supabase.from("lancamentos").insert(batch as any);
      if (error) {
        errors += batch.length;
      } else {
        imported += batch.length;
      }
      setProgress(Math.round(((i + batch.length) / validRows.length) * 100));
    }

    setImporting(false);
    if (errors > 0) {
      toast.error(`${errors} lançamentos falharam ao importar`);
    }
    if (imported > 0) {
      toast.success(`${imported} lançamentos importados com sucesso!`);
      onImportComplete();
      setOpen(false);
      setRows([]);
    }
  };

  const downloadTemplate = () => {
    const headers = ["data", "competencia_mes", "competencia_ano", "tipo", "subtipo", "descricao", "valor", "observacao", "status"];
    const example = ["2026-01-15", "1", "2026", "Vendas", "Venda Bruta", "Venda do dia", "15000.50", "Loja matriz", "ativo"];
    const csv = [headers.join(";"), example.join(";")].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo_lancamentos.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtCurrency = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Upload className="h-4 w-4" /> Importar Planilha
      </Button>

      <Dialog open={open} onOpenChange={v => { if (!importing) setOpen(v); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Importar Lançamentos em Lote</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex flex-wrap gap-3 items-center">
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2">
                <Download className="h-4 w-4" /> Baixar Modelo CSV
              </Button>
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="import-file"
                />
                <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} className="gap-2">
                  <Upload className="h-4 w-4" /> Selecionar Arquivo
                </Button>
              </div>
              {fileName && <span className="text-sm text-muted-foreground">{fileName}</span>}
            </div>

            <p className="text-xs text-muted-foreground">
              Formatos aceitos: CSV (separado por ; ou ,) e Excel (.xlsx/.xls). 
              Colunas: data, competencia_mes, competencia_ano, tipo, subtipo, descricao, valor, observacao, status
            </p>

            {rows.length > 0 && (
              <>
                <div className="flex gap-4 text-sm">
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="h-4 w-4" /> {validRows.length} válidos
                  </span>
                  {errorRows.length > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-4 w-4" /> {errorRows.length} com erro
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    Total: {fmtCurrency(validRows.reduce((s, r) => s + r.valor, 0))}
                  </span>
                </div>

                <div className="overflow-auto flex-1 border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Mês/Ano</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Subtipo</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 100).map((r, i) => (
                        <TableRow key={i} className={r.error ? "bg-destructive/10" : ""}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="text-xs">{r.data}</TableCell>
                          <TableCell className="text-xs">{r.competencia_mes}/{r.competencia_ano}</TableCell>
                          <TableCell className="text-xs">{r.tipo}</TableCell>
                          <TableCell className="text-xs">{r.subtipo}</TableCell>
                          <TableCell className="text-xs max-w-[120px] truncate">{r.descricao || "—"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{fmtCurrency(r.valor)}</TableCell>
                          <TableCell className="text-xs">
                            {r.error ? (
                              <span className="text-destructive text-xs" title={r.error}>
                                <AlertCircle className="h-3 w-3 inline mr-1" />{r.error}
                              </span>
                            ) : r.status}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rows.length > 100 && (
                    <p className="text-xs text-muted-foreground p-2 text-center">
                      Exibindo 100 de {rows.length} linhas
                    </p>
                  )}
                </div>
              </>
            )}

            {importing && (
              <div className="space-y-2">
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">Importando... {progress}%</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setRows([]); }} disabled={importing}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={importing || validRows.length === 0} className="gap-2">
              {importing ? "Importando..." : `Importar ${validRows.length} lançamentos`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
