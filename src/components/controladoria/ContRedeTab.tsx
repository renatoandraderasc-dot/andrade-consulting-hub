import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DollarSign, TrendingUp, TrendingDown, ShoppingCart, Receipt, BarChart3,
} from "lucide-react";
import { DRETable } from "./DRETable";
import { ContRedeCharts } from "./ContRedeCharts";
import { useLancamentosData } from "./useLancamentosData";

const mesesOptions = [
  { value: 1, label: "Janeiro" }, { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" }, { value: 4, label: "Abril" },
  { value: 5, label: "Maio" }, { value: 6, label: "Junho" },
  { value: 7, label: "Julho" }, { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" }, { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" }, { value: 12, label: "Dezembro" },
];
const anos = ["2024", "2025", "2026"];

interface Props {
  storeId: string;
}

export const ContRedeTab = ({ storeId }: Props) => {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());

  const { kpis, dreData, composicaoDespesas, loading } = useLancamentosData(storeId, mes, ano);

  const fmt = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1000000) return `R$ ${(v / 1000000).toFixed(2).replace(".", ",")}M`;
    if (abs >= 1000) return `R$ ${(v / 1000).toFixed(0)}K`;
    return `R$ ${v.toFixed(2).replace(".", ",")}`;
  };

  const kpiCards = [
    { label: "Receita Líquida", value: fmt(kpis.receitaLiquida), icon: DollarSign, positive: true },
    { label: "Impostos", value: fmt(Math.abs(kpis.impostos)), icon: Receipt, positive: false },
    { label: "CMV", value: fmt(Math.abs(kpis.cmv)), icon: ShoppingCart, positive: false },
    { label: "Despesas", value: fmt(Math.abs(kpis.despesas)), icon: TrendingDown, positive: false },
    { label: "EBITDA", value: fmt(kpis.ebitda), icon: BarChart3, positive: kpis.ebitda >= 0 },
    { label: kpis.resultado >= 0 ? "Lucro" : "Prejuízo", value: fmt(kpis.resultado), icon: TrendingUp, positive: kpis.resultado >= 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">Cont Rede</h2>
        <p className="text-sm text-muted-foreground">
          Painel consolidado de controladoria da rede — alimentado pelos lançamentos
        </p>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-wrap gap-3">
          <Select value={String(mes)} onValueChange={v => setMes(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {mesesOptions.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(ano)} onValueChange={v => setAno(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading && <p className="text-muted-foreground text-sm">Carregando dados...</p>}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-md ${kpi.positive ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                  <kpi.icon className="h-4 w-4" />
                </div>
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-lg font-bold text-foreground">{kpi.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* DRE Table */}
      <DRETable data={dreData} />

      {/* Charts */}
      <ContRedeCharts composicaoDespesas={composicaoDespesas} />
    </div>
  );
};
