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

const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const pct = (v: number) => `${v.toFixed(2)}%`;

const StatusIcon = ({ ok }: { ok: boolean }) =>
  ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 inline" /> : <XCircle className="w-3.5 h-3.5 text-red-400 inline" />;

const DailyMetricsTable = ({ data }: { data: DailyRow[] }) => {
  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-muted-foreground font-body text-sm">Nenhum dado diário cadastrado para este período.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th colSpan={2} className="px-2 py-2 text-left font-semibold" />
              <th colSpan={3} className="px-2 py-1 text-center font-display font-semibold text-primary border-l border-border">Vendas</th>
              <th colSpan={3} className="px-2 py-1 text-center font-display font-semibold text-primary border-l border-border">Lucro</th>
              <th colSpan={3} className="px-2 py-1 text-center font-display font-semibold text-primary border-l border-border">Margem</th>
              <th colSpan={3} className="px-2 py-1 text-center font-display font-semibold text-primary border-l border-border">Volume</th>
            </tr>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-2 py-1.5 text-left">Data</th>
              <th className="px-2 py-1.5 text-left">Tipo</th>
              <th className="px-2 py-1.5 text-right border-l border-border">Meta</th>
              <th className="px-2 py-1.5 text-right">Realiz.</th>
              <th className="px-2 py-1.5 text-right">Proj.</th>
              <th className="px-2 py-1.5 text-right border-l border-border">Meta</th>
              <th className="px-2 py-1.5 text-right">Realiz.</th>
              <th className="px-2 py-1.5 text-right">Proj.</th>
              <th className="px-2 py-1.5 text-right border-l border-border">Meta</th>
              <th className="px-2 py-1.5 text-right">Realiz.</th>
              <th className="px-2 py-1.5 text-right">Proj.</th>
              <th className="px-2 py-1.5 text-right border-l border-border">Meta</th>
              <th className="px-2 py-1.5 text-right">Realiz.</th>
              <th className="px-2 py-1.5 text-right">Proj.</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const vendasOk = row.realizadoVendas >= row.metaVendas;
              const lucroOk = row.realizadoLucro >= row.metaLucro;
              return (
                <tr key={i} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                  <td className="px-2 py-1.5">{row.date}</td>
                  <td className="px-2 py-1.5 font-semibold">{row.tipoDia}</td>
                  <td className="px-2 py-1.5 text-right border-l border-border/50">{fmt(row.metaVendas)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <StatusIcon ok={vendasOk} /> {fmt(row.realizadoVendas)}
                  </td>
                  <td className="px-2 py-1.5 text-right">{fmt(row.projecaoVendas)}</td>
                  <td className="px-2 py-1.5 text-right border-l border-border/50">{fmt(row.metaLucro)}</td>
                  <td className="px-2 py-1.5 text-right">
                    <StatusIcon ok={lucroOk} /> {fmt(row.realizadoLucro)}
                  </td>
                  <td className="px-2 py-1.5 text-right">{fmt(row.projecaoLucro)}</td>
                  <td className="px-2 py-1.5 text-right border-l border-border/50">{pct(row.metaMargemPct)}</td>
                  <td className="px-2 py-1.5 text-right">{pct(row.realizadoMargemPct)}</td>
                  <td className="px-2 py-1.5 text-right">{pct(row.projecaoMargemPct)}</td>
                  <td className="px-2 py-1.5 text-right border-l border-border/50">{fmt(row.metaVolume)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(row.realizadoVolume)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(row.projecaoVolume)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DailyMetricsTable;
