import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, FileSpreadsheet } from "lucide-react";
import { formatBRL } from "@/lib/formatters";
import { ItemEncarte, faixaClass, faixaLabel, pct } from "./types";

interface Props {
  itens: ItemEncarte[];
  nomeEncarte: string;
}

const ImpressaoTab = ({ itens, nomeEncarte }: Props) => {
  const linhas = itens.map((i, idx) => ({
    "Nº": idx + 1,
    Faixa: faixaLabel(String(i.tipo_faixa)),
    Face: i.face === "capa" ? "Capa" : "Verso",
    Departamento: i.departamento ?? "",
    Cód: i.codigo ?? "",
    Produto: i.descricao ?? "",
    Observação: i.observacao ?? "",
    Oferta: i.preco_oferta ?? "",
    "Margem oferta": i.margem_oferta != null ? Number(i.margem_oferta.toFixed(1)) : "",
  }));

  const nomeArquivo = `encarte-${(nomeEncarte || "sugestao").replace(/[^\w-]+/g, "-").toLowerCase()}`;

  const exportXlsx = () => {
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Impressão");
    XLSX.writeFile(wb, `${nomeArquivo}.xlsx`);
  };

  const exportCsv = () => {
    const ws = XLSX.utils.json_to_sheet(linhas);
    const csv = XLSX.utils.sheet_to_csv(ws, { FS: ";" });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${nomeArquivo}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!itens.length}>
          <Download className="w-4 h-4 mr-2" /> Exportar CSV
        </Button>
        <Button size="sm" onClick={exportXlsx} disabled={!itens.length}>
          <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar XLSX
        </Button>
      </div>

      <Card className="p-4 overflow-x-auto">
        {itens.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Gere ou carregue um encarte na aba Montagem para ver a prévia de impressão.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
                <th className="py-2 pr-2 w-10">Nº</th>
                <th className="py-2 pr-2">Faixa</th>
                <th className="py-2 pr-2">Departamento</th>
                <th className="py-2 pr-2">Cód</th>
                <th className="py-2 pr-2">Produto</th>
                <th className="py-2 pr-2">Observação</th>
                <th className="py-2 pr-2 text-right">Oferta</th>
                <th className="py-2 pr-2 text-right">Margem oferta</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i, idx) => (
                <tr key={`${i.face}-${i.posicao}`} className="border-b border-border/50">
                  <td className="py-1.5 pr-2 text-muted-foreground">{idx + 1}</td>
                  <td className="py-1.5 pr-2">
                    <span className={`px-2 py-0.5 rounded border text-xs ${faixaClass(String(i.tipo_faixa))}`}>
                      {faixaLabel(String(i.tipo_faixa))}
                    </span>
                  </td>
                  <td className="py-1.5 pr-2">{i.departamento ?? "—"}</td>
                  <td className="py-1.5 pr-2 font-mono text-xs">{i.codigo ?? "—"}</td>
                  <td className="py-1.5 pr-2">{i.descricao ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground">{i.observacao ?? ""}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold">
                    {i.preco_oferta != null ? formatBRL(i.preco_oferta) : "—"}
                  </td>
                  <td className="py-1.5 pr-2 text-right">{pct(i.margem_oferta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};

export default ImpressaoTab;
