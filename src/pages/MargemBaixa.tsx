import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfMonth, endOfMonth, subMonths, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import * as XLSX from "xlsx";
import { CalendarDays, Download, Info, Search, ArrowUp, ArrowDown, TrendingDown } from "lucide-react";

import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { supabase } from "@/integrations/supabase/client";
import {
  ALIAS_EAN, chamarRelatorio, chamarRelatorioFatiado, avisoRelatorio, maxDiasConsulta,
  lucroDaLinha, pick as col, num,
} from "@/lib/vrReport";
import { mercadologicoNivel1, mercadologicoNivel2, mercadologicoNivel3 } from "@/lib/mercadologico";
import { salvarWorkbook } from "@/lib/exportBranding";
import { margemPct, lucroQueFalta, precoParaMargem, abaixoDoAlvo } from "@/lib/margemBaixa";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CartProgressOverlay } from "@/components/CartProgress";

interface Store { id: string; name: string }

interface Linha {
  codigo: string;
  descricao: string;
  barras: string;
  departamento: string;
  grupo: string;
  subgrupo: string;
  qtd: number;
  venda: number;
  custo: number;
  lucro: number;
  margem: number;
  precoMedio: number;
  custoMedio: number;
  abc: string;
}

const FAIXAS_ABC = [
  { classe: "A1", ate: 20.3 }, { classe: "A2", ate: 31.5 }, { classe: "A3", ate: 40.5 }, { classe: "A4", ate: 45.0 },
  { classe: "B1", ate: 56.3 }, { classe: "B2", ate: 62.5 }, { classe: "B3", ate: 67.5 }, { classe: "B4", ate: 70.0 },
  { classe: "C1", ate: 79.0 }, { classe: "C2", ate: 84.0 }, { classe: "C3", ate: 88.0 }, { classe: "C4", ate: 90.0 },
  { classe: "D1", ate: 94.5 }, { classe: "D2", ate: 97.0 }, { classe: "D3", ate: 99.0 }, { classe: "D4", ate: 100 },
];

const FAIXAS_MARGEM = [
  { key: "neg", label: "Negativa", test: (m: number) => m < 0 },
  { key: "0-5", label: "0–5%", test: (m: number) => m >= 0 && m < 5 },
  { key: "5-10", label: "5–10%", test: (m: number) => m >= 5 && m < 10 },
  { key: "10-15", label: "10–15%", test: (m: number) => m >= 10 && m < 15 },
  { key: "15-20", label: "15–20%", test: (m: number) => m >= 15 && m < 20 },
  { key: "20+", label: "20% ou mais", test: (m: number) => m >= 20 },
];

const fmtBRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQtd = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtPct = (v: number) => `${(Number(v) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const chave = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");

type SortKey = keyof Pick<Linha,
  "codigo" | "descricao" | "departamento" | "grupo" | "subgrupo" | "abc" | "qtd" | "venda" | "custo" | "lucro" | "margem" | "precoMedio" | "custoMedio"
> | "falta";

const PAGE_SIZE = 50;

export default function MargemBaixa() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { restrito, permiteDept } = useDepartamentosPermitidos();
  const navigate = useNavigate();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [range, setRange] = useState<DateRange | undefined>({ from: subDays(new Date(), 30), to: subDays(new Date(), 1) });
  const [calOpen, setCalOpen] = useState(false);

  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const [alvo, setAlvo] = useState(15);
  const [vendaMin, setVendaMin] = useState(0);
  const [fDep, setFDep] = useState("__all__");
  const [fGrupo, setFGrupo] = useState("__all__");
  const [fSub, setFSub] = useState("__all__");
  const [fAbc1, setFAbc1] = useState<string[]>([]);
  const [fAbc2, setFAbc2] = useState("__all__");
  const [fFaixa, setFFaixa] = useState<string[]>([]);
  const [soNegativa, setSoNegativa] = useState(false);
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "falta", dir: "desc" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
    if (user) fetchStores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const fetchStores = async () => {
    const sid = sessionStorage.getItem("selectedStoreId");
    let lojas: Store[] = [];
    if (isAdmin) {
      const { data } = await supabase.from("stores").select("id, name").order("name");
      lojas = data || [];
    } else {
      const { data } = await supabase
        .from("user_store_access").select("stores(id, name)")
        .eq("user_id", user!.id).eq("approved", true);
      lojas = (data || []).map((r: any) => r.stores).filter(Boolean) as Store[];
    }
    setStores(lojas);
    if (lojas.length) {
      const p = lojas.find((s) => s.id === sid) || lojas[0];
      setStoreId(p.id); setStoreName(p.name);
    }
  };

  const aplicarAtalho = (tipo: string) => {
    const hoje = new Date();
    const ontem = subDays(hoje, 1);
    if (tipo === "7") setRange({ from: subDays(hoje, 7), to: ontem });
    else if (tipo === "30") setRange({ from: subDays(hoje, 30), to: ontem });
    else if (tipo === "mes") setRange({ from: startOfMonth(hoje), to: hoje });
    else if (tipo === "mespassado") { const m = subMonths(hoje, 1); setRange({ from: startOfMonth(m), to: endOfMonth(m) }); }
    else if (tipo === "90") setRange({ from: subDays(hoje, 90), to: ontem });
  };

  const buscar = async () => {
    if (!storeId || !range?.from || !range?.to) return;
    setLoading(true); setAviso(null); setPage(1); setProgresso("");
    try {
      const inicio = iso(range.from), fim = iso(range.to);
      const limite = await maxDiasConsulta(storeId);
      const dias = differenceInCalendarDays(range.to, range.from) + 1;
      const [r, cadastro] = await Promise.all([
        limite > 0 && dias > limite
          ? chamarRelatorioFatiado(storeId, "ranking_produtos", { inicio, fim, limite: 200000 }, {
              diasPorLote: limite,
              onProgresso: (f, t) => setProgresso(`${f}/${t} partes`),
            })
          : chamarRelatorio(storeId, "ranking_produtos", { inicio, fim, limite: 200000 }),
        chamarRelatorio(storeId, "produtos", {}).catch(() => null),
      ]);
      const msg = avisoRelatorio(r);
      if (msg) { setAviso(msg); return; }
      if (r.aviso) setAviso(r.aviso);

      const porCodigo = new Map<string, any>();
      for (const l of cadastro?.dados || []) {
        const k = chave(col(l, "codigo", "cod", "cod_produto", "id_produto"));
        if (k) porCodigo.set(k, l);
      }

      const agg = new Map<string, Linha>();
      for (const l of r.dados || []) {
        const k = chave(col(l, "codigo", "cod", "codigo_produto", "cod_produto", "id_produto"));
        if (!k) continue;
        const produto = porCodigo.get(k);
        const venda = num(col(l, "vendas", "total_vendido", "valor_venda", "venda", "valor"));
        const lucro = lucroDaLinha(l, venda);
        const qtd = num(col(l, "volume", "quantidade", "qtd", "qtde"));
        const cur = agg.get(k) ?? {
          codigo: k,
          descricao: String(col(l, "produto", "descricao", "nome") ?? col(produto, "descricao", "produto") ?? ""),
          barras: String(col(l, ...ALIAS_EAN) ?? col(produto, ...ALIAS_EAN) ?? ""),
          departamento: mercadologicoNivel1(l) || mercadologicoNivel1(produto) || "SEM DEPARTAMENTO",
          grupo: mercadologicoNivel2(l) || mercadologicoNivel2(produto),
          subgrupo: mercadologicoNivel3(l) || mercadologicoNivel3(produto),
          qtd: 0, venda: 0, custo: 0, lucro: 0, margem: 0, precoMedio: 0, custoMedio: 0, abc: "D4",
        };
        cur.qtd += qtd;
        cur.venda += venda;
        cur.lucro += lucro;
        cur.custo += venda - lucro;
        agg.set(k, cur);
      }
      const base = [...agg.values()].filter((l) => l.venda > 0);
      for (const l of base) {
        l.margem = margemPct(l.venda, l.custo);
        l.precoMedio = l.qtd > 0 ? l.venda / l.qtd : 0;
        l.custoMedio = l.qtd > 0 ? l.custo / l.qtd : 0;
      }
      // Curva ABC sobre a loja toda, antes dos filtros
      const total = base.reduce((s, l) => s + l.venda, 0);
      let acum = 0;
      [...base].sort((a, b) => b.venda - a.venda).forEach((l) => {
        acum += total > 0 ? (l.venda / total) * 100 : 100;
        l.abc = FAIXAS_ABC.find((f) => acum <= f.ate)?.classe ?? "D4";
      });
      setLinhas(base);
    } catch {
      setAviso("A consulta não respondeu a tempo. Tente um período menor.");
    } finally {
      setLoading(false); setProgresso("");
    }
  };

  const permitidas = useMemo(() => (linhas || []).filter((l) => permiteDept(l.departamento)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linhas, restrito]);

  const departamentos = useMemo(() => [...new Set(permitidas.map((l) => l.departamento))].sort(), [permitidas]);
  const grupos = useMemo(() => [...new Set(permitidas
    .filter((l) => fDep === "__all__" || l.departamento === fDep).map((l) => l.grupo).filter(Boolean))].sort(), [permitidas, fDep]);
  const subgrupos = useMemo(() => [...new Set(permitidas
    .filter((l) => (fDep === "__all__" || l.departamento === fDep) && (fGrupo === "__all__" || l.grupo === fGrupo))
    .map((l) => l.subgrupo).filter(Boolean))].sort(), [permitidas, fDep, fGrupo]);

  // Escopo = filtros de mercadológico/ABC/busca (sem o corte de margem), para comparar com a loja.
  const escopo = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return permitidas.filter((l) => {
      if (fDep !== "__all__" && l.departamento !== fDep) return false;
      if (fGrupo !== "__all__" && l.grupo !== fGrupo) return false;
      if (fSub !== "__all__" && l.subgrupo !== fSub) return false;
      if (fAbc1.length && !fAbc1.includes(l.abc[0])) return false;
      if (fAbc2 !== "__all__" && l.abc !== fAbc2) return false;
      if (l.venda < vendaMin) return false;
      if (q && ![l.codigo, l.descricao, l.barras].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [permitidas, fDep, fGrupo, fSub, fAbc1, fAbc2, vendaMin, busca]);

  const filtradas = useMemo(() => escopo.filter((l) => {
    if (!abaixoDoAlvo(l.venda, l.custo, alvo)) return false;
    if (soNegativa && l.margem >= 0) return false;
    if (fFaixa.length && !FAIXAS_MARGEM.some((f) => fFaixa.includes(f.key) && f.test(l.margem))) return false;
    return true;
  }), [escopo, alvo, soNegativa, fFaixa]);

  const ordenadas = useMemo(() => {
    const val = (l: Linha) => (sort.key === "falta" ? lucroQueFalta(l.venda, l.custo, alvo) : l[sort.key]);
    return [...filtradas].sort((a, b) => {
      const va = val(a) as any, vb = val(b) as any;
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [filtradas, sort, alvo]);

  useEffect(() => { setPage(1); }, [fDep, fGrupo, fSub, fAbc1, fAbc2, fFaixa, soNegativa, busca, alvo, vendaMin]);

  const totalPages = Math.max(1, Math.ceil(ordenadas.length / PAGE_SIZE));
  const pagina = ordenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const kpi = useMemo(() => {
    const soma = (arr: Linha[]) => arr.reduce((s, l) => ({ venda: s.venda + l.venda, custo: s.custo + l.custo }), { venda: 0, custo: 0 });
    const a = soma(filtradas), e = soma(escopo);
    return {
      qtd: filtradas.length,
      venda: a.venda,
      margem: margemPct(a.venda, a.custo),
      falta: filtradas.reduce((s, l) => s + lucroQueFalta(l.venda, l.custo, alvo), 0),
      participacao: e.venda > 0 ? (a.venda / e.venda) * 100 : 0,
      margemEscopo: margemPct(e.venda, e.custo),
      negativos: filtradas.filter((l) => l.margem < 0).length,
    };
  }, [filtradas, escopo, alvo]);

  const exportar = () => {
    const rows = ordenadas.map((l) => ({
      "Cód.": l.codigo, "Descrição": l.descricao, "Barras": l.barras,
      "Departamento": l.departamento, "Grupo": l.grupo, "Subgrupo": l.subgrupo, "ABC": l.abc,
      "Qtd. vendida": l.qtd, "Venda": l.venda, "Custo": l.custo, "Lucro": l.lucro,
      "Margem (%)": Number(l.margem.toFixed(2)),
      "Preço médio": Number(l.precoMedio.toFixed(2)), "Custo médio": Number(l.custoMedio.toFixed(2)),
      [`Preço p/ ${alvo}%`]: Number((precoParaMargem(l.custo, l.qtd, alvo) ?? 0).toFixed(2)),
      [`Lucro que falta p/ ${alvo}%`]: Number(lucroQueFalta(l.venda, l.custo, alvo).toFixed(2)),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Margem Baixa");
    salvarWorkbook(wb, "Margem Baixa");
  };

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const th = (key: SortKey, label: string, right = false) => (
    <th
      className={`px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none ${right ? "text-right" : "text-left"}`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sort.key === key && (sort.dir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
      </span>
    </th>
  );

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  const rotuloRange = range?.from && range?.to
    ? `${format(range.from, "dd/MM/yyyy")} — ${format(range.to, "dd/MM/yyyy")}`
    : "Selecione o intervalo";

  const corMargem = (m: number) =>
    m < 0 ? "text-destructive font-bold" : m < alvo / 2 ? "text-destructive" : "text-foreground";

  return (
    <ClientLayout storeName={storeName}>
      <div className="w-full mx-auto space-y-4 p-3 sm:p-4 md:p-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Produtos com Margem Baixa</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground" aria-label="Como é calculado">
                <Info className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Margem = (Venda − Custo) ÷ Venda no período escolhido, com o mesmo custo usado no Dashboard.
              Aparecem os produtos que venderam e ficaram abaixo da margem alvo.
            </TooltipContent>
          </Tooltip>
        </div>

        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[auto_auto_auto_minmax(220px,1fr)_auto] xl:items-end">
            {stores.length > 1 && (
              <div className="min-w-0 space-y-1">
                <label className="block text-xs text-muted-foreground">Loja</label>
                <Select value={storeId} onValueChange={(v) => {
                  setStoreId(v);
                  setStoreName(stores.find((s) => s.id === v)?.name || "");
                  sessionStorage.setItem("selectedStoreId", v);
                  setLinhas(null);
                }}>
                  <SelectTrigger className="w-full xl:w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="min-w-0 space-y-1">
              <label className="block text-xs text-muted-foreground">Período</label>
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start gap-2 xl:w-[260px]">
                    <CalendarDays className="w-4 h-4 shrink-0" /> <span className="truncate">{rotuloRange}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-popover" align="start">
                  <div className="flex flex-wrap gap-1 p-2 border-b border-border">
                    {[["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["mes", "Este mês"],
                      ["mespassado", "Mês passado"], ["90", "Últimos 90 dias"]].map(([k, l]) => (
                      <Button key={k} size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => aplicarAtalho(k)}>{l}</Button>
                    ))}
                  </div>
                  <Calendar mode="range" numberOfMonths={1} locale={ptBR} selected={range} onSelect={setRange} className="pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>

            <Button className="w-full sm:w-auto" onClick={() => { setCalOpen(false); buscar(); }}
              disabled={!storeId || !range?.from || !range?.to || loading}>
              Aplicar
            </Button>

            <div className="min-w-0 space-y-1">
              <label className="block text-xs text-muted-foreground">Buscar</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Código, descrição ou barras" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>

            <Button variant="outline" onClick={exportar} disabled={!ordenadas.length} className="w-full gap-2 sm:w-auto">
              <Download className="w-4 h-4" /> Exportar Excel
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Margem alvo (%)</div>
              <Input type="number" className="h-8 text-xs" min={0} max={99} step={0.5}
                value={alvo} onChange={(e) => setAlvo(Math.min(99, Math.max(0, Number(e.target.value) || 0)))} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Venda mínima no período (R$)</div>
              <Input type="number" className="h-8 text-xs" min={0} step={50}
                value={vendaMin} onChange={(e) => setVendaMin(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Departamento</div>
              <Select value={fDep} onValueChange={(v) => { setFDep(v); setFGrupo("__all__"); setFSub("__all__"); }}>
                <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="__all__">Todos os departamentos</SelectItem>
                  {departamentos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Grupo</div>
              <Select value={fGrupo} onValueChange={(v) => { setFGrupo(v); setFSub("__all__"); }}>
                <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="__all__">Todos os grupos</SelectItem>
                  {grupos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Subgrupo</div>
              <Select value={fSub} onValueChange={setFSub}>
                <SelectTrigger className="h-8 w-full text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="__all__">Todos os subgrupos</SelectItem>
                  {subgrupos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Classificação ABC</div>
              <div className="flex flex-wrap items-center gap-1">
                {["A", "B", "C", "D"].map((c) => (
                  <Button key={c} size="sm" variant={fAbc1.includes(c) ? "default" : "secondary"}
                    className="h-8 w-8 text-[11px]" onClick={() => toggle(fAbc1, setFAbc1, c)}>{c}</Button>
                ))}
                <Select value={fAbc2} onValueChange={setFAbc2}>
                  <SelectTrigger className="h-8 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="__all__">Subclasse</SelectItem>
                    {FAIXAS_ABC.map((f) => <SelectItem key={f.classe} value={f.classe}>{f.classe}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Faixa de margem</div>
              <div className="flex flex-wrap gap-1">
                {FAIXAS_MARGEM.map((f) => (
                  <Button key={f.key} size="sm" variant={fFaixa.includes(f.key) ? "default" : "secondary"}
                    className="h-7 text-[11px]" onClick={() => toggle(fFaixa, setFFaixa, f.key)}>{f.label}</Button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={soNegativa} onCheckedChange={setSoNegativa} /> Só vendidos abaixo do custo
            </label>
          </div>
        </Card>

        {aviso && (
          <Card className="p-4 text-sm text-muted-foreground flex items-center gap-2">
            <Info className="w-4 h-4" /> {aviso}
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
          {[
            { label: `Produtos abaixo de ${fmtPct(alvo)}`, valor: `${kpi.qtd.toLocaleString("pt-BR")}`, sub: `${kpi.negativos} abaixo do custo` },
            { label: "Venda desses produtos", valor: fmtBRL(kpi.venda), sub: `${fmtPct(kpi.participacao)} da venda filtrada` },
            { label: "Margem desses produtos", valor: fmtPct(kpi.margem), sub: `Filtro inteiro: ${fmtPct(kpi.margemEscopo)}` },
            { label: `Lucro que falta p/ ${fmtPct(alvo)}`, valor: fmtBRL(kpi.falta), sub: "Se todos chegassem na margem alvo" },
            { label: "Margem alvo", valor: fmtPct(alvo), sub: "Altere no filtro acima" },
          ].map((c) => (
            <Card key={c.label} className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
              <div className="mt-1 break-words text-lg font-bold text-foreground md:text-xl">{c.valor}</div>
              <div className="text-[11px] text-muted-foreground">{c.sub}</div>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-2">
              <CartProgressOverlay label={`Consultando vendas e custos${progresso ? ` (${progresso})` : ""}...`} />
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : linhas === null ? (
            <div className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <TrendingDown className="w-6 h-6" />
              Escolha o período e clique em Aplicar
            </div>
          ) : ordenadas.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">Nenhum produto abaixo da margem alvo com esses filtros.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    {th("codigo", "Cód.")}
                    {th("descricao", "Descrição")}
                    {th("departamento", "Departamento")}
                    {th("grupo", "Grupo")}
                    {th("subgrupo", "Subgrupo")}
                    {th("abc", "ABC")}
                    {th("qtd", "Qtd.", true)}
                    {th("venda", "Venda", true)}
                    {th("custo", "Custo", true)}
                    {th("lucro", "Lucro", true)}
                    {th("margem", "Margem", true)}
                    {th("precoMedio", "Preço médio", true)}
                    {th("custoMedio", "Custo médio", true)}
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Preço p/ {fmtPct(alvo)}</th>
                    {th("falta", "Lucro que falta", true)}
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((l) => {
                    const sugerido = precoParaMargem(l.custo, l.qtd, alvo);
                    return (
                      <tr key={l.codigo} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono">{l.codigo}</td>
                        <td className="px-3 py-2 min-w-[220px]">
                          <div className="font-medium text-foreground">{l.descricao}</div>
                          {l.barras && <div className="text-[10px] text-muted-foreground font-mono">{l.barras}</div>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{l.departamento}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{l.grupo}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{l.subgrupo}</td>
                        <td className="px-3 py-2"><Badge variant="outline">{l.abc}</Badge></td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtQtd(l.qtd)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.venda)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.custo)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${l.lucro < 0 ? "text-destructive" : ""}`}>{fmtBRL(l.lucro)}</td>
                        <td className={`px-3 py-2 text-right tabular-nums text-sm ${corMargem(l.margem)}`}>{fmtPct(l.margem)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.precoMedio)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.custoMedio)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-primary">{sugerido ? fmtBRL(sugerido) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(lucroQueFalta(l.venda, l.custo, alvo))}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {ordenadas.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted-foreground">
              <span>{ordenadas.length.toLocaleString("pt-BR")} produtos · página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </ClientLayout>
  );
}
