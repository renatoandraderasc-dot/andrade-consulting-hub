import { Target, TrendingUp, DollarSign, BarChart3 } from "lucide-react";

interface KPIData {
  metaAcumulada: number;
  realizado: number;
  realizadoPct: number;
  metaMensal: number;
  projecao: number;
  projecaoPct: number;
}

interface DashboardKPIsProps {
  vendas: KPIData;
  lucro: KPIData;
  margem: { metaPct: number; realizadoPct: number; projecaoPct: number };
  volume: KPIData;
}

const fmt = (v: number) =>
  v >= 1000
    ? `R$ ${(v / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 })}k`
    : `R$ ${v.toLocaleString("pt-BR")}`;

const fmtFull = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const pct = (v: number) => `${v.toFixed(2)}%`;

const KPICard = ({ label, icon: Icon, rows }: { label: string; icon: any; rows: { label: string; value: string; color?: string }[] }) => (
  <div className="bg-card border border-border rounded-2xl p-4">
    <div className="flex items-center gap-2 mb-3">
      <Icon className="w-4 h-4 text-primary" />
      <span className="font-display text-sm font-semibold">{label}</span>
    </div>
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between">
          <span className="font-body text-xs text-muted-foreground">{r.label}</span>
          <span className={`font-display text-sm font-bold ${r.color || ""}`}>{r.value}</span>
        </div>
      ))}
    </div>
  </div>
);

const DashboardKPIs = ({ vendas, lucro, margem, volume }: DashboardKPIsProps) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <KPICard
        label="Vendas"
        icon={DollarSign}
        rows={[
          { label: "Meta Mensal", value: fmtFull(vendas.metaMensal) },
          { label: "Meta Acumulada", value: fmtFull(vendas.metaAcumulada) },
          { label: "Realizado", value: fmtFull(vendas.realizado), color: vendas.realizadoPct >= 100 ? "text-green-500" : "text-amber-500" },
          { label: "Realizado %", value: pct(vendas.realizadoPct), color: vendas.realizadoPct >= 100 ? "text-green-500" : "text-amber-500" },
          { label: "Projeção", value: fmtFull(vendas.projecao) },
          { label: "Projeção %", value: pct(vendas.projecaoPct) },
        ]}
      />
      <KPICard
        label="Lucro"
        icon={TrendingUp}
        rows={[
          { label: "Meta Acumulada", value: fmtFull(lucro.metaAcumulada) },
          { label: "Realizado", value: fmtFull(lucro.realizado), color: lucro.realizadoPct >= 100 ? "text-green-500" : "text-amber-500" },
          { label: "Realizado %", value: pct(lucro.realizadoPct) },
          { label: "Projeção", value: fmtFull(lucro.projecao) },
        ]}
      />
      <KPICard
        label="Margem"
        icon={Target}
        rows={[
          { label: "Meta", value: pct(margem.metaPct) },
          { label: "Realizado", value: pct(margem.realizadoPct), color: margem.realizadoPct >= margem.metaPct ? "text-green-500" : "text-amber-500" },
          { label: "Projeção", value: pct(margem.projecaoPct) },
        ]}
      />
      <KPICard
        label="Volume"
        icon={BarChart3}
        rows={[
          { label: "Meta Acumulada", value: volume.metaAcumulada.toLocaleString("pt-BR") },
          { label: "Realizado", value: volume.realizado.toLocaleString("pt-BR"), color: volume.realizadoPct >= 100 ? "text-green-500" : "text-amber-500" },
          { label: "Realizado %", value: pct(volume.realizadoPct) },
          { label: "Projeção", value: volume.projecao.toLocaleString("pt-BR") },
        ]}
      />
    </div>
  );
};

export default DashboardKPIs;
