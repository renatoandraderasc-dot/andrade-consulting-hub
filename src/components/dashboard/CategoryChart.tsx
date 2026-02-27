import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export interface CategoryChartData {
  category: string;
  atual: number;
  mesAnterior: number;
  anoAnterior: number;
}

const CategoryChart = ({ data, title }: { data: CategoryChartData[]; title: string }) => {
  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-2xl p-6 text-center">
        <p className="text-muted-foreground font-body text-sm">Nenhum dado de categorias cadastrado.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <h3 className="font-display text-sm font-semibold mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} barGap={2} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" fontSize={11} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            formatter={(v: number) => `R$ ${v.toLocaleString("pt-BR")}`}
            contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="atual" fill="hsl(45,93%,47%)" radius={[4, 4, 0, 0]} name="Mês Atual" />
          <Bar dataKey="mesAnterior" fill="hsl(0,0%,60%)" radius={[4, 4, 0, 0]} name="Mês Anterior" />
          <Bar dataKey="anoAnterior" fill="hsl(0,0%,40%)" radius={[4, 4, 0, 0]} name="Ano Anterior" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default CategoryChart;
