import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Upload, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const MONTH_NAMES = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// Parse pt-BR number: "1.234,56" or "12,5" or "1234.56" or "12,5%" -> number
const parseBRNumber = (raw: string): number => {
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  s = s.replace(/%/g, "").replace(/\s/g, "").replace(/R\$/gi, "");
  // If both "." and "," present -> "." is thousand sep, "," is decimal
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Parse dd/mm/yyyy or dd-mm-yyyy or yyyy-mm-dd
const parseBRDate = (raw: string): { iso: string; year: number; month: number } | null => {
  if (!raw) return null;
  const s = raw.trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    let year = parseInt(y);
    if (year < 100) year += 2000;
    return {
      iso: `${year}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
      year,
      month: parseInt(mo),
    };
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return {
      iso: `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`,
      year: parseInt(y),
      month: parseInt(mo),
    };
  }
  return null;
};

// Expected columns (in order). Tab-separated paste from Excel.
const COLUMNS = [
  "data",
  "ranking_dia_semana",
  "tipo",
  "mes",
  "dia_sem",
  "vendas_realizada",
  "margem_realizada",
  "volume",
  "vendas_meta",
  "margem_meta",
  "lucro_meta",
  "loja",
  "part_percent",
  "lucro",
  "ano",
  "mes_nome",
];

const NUMERIC_COLS = new Set([
  "vendas_realizada",
  "vendas_meta",
  "margem_realizada",
  "margem_meta",
  "volume",
  "lucro",
  "lucro_meta",
]);
// part_percent: percent value (e.g. "35,35" or "35,35%") -> 0.3535

interface ParsedRow {
  data: string;
  ranking_dia_semana: string | null;
  tipo: string | null;
  mes: number | null;
  dia_sem: string | null;
  vendas_realizada: number;
  vendas_meta: number;
  margem_realizada: number;
  margem_meta: number;
  volume: number;
  loja: string | null;
  part_percent: number;
  lucro: number;
  lucro_meta: number;
  ano: number | null;
  mes_nome: string | null;
}

const AdminPadariaImport = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [raw, setRaw] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  if (!authLoading && !user) {
    navigate("/login");
    return null;
  }

  const handleParse = () => {
    setParsing(true);
    setErrors([]);
    setPreview([]);
    try {
      const lines = raw
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (!lines.length) {
        setErrors(["Cole pelo menos uma linha de dados."]);
        setParsing(false);
        return;
      }
      // If first line looks like a header (contains "data" or text), skip it
      const first = lines[0].toLowerCase();
      const hasHeader = first.includes("data") || first.includes("dia") || first.includes("vendas");
      const dataLines = hasHeader ? lines.slice(1) : lines;

      const rows: ParsedRow[] = [];
      const errs: string[] = [];

      dataLines.forEach((line, i) => {
        const cells = line.split("\t");
        if (cells.length < 6) {
          errs.push(`Linha ${i + 1}: poucas colunas (${cells.length}).`);
          return;
        }
        const row: any = {};
        COLUMNS.forEach((col, idx) => {
          const v = cells[idx]?.trim() ?? "";
          if (col === "data") {
            const d = parseBRDate(v);
            if (!d) {
              errs.push(`Linha ${i + 1}: data inválida "${v}".`);
              return;
            }
            row.data = d.iso;
            if (!row.ano) row.ano = d.year;
            if (!row.mes) row.mes = d.month;
            if (!row.mes_nome) row.mes_nome = MONTH_NAMES[d.month];
          } else if (col === "mes" || col === "ano") {
            row[col] = v ? parseInt(v.replace(/\D/g, "")) || null : null;
          } else if (col === "part_percent") {
            row[col] = parseBRNumber(v) / 100;
          } else if (NUMERIC_COLS.has(col)) {
            row[col] = parseBRNumber(v);
          } else {
            row[col] = v || null;
          }
        });

        // Backfill ano/mes/mes_nome from data if blank
        if (!row.ano || !row.mes) {
          const d = parseBRDate(cells[0]?.trim() ?? "");
          if (d) {
            row.ano = row.ano || d.year;
            row.mes = row.mes || d.month;
            row.mes_nome = row.mes_nome || MONTH_NAMES[d.month];
          }
        }

        rows.push(row as ParsedRow);
      });

      setPreview(rows);
      setErrors(errs);
    } catch (e: any) {
      setErrors([`Erro ao processar: ${e?.message ?? e}`]);
    } finally {
      setParsing(false);
    }
  };

  const handleUpload = async () => {
    if (!preview.length) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("vendas_padaria" as any).insert(preview as any);
      if (error) throw error;
      toast({
        title: "Importação concluída",
        description: `${preview.length} registro(s) enviado(s) para vendas_padaria.`,
      });
      setRaw("");
      setPreview([]);
      setErrors([]);
    } catch (e: any) {
      toast({
        title: "Erro ao importar",
        description: e?.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ClientLayout>
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30">
              <FileSpreadsheet className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Importar Vendas Padaria</h1>
              <p className="text-xs text-slate-400">
                Cole linhas copiadas direto do Excel (separadas por TAB).
              </p>
            </div>
          </div>

          <Card className="bg-slate-900/80 border-slate-800 p-4 space-y-3">
            <div className="text-xs text-slate-400">
              <strong className="text-slate-200">Ordem das colunas:</strong>{" "}
              {COLUMNS.join(" | ")}
              <br />
              Datas em formato <code>dd/mm/aaaa</code>; números com ponto como milhar e vírgula como decimal;
              percentuais sem o "%".
            </div>
            <Textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={`01/06/2026\tTOP\tNormal\t6\tSeg\t12.345,67\t10.000,00\t25,5\t22,0\t75,3\tCD MATRIZ\t12,5\t3.150,00\t2.500,00\t2026\tJunho`}
              className="min-h-[200px] font-mono text-xs bg-slate-950 border-slate-700 text-slate-200"
            />
            <div className="flex gap-2">
              <Button onClick={handleParse} disabled={parsing || !raw.trim()} variant="secondary">
                {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Analisar
              </Button>
              <Button
                onClick={handleUpload}
                disabled={saving || preview.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Enviar {preview.length > 0 ? `(${preview.length})` : ""}
              </Button>
            </div>
          </Card>

          {errors.length > 0 && (
            <Card className="bg-red-950/40 border-red-800 p-4">
              <div className="flex items-center gap-2 text-red-300 font-semibold mb-2">
                <AlertCircle className="w-4 h-4" /> {errors.length} aviso(s)
              </div>
              <ul className="text-xs text-red-200 space-y-1 max-h-40 overflow-auto">
                {errors.map((e, i) => (
                  <li key={i}>• {e}</li>
                ))}
              </ul>
            </Card>
          )}

          {preview.length > 0 && (
            <Card className="bg-slate-900/80 border-slate-800 p-4">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-3 text-sm">
                <CheckCircle2 className="w-4 h-4" /> Pré-visualização ({preview.length} linhas)
              </div>
              <div className="overflow-auto max-h-[400px]">
                <table className="w-full text-xs">
                  <thead className="text-slate-400 border-b border-slate-700 sticky top-0 bg-slate-900">
                    <tr>
                      <th className="text-left px-2 py-1">Data</th>
                      <th className="text-left px-2 py-1">Loja</th>
                      <th className="text-right px-2 py-1">V. Real</th>
                      <th className="text-right px-2 py-1">V. Meta</th>
                      <th className="text-right px-2 py-1">M. Real</th>
                      <th className="text-right px-2 py-1">M. Meta</th>
                      <th className="text-right px-2 py-1">Volume</th>
                      <th className="text-right px-2 py-1">Lucro</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-200">
                    {preview.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b border-slate-800">
                        <td className="px-2 py-1">{r.data}</td>
                        <td className="px-2 py-1">{r.loja ?? "-"}</td>
                        <td className="text-right px-2 py-1">{r.vendas_realizada.toLocaleString("pt-BR")}</td>
                        <td className="text-right px-2 py-1">{r.vendas_meta.toLocaleString("pt-BR")}</td>
                        <td className="text-right px-2 py-1">{r.margem_realizada.toLocaleString("pt-BR")}</td>
                        <td className="text-right px-2 py-1">{r.margem_meta.toLocaleString("pt-BR")}</td>
                        <td className="text-right px-2 py-1">{r.volume.toLocaleString("pt-BR")}</td>
                        <td className="text-right px-2 py-1">{r.lucro.toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <div className="text-xs text-slate-500 mt-2">
                    Mostrando 50 de {preview.length} linhas. Todas serão enviadas.
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </ClientLayout>
  );
};

export default AdminPadariaImport;
