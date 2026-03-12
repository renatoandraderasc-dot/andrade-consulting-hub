import { Card, CardContent } from "@/components/ui/card";
import { Package, TrendingUp, TrendingDown, Equal, Percent, AlertTriangle } from "lucide-react";
import type { Product } from "./mockData";

interface Props {
  products: Product[];
}

const RepricingKPIs = ({ products }: Props) => {
  const total = products.length;
  const maior = products.filter(p => p.status === "maior").length;
  const menor = products.filter(p => p.status === "menor").length;
  const igual = products.filter(p => p.status === "igual").length;
  const margemMedia = total > 0 ? products.reduce((s, p) => s + p.margem, 0) / total : 0;
  const oportunidades = products.filter(p => p.status === "maior" && p.margem > 35).length;

  const cards = [
    { label: "Produtos Ativos", value: total, icon: Package, color: "text-primary" },
    { label: "Preço Acima", value: maior, icon: TrendingUp, color: "text-destructive" },
    { label: "Preço Abaixo", value: menor, icon: TrendingDown, color: "text-green-600" },
    { label: "Preço Igual", value: igual, icon: Equal, color: "text-muted-foreground" },
    { label: "Margem Média", value: `${margemMedia.toFixed(1)}%`, icon: Percent, color: "text-primary" },
    { label: "Oportunidades", value: oportunidades, icon: AlertTriangle, color: "text-amber-600" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cards.map(c => (
        <Card key={c.label} className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{c.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default RepricingKPIs;
