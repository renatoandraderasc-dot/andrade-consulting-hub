import { CheckCircle2, XCircle } from "lucide-react";

export interface DailyRow {
  date: string;
  tipoDia: string;
  metaVendas: number;
  realizadoVendas: number;
  projecaoVendas: number;
  metaLucro: number;
  realizadoLucro: number;
  projecaoLucro: number;
  metaMargemPct: number;
  realizadoMargemPct: number;
  projecaoMargemPct: number;
  metaVolume: number;
  realizadoVolume: number;
  projecaoVolume: number;
}

const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const fmt = (v: number) => num.format(v || 0);
const pct = (v: number) => `${(v || 0).toFixed(2)}%`;

const StatusIcon = ({ ok }: { ok: boolean }) =>
  ok ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-success inline" />
  ) : (
    <XCircle className="w-3.5 h-3.5 text-danger inline" />
  );

const DailyMetricsTable = ({ data }: { data: DailyRow[] }) => {
  if (data.length === 0) {
    return (
      <div className="rounded-lg bg-card border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Nenhum dado diário cadastrado para este período.</p>
      </div>
    );
  }

  const t = data.reduce(
    (acc, r) => ({
      metaVendas: acc.metaVendas + r.metaVendas,
      realizadoVendas: acc.realizadoVendas + r.realizadoVendas,
      projecaoVendas: acc.projecaoVendas + r.projecaoVendas,
      metaLucro: acc.metaLucro + r.metaLucro,
      realizadoLucro: acc.realizadoLucro + r.realizadoLucro,
      projecaoLucro: acc.projecaoLucro + r.projecaoLucro,
      metaVolume: acc.metaVolume + r.metaVolume,
      realizadoVolume: acc.realizadoVolume + r.realizadoVolume,
      projecaoVolume: acc.projecaoVolume + r.projecaoVolume,
    }),
    {
      metaVendas: 0, realizadoVendas: 0, projecaoVendas: 0,
      metaLucro: 0, realizadoLucro: 0, projecaoLucro: 0,
      metaVolume: 0, realizadoVolume: 0, projecaoVolume: 0,
    },
  );
  // Margin totals derived consistently: total lucro / total vendas
  const metaMargemTotal = t.metaVendas > 0 ? (t.metaLucro / t.metaVendas) * 100 : 0;
  const realMargemTotal = t.realizadoVendas > 0 ? (t.realizadoLucro / t.realizadoVendas) * 100 : 0;
  const projMargemTotal = t.projecaoVendas > 0 ? (t.projecaoLucro / t.projecaoVendas) * 100 : 0;

  return (
    <div className="rounded-lg bg-card border border-border overflow-hidden mb-6">
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular">
          <thead>
            <tr className="text-muted-foreground border-b border-border">
              <th colSpan={2} className="px-3 py-2 text-left font-medium uppercase tracking-wider text-[11px]" />
              <th colSpan={3} className="px-3 py-2 text-center font-medium uppercase tracking-wider text-[11px] border-l border-border">Vendas</th>
              <th colSpan={3} className="px-3 py-2 text-center font-medium uppercase tracking-wider text-[11px] border-l border-border">Lucro</th>
              <th colSpan={3} className="px-3 py-2 text-center font-medium uppercase tracking-wider text-[11px] border-l border-border">Margem</th>
              <th colSpan={3} className="px-3 py-2 text-center font-medium uppercase tracking-wider text-[11px] border-l border-border">Volume</th>
            </tr>
            <tr className="text-muted-foreground uppercase tracking-wider text-[10px] border-b border-border">
              <th className="px-3 py-2 text-left font-medium">Data</th>
              <th className="px-3 py-2 text-left font-medium">Tipo</th>
              <th className="px-3 py-2 text-right font-medium border-l border-border">Meta</th>
              <th className="px-3 py-2 text-right font-medium">Realiz.</th>
              <th className="px-3 py-2 text-right font-medium">Proj.</th>
              <th className="px-3 py-2 text-right font-medium border-l border-border">Meta</th>
              <th className="px-3 py-2 text-right font-medium">Realiz.</th>
              <th className="px-3 py-2 text-right font-medium">Proj.</th>
              <th className="px-3 py-2 text-right font-medium border-l border-border">Meta</th>
              <th className="px-3 py-2 text-right font-medium">Realiz.</th>
              <th className="px-3 py-2 text-right font-medium">Proj.</th>
              <th className="px-3 py-2 text-right font-medium border-l border-border">Meta</th>
              <th className="px-3 py-2 text-right font-medium">Realiz.</th>
              <th className="px-3 py-2 text-right font-medium">Proj.</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const vendasOk = row.realizadoVendas >= row.metaVendas && row.metaVendas > 0;
              const lucroOk = row.realizadoLucro >= row.metaLucro && row.metaLucro > 0;
              return (
                <tr key={i} className="border-b border-border/60 hover:bg-secondary/40 transition-colors">
                  <td className="px-3 py-2">{row.date}</td>
                  <td className="px-3 py-2 text-muted-foreground text-[11px] uppercase tracking-wider">{row.tipoDia}</td>
                  <td className="px-3 py-2 text-right border-l border-border/60">{fmt(row.metaVendas)}</td>
                  <td className="px-3 py-2 text-right"><StatusIcon ok={vendasOk} /> {fmt(row.realizadoVendas)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.projecaoVendas)}</td>
                  <td className="px-3 py-2 text-right border-l border-border/60">{fmt(row.metaLucro)}</td>
                  <td className="px-3 py-2 text-right"><StatusIcon ok={lucroOk} /> {fmt(row.realizadoLucro)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.projecaoLucro)}</td>
                  <td className="px-3 py-2 text-right border-l border-border/60">{pct(row.metaMargemPct)}</td>
                  <td className="px-3 py-2 text-right">{pct(row.realizadoMargemPct)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{pct(row.projecaoMargemPct)}</td>
                  <td className="px-3 py-2 text-right border-l border-border/60">{fmt(row.metaVolume)}</td>
                  <td className="px-3 py-2 text-right">{fmt(row.realizadoVolume)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{fmt(row.projecaoVolume)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-secondary/60 text-foreground font-semibold border-t border-border">
              <td className="px-3 py-2.5 text-left uppercase tracking-wider text-[11px]">Total</td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-right border-l border-border">{fmt(t.metaVendas)}</td>
              <td className="px-3 py-2.5 text-right">{fmt(t.realizadoVendas)}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(t.projecaoVendas)}</td>
              <td className="px-3 py-2.5 text-right border-l border-border">{fmt(t.metaLucro)}</td>
              <td className="px-3 py-2.5 text-right">{fmt(t.realizadoLucro)}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(t.projecaoLucro)}</td>
              <td className="px-3 py-2.5 text-right border-l border-border">{pct(metaMargemTotal)}</td>
              <td className="px-3 py-2.5 text-right">{pct(realMargemTotal)}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{pct(projMargemTotal)}</td>
              <td className="px-3 py-2.5 text-right border-l border-border">{fmt(t.metaVolume)}</td>
              <td className="px-3 py-2.5 text-right">{fmt(t.realizadoVolume)}</td>
              <td className="px-3 py-2.5 text-right text-muted-foreground">{fmt(t.projecaoVolume)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default DailyMetricsTable;
