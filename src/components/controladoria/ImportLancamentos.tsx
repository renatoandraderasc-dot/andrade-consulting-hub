import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Upload, Download, AlertCircle, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import Papa from "papaparse";
import * as XLSX from "xlsx";

interface Props {
  storeId: string;
  userId: string;
  onImportComplete: () => void;
}

interface ParsedRow {
  data_vencimento: string;
  competencia_mes: number;
  competencia_ano: number;
  tipo: string;
  subtipo: string;
  descricao: string;
  valor: number;
  classified: boolean;
  error?: string;
}

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

function parseDate(val: any): { iso: string; mes: number; ano: number } | null {
  if (!val) return null;
  const s = String(val).trim();

  // dd/mm/yyyy or dd-mm-yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    const y = dmy[3];
    return { iso: `${y}-${m}-${d}`, mes: parseInt(m), ano: parseInt(y) };
  }

  // yyyy-mm-dd
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    return { iso: s, mes: parseInt(ymd[2]), ano: parseInt(ymd[1]) };
  }

  // Excel serial number
  const num = Number(val);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    const iso = date.toISOString().split("T")[0];
    return { iso, mes: date.getMonth() + 1, ano: date.getFullYear() };
  }

  return null;
}

function parseRow(row: any): ParsedRow {
  const errors: string[] = [];

  // Find the date field (flexible naming)
  const dateVal = row.data_vencimento || row.data || row.vencimento || row.date || "";
  const parsed = parseDate(dateVal);

  if (!parsed) {
    errors.push("data inválida");
  }

  const valor = parseNumber(row.valor || row.value || row.total || "");
  if (valor === 0) errors.push("valor zerado");

  const descricao = String(row.descricao || row.beneficiario || row.description || row.desc || "").trim();

  // tipo is optional — will be classified by AI
  const tipo = String(row.tipo || row.type || row.classificacao || "").trim();

  return {
    data_vencimento: parsed?.iso || new Date().toISOString().split("T")[0],
    competencia_mes: parsed?.mes || new Date().getMonth() + 1,
    competencia_ano: parsed?.ano || new Date().getFullYear(),
    tipo,
    subtipo: "",
    descricao,
    valor,
    classified: false,
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
  const [classifying, setClassifying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const validRows = rows.filter(r => !r.error && r.classified);
  const pendingRows = rows.filter(r => !r.error && !r.classified);
  const errorRows = rows.filter(r => r.error);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    try {
      const raw = await parseFile(file);
      const parsed = raw.map(r => parseRow(r));
      setRows(parsed);
      if (parsed.length === 0) {
        toast.error("Nenhuma linha encontrada no arquivo");
      } else {
        toast.success(`${parsed.length} linhas carregadas. Clique em "Classificar com IA" para categorizar.`);
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao processar arquivo");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const classifyWithAI = async () => {
    const toClassify = rows.filter(r => !r.error);
    if (toClassify.length === 0) return;

    setClassifying(true);
    try {
      // Process in batches of 30
      const batchSize = 30;
      const allClassified = [...rows];

      for (let i = 0; i < toClassify.length; i += batchSize) {
        const batch = toClassify.slice(i, i + batchSize);
        const items = batch.map(r => ({
          descricao: r.descricao,
          valor: r.valor,
          tipo: r.tipo,
        }));

        const { data, error } = await supabase.functions.invoke("classify-lancamentos", {
          body: { items },
        });

        if (error || !data?.classifications) {
          toast.error(data?.error || "Erro na classificação IA");
          setClassifying(false);
          return;
        }

        // Map classifications back to rows
        data.classifications.forEach((c: any) => {
          const batchIdx = c.index - 1;
          const originalRow = batch[batchIdx];
          if (!originalRow) return;
          const globalIdx = allClassified.findIndex(r => r === originalRow);
          if (globalIdx >= 0) {
            allClassified[globalIdx] = {
              ...allClassified[globalIdx],
              tipo: c.tipo,
              subtipo: c.subtipo,
              classified: true,
            };
          }
        });
      }

      setRows(allClassified);
      toast.success("Classificação concluída!");
    } catch (err: any) {
      toast.error("Erro ao classificar: " + (err.message || "erro desconhecido"));
    }
    setClassifying(false);
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
        data: r.data_vencimento,
        competencia_mes: r.competencia_mes,
        competencia_ano: r.competencia_ano,
        tipo: r.tipo,
        subtipo: r.subtipo,
        descricao: r.descricao || null,
        valor: r.valor,
        observacao: null,
        status: "ativo",
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
    if (errors > 0) toast.error(`${errors} lançamentos falharam ao importar`);
    if (imported > 0) {
      toast.success(`${imported} lançamentos importados com sucesso!`);
      onImportComplete();
      setOpen(false);
      setRows([]);
    }
  };

  const downloadTemplate = () => {
    const headers = ["data_vencimento", "descricao", "valor", "tipo"];
    const examples = [
      ["15/01/2026", "Fornecedor ABC Alimentos", "15000,50", ""],
      ["20/01/2026", "Energia Elétrica", "3500,00", ""],
      ["25/01/2026", "Aluguel Loja", "8000,00", ""],
      ["28/01/2026", "Salários Funcionários", "22000,00", ""],
      ["30/01/2026", "ICMS Mês", "4500,00", "Impostos"],
    ];
    const csv = [headers.join(";"), ...examples.map(e => e.join(";"))].join("\n");
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

      <Dialog open={open} onOpenChange={v => { if (!importing && !classifying) setOpen(v); }}>
        <DialogContent className="sm:max-w-[750px] max-h-[85vh] flex flex-col">
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
              Colunas aceitas: <strong>data_vencimento</strong> (dd/mm/aaaa), <strong>descricao</strong> (beneficiário), <strong>valor</strong> (R$), <strong>tipo</strong> (opcional — a IA classifica automaticamente).
            </p>

            {rows.length > 0 && (
              <>
                <div className="flex flex-wrap gap-4 items-center text-sm">
                  <span className="text-muted-foreground">
                    {rows.length} linhas carregadas
                  </span>
                  {validRows.length > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-4 w-4" /> {validRows.length} classificados
                    </span>
                  )}
                  {pendingRows.length > 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Sparkles className="h-4 w-4" /> {pendingRows.length} aguardando classificação
                    </span>
                  )}
                  {errorRows.length > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-4 w-4" /> {errorRows.length} com erro
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    Total: {fmtCurrency(rows.filter(r => !r.error).reduce((s, r) => s + r.valor, 0))}
                  </span>
                </div>

                {pendingRows.length > 0 && (
                  <Button
                    onClick={classifyWithAI}
                    disabled={classifying}
                    className="gap-2 w-fit"
                    variant="default"
                  >
                    {classifying ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Classificando...</>
                    ) : (
                      <><Sparkles className="h-4 w-4" /> Classificar com IA ({pendingRows.length} itens)</>
                    )}
                  </Button>
                )}

                <div className="overflow-auto flex-1 border rounded-md border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">#</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Comp.</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Subtipo</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.slice(0, 100).map((r, i) => (
                        <TableRow key={i} className={r.error ? "bg-destructive/10" : r.classified ? "" : "bg-amber-500/5"}>
                          <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                          <TableCell className="text-xs">{r.data_vencimento}</TableCell>
                          <TableCell className="text-xs">{r.competencia_mes}/{r.competencia_ano}</TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate">{r.descricao || "—"}</TableCell>
                          <TableCell className="text-xs text-right font-mono">{fmtCurrency(r.valor)}</TableCell>
                          <TableCell className="text-xs">
                            {r.tipo ? (
                              <span className="bg-secondary/20 text-secondary-foreground px-1.5 py-0.5 rounded text-xs">
                                {r.tipo}
                              </span>
                            ) : (
                              <span className="text-muted-foreground italic">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">{r.subtipo || "—"}</TableCell>
                          <TableCell className="text-xs">
                            {r.error ? (
                              <span className="text-destructive text-xs" title={r.error}>
                                <AlertCircle className="h-3 w-3 inline mr-1" />{r.error}
                              </span>
                            ) : r.classified ? (
                              <span className="text-green-600 text-xs">
                                <CheckCircle2 className="h-3 w-3 inline mr-1" />OK
                              </span>
                            ) : (
                              <span className="text-amber-600 text-xs">Pendente</span>
                            )}
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

            {(importing || classifying) && (
              <div className="space-y-2">
                <Progress value={importing ? progress : undefined} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {classifying ? "Classificando com IA..." : `Importando... ${progress}%`}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setRows([]); }} disabled={importing || classifying}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={importing || classifying || validRows.length === 0} className="gap-2">
              {importing ? "Importando..." : `Importar ${validRows.length} lançamentos`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
