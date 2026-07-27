import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LabelList,
  Cell,
} from "recharts";

export interface CategoryChartData {
  category: string;
  atual: number;
  mesAnterior: number;
  anoAnterior: number;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtBRL = (v: number) => brl.format(v || 0);
const fmtShort = (v: number) =>
  v >= 1_000_000
    ? `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`
    : v >= 1000
    ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`
    : String(v || 0);

const CategoryChart = ({ data, title }: { data: CategoryChartData[]; title: string }) => {
  if (data.length === 0) {
    return (
      <div className="rounded-lg bg-card border border-border p-6 text-center">
        <p className="text-sm text-muted-foreground">Nenhum dado de categorias cadastrado.</p>
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.atual - a.atual);
  const maxLen = sorted.reduce((m, r) => Math.max(m, r.category.length), 0);

  return (
    <div className="rounded-lg bg-card border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-primary" /> Mês atual
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/60" /> Mês anterior
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/30" /> Ano anterior
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(240, sorted.length * 56)}>
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 8, right: 60, bottom: 8, left: Math.min(140, maxLen * 7) }}
          barCategoryGap={12}
          barGap={2}
        >
          <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            tickFormatter={fmtShort}
          />
          <YAxis
            type="category"
            dataKey="category"
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            width={Math.min(140, maxLen * 7)}
          />
          <Tooltip
            cursor={{ fill: "hsl(var(--secondary) / 0.4)" }}
            formatter={(v: number) => fmtBRL(Number(v))}
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 12,
              color: "hsl(var(--foreground))",
            }}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ display: "none" }} />
          <Bar dataKey="anoAnterior" name="Ano anterior" fill="hsl(var(--muted-foreground) / 0.3)" radius={[3, 3, 3, 3]} />
          <Bar dataKey="mesAnterior" name="Mês anterior" fill="hsl(var(--muted-foreground) / 0.6)" radius={[3, 3, 3, 3]} />
          <Bar dataKey="atual" name="Mês atual" radius={[3, 3, 3, 3]}>
            {sorted.map((_, i) => (
              <Cell key={i} fill="hsl(var(--primary))" />
            ))}
            <LabelList
              dataKey="atual"
              position="right"
              formatter={(v: number) => fmtShort(Number(v))}
              style={{ fill: "hsl(var(--foreground))", fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CategoryChart;
