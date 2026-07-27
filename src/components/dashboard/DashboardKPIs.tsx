import { Target, TrendingUp, DollarSign, BarChart3 } from "lucide-react";
import PriceTagCard from "@/components/poster/PriceTagCard";
import CouponDivider from "@/components/poster/CouponDivider";

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

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

const fmtBRL = (v: number) => brl.format(v || 0);
const fmtNum = (v: number) => num.format(v || 0);
const pct = (v: number) => `${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

const toneFromPct = (p: number): "success" | "warning" | "danger" =>
  p >= 100 ? "success" : p >= 80 ? "warning" : "danger";

const DashboardKPIs = ({ vendas, lucro, margem, volume }: DashboardKPIsProps) => {
  const margemAtingidoPct = margem.metaPct > 0 ? (margem.realizadoPct / margem.metaPct) * 100 : 0;

  return (
    <>
      <CouponDivider label="Indicadores do mês" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        <PriceTagCard
          label="Vendas"
          icon={<DollarSign className="w-4 h-4" />}
          value={fmtBRL(vendas.realizado)}
          sub={<>Meta {fmtBRL(vendas.metaAcumulada || vendas.metaMensal)}</>}
          badge={{ text: pct(vendas.realizadoPct), tone: toneFromPct(vendas.realizadoPct) }}
          progressPct={vendas.realizadoPct}
        />

        <PriceTagCard
          label="Lucro"
          icon={<TrendingUp className="w-4 h-4" />}
          value={fmtBRL(lucro.realizado)}
          sub={<>Meta {fmtBRL(lucro.metaAcumulada)}</>}
          badge={{ text: pct(lucro.realizadoPct), tone: toneFromPct(lucro.realizadoPct) }}
          progressPct={lucro.realizadoPct}
        />

        <PriceTagCard
          label="Margem"
          icon={<Target className="w-4 h-4" />}
          value={pct(margem.realizadoPct)}
          sub={<>Meta {pct(margem.metaPct)}</>}
          badge={{ text: pct(margemAtingidoPct), tone: toneFromPct(margemAtingidoPct) }}
          progressPct={margemAtingidoPct}
        />

        <PriceTagCard
          label="Volume"
          icon={<BarChart3 className="w-4 h-4" />}
          value={fmtNum(volume.realizado)}
          sub={<>Meta {fmtNum(volume.metaAcumulada)}</>}
          badge={{ text: pct(volume.realizadoPct), tone: toneFromPct(volume.realizadoPct) }}
          progressPct={volume.realizadoPct}
        />
      </div>
    </>
  );
};

export default DashboardKPIs;
