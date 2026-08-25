import { Fragment as FragmentWithKey, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  Legend, ResponsiveContainer, LabelList,
} from "recharts";
import { RefreshCw, Download, ChevronDown, ChevronRight, Network } from "lucide-react";
import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ----------------------------------------------------------------- tipos
interface Row {
  store_id: string;
  mes: string;
  faturamento: number;
  cmv: number;
  arrecadacao: number;
  volume: number;
  cupons: number;
  compras: number;
  atualizado_em: string;
}

interface Agg {
  faturamento: number;
  cmv: number;
  arrecadacao: number;
  volume: number;
  cupons: number;
  compras: number;
  temDado: boolean;
}

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

type MetricKey =
  | "faturamento" | "arrecadacao" | "margem_pct" | "compras"
  | "pct_compras_vendas" | "volume" | "cupons" | "ticket_medio";

const METRICAS: { key: MetricKey; label: string; tipo: "money" | "pct" | "vol" | "int" }[] = [
  { key: "faturamento", label: "Faturamento", tipo: "money" },
  { key: "arrecadacao", label: "Arrecadação", tipo: "money" },
  { key: "margem_pct", label: "Margem %", tipo: "pct" },
  { key: "compras", label: "Compras", tipo: "money" },
  { key: "pct_compras_vendas", label: "% Compras x Vendas", tipo: "pct" },
  { key: "volume", label: "Volume", tipo: "vol" },
  { key: "cupons", label: "Cupons", tipo: "int" },
  { key: "ticket_medio", label: "Ticket Médio", tipo: "money" },
];

const CORES = [
  "#f97316", "#0ea5e9", "#22c55e", "#a855f7", "#eab308", "#ef4444",
  "#14b8a6", "#6366f1", "#ec4899", "#84cc16", "#f59e0b", "#06b6d4",
];

// ------------------------------------------------------------ formatação
const money = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
const pct = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const vol = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const int = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function fmt(valor: number | null, tipo: "money" | "pct" | "vol" | "int") {
  if (valor === null || !isFinite(valor)) return "—";
  if (tipo === "money") return money(valor);
  if (tipo === "pct") return pct(valor);
  if (tipo === "vol") return vol(valor);
  return int(valor);
}

const vazio = (): Agg => ({
  faturamento: 0, cmv: 0, arrecadacao: 0, volume: 0, cupons: 0, compras: 0, temDado: false,
});

function somar(a: Agg, r: Row): Agg {
  return {
    faturamento: a.faturamento + r.faturamento,
    cmv: a.cmv + r.cmv,
    arrecadacao: a.arrecadacao + r.arrecadacao,
    volume: a.volume + r.volume,
    cupons: a.cupons + r.cupons,
    compras: a.compras + r.compras,
    temDado: true,
  };
}

// Percentuais SEMPRE recalculados a partir dos totais.
function metrica(a: Agg | undefined, key: MetricKey): number | null {
  if (!a || !a.temDado) return null;
  switch (key) {
    case "faturamento": return a.faturamento;
    case "arrecadacao": return a.arrecadacao;
    case "compras": return a.compras;
    case "volume": return a.volume;
    case "cupons": return a.cupons;
    case "margem_pct":
      return a.faturamento > 0 ? ((a.faturamento - a.cmv) / a.faturamento) * 100 : null;
    case "pct_compras_vendas":
      return a.faturamento > 0 ? (a.compras / a.faturamento) * 100 : null;
    case "ticket_medio":
      return a.cupons > 0 ? a.faturamento / a.cupons : null;
  }
}

const tipoDe = (k: MetricKey) => METRICAS.find((m) => m.key === k)!.tipo;

// ================================================================= página
const AdminRedeContent = () => {
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [metrica0, setMetrica0] = useState<MetricKey>("faturamento");
  const [rows, setRows] = useState<Row[]>([]);
  const [lojas, setLojas] = useState<{ id: string; name: string }[]>([]);
  const [selecionadas, setSelecionadas] = useState<Set<string> | null>(null);
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [ordem, setOrdem] = useState<{ col: string; dir: "asc" | "desc" }>({
    col: "faturamento", dir: "desc",
  });
  const [expandida, setExpandida] = useState<string | null>(null);

  const carregar = async () => {
    setLoading(true);
    const [{ data: metricas }, { data: stores }] = await Promise.all([
      supabase
        .from("rede_metricas_mensais")
        .select("*")
        .gte("mes", `${ano}-01`)
        .lte("mes", `${ano}-12`),
      supabase.from("stores").select("id, name").order("name"),
    ]);
    setRows((metricas || []) as unknown as Row[]);
    setLojas((stores || []) as { id: string; name: string }[]);
    setLoading(false);
  };

  useEffect(() => { carregar(); /* eslint-disable-next-line */ }, [ano]);

  const atualizarAgora = async () => {
    setSincronizando(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-rede-mensal", {
        body: { ano },
      });
      if (error) throw error;
      const res = (data?.resultados || []) as { loja: string; status: string }[];
      const ok = res.filter((r) => r.status === "ok");
      const falhas = res.filter((r) => r.status !== "ok");
      toast.success(`${ok.length} loja(s) atualizada(s)`, {
        description: falhas.length
          ? `Sem retorno: ${falhas.map((f) => `${f.loja} (${f.status})`).join(", ")}`
          : "Todas as lojas responderam.",
      });
      await carregar();
    } catch (e) {
      toast.error("Não foi possível atualizar", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSincronizando(false);
    }
  };

  // lojas que possuem dados no ano + todas as cadastradas com conexão
  const lojasVisiveis = useMemo(() => {
    const comDados = new Set(rows.map((r) => r.store_id));
    return lojas.filter((l) => comDados.has(l.id) || selecionadas?.has(l.id) || true);
  }, [lojas, rows, selecionadas]);

  const ativas = useMemo(
    () => lojasVisiveis.filter((l) => (selecionadas ? selecionadas.has(l.id) : true)),
    [lojasVisiveis, selecionadas],
  );

  // agregações
  const { porLoja, porLojaMes, ultimaAtualizacaoLoja, totalRede, totalPorMes } = useMemo(() => {
    const porLoja = new Map<string, Agg>();
    const porLojaMes = new Map<string, Agg>();
    const ultimaAtualizacaoLoja = new Map<string, string>();
    const totalPorMes = new Map<number, Agg>();
    let totalRede = vazio();
    const ids = new Set(ativas.map((l) => l.id));

    for (const r of rows) {
      if (!ids.has(r.store_id)) continue;
      const mesIdx = Number(r.mes.slice(5, 7)) - 1;
      porLoja.set(r.store_id, somar(porLoja.get(r.store_id) ?? vazio(), r));
      const k = `${r.store_id}|${mesIdx}`;
      porLojaMes.set(k, somar(porLojaMes.get(k) ?? vazio(), r));
      totalPorMes.set(mesIdx, somar(totalPorMes.get(mesIdx) ?? vazio(), r));
      totalRede = somar(totalRede, r);
      const atual = ultimaAtualizacaoLoja.get(r.store_id);
      if (!atual || r.atualizado_em > atual) ultimaAtualizacaoLoja.set(r.store_id, r.atualizado_em);
    }
    return { porLoja, porLojaMes, ultimaAtualizacaoLoja, totalRede, totalPorMes };
  }, [rows, ativas]);

  const ultimaAtualizacao = useMemo(() => {
    let max = "";
    for (const r of rows) if (r.atualizado_em > max) max = r.atualizado_em;
    return max ? new Date(max).toLocaleString("pt-BR") : null;
  }, [rows]);

  const selo = (id: string): { cor: string; texto: string } => {
    const at = ultimaAtualizacaoLoja.get(id);
    if (!at) return { cor: "bg-muted-foreground/40", texto: "Sem dados" };
    const horas = (Date.now() - new Date(at).getTime()) / 36e5;
    return horas <= 24
      ? { cor: "bg-emerald-500", texto: `Atualizado ${new Date(at).toLocaleDateString("pt-BR")}` }
      : { cor: "bg-amber-500", texto: `Desde ${new Date(at).toLocaleDateString("pt-BR")}` };
  };

  const COLUNAS: { key: string; label: string; metric?: MetricKey }[] = [
    { key: "faturamento", label: "Faturamento", metric: "faturamento" },
    { key: "margem_pct", label: "Margem %", metric: "margem_pct" },
    { key: "arrecadacao", label: "Arrecadação", metric: "arrecadacao" },
    { key: "compras", label: "Compras", metric: "compras" },
    { key: "pct_compras_vendas", label: "% Compras x Vendas", metric: "pct_compras_vendas" },
    { key: "volume", label: "Volume", metric: "volume" },
    { key: "cupons", label: "Cupons", metric: "cupons" },
    { key: "ticket_medio", label: "Ticket Médio", metric: "ticket_medio" },
  ];

  const linhasClientes = useMemo(() => {
    const base = ativas.map((l) => ({ id: l.id, nome: l.name, agg: porLoja.get(l.id) }));
    const dir = ordem.dir === "asc" ? 1 : -1;
    return base.sort((a, b) => {
      if (ordem.col === "nome") return a.nome.localeCompare(b.nome) * dir;
      const va = metrica(a.agg, ordem.col as MetricKey);
      const vb = metrica(b.agg, ordem.col as MetricKey);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va - vb) * dir;
    });
  }, [ativas, porLoja, ordem]);

  const ordenarPor = (col: string) =>
    setOrdem((o) => (o.col === col ? { col, dir: o.dir === "desc" ? "asc" : "desc" } : { col, dir: "desc" }));

  const tipoDestaque = tipoDe(metrica0);
  const labelDestaque = METRICAS.find((m) => m.key === metrica0)!.label;

  const rankData = useMemo(
    () =>
      linhasClientes
        .map((l) => ({ nome: l.nome, valor: metrica(l.agg, metrica0) ?? 0 }))
        .filter((d) => d.valor !== 0)
        .sort((a, b) => b.valor - a.valor),
    [linhasClientes, metrica0],
  );

  const evolucaoData = useMemo(
    () =>
      MESES.map((m, i) => {
        const linha: Record<string, string | number | null> = { mes: m };
        for (const l of ativas) linha[l.name] = metrica(porLojaMes.get(`${l.id}|${i}`), metrica0);
        linha["TOTAL DA REDE"] = metrica(totalPorMes.get(i), metrica0);
        return linha;
      }),
    [ativas, porLojaMes, totalPorMes, metrica0],
  );

  const [isolado, setIsolado] = useState<string | null>(null);

  const exportar = () => {
    const aba1 = linhasClientes.map((l) => ({
      Cliente: l.nome,
      Faturamento: metrica(l.agg, "faturamento") ?? "",
      "Margem %": metrica(l.agg, "margem_pct") ?? "",
      Arrecadação: metrica(l.agg, "arrecadacao") ?? "",
      Compras: metrica(l.agg, "compras") ?? "",
      "% Compras x Vendas": metrica(l.agg, "pct_compras_vendas") ?? "",
      Volume: metrica(l.agg, "volume") ?? "",
      Cupons: metrica(l.agg, "cupons") ?? "",
      "Ticket Médio": metrica(l.agg, "ticket_medio") ?? "",
    }));
    const aba2 = ativas.map((l) => {
      const linha: Record<string, string | number> = { Cliente: l.name };
      MESES.forEach((m, i) => {
        const v = metrica(porLojaMes.get(`${l.id}|${i}`), metrica0);
        linha[m] = v ?? "";
      });
      linha["Total"] = metrica(porLoja.get(l.id), metrica0) ?? "";
      return linha;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aba1), "Clientes");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(aba2), "Mensal");
    XLSX.writeFile(wb, `visao-rede-${ano}.xlsx`);
  };

  // heatmap: intensidade dentro da linha
  const intensidade = (v: number | null, max: number) => {
    if (v === null || max <= 0) return undefined;
    const a = Math.max(0.06, Math.min(0.5, (v / max) * 0.5));
    return { backgroundColor: `hsl(var(--primary) / ${a.toFixed(2)})` };
  };

  const anos = Array.from({ length: 5 }, (_, i) => anoAtual - i);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-6 space-y-6">
      {/* cabeçalho */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Network className="w-5 h-5 text-primary" /> Visão da Rede
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ultimaAtualizacao ? `Atualizado em ${ultimaAtualizacao}` : "Sem dados sincronizados"}
          </p>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Ano</label>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">Métrica em destaque</label>
          <Select value={metrica0} onValueChange={(v) => setMetrica0(v as MetricKey)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {METRICAS.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground block">Clientes</label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-[190px] justify-between">
                {selecionadas ? `${selecionadas.size} selecionado(s)` : "Todos os clientes"}
                <ChevronDown className="w-4 h-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="max-h-[320px] overflow-y-auto bg-popover">
              <DropdownMenuCheckboxItem
                checked={!selecionadas}
                onCheckedChange={() => setSelecionadas(null)}
              >
                Todos os clientes
              </DropdownMenuCheckboxItem>
              {lojasVisiveis.map((l) => (
                <DropdownMenuCheckboxItem
                  key={l.id}
                  checked={selecionadas ? selecionadas.has(l.id) : true}
                  onCheckedChange={(c) => {
                    const base = new Set(selecionadas ?? lojasVisiveis.map((x) => x.id));
                    if (c) base.add(l.id); else base.delete(l.id);
                    setSelecionadas(base.size === lojasVisiveis.length ? null : base);
                  }}
                  onSelect={(e) => e.preventDefault()}
                >
                  {l.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Button onClick={atualizarAgora} disabled={sincronizando}>
          <RefreshCw className={`w-4 h-4 mr-2 ${sincronizando ? "animate-spin" : ""}`} />
          Atualizar agora
        </Button>
        <Button variant="outline" onClick={exportar}>
          <Download className="w-4 h-4 mr-2" /> Exportar Excel
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
          </div>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {METRICAS.map((m) => (
              <Card key={m.key} className="p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{m.label}</p>
                <p className="text-xl font-semibold mt-1">{fmt(metrica(totalRede, m.key), m.tipo)}</p>
              </Card>
            ))}
          </div>

          {/* tabela 1 */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-sm font-medium">
              Clientes — acumulado {ano}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left cursor-pointer" onClick={() => ordenarPor("nome")}>Cliente</th>
                    {COLUNAS.map((c) => (
                      <th key={c.key} className="px-3 py-2 text-right cursor-pointer whitespace-nowrap"
                          onClick={() => ordenarPor(c.key)}>
                        {c.label}{ordem.col === c.key ? (ordem.dir === "desc" ? " ↓" : " ↑") : ""}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasClientes.map((l) => {
                    const s = selo(l.id);
                    const aberta = expandida === l.id;
                    return (
                      <FragmentWithKey key={l.id}>
                        <tr
                          className="border-t border-border hover:bg-muted/30 cursor-pointer"
                          onClick={() => setExpandida(aberta ? null : l.id)}
                        >
                          <td className="px-3 py-2 font-medium flex items-center gap-1">
                            {aberta ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                            {l.nome}
                          </td>
                          {COLUNAS.map((c) => (
                            <td key={c.key} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                              {fmt(metrica(l.agg, c.metric!), tipoDe(c.metric!))}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center">
                            <span title={s.texto} className={`inline-block w-2.5 h-2.5 rounded-full ${s.cor}`} />
                          </td>
                        </tr>
                        {aberta && MESES.map((m, i) => {
                          const agg = porLojaMes.get(`${l.id}|${i}`);
                          if (!agg) return null;
                          return (
                            <tr key={`${l.id}-${i}`} className="border-t border-border/50 bg-muted/20 text-xs">
                              <td className="px-3 py-1.5 pl-9 text-muted-foreground">{m}</td>
                              {COLUNAS.map((c) => (
                                <td key={c.key} className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">
                                  {fmt(metrica(agg, c.metric!), tipoDe(c.metric!))}
                                </td>
                              ))}
                              <td />
                            </tr>
                          );
                        })}
                      </FragmentWithKey>
                    );
                  })}
                  <tr className="border-t-2 border-primary/40 bg-muted/50 font-semibold">
                    <td className="px-3 py-2">TOTAL DA REDE</td>
                    {COLUNAS.map((c) => (
                      <td key={c.key} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {fmt(metrica(totalRede, c.metric!), tipoDe(c.metric!))}
                      </td>
                    ))}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* tabela 2 — matriz */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border text-sm font-medium">
              Cliente × Mês — {labelDestaque}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    {MESES.map((m) => <th key={m} className="px-2 py-2 text-right">{m}</th>)}
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ativas.map((l) => {
                    const valores = MESES.map((_, i) => metrica(porLojaMes.get(`${l.id}|${i}`), metrica0));
                    const max = Math.max(0, ...valores.map((v) => v ?? 0));
                    return (
                      <tr key={l.id} className="border-t border-border">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{l.name}</td>
                        {valores.map((v, i) => (
                          <td key={i} className="px-2 py-2 text-right tabular-nums whitespace-nowrap"
                              style={intensidade(v, max)}>
                            {v === null ? "—" : fmt(v, tipoDestaque)}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right tabular-nums font-medium whitespace-nowrap">
                          {fmt(metrica(porLoja.get(l.id), metrica0), tipoDestaque)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-primary/40 bg-muted/50 font-semibold">
                    <td className="px-3 py-2">TOTAL DA REDE</td>
                    {MESES.map((_, i) => (
                      <td key={i} className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                        {fmt(metrica(totalPorMes.get(i), metrica0), tipoDestaque)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right tabular-nums">
                      {fmt(metrica(totalRede, metrica0), tipoDestaque)}
                    </td>
                  </tr>
                  <tr className="border-t border-border bg-muted/30 text-xs">
                    <td className="px-3 py-1.5 text-muted-foreground">Δ% vs mês anterior</td>
                    {MESES.map((_, i) => {
                      const atual = metrica(totalPorMes.get(i), metrica0);
                      const ant = i > 0 ? metrica(totalPorMes.get(i - 1), metrica0) : null;
                      if (atual === null || ant === null || ant === 0) {
                        return <td key={i} className="px-2 py-1.5 text-right text-muted-foreground">—</td>;
                      }
                      const d = ((atual - ant) / Math.abs(ant)) * 100;
                      return (
                        <td key={i} className={`px-2 py-1.5 text-right tabular-nums ${d >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                          {d >= 0 ? "+" : ""}{pct(d)}
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* gráficos */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="p-4">
              <p className="text-sm font-medium mb-3">Ranking de clientes — {labelDestaque}</p>
              <ResponsiveContainer width="100%" height={Math.max(240, rankData.length * 34)}>
                <BarChart data={rankData} layout="vertical" margin={{ left: 8, right: 96, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.2} />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 12 }} />
                  <RTooltip formatter={(v: number) => fmt(v, tipoDestaque)} />
                  <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}>
                    <LabelList
                      dataKey="valor" position="right" offset={8}
                      formatter={(v: number) => fmt(v, tipoDestaque)}
                      style={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-4">
              <p className="text-sm font-medium mb-3">Evolução mensal — {labelDestaque}</p>
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={evolucaoData} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} width={70}
                         tickFormatter={(v: number) => (tipoDestaque === "money" ? int(v) : fmt(v, tipoDestaque))} />
                  <RTooltip formatter={(v: number) => fmt(v, tipoDestaque)} />
                  <Legend
                    onClick={(e) => setIsolado((cur) => (cur === e.value ? null : String(e.value)))}
                    wrapperStyle={{ fontSize: 11, cursor: "pointer" }}
                  />
                  {ativas.map((l, i) => (
                    <Line
                      key={l.id} type="monotone" dataKey={l.name}
                      stroke={CORES[i % CORES.length]} strokeWidth={2} dot={false} connectNulls
                      hide={!!isolado && isolado !== l.name && isolado !== "TOTAL DA REDE"}
                    />
                  ))}
                  <Line
                    type="monotone" dataKey="TOTAL DA REDE" stroke="hsl(var(--primary))"
                    strokeWidth={4} dot={false} connectNulls
                    hide={!!isolado && isolado !== "TOTAL DA REDE"}
                  />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </>
      )}
    </div>
  );
};

const AdminRede = () => {
  const { isAdmin, loading } = useAuth();
  if (loading) return <ClientLayout><div className="min-h-screen bg-background" /></ClientLayout>;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return (
    <ClientLayout>
      <AdminRedeContent />
    </ClientLayout>
  );
};

export default AdminRede;
