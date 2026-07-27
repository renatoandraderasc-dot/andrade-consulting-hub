import { Target, TrendingUp, DollarSign, BarChart3 } from "lucide-react";
import PriceTagCard from "@/components/poster/PriceTagCard";
import Thermometer from "@/components/poster/Thermometer";
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

const fmtBRL = (v: number) =>
  v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}M`
    : v >= 1000
    ? `R$ ${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`
    : `R$ ${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const fmtNum = (v: number) =>
  v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k` : v.toLocaleString("pt-BR");
const pct = (v: number) => `${v.toFixed(1)}%`;

const toneFromPct = (p: number): "green" | "yellow" | "red" =>
  p >= 100 ? "green" : p >= 80 ? "yellow" : "red";

const DashboardKPIs = ({ vendas, lucro, margem, volume }: DashboardKPIsProps) => {
  return (
    <>
      <CouponDivider label="Indicadores do Mês" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6 pt-3">
        <PriceTagCard
          label="Vendas"
          ribbonTone="yellow"
          icon={<DollarSign className="w-3.5 h-3.5" />}
          value={fmtBRL(vendas.realizado)}
          sub={
            <div className="space-y-1 w-full">
              <div className="flex justify-between tabular">
                <span>Meta</span><span>{fmtBRL(vendas.metaAcumulada || vendas.metaMensal)}</span>
              </div>
              <Thermometer pct={vendas.realizadoPct} />
            </div>
          }
          badge={{ text: pct(vendas.realizadoPct), tone: toneFromPct(vendas.realizadoPct) }}
        />

        <PriceTagCard
          label="Lucro"
          ribbonTone="red"
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          value={fmtBRL(lucro.realizado)}
          sub={
            <div className="space-y-1 w-full">
              <div className="flex justify-between tabular">
                <span>Meta</span><span>{fmtBRL(lucro.metaAcumulada)}</span>
              </div>
              <Thermometer pct={lucro.realizadoPct} />
            </div>
          }
          badge={{ text: pct(lucro.realizadoPct), tone: toneFromPct(lucro.realizadoPct) }}
        />

        <PriceTagCard
          label="Margem"
          ribbonTone="green"
          icon={<Target className="w-3.5 h-3.5" />}
          value={pct(margem.realizadoPct)}
          sub={
            <div className="space-y-1 w-full">
              <div className="flex justify-between tabular">
                <span>Meta</span><span>{pct(margem.metaPct)}</span>
              </div>
              <Thermometer
                pct={margem.metaPct > 0 ? (margem.realizadoPct / margem.metaPct) * 100 : 0}
              />
            </div>
          }
          badge={{
            text: pct(margem.metaPct > 0 ? (margem.realizadoPct / margem.metaPct) * 100 : 0),
            tone: toneFromPct(margem.metaPct > 0 ? (margem.realizadoPct / margem.metaPct) * 100 : 0),
          }}
        />

        <PriceTagCard
          label="Volume"
          ribbonTone="ink"
          icon={<BarChart3 className="w-3.5 h-3.5" />}
          value={fmtNum(volume.realizado)}
          sub={
            <div className="space-y-1 w-full">
              <div className="flex justify-between tabular">
                <span>Meta</span><span>{fmtNum(volume.metaAcumulada)}</span>
              </div>
              <Thermometer pct={volume.realizadoPct} />
            </div>
          }
          badge={{ text: pct(volume.realizadoPct), tone: toneFromPct(volume.realizadoPct) }}
        />
      </div>
    </>
  );
};

export default DashboardKPIs;
