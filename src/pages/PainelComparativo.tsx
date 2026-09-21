import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, FileDown, GitCompare, Presentation, RefreshCw } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { carregarLojasPermitidas, type LojaSimples } from "@/lib/lojasPermitidas";
import { chamarRelatorio, avisoRelatorio, pick, num, txt } from "@/lib/vrReport";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { chaveDept } from "@/lib/departamentosPermitidos";
import { exportarPdf, exportarPptx, type BlocoExport } from "@/lib/exportComparativo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CartProgress, CartProgressOverlay } from "@/components/CartProgress";
import { toast } from "@/hooks/use-toast";

const TODOS = "__todos__";
const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

const C1 = "hsl(var(--chart-1))";
const C2 = "hsl(var(--chart-2))";
const C3 = "hsl(var(--chart-3))";
const CANT = "hsl(var(--muted-foreground))";

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const brl = (v: number) => `R$ ${nf0.format(Math.round(v || 0))}`;
const brlCurto = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `${nf1.format(v / 1_000_000)}M` : Math.abs(v) >= 1000 ? `${nf0.format(v / 1000)}k` : nf0.format(v || 0);
const pct = (v: number) => `${nf1.format(v || 0)}%`;
const div = (a: number, b: number) => (b > 0 ? a / b : 0);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

interface MesRow {
  ano: number;
  mes: number;
  vendas: number; promo: number; regular: number;
  custo: number; custoPromo: number; lucro: number;
  volume: number; volumePromo: number;
  mix: number; mixPromo: number;
  cupons: number; cuponsPromo: number;
  compras: number; compraIdeal: number;
}

const vazio = (ano: number, mes: number): MesRow => ({
  ano, mes, vendas: 0, promo: 0, regular: 0, custo: 0, custoPromo: 0, lucro: 0,
  volume: 0, volumePromo: 0, mix: 0, mixPromo: 0, cupons: 0, cuponsPromo: 0, compras: 0, compraIdeal: 0,
});

function acumular(alvo: MesRow, l: any) {
  const vendas = num(pick(l, "vendas", "faturamento", "venda_total"));
  const promo = num(pick(l, "vendas_promocional", "venda_promocional"));
  const custo = num(pick(l, "custo", "cmv"));
  alvo.vendas += vendas;
  alvo.promo += promo;
  alvo.regular += Math.max(vendas - promo, 0);
  alvo.custo += custo;
  alvo.custoPromo += num(pick(l, "custo_promocional"));
  alvo.lucro += num(pick(l, "arrecadacao", "lucro")) || vendas - custo;
  alvo.volume += num(pick(l, "volume"));
  alvo.volumePromo += num(pick(l, "volume_promocional"));
  alvo.mix += num(pick(l, "mix"));
  alvo.mixPromo += num(pick(l, "mix_promocional"));
  alvo.cupons += num(pick(l, "clientes", "cupons"));
  alvo.cuponsPromo += num(pick(l, "clientes_promocional", "cupons_promocional"));
  alvo.compras += num(pick(l, "compras"));
  alvo.compraIdeal += num(pick(l, "compra_ideal")) || custo;
}

const somar = (rows: MesRow[]): MesRow =>
  rows.reduce((acc, r) => {
    (Object.keys(acc) as (keyof MesRow)[]).forEach((k) => {
      if (k !== "mes" && k !== "ano") (acc[k] as number) += r[k] as number;
    });
    return acc;
  }, vazio(0, 0));

function Variacao({ atual, anterior, invertido = false }: { atual: number; anterior: number; invertido?: boolean }) {
  if (!anterior) return <span className="text-xs text-muted-foreground">sem base anterior</span>;
  const d = ((atual - anterior) / Math.abs(anterior)) * 100;
  const neutro = Math.abs(d) < 0.5;
  const bom = invertido ? d < 0 : d > 0;
  const Icone = neutro ? ArrowRight : d > 0 ? ArrowUpRight : ArrowDownRight;
  const cor = neutro ? "text-muted-foreground" : bom ? "text-success" : "text-destructive";
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${cor}`}>
      <Icone className="h-3.5 w-3.5" />{nf1.format(Math.abs(d))}%
    </span>
  );
}

type Formato = "moeda" | "numero" | "percentual";
interface Indicador {
  key: string;
  titulo: string;
  descricao: string;
  formato: Formato;
  /** série principal (uma ou mais barras, como no comparativo de vendas) */
  series: { key: string; nome: string; cor: string }[];
  valor: (r: MesRow, ctx: Ctx) => Record<string, number>;
  total: (t: MesRow, ctx: Ctx) => number;
  invertido?: boolean;
}
interface Ctx { areaM2: number; colaboradores: number }

const fmt = (f: Formato) => (v: number) => (f === "moeda" ? brl(v) : f === "percentual" ? pct(v) : nf0.format(Math.round(v || 0)));

const INDICADORES: Indicador[] = [
  {
    key: "vendas", titulo: "Vendas", descricao: "Total, promocional e regular", formato: "moeda",
    series: [
      { key: "total", nome: "Vendas", cor: C1 },
      { key: "promo", nome: "Vendas - Promocional", cor: C3 },
      { key: "regular", nome: "Vendas - Regular", cor: C2 },
    ],
    valor: (r) => ({ total: r.vendas, promo: r.promo, regular: r.regular }),
    total: (t) => t.vendas,
  },
  {
    key: "lucro", titulo: "Arrecadação (lucro)", descricao: "Venda menos custo da mercadoria", formato: "moeda",
    series: [{ key: "total", nome: "Arrecadação", cor: C2 }],
    valor: (r) => ({ total: r.lucro }), total: (t) => t.lucro,
  },
  {
    key: "margem", titulo: "Margem", descricao: "Margem total, regular e promocional", formato: "percentual",
    series: [
      { key: "total", nome: "Margem", cor: C1 },
      { key: "regular", nome: "Margem regular", cor: C2 },
      { key: "promo", nome: "Margem promoção", cor: C3 },
    ],
    valor: (r) => ({
      total: div(r.lucro, r.vendas) * 100,
      regular: div(r.regular - (r.custo - r.custoPromo), r.regular) * 100,
      promo: div(r.promo - r.custoPromo, r.promo) * 100,
    }),
    total: (t) => div(t.lucro, t.vendas) * 100,
  },
  {
    key: "mix", titulo: "Mix de produtos", descricao: "Produtos vendidos x vendidos em promoção", formato: "numero",
    series: [
      { key: "total", nome: "Mix", cor: C1 },
      { key: "promo", nome: "Mix promocional", cor: C3 },
    ],
    valor: (r) => ({ total: r.mix, promo: r.mixPromo }), total: (t) => t.mix,
  },
  {
    key: "volume", titulo: "Itens vendidos", descricao: "Volume total e volume em promoção", formato: "numero",
    series: [
      { key: "total", nome: "Itens", cor: C1 },
      { key: "promo", nome: "Itens promocionais", cor: C3 },
    ],
    valor: (r) => ({ total: r.volume, promo: r.volumePromo }), total: (t) => t.volume,
  },
  {
    key: "clientes", titulo: "Clientes (cupons)", descricao: "Cupons totais e cupons com promoção", formato: "numero",
    series: [
      { key: "total", nome: "Clientes", cor: C1 },
      { key: "promo", nome: "Clientes promocionais", cor: C3 },
    ],
    valor: (r) => ({ total: r.cupons, promo: r.cuponsPromo }), total: (t) => t.cupons,
  },
  {
    key: "ticket", titulo: "Ticket médio", descricao: "Venda dividida pelos cupons", formato: "moeda",
    series: [{ key: "total", nome: "Ticket médio", cor: C1 }],
    valor: (r) => ({ total: div(r.vendas, r.cupons) }), total: (t) => div(t.vendas, t.cupons),
  },
  {
    key: "compras", titulo: "Compra ideal x compras", descricao: "CMV comparado às entradas de mercadoria", formato: "moeda",
    series: [
      { key: "total", nome: "Compras", cor: C1 },
      { key: "regular", nome: "Compra ideal (CMV)", cor: C2 },
    ],
    valor: (r) => ({ total: r.compras, regular: r.compraIdeal }), total: (t) => t.compras,
  },
  {
    key: "participacao", titulo: "Participação regular x promocional", descricao: "Peso de cada tipo de venda", formato: "percentual",
    series: [
      { key: "regular", nome: "Participação regular", cor: C2 },
      { key: "promo", nome: "Participação promocional", cor: C3 },
    ],
    valor: (r) => ({ regular: div(r.regular, r.vendas) * 100, promo: div(r.promo, r.vendas) * 100 }),
    total: (t) => div(t.promo, t.vendas) * 100,
  },
  {
    key: "itens_promo", titulo: "Participação de itens promocionais", descricao: "Itens em promoção sobre o total de itens", formato: "percentual",
    series: [{ key: "total", nome: "Itens promocionais", cor: C3 }],
    valor: (r) => ({ total: div(r.volumePromo, r.volume) * 100 }),
    total: (t) => div(t.volumePromo, t.volume) * 100,
  },
  {
    key: "cliente_promo", titulo: "Cliente promocional", descricao: "Cupons com promoção sobre o total de cupons", formato: "percentual",
    series: [{ key: "total", nome: "Cliente promocional", cor: C3 }],
    valor: (r) => ({ total: div(r.cuponsPromo, r.cupons) * 100 }),
    total: (t) => div(t.cuponsPromo, t.cupons) * 100,
  },
  {
    key: "vendas_m2", titulo: "Vendas por m²", descricao: "Faturamento dividido pela área de venda", formato: "moeda",
    series: [{ key: "total", nome: "Vendas/m²", cor: C1 }],
    valor: (r, c) => ({ total: div(r.vendas, c.areaM2) }), total: (t, c) => div(t.vendas, c.areaM2),
  },
  {
    key: "itens_m2", titulo: "Itens por m²", descricao: "Itens vendidos dividido pela área de venda", formato: "numero",
    series: [{ key: "total", nome: "Itens/m²", cor: C2 }],
    valor: (r, c) => ({ total: div(r.volume, c.areaM2) }), total: (t, c) => div(t.volume, c.areaM2),
  },
  {
    key: "vendas_colab", titulo: "Vendas por colaborador", descricao: "Faturamento dividido pelo número de colaboradores", formato: "moeda",
    series: [{ key: "total", nome: "Vendas/colaborador", cor: C1 }],
    valor: (r, c) => ({ total: div(r.vendas, c.colaboradores) }), total: (t, c) => div(t.vendas, c.colaboradores),
  },
];

export default function PainelComparativo() {
  const { user, isGlobalAdmin } = useAuth() as any;
  const { permitidos, permiteDept } = useDepartamentosPermitidos();

  const hoje = new Date();
  const padraoFim = iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
  const padraoInicio = iso(new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1));

  const [lojas, setLojas] = useState<LojaSimples[]>([]);
  const [storeId, setStoreId] = useState("");
  const [departamentos, setDepartamentos] = useState<string[]>([]);
  const [departamento, setDepartamento] = useState(TODOS);
  const [inicio, setInicio] = useState(padraoInicio);
  const [fim, setFim] = useState(padraoFim);

  const [atual, setAtual] = useState<MesRow[]>([]);
  const [anterior, setAnterior] = useState<MesRow[]>([]);
  const [ctx, setCtx] = useState<Ctx>({ areaM2: 500, colaboradores: 25 });
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoDept, setAvisoDept] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [etapa, setEtapa] = useState("");

  const blocos = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    (async () => {
      const ls = await carregarLojasPermitidas(user?.id, !!isGlobalAdmin);
      setLojas(ls);
      const sid = sessionStorage.getItem("selectedStoreId");
      if (sid && ls.some((l) => l.id === sid)) setStoreId(sid);
      else if (ls.length === 1) setStoreId(ls[0].id);
    })();
  }, [user?.id, isGlobalAdmin]);

  useEffect(() => {
    if (!storeId) return;
    let vivo = true;
    (async () => {
      const { data } = await supabase.from("vr_secao_departamento").select("departamento").eq("store_id", storeId);
      if (!vivo) return;
      const lista = Array.from(new Set((data ?? []).map((d: any) => txt(d.departamento)).filter(Boolean)))
        .filter((d) => permiteDept(d))
        .sort((a, b) => a.localeCompare(b, "pt-BR"));
      setDepartamentos(lista);
      setDepartamento((atualDep) => (lista.includes(atualDep) ? atualDep : TODOS));
    })();
    return () => { vivo = false; };
  }, [storeId, permitidos]);

  const nomeLoja = lojas.find((l) => l.id === storeId)?.name ?? "";
  const rotuloDept = departamento === TODOS ? (permitidos ? "Meus departamentos" : "Loja toda") : departamento;

  async function comLimite<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    return await Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
  }
  const VAZIO = { dados: [] as any[], indisponivel: false, offline: false, erro: null as string | null };

  /** Lista de [ano, mes, dataInicio, dataFim] dentro do intervalo escolhido. */
  function fatiarMeses(ini: string, f: string) {
    const [ay, am] = ini.split("-").map(Number);
    const [by, bm] = f.split("-").map(Number);
    const out: Array<{ ano: number; mes: number; de: string; ate: string }> = [];
    let y = ay, m = am;
    while (y < by || (y === by && m <= bm)) {
      const primeiro = `${y}-${String(m).padStart(2, "0")}-01`;
      const ultimo = `${y}-${String(m).padStart(2, "0")}-${String(ultimoDia(y, m)).padStart(2, "0")}`;
      out.push({ ano: y, mes: m, de: primeiro < ini ? ini : primeiro, ate: ultimo > f ? f : ultimo });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
  }

  async function buscarMes(sid: string, ano: number, mes: number, de: string, ate: string, dept: string) {
    const chaveDeptCache = dept === TODOS ? "" : dept;
    const guardado = await lerPeriodoCache(sid, "diagnostico_mensal", chaveDeptCache, de, ate);

    let linhas: any[];
    if (guardado) {
      linhas = guardado;
    } else {
      const params: Record<string, unknown> = { inicio: de, fim: ate };
      if (dept !== TODOS) params.departamento = dept;
      const r = await comLimite(
        chamarRelatorio(sid, "diagnostico_mensal", params).catch(() => ({ ...VAZIO, erro: "Falha na consulta." })),
        70000,
        { ...VAZIO, erro: "O sistema da loja demorou demais para responder." },
      );
      const msg = avisoRelatorio(r);
      if (msg) return { row: null as MesRow | null, aviso: msg, temDept: true };
      linhas = r.dados ?? [];
      await gravarPeriodoCache(sid, "diagnostico_mensal", chaveDeptCache, de, ate, linhas);
    }

    const temDept = linhas.some((l: any) => pick(l, "departamento", "secao", "setor") !== undefined);
    const row = vazio(ano, mes);
    for (const l of linhas) {
      const d = txt(pick(l, "departamento", "secao", "setor"));
      if (dept !== TODOS && temDept && chaveDept(d) !== chaveDept(dept)) continue;
      if (dept === TODOS && temDept && permitidos && !permiteDept(d)) continue;
      acumular(row, l);
    }
    return { row, aviso: null as string | null, temDept };
  }

  async function carregar() {
    if (!storeId) { toast({ title: "Escolha a loja", variant: "destructive" }); return; }
    if (inicio > fim) { toast({ title: "A data inicial é maior que a final", variant: "destructive" }); return; }

    setCarregando(true);
    setAviso(null);
    setAvisoDept(null);
    setProgresso(2);
    setEtapa("Lendo o cadastro da loja");
    try {
      const cfg = await supabase.from("stores").select("area_m2, colaboradores").eq("id", storeId).maybeSingle();
      setCtx({
        areaM2: Number((cfg.data as any)?.area_m2) || 500,
        colaboradores: Number((cfg.data as any)?.colaboradores) || 25,
      });

      const meses = fatiarMeses(inicio, fim);
      const anteriores = meses.map((p) => ({
        ano: p.ano - 1, mes: p.mes,
        de: `${p.ano - 1}${p.de.slice(4)}`,
        ate: `${p.ano - 1}${p.ate.slice(4)}`,
      }));
      const tarefas = [...meses.map((p) => ({ ...p, base: "atual" as const })), ...anteriores.map((p) => ({ ...p, base: "anterior" as const }))];

      const rowsAtual: MesRow[] = [];
      const rowsAnt: MesRow[] = [];
      let avisoGeral: string | null = null;
      let deptFaltando = false;
      let feitos = 0;

      for (const t of tarefas) {
        setEtapa(`Buscando ${MESES_CURTO[t.mes - 1]}/${String(t.ano).slice(2)}`);
        setProgresso(4 + Math.round((feitos / tarefas.length) * 93));
        feitos += 1;
        const { row, aviso: msg, temDept } = await buscarMes(storeId, t.ano, t.mes, t.de, t.ate, departamento);
        if (msg) { if (!avisoGeral) avisoGeral = msg; continue; }
        if (departamento !== TODOS && !temDept) deptFaltando = true;
        if (row) (t.base === "atual" ? rowsAtual : rowsAnt).push(row);
      }

      setProgresso(100);
      setEtapa("Montando os gráficos");
      setAtual(rowsAtual);
      setAnterior(rowsAnt);
      if (!rowsAtual.length && avisoGeral) setAviso(avisoGeral);
      if (deptFaltando) {
        setAvisoDept(
          "O sistema desta loja ainda não separa esses números por departamento — os gráficos mostram a loja toda.",
        );
      }
      setCarregado(true);
    } catch (e: any) {
      setAviso(e?.message || "Não foi possível carregar os dados agora.");
      setCarregado(true);
    } finally {
      setCarregando(false);
    }
  }

  const antPorMes = useMemo(() => new Map(anterior.map((r) => [`${r.ano + 1}-${r.mes}`, r])), [anterior]);

  const dados = useMemo(
    () => atual.map((r) => ({ r, ant: antPorMes.get(`${r.ano}-${r.mes}`) ?? vazio(r.ano - 1, r.mes) })),
    [atual, antPorMes],
  );

  const totAtual = useMemo(() => somar(atual), [atual]);
  const totAnt = useMemo(() => somar(anterior), [anterior]);

  const periodoTexto = `${inicio.split("-").reverse().join("/")} a ${fim.split("-").reverse().join("/")}`;
  const subtituloExport = `${nomeLoja} · ${rotuloDept} · ${periodoTexto}`;

  async function exportar(tipo: "pdf" | "pptx") {
    const lista: BlocoExport[] = [];
    for (const i of INDICADORES) {
      const el = blocos.current[i.key];
      if (el) lista.push({ titulo: `${i.titulo} — ${nomeLoja}`, subtitulo: i.descricao, el });
    }
    if (!lista.length) { toast({ title: "Carregue os dados antes de exportar", variant: "destructive" }); return; }
    setExportando(true);
    try {
      if (tipo === "pdf") await exportarPdf("Comparativo de Indicadores", subtituloExport, lista);
      else await exportarPptx("Comparativo de Indicadores", subtituloExport, lista);
    } catch (e: any) {
      toast({ title: "Não foi possível exportar", description: e?.message, variant: "destructive" });
    } finally {
      setExportando(false);
    }
  }

  const semDados = carregado && !aviso && atual.length === 0;

  return (
    <ClientLayout storeName={nomeLoja}>
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitCompare className="h-6 w-6 text-primary" /> Comparativo de Indicadores
            </h1>
            <p className="text-sm text-muted-foreground">
              Um gráfico por indicador, mês a mês, com o mesmo período do ano anterior.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Loja</label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="w-[220px]"><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                <SelectContent>
                  {lojas.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Departamento</label>
              <Select value={departamento} onValueChange={setDepartamento}>
                <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS}>{permitidos ? "Meus departamentos" : "Loja toda"}</SelectItem>
                  {departamentos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">De</label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-[150px]" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Até</label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-[150px]" />
            </div>
            <Button onClick={carregar} disabled={carregando}>
              <RefreshCw className={`h-4 w-4 mr-2 ${carregando ? "animate-spin" : ""}`} />
              {carregando ? "Carregando..." : "Atualizar"}
            </Button>
            <Button variant="outline" onClick={() => exportar("pdf")} disabled={exportando || !atual.length}>
              <FileDown className="h-4 w-4 mr-2" /> PDF
            </Button>
            <Button variant="outline" onClick={() => exportar("pptx")} disabled={exportando || !atual.length}>
              <Presentation className="h-4 w-4 mr-2" /> PowerPoint
            </Button>
          </div>
        </div>

        {carregando && (
          <>
            <CartProgressOverlay value={progresso} label="Montando o comparativo" detail={etapa} />
            <CartProgress value={progresso} label="Montando o comparativo" detail={etapa} />
          </>
        )}
        {exportando && <CartProgressOverlay label="Gerando o arquivo" detail="Preparando os gráficos" />}

        {!carregando && aviso && <Card className="p-4 text-sm">{aviso}</Card>}
        {!carregando && avisoDept && <Card className="p-4 text-sm">{avisoDept}</Card>}
        {!carregando && semDados && (
          <Card className="p-4 text-sm">Nenhum movimento encontrado no período escolhido.</Card>
        )}

        {!carregando && atual.length > 0 && (
          <div className="grid gap-4 xl:grid-cols-2">
            {INDICADORES.map((ind) => {
              const f = fmt(ind.formato);
              const serie = dados.map(({ r, ant }) => {
                const v = ind.valor(r, ctx);
                const va = ind.valor(ant, ctx);
                return {
                  mes: `${MESES_CURTO[r.mes - 1]}-${String(r.ano).slice(2)}`,
                  ...v,
                  anoAnterior: va[ind.series[0].key] ?? 0,
                };
              });
              const tA = ind.total(totAtual, ctx);
              const tB = ind.total(totAnt, ctx);
              return (
                <Card key={ind.key} className="p-4">
                  <div ref={(el) => (blocos.current[ind.key] = el)} className="bg-card">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">{ind.titulo} — {nomeLoja}</h3>
                        <p className="text-xs text-muted-foreground">{ind.descricao} · {rotuloDept}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold tabular-nums">{f(tA)}</p>
                        <Variacao atual={tA} anterior={tB} invertido={ind.invertido} />
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={serie} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="mes" fontSize={11} stroke="hsl(var(--muted-foreground))" />
                        <YAxis fontSize={11} stroke="hsl(var(--muted-foreground))"
                          tickFormatter={(v) => (ind.formato === "percentual" ? `${nf0.format(v)}%` : brlCurto(v))} />
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))",
                            borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))",
                          }}
                          formatter={(v: number) => f(Number(v))}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {ind.series.map((s, i) => (
                          <Bar key={s.key} dataKey={s.key} name={s.nome} fill={s.cor} radius={[4, 4, 0, 0]}>
                            {i === 0 && ind.series.length <= 2 && (
                              <LabelList dataKey={s.key} position="top" fontSize={9}
                                formatter={(v: number) => (ind.formato === "percentual" ? nf1.format(Number(v)) : nf0.format(Math.round(Number(v))))} />
                            )}
                          </Bar>
                        ))}
                        <Bar dataKey="anoAnterior" name="Ano anterior" fill={CANT} fillOpacity={0.45} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
