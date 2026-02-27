import { ArrowUpRight, ArrowDownRight } from "lucide-react";

export interface ProductCompRow {
  name: string;
  valorAtual: number;
  valorMesAnterior: number;
  valorAnoAnterior: number;
  volumeAtual: number;
  volumeMesAnterior: number;
  volumeAnoAnterior: number;
}

const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`;
const fmtVol = (v: number) => v.toLocaleString("pt-BR");

const Diff = ({ current, previous }: { current: number; previous: number }) => {
  if (previous === 0) return <span className="text-muted-foreground">—</span>;
  const diff = ((current - previous) / previous) * 100;
  const positive = diff >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${positive ? "text-green-500" : "text-red-400"}`}>
      {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
      {Math.abs(diff).toFixed(1)}%
    </span>
  );
};

const ProductComparison = ({ data, title }: { data: ProductCompRow[]; title: string }) => {
  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-muted-foreground font-body text-sm">Nenhum dado de produtos cadastrado.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-body">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-3 py-2 text-left">Produto</th>
              <th className="px-3 py-2 text-right">Valor Atual</th>
              <th className="px-3 py-2 text-right">vs Mês Ant.</th>
              <th className="px-3 py-2 text-right">vs Ano Ant.</th>
              <th className="px-3 py-2 text-right border-l border-border">Vol. Atual</th>
              <th className="px-3 py-2 text-right">vs Mês Ant.</th>
              <th className="px-3 py-2 text-right">vs Ano Ant.</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-muted/10">
                <td className="px-3 py-2 font-semibold">{p.name}</td>
                <td className="px-3 py-2 text-right">{fmt(p.valorAtual)}</td>
                <td className="px-3 py-2 text-right"><Diff current={p.valorAtual} previous={p.valorMesAnterior} /></td>
                <td className="px-3 py-2 text-right"><Diff current={p.valorAtual} previous={p.valorAnoAnterior} /></td>
                <td className="px-3 py-2 text-right border-l border-border/50">{fmtVol(p.volumeAtual)}</td>
                <td className="px-3 py-2 text-right"><Diff current={p.volumeAtual} previous={p.volumeMesAnterior} /></td>
                <td className="px-3 py-2 text-right"><Diff current={p.volumeAtual} previous={p.volumeAnoAnterior} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductComparison;
