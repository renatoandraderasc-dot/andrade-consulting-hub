import { useEffect, useMemo, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, BarChart3, RefreshCw } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { carregarLojasPermitidas, type LojaSimples } from "@/lib/lojasPermitidas";
import { chamarRelatorio, avisoRelatorio, pick, num } from "@/lib/vrReport";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const ANOS = [2023, 2024, 2025, 2026];

const C_REG = "hsl(var(--chart-1))";
const C_PROMO = "hsl(var(--chart-3))";
const C_LUCRO = "hsl(var(--chart-2))";
const C_ANT = "hsl(var(--chart-5))";

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const brl = (v: number) => `R$ ${nf0.format(Math.round(v || 0))}`;
const brlCurto = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `R$ ${nf1.format(v / 1_000_000)}M`
  : Math.abs(v) >= 1000 ? `R$ ${nf0.format(v / 1000)}k`
  : `R$ ${nf0.format(v || 0)}`;
const pct = (v: number) => `${nf1.format(v || 0)}%`;
const div = (a: number, b: number) => (b > 0 ? a / b : 0);

interface MesRow {
  mes: number;
  vendas: number;
  promo: number;
  regular: number;
  custo: number;
  custoPromo: number;
  lucro: number;
  volume: number;
  volumePromo: number;
  mix: number;
  mixPromo: number;
  cupons: number;
  cuponsPromo: number;
  compras: number;
  compraIdeal: number;
}

const vazio = (mes: number): MesRow => ({
  mes, vendas: 0, promo: 0, regular: 0, custo: 0, custoPromo: 0, lucro: 0,
  volume: 0, volumePromo: 0, mix: 0, mixPromo: 0, cupons: 0, cuponsPromo: 0,
  compras: 0, compraIdeal: 0,
});

function mapear(linhas: any[]): MesRow[] {
  const porMes = new Map<number, MesRow>();
  for (const l of linhas) {
    const bruto = String(pick(l, "mes", "competencia", "periodo") ?? "");
    const m = Number(bruto.slice(-2)) || Number(bruto);
    if (!m || m < 1 || m > 12) continue;
    const vendas = num(pick(l, "vendas", "faturamento", "venda_total"));
    const promo = num(pick(l, "vendas_promocional", "venda_promocional"));
    const custo = num(pick(l, "custo", "cmv"));
    const custoPromo = num(pick(l, "custo_promocional"));
    const r = porMes.get(m) ?? vazio(m);
    r.vendas += vendas;
    r.promo += promo;
    r.regular += Math.max(vendas - promo, 0);
    r.custo += custo;
    r.custoPromo += custoPromo;
    r.lucro += num(pick(l, "arrecadacao", "lucro")) || vendas - custo;
    r.volume += num(pick(l, "volume"));
    r.volumePromo += num(pick(l, "volume_promocional"));
    r.mix += num(pick(l, "mix"));
    r.mixPromo += num(pick(l, "mix_promocional"));
    r.cupons += num(pick(l, "clientes", "cupons"));
    r.cuponsPromo += num(pick(l, "clientes_promocional", "cupons_promocional"));
    r.compras += num(pick(l, "compras"));
    r.compraIdeal += num(pick(l, "compra_ideal")) || custo;
    porMes.set(m, r);
  }
  return [...porMes.values()].sort((a, b) => a.mes - b.mes);
}

const somar = (rows: MesRow[]): MesRow =>
  rows.reduce((acc, r) => {
    (Object.keys(acc) as (keyof MesRow)[]).forEach((k) => {
      if (k !== "mes") (acc[k] as number) += r[k] as number;
    });
    return acc;
  }, vazio(0));

function Variacao({ atual, anterior, invertido = false }: { atual: number; anterior: number; invertido?: boolean }) {
  if (!anterior) return <span className="text-xs text-muted-foreground">sem base</span>;
  const d = ((atual - anterior) / Math.abs(anterior)) * 100;
  const neutro = Math.abs(d) < 0.5;
  const bom = invertido ? d < 0 : d > 0;
  const Icone = neutro ? ArrowRight : d > 0 ? ArrowUpRight : ArrowDownRight;
  const cor = neutro ? "text-muted-foreground" : bom ? "text-success" : "text-destructive";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${cor}`}>
      <Icone className="h-3.5 w-3.5" />
      {nf1.format(Math.abs(d))}% vs ano anterior
    </span>
  );
}

function Kpi({ titulo, valor, atual, anterior, invertido, detalhe }: {
  titulo: string; valor: string; atual?: number; anterior?: number; invertido?: boolean; detalhe?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-xl font-semibold mt-1 tabular-nums">{valor}</p>
      {detalhe && <p className="text-xs text-muted-foreground mt-0.5">{detalhe}</p>}
      {atual !== undefined && anterior !== undefined && (
        <div className="mt-1"><Variacao atual={atual} anterior={anterior} invertido={invertido} /></div>
      )}
    </Card>
  );
}

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--foreground))",
};

function Grafico({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: React.ReactElement }) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {subtitulo && <p className="text-xs text-muted-foreground">{subtitulo}</p>}
      </div>
      <ResponsiveContainer width="100%" height={280}>{children}</ResponsiveContainer>
    </Card>
  );
}

export default function PainelAnalitico() {
  const { user, isGlobalAdmin } = useAuth() as any;

  const [lojas, setLojas] = useState<LojaSimples[]>([]);
  const [storeId, setStoreId] = useState("");
  const [ano, setAno] = useState(new Date().getFullYear());
  const [areaM2, setAreaM2] = useState(500);
  const [colaboradores, setColaboradores] = useState(25);

  const [atual, setAtual] = useState<MesRow[]>([]);
  const [anterior, setAnterior] = useState<MesRow[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    (async () => {
      const ls = await carregarLojasPermitidas(user?.id, !!isGlobalAdmin);
      setLojas(ls);
      const sid = sessionStorage.getItem("selectedStoreId");
      if (sid && ls.some((l) => l.id === sid)) setStoreId(sid);
      else if (ls.length === 1) setStoreId(ls[0].id);
    })();
  }, [user?.id, isGlobalAdmin]);

  const nomeLoja = lojas.find((l) => l.id === storeId)?.name ?? "";

  async function carregar() {
    if (!storeId) {
      toast({ title: "Escolha a loja", variant: "destructive" });
      return;
    }
    setCarregando(true);
    setAviso(null);
    const cfg = await supabase.from("stores").select("area_m2, colaboradores").eq("id", storeId).maybeSingle();
    setAreaM2(Number((cfg.data as any)?.area_m2) || 500);
    setColaboradores(Number((cfg.data as any)?.colaboradores) || 25);

    const [a, b] = await Promise.all([
      chamarRelatorio(storeId, "diagnostico_mensal", { inicio: `${ano}-01-01`, fim: `${ano}-12-31` }),
      chamarRelatorio(storeId, "diagnostico_mensal", { inicio: `${ano - 1}-01-01`, fim: `${ano - 1}-12-31` }),
    ]);
    setCarregando(false);
    setCarregado(true);

    const msg = avisoRelatorio(a);
    if (msg) { setAtual([]); setAnterior([]); setAviso(msg); return; }
    setAtual(mapear(a.dados || []));
    setAnterior(mapear(b.dados || []));
  }

  const totAtual = useMemo(() => somar(atual), [atual]);
  const totAnt = useMemo(() => somar(anterior), [anterior]);

  const antPorMes = useMemo(() => new Map(anterior.map((r) => [r.mes, r])), [anterior]);

  const serie = useMemo(
    () => atual.map((r) => {
      const ant = antPorMes.get(r.mes);
      return {
        mes: MESES[r.mes - 1],
        regular: r.regular,
        promo: r.promo,
        total: r.vendas,
        anterior: ant?.vendas ?? 0,
        lucro: r.lucro,
        lucroAnterior: ant?.lucro ?? 0,
        margem: div(r.lucro, r.vendas) * 100,
        margemPromo: div(r.promo - r.custoPromo, r.promo) * 100,
        margemRegular: div(r.regular - (r.custo - r.custoPromo), r.regular) * 100,
        compras: r.compras,
        compraIdeal: r.compraIdeal,
        mix: r.mix,
        mixPromo: r.mixPromo,
        vendasM2: div(r.vendas, areaM2),
        vendasColab: div(r.vendas, colaboradores),
        itensM2: div(r.volume, areaM2),
      };
    }),
    [atual, antPorMes, areaM2, colaboradores],
  );

  const participacao = useMemo(() => [
    { name: "Regular", value: totAtual.regular },
    { name: "Promoção", value: totAtual.promo },
  ], [totAtual]);

  const semDados = carregado && !aviso && atual.length === 0;

  return (
    <ClientLayout storeName={nomeLoja}>
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" /> Painel Analítico
            </h1>
            <p className="text-sm text-muted-foreground">
              Faturamento regular x promoção, margens, produtividade e comparativo com o ano anterior.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Loja</label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="w-[240px]"><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                <SelectContent>
                  {lojas.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Ano</label>
              <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
                <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ANOS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={carregar} disabled={carregando}>
              <RefreshCw className={`h-4 w-4 mr-2 ${carregando ? "animate-spin" : ""}`} />
              {carregando ? "Carregando..." : "Atualizar"}
            </Button>
          </div>
        </div>

        {carregando && (
          <div className="grid gap-3 md:grid-cols-4">
            {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        )}

        {!carregando && aviso && (
          <Card className="p-4 text-sm">{aviso}</Card>
        )}

        {!carregando && semDados && (
          <Card className="p-4 text-sm">Nenhum movimento encontrado para {ano} nesta loja.</Card>
        )}

        {!carregando && !aviso && atual.length > 0 && (
          <>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Kpi titulo="Faturamento total" valor={brl(totAtual.vendas)} atual={totAtual.vendas} anterior={totAnt.vendas} />
              <Kpi titulo="Faturamento regular" valor={brl(totAtual.regular)} atual={totAtual.regular} anterior={totAnt.regular} />
              <Kpi titulo="Faturamento promoção" valor={brl(totAtual.promo)} atual={totAtual.promo} anterior={totAnt.promo} />
              <Kpi titulo="Arrecadação (lucro)" valor={brl(totAtual.lucro)} atual={totAtual.lucro} anterior={totAnt.lucro} />

              <Kpi titulo="Margem total" valor={pct(div(totAtual.lucro, totAtual.vendas) * 100)}
                atual={div(totAtual.lucro, totAtual.vendas)} anterior={div(totAnt.lucro, totAnt.vendas)} />
              <Kpi titulo="Margem regular" valor={pct(div(totAtual.regular - (totAtual.custo - totAtual.custoPromo), totAtual.regular) * 100)}
                atual={div(totAtual.regular - (totAtual.custo - totAtual.custoPromo), totAtual.regular)}
                anterior={div(totAnt.regular - (totAnt.custo - totAnt.custoPromo), totAnt.regular)} />
              <Kpi titulo="Margem promoção" valor={pct(div(totAtual.promo - totAtual.custoPromo, totAtual.promo) * 100)}
                atual={div(totAtual.promo - totAtual.custoPromo, totAtual.promo)}
                anterior={div(totAnt.promo - totAnt.custoPromo, totAnt.promo)} />
              <Kpi titulo="Clientes (cupons)" valor={nf0.format(totAtual.cupons)} atual={totAtual.cupons} anterior={totAnt.cupons} />

              <Kpi titulo="Vendas por m²" valor={brl(div(totAtual.vendas, areaM2))} detalhe={`${nf0.format(areaM2)} m²`}
                atual={div(totAtual.vendas, areaM2)} anterior={div(totAnt.vendas, areaM2)} />
              <Kpi titulo="Vendas por colaborador" valor={brl(div(totAtual.vendas, colaboradores))} detalhe={`${colaboradores} colaboradores`}
                atual={div(totAtual.vendas, colaboradores)} anterior={div(totAnt.vendas, colaboradores)} />
              <Kpi titulo="Itens por m²" valor={nf1.format(div(totAtual.volume, areaM2))}
                atual={div(totAtual.volume, areaM2)} anterior={div(totAnt.volume, areaM2)} />
              <Kpi titulo="Ticket médio" valor={brl(div(totAtual.vendas, totAtual.cupons))}
                atual={div(totAtual.vendas, totAtual.cupons)} anterior={div(totAnt.vendas, totAnt.cupons)} />

              <Kpi titulo="Mix (produtos vendidos)" valor={nf0.format(totAtual.mix)} atual={totAtual.mix} anterior={totAnt.mix} />
              <Kpi titulo="Mix promoção" valor={nf0.format(totAtual.mixPromo)} atual={totAtual.mixPromo} anterior={totAnt.mixPromo} />
              <Kpi titulo="Participação regular" valor={pct(div(totAtual.regular, totAtual.vendas) * 100)}
                atual={div(totAtual.regular, totAtual.vendas)} anterior={div(totAnt.regular, totAnt.vendas)} />
              <Kpi titulo="Participação promocional" valor={pct(div(totAtual.promo, totAtual.vendas) * 100)}
                atual={div(totAtual.promo, totAtual.vendas)} anterior={div(totAnt.promo, totAnt.vendas)} />

              <Kpi titulo="Participação itens promo" valor={pct(div(totAtual.volumePromo, totAtual.volume) * 100)}
                atual={div(totAtual.volumePromo, totAtual.volume)} anterior={div(totAnt.volumePromo, totAnt.volume)} />
              <Kpi titulo="Cliente promocional" valor={pct(div(totAtual.cuponsPromo, totAtual.cupons) * 100)}
                atual={div(totAtual.cuponsPromo, totAtual.cupons)} anterior={div(totAnt.cuponsPromo, totAnt.cupons)} />
              <Kpi titulo="Compras" valor={brl(totAtual.compras)} atual={totAtual.compras} anterior={totAnt.compras} />
              <Kpi titulo="Compra ideal (CMV)" valor={brl(totAtual.compraIdeal)}
                detalhe={`Diferença: ${brl(totAtual.compras - totAtual.compraIdeal)}`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Grafico titulo="Faturamento regular x promoção" subtitulo="Por mês, com o total do ano anterior">
                <ComposedChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={brlCurto} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="regular" name="Regular" stackId="f" fill={C_REG} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="promo" name="Promoção" stackId="f" fill={C_PROMO} radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="anterior" name="Ano anterior" stroke={C_ANT} strokeWidth={2} dot={false} />
                </ComposedChart>
              </Grafico>

              <Grafico titulo="Faturamento ano atual x ano anterior" subtitulo={`${ano} x ${ano - 1}`}>
                <LineChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={brlCurto} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="total" name={String(ano)} stroke={C_REG} strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="anterior" name={String(ano - 1)} stroke={C_ANT} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                </LineChart>
              </Grafico>

              <Grafico titulo="Arrecadação (lucro)" subtitulo={`${ano} x ${ano - 1}`}>
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={brlCurto} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="lucroAnterior" name={String(ano - 1)} fill={C_ANT} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="lucro" name={String(ano)} fill={C_LUCRO} radius={[4, 4, 0, 0]} />
                </BarChart>
              </Grafico>

              <Grafico titulo="Margens" subtitulo="Total, regular e promoção">
                <LineChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${nf0.format(v)}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => pct(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="margem" name="Margem total" stroke={C_REG} strokeWidth={3} dot={false} />
                  <Line type="monotone" dataKey="margemRegular" name="Margem regular" stroke={C_LUCRO} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="margemPromo" name="Margem promoção" stroke={C_PROMO} strokeWidth={2} dot={false} />
                </LineChart>
              </Grafico>

              <Grafico titulo="Compra ideal x compras" subtitulo="CMV do mês comparado às entradas de mercadoria">
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={brlCurto} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="compraIdeal" name="Compra ideal (CMV)" fill={C_ANT} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="compras" name="Compras" fill={C_REG} radius={[4, 4, 0, 0]} />
                </BarChart>
              </Grafico>

              <Grafico titulo="Participação regular x promocional" subtitulo="Sobre o faturamento do período">
                <PieChart>
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Pie data={participacao} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                    {participacao.map((p, i) => <Cell key={p.name} fill={i === 0 ? C_REG : C_PROMO} />)}
                  </Pie>
                </PieChart>
              </Grafico>

              <Grafico titulo="Mix de produtos" subtitulo="Total vendido x vendido em promoção">
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => nf0.format(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => nf0.format(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="mix" name="Mix total" fill={C_REG} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="mixPromo" name="Mix promoção" fill={C_PROMO} radius={[4, 4, 0, 0]} />
                </BarChart>
              </Grafico>

              <Grafico titulo="Produtividade" subtitulo="Vendas por m² e por colaborador, mês a mês">
                <ComposedChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="mes" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                  <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))" tickFormatter={brlCurto} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => brl(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="vendasM2" name="Vendas / m²" fill={C_REG} radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="vendasColab" name="Vendas / colaborador" stroke={C_LUCRO} strokeWidth={2} dot={false} />
                </ComposedChart>
              </Grafico>
            </div>
          </>
        )}
      </div>
    </ClientLayout>
  );
}
