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
import { dreDataMock } from "./mockData";

const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const anos = ["2024","2025","2026"];
const lojas = ["Todas", "SM Nascimento Embu", "SM Nascimento Taboão", "SM Nascimento Itapecerica"];

export const ContRedeTab = () => {
  const [mes, setMes] = useState("Março");
  const [ano, setAno] = useState("2026");
  const [loja, setLoja] = useState("Todas");

  // Extract KPI values from mock
  const receitaLiq = dreDataMock.find(d => d.id === "receita")!;
  const impostos = dreDataMock.find(d => d.id === "impostos")!;
  const cmv = dreDataMock.find(d => d.id === "cmv")!;
  const despesas = dreDataMock.find(d => d.id === "despesas")!;
  const ebitda = dreDataMock.find(d => d.id === "ebitda")!;
  const resultado = dreDataMock.find(d => d.id === "resultado")!;

  const fmt = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1000000) return `R$ ${(v / 1000000).toFixed(2).replace(".", ",")}M`;
    if (abs >= 1000) return `R$ ${(v / 1000).toFixed(0)}K`;
    return `R$ ${v.toFixed(2).replace(".", ",")}`;
  };

  const kpis = [
    { label: "Receita Líquida", value: fmt(receitaLiq.valor), variacao: receitaLiq.variacao, icon: DollarSign, positive: true },
    { label: "Impostos", value: fmt(impostos.valor), variacao: impostos.variacao, icon: Receipt, positive: false },
    { label: "CMV", value: fmt(cmv.valor), variacao: cmv.variacao, icon: ShoppingCart, positive: false },
    { label: "Despesas", value: fmt(despesas.valor), variacao: despesas.variacao, icon: TrendingDown, positive: false },
    { label: "EBITDA", value: fmt(ebitda.valor), variacao: ebitda.variacao, icon: BarChart3, positive: true },
    { label: resultado.valor >= 0 ? "Lucro" : "Prejuízo", value: fmt(resultado.valor), variacao: resultado.variacao, icon: TrendingUp, positive: resultado.valor >= 0 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-foreground">Cont Rede</h2>
        <p className="text-sm text-muted-foreground">
          Painel consolidado de controladoria da rede
        </p>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4 flex flex-wrap gap-3">
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={loja} onValueChange={setLoja}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {lojas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="bg-card border-border">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded-md ${kpi.positive ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                  <kpi.icon className="h-4 w-4" />
                </div>
                <span className="text-xs text-muted-foreground">{kpi.label}</span>
              </div>
              <p className="text-lg font-bold text-foreground">{kpi.value}</p>
              <p className={`text-xs mt-1 ${kpi.variacao >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {kpi.variacao >= 0 ? "▲" : "▼"} {Math.abs(kpi.variacao).toFixed(1)}% vs mês anterior
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* DRE Table */}
      <DRETable data={dreDataMock} />

      {/* Charts */}
      <ContRedeCharts />
    </div>
  );
};
