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
  ok ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-gondola-green inline" />
  ) : (
    <XCircle className="w-3.5 h-3.5 text-offer-red inline" />
  );

const dotted = "border-b border-dotted border-ink/40";

const DailyMetricsTable = ({ data }: { data: DailyRow[] }) => {
  if (data.length === 0) {
    return (
      <div className="clip-tag bg-card border-2 border-ink p-6 text-center">
        <p className="text-muted-foreground font-condensed uppercase tracking-widest text-xs">
          Nenhum dado diário cadastrado para este período.
        </p>
      </div>
    );
  }

  // Totals row
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
  const avg = (k: keyof DailyRow) => (data.length ? data.reduce((s, r) => s + (r[k] as number), 0) / data.length : 0);

  return (
    <div className="clip-tag border-2 border-ink bg-card overflow-hidden mb-6">
      <div className="overflow-x-auto">
        <table className="w-full text-xs tabular">
          <thead>
            <tr className="bg-ink text-paper">
              <th colSpan={2} className="px-2 py-2 text-left font-condensed uppercase tracking-widest" />
              <th colSpan={3} className="px-2 py-2 text-center font-condensed font-bold uppercase tracking-widest border-l border-paper/20">Vendas</th>
              <th colSpan={3} className="px-2 py-2 text-center font-condensed font-bold uppercase tracking-widest border-l border-paper/20">Lucro</th>
              <th colSpan={3} className="px-2 py-2 text-center font-condensed font-bold uppercase tracking-widest border-l border-paper/20">Margem</th>
              <th colSpan={3} className="px-2 py-2 text-center font-condensed font-bold uppercase tracking-widest border-l border-paper/20">Volume</th>
            </tr>
            <tr className="bg-ink text-paper/80 font-condensed uppercase tracking-widest text-[10px]">
              <th className="px-2 py-1.5 text-left">Data</th>
              <th className="px-2 py-1.5 text-left">Tipo</th>
              <th className="px-2 py-1.5 text-right border-l border-paper/20">Meta</th>
              <th className="px-2 py-1.5 text-right">Realiz.</th>
              <th className="px-2 py-1.5 text-right">Proj.</th>
              <th className="px-2 py-1.5 text-right border-l border-paper/20">Meta</th>
              <th className="px-2 py-1.5 text-right">Realiz.</th>
              <th className="px-2 py-1.5 text-right">Proj.</th>
              <th className="px-2 py-1.5 text-right border-l border-paper/20">Meta</th>
              <th className="px-2 py-1.5 text-right">Realiz.</th>
              <th className="px-2 py-1.5 text-right">Proj.</th>
              <th className="px-2 py-1.5 text-right border-l border-paper/20">Meta</th>
              <th className="px-2 py-1.5 text-right">Realiz.</th>
              <th className="px-2 py-1.5 text-right">Proj.</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const vendasOk = row.realizadoVendas >= row.metaVendas && row.metaVendas > 0;
              const lucroOk = row.realizadoLucro >= row.metaLucro && row.metaLucro > 0;
              return (
                <tr key={i} className={`${dotted} hover:bg-poster-yellow/10 transition-colors`}>
                  <td className="px-2 py-1.5 font-condensed">{row.date}</td>
                  <td className="px-2 py-1.5 font-semibold uppercase text-[10px] tracking-wider">{row.tipoDia}</td>
                  <td className="px-2 py-1.5 text-right border-l border-dotted border-ink/30">{fmt(row.metaVendas)}</td>
                  <td className="px-2 py-1.5 text-right"><StatusIcon ok={vendasOk} /> {fmt(row.realizadoVendas)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(row.projecaoVendas)}</td>
                  <td className="px-2 py-1.5 text-right border-l border-dotted border-ink/30">{fmt(row.metaLucro)}</td>
                  <td className="px-2 py-1.5 text-right"><StatusIcon ok={lucroOk} /> {fmt(row.realizadoLucro)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(row.projecaoLucro)}</td>
                  <td className="px-2 py-1.5 text-right border-l border-dotted border-ink/30">{pct(row.metaMargemPct)}</td>
                  <td className="px-2 py-1.5 text-right">{pct(row.realizadoMargemPct)}</td>
                  <td className="px-2 py-1.5 text-right">{pct(row.projecaoMargemPct)}</td>
                  <td className="px-2 py-1.5 text-right border-l border-dotted border-ink/30">{fmt(row.metaVolume)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(row.realizadoVolume)}</td>
                  <td className="px-2 py-1.5 text-right">{fmt(row.projecaoVolume)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-poster-yellow text-ink font-condensed font-bold uppercase">
              <td className="px-2 py-2 text-left">Total</td>
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-right border-l border-ink/20">{fmt(t.metaVendas)}</td>
              <td className="px-2 py-2 text-right">{fmt(t.realizadoVendas)}</td>
              <td className="px-2 py-2 text-right">{fmt(t.projecaoVendas)}</td>
              <td className="px-2 py-2 text-right border-l border-ink/20">{fmt(t.metaLucro)}</td>
              <td className="px-2 py-2 text-right">{fmt(t.realizadoLucro)}</td>
              <td className="px-2 py-2 text-right">{fmt(t.projecaoLucro)}</td>
              <td className="px-2 py-2 text-right border-l border-ink/20">{pct(avg("metaMargemPct"))}</td>
              <td className="px-2 py-2 text-right">{pct(avg("realizadoMargemPct"))}</td>
              <td className="px-2 py-2 text-right">{pct(avg("projecaoMargemPct"))}</td>
              <td className="px-2 py-2 text-right border-l border-ink/20">{fmt(t.metaVolume)}</td>
              <td className="px-2 py-2 text-right">{fmt(t.realizadoVolume)}</td>
              <td className="px-2 py-2 text-right">{fmt(t.projecaoVolume)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default DailyMetricsTable;
