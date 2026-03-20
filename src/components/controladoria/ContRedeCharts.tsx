import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const fmtK = (v: number) => v === 0 ? "R$ 0" : `R$ ${(v / 1000).toFixed(0)}K`;

interface Props {
  composicaoDespesas: { name: string; valor: number }[];
}

export const ContRedeCharts = ({ composicaoDespesas }: Props) => {
  const hasData = composicaoDespesas.length > 0;

  return (
    <div className="grid grid-cols-1 gap-6">
      {/* Bar Chart - Composição das Despesas */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Composição das Despesas</CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={composicaoDespesas} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => fmtK(v)} />
                <Bar dataKey="valor" name="Valor" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              Nenhum lançamento de despesas cadastrado para este período
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
