import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import * as XLSX from "xlsx";
import { salvarWorkbook } from "@/lib/exportBranding";
import {
  CalendarDays, Download, Info, Search, ArrowUp, ArrowDown, PackageSearch,
} from "lucide-react";

import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio, pick as col, num } from "@/lib/vrReport";

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

interface Store { id: string; name: string }

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQtd = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtPct = (v: number) =>
  `${(Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const fmtDate = (v: string | undefined | null) => {
  if (!v || v === "0000-00-00") return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return format(d, "dd/MM/yyyy");
};

const FAIXAS_ABC = [
  { classe: "A1", ate: 20.3 }, { classe: "A2", ate: 31.5 }, { classe: "A3", ate: 40.5 }, { classe: "A4", ate: 45.0 },
  { classe: "B1", ate: 56.3 }, { classe: "B2", ate: 62.5 }, { classe: "B3", ate: 67.5 }, { classe: "B4", ate: 70.0 },
  { classe: "C1", ate: 79.0 }, { classe: "C2", ate: 84.0 }, { classe: "C3", ate: 88.0 }, { classe: "C4", ate: 90.0 },
  { classe: "D1", ate: 94.5 }, { classe: "D2", ate: 97.0 }, { classe: "D3", ate: 99.0 }, { classe: "D4", ate: 100 },
];

const FAIXAS_PCT = [
  { key: "0", label: "0%", test: (p: number) => p <= 0 },
  { key: "1-25", label: "1–25%", test: (p: number) => p > 0 && p <= 25 },
  { key: "26-50", label: "26–50%", test: (p: number) => p > 25 && p <= 50 },
  { key: "51-75", label: "51–75%", test: (p: number) => p > 50 && p <= 75 },
  { key: "76-99", label: "76–99%", test: (p: number) => p > 75 && p < 100 },
  { key: "100", label: "100% ou mais", test: (p: number) => p >= 100 },
];

interface Linha {
  codigo: string;
  descricao: string;
  barras: string;
  departamento: string;
  grupo: string;
  ultimaCompra: string;
  ultimaVenda: string;
  diasSemCompra: number;
  qtdCompra: number;
  valorCompra: number;
  qtdVenda: number;
  valorVenda: number;
  progresso: number;
  estoqueDinamico: number;
  valorEstoqueDinamico: number;
  estoqueSistema: number;
  abc: string;
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

const badgeAbc = (abc: string) => {
  const n = abc[0];
  if (n === "A") return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (n === "B") return "bg-sky-500/15 text-sky-500 border-sky-500/30";
  if (n === "C") return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
};

const corProgresso = (p: number) => {
  if (p < 25) return "bg-red-500";
  if (p < 60) return "bg-amber-500";
  if (p < 90) return "bg-sky-500";
  return "bg-emerald-500";
};

type SortKey =
  | "codigo" | "descricao" | "departamento" | "abc" | "ultimaCompra" | "ultimaVenda"
  | "qtdCompra" | "valorCompra" | "qtdVenda" | "valorVenda" | "progresso" | "estoqueDinamico";

const PAGE_SIZE = 50;

const EstoqueDinamico = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");

  const [range, setRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 29),
    to: new Date(),
  });
  const [calOpen, setCalOpen] = useState(false);

  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [fDep, setFDep] = useState<string>("__all__");
  const [fAbc1, setFAbc1] = useState<string[]>([]);
  const [fAbc2, setFAbc2] = useState<string>("__all__");
  const [fFaixa, setFFaixa] = useState<string[]>([]);
  const [soNaoVendidos, setSoNaoVendidos] = useState(false);
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "valorCompra", dir: "desc" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
    if (user) fetchStores();
  }, [user, authLoading]);

  const fetchStores = async () => {
    const sid = sessionStorage.getItem("selectedStoreId");
    if (isAdmin) {
      const { data } = await supabase.from("stores").select("id, name").order("name");
      if (data && data.length) {
        setStores(data);
        const p = data.find((s) => s.id === sid) || data[0];
        setStoreId(p.id); setStoreName(p.name);
      }
    } else {
      const { data } = await supabase
        .from("user_store_access")
        .select("stores(id, name)")
        .eq("user_id", user!.id)
        .eq("approved", true);
      const lojas = (data || []).map((r: any) => r.stores).filter(Boolean) as Store[];
      setStores(lojas);
      if (lojas.length) {
        const p = lojas.find((s) => s.id === sid) || lojas[0];
        setStoreId(p.id); setStoreName(p.name);
      }
    }
  };

  const aplicarAtalho = (tipo: string) => {
    const hoje = new Date();
    if (tipo === "hoje") setRange({ from: hoje, to: hoje });
    else if (tipo === "7") setRange({ from: subDays(hoje, 6), to: hoje });
    else if (tipo === "30") setRange({ from: subDays(hoje, 29), to: hoje });
    else if (tipo === "mes") setRange({ from: startOfMonth(hoje), to: hoje });
    else if (tipo === "mespassado") {
      const m = subMonths(hoje, 1);
      setRange({ from: startOfMonth(m), to: endOfMonth(m) });
    } else if (tipo === "90") setRange({ from: subDays(hoje, 89), to: hoje });
  };

  const buscar = async () => {
    if (!storeId || !range?.from || !range?.to) return;
    setLoading(true); setAviso(null); setPage(1);
    const r = await chamarRelatorio(storeId, "estoque_dinamico", {
      inicio: iso(range.from),
      fim: iso(range.to),
    });
    const msg = avisoRelatorio(r);
    if (msg) { setAviso(msg); setLinhas([]); setLoading(false); return; }

    const base: Linha[] = (r.dados || []).map((l: any) => {
      const qtdCompra = num(col(l, "qtd_compra", "quantidade_compra"));
      const qtdVenda = num(col(l, "qtd_venda", "quantidade_venda"));
      const progRaw = col(l, "progresso_venda");
      const estRaw = col(l, "estoque_dinamico");
      return {
        codigo: String(col(l, "codigo", "cod_produto", "id_produto") ?? ""),
        descricao: String(col(l, "descricao", "produto") ?? ""),
        barras: String(col(l, "codigo_barras", "ean", "barras") ?? ""),
        departamento: String(col(l, "departamento", "m1_departamento", "secao") ?? "").trim(),
        grupo: String(col(l, "grupo", "m2_grupo") ?? "").trim(),
        ultimaCompra: String(col(l, "ultima_compra") ?? ""),
        ultimaVenda: String(col(l, "ultima_venda") ?? ""),
        diasSemCompra: num(col(l, "dias_desde_ultima_compra")),
        qtdCompra,
        valorCompra: num(col(l, "valor_compra", "total_compra")),
        qtdVenda,
        valorVenda: num(col(l, "valor_venda", "total_venda")),
        progresso:
          progRaw !== undefined && String(progRaw).trim() !== ""
            ? num(progRaw)
            : qtdCompra > 0 ? (qtdVenda / qtdCompra) * 100 : 0,
        estoqueDinamico:
          estRaw !== undefined && String(estRaw).trim() !== ""
            ? num(estRaw)
            : qtdCompra - qtdVenda,
        valorEstoqueDinamico: num(col(l, "valor_estoque_dinamico")),
        estoqueSistema: num(col(l, "estoque_sistema")),
        abc: "D4",
      };
    });

    // Classificacao ABC sobre o resultado inteiro (antes dos filtros)
    const totalVenda = base.reduce((s, l) => s + l.valorVenda, 0);
    const ordenado = [...base].sort((a, b) => b.valorVenda - a.valorVenda);
    let acum = 0;
    ordenado.forEach((l) => {
      if (totalVenda > 0 && l.valorVenda > 0) {
        acum += (l.valorVenda / totalVenda) * 100;
        l.abc = FAIXAS_ABC.find((f) => acum <= f.ate)?.classe ?? "D4";
      } else {
        l.abc = "D4";
      }
    });

    setLinhas(base);
    setLoading(false);
  };

  const departamentos = useMemo(
    () => Array.from(new Set((linhas || []).map((l) => l.departamento).filter(Boolean))).sort(),
    [linhas],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (linhas || []).filter((l) => {
      if (fDep !== "__all__" && l.departamento !== fDep) return false;
      if (fAbc1.length && !fAbc1.includes(l.abc[0])) return false;
      if (fAbc2 !== "__all__" && l.abc !== fAbc2) return false;
      if (fFaixa.length && !FAIXAS_PCT.some((f) => fFaixa.includes(f.key) && f.test(l.progresso))) return false;
      if (soNaoVendidos && l.qtdVenda !== 0) return false;
      if (q && ![l.codigo, l.descricao, l.barras].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [linhas, fDep, fAbc1, fAbc2, fFaixa, soNaoVendidos, busca]);

  const ordenadas = useMemo(() => {
    const arr = [...filtradas];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const va = a[key] as any, vb = b[key] as any;
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "pt-BR");
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtradas, sort]);

  useEffect(() => { setPage(1); }, [fDep, fAbc1, fAbc2, fFaixa, soNaoVendidos, busca]);

  const totalPages = Math.max(1, Math.ceil(ordenadas.length / PAGE_SIZE));
  const pagina = ordenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totais = useMemo(() => {
    const t = filtradas.reduce(
      (s, l) => ({
        qtdCompra: s.qtdCompra + l.qtdCompra,
        valorCompra: s.valorCompra + l.valorCompra,
        qtdVenda: s.qtdVenda + l.qtdVenda,
        valorVenda: s.valorVenda + l.valorVenda,
        estoqueDinamico: s.estoqueDinamico + l.estoqueDinamico,
        valorEstoqueDinamico: s.valorEstoqueDinamico + l.valorEstoqueDinamico,
      }),
      { qtdCompra: 0, valorCompra: 0, qtdVenda: 0, valorVenda: 0, estoqueDinamico: 0, valorEstoqueDinamico: 0 },
    );
    return { ...t, progresso: t.qtdCompra > 0 ? (t.qtdVenda / t.qtdCompra) * 100 : 0 };
  }, [filtradas]);

  const exportar = () => {
    const rows = ordenadas.map((l) => ({
      "Cód.": l.codigo,
      "Descrição": l.descricao,
      "Barras": l.barras,
      "Departamento": l.departamento,
      "Grupo": l.grupo,
      "ABC": l.abc,
      "Última compra": fmtDate(l.ultimaCompra),
      "Última venda": fmtDate(l.ultimaVenda),
      "Dias s/ compra": l.diasSemCompra,
      "Qtd. compra": l.qtdCompra,
      "Valor compra": l.valorCompra,
      "Qtd. venda": l.qtdVenda,
      "Valor venda": l.valorVenda,
      "Progresso (%)": Number(l.progresso.toFixed(1)),
      "Estoque dinâmico": l.estoqueDinamico,
      "Valor est. dinâmico": l.valorEstoqueDinamico,
      "Estoque sistema": l.estoqueSistema,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Estoque Dinâmico");
    salvarWorkbook(wb, "Estoque Dinâmico");
  };

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const th = (key: SortKey, label: string, align = "left") => (
    <th
      className={`px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none text-${align}`}
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

  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-2">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Estoque Dinâmico</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground" aria-label="Como é calculado">
                <Info className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              As compras respeitam o intervalo de datas selecionado. As vendas são contadas
              da data da última compra de cada produto até hoje, ignorando o fim do intervalo.
            </TooltipContent>
          </Tooltip>
        </div>

        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {stores.length > 1 && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Loja</label>
                <Select
                  value={storeId}
                  onValueChange={(v) => {
                    setStoreId(v);
                    setStoreName(stores.find((s) => s.id === v)?.name || "");
                    sessionStorage.setItem("selectedStoreId", v);
                    setLinhas(null);
                  }}
                >
                  <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Intervalo</label>
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="justify-start gap-2 w-[260px]">
                    <CalendarDays className="w-4 h-4" /> {rotuloRange}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-popover" align="start">
                  <div className="flex flex-wrap gap-1 p-2 border-b border-border">
                    {[["hoje", "Hoje"], ["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"],
                      ["mes", "Este mês"], ["mespassado", "Mês passado"], ["90", "Últimos 90 dias"]]
                      .map(([k, l]) => (
                        <Button key={k} size="sm" variant="secondary" className="h-7 text-[11px]"
                          onClick={() => aplicarAtalho(k)}>{l}</Button>
                      ))}
                  </div>
                  <Calendar
                    mode="range"
                    numberOfMonths={2}
                    locale={ptBR}
                    selected={range}
                    onSelect={setRange}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button onClick={() => { setCalOpen(false); buscar(); }} disabled={!storeId || !range?.from || !range?.to || loading}>
              Aplicar
            </Button>

            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">Buscar</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Código, descrição ou barras"
                  value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>

            <Button variant="outline" onClick={exportar} disabled={!ordenadas.length} className="gap-2">
              <Download className="w-4 h-4" /> Exportar Excel
            </Button>
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Departamento</div>
              <Select value={fDep} onValueChange={setFDep}>
                <SelectTrigger className="h-7 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="__all__">Todos os departamentos</SelectItem>
                  {departamentos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Classificação ABC</div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {["A", "B", "C", "D"].map((c) => (
                    <Button key={c} size="sm" variant={fAbc1.includes(c) ? "default" : "secondary"}
                      className="h-7 w-8 text-[11px]" onClick={() => toggle(fAbc1, setFAbc1, c)}>{c}</Button>
                  ))}
                </div>
                <Select value={fAbc2} onValueChange={setFAbc2}>
                  <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="__all__">Subclasse: todas</SelectItem>
                    {FAIXAS_ABC.map((f) => <SelectItem key={f.classe} value={f.classe}>{f.classe}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Faixa de % vendida</div>
              <div className="flex flex-wrap gap-1">
                {FAIXAS_PCT.map((f) => (
                  <Button key={f.key} size="sm" variant={fFaixa.includes(f.key) ? "default" : "secondary"}
                    className="h-7 text-[11px]" onClick={() => toggle(fFaixa, setFFaixa, f.key)}>{f.label}</Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Somente não vendidos</div>
              <div className="h-7 flex items-center">
                <Switch checked={soNaoVendidos} onCheckedChange={setSoNaoVendidos} />
              </div>
            </div>
          </div>
        </Card>

        {aviso && (
          <Card className="p-4 text-sm text-muted-foreground flex items-center gap-2">
            <Info className="w-4 h-4" /> {aviso}
          </Card>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Valor comprado", valor: fmtBRL(totais.valorCompra) },
            { label: "Valor vendido", valor: fmtBRL(totais.valorVenda) },
            { label: "Progresso geral", valor: fmtPct(totais.progresso) },
            { label: "Estoque dinâmico (R$)", valor: fmtBRL(totais.valorEstoqueDinamico) },
          ].map((c) => (
            <Card key={c.label} className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
              <div className="text-lg md:text-xl font-bold text-foreground mt-1">{c.valor}</div>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : linhas === null ? (
            <div className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <PackageSearch className="w-6 h-6" />
              Selecione um intervalo e clique em Aplicar
            </div>
          ) : ordenadas.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">Nenhum produto encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    {th("codigo", "Cód.")}
                    {th("descricao", "Descrição")}
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-left">Barras</th>
                    {th("departamento", "Departamento")}
                    {th("abc", "ABC")}
                    {th("ultimaCompra", "Última compra")}
                    {th("ultimaVenda", "Última venda")}
                    {th("qtdCompra", "Qtd. compra", "right")}
                    {th("valorCompra", "Valor compra", "right")}
                    {th("qtdVenda", "Qtd. venda", "right")}
                    {th("valorVenda", "Valor venda", "right")}
                    {th("progresso", "Progresso")}
                    {th("estoqueDinamico", "Estoque dinâmico", "right")}
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((l, i) => {
                    const encalhe = l.progresso < 25 && l.diasSemCompra > 30;
                    return (
                      <tr key={`${l.codigo}-${i}`} className="border-t border-border hover:bg-muted/30">
                        <td className="px-3 py-2 whitespace-nowrap">{l.codigo}</td>
                        <td className="px-3 py-2 min-w-[220px]">{l.descricao}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{l.barras}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{l.departamento}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={badgeAbc(l.abc)}>{l.abc}</Badge>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.ultimaCompra)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.ultimaVenda)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmtQtd(l.qtdCompra)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmtBRL(l.valorCompra)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmtQtd(l.qtdVenda)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmtBRL(l.valorVenda)}</td>
                        <td className="px-3 py-2 min-w-[140px]">
                          <div className="relative h-4 w-full rounded bg-muted overflow-hidden">
                            <div className={`h-full ${corProgresso(l.progresso)}`}
                              style={{ width: `${Math.min(100, Math.max(0, l.progresso))}%` }} />
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-foreground">
                              {fmtPct(l.progresso)}
                            </span>
                          </div>
                        </td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap font-medium ${
                          encalhe ? "text-red-500" : l.estoqueDinamico < 0 ? "text-sky-500" : ""
                        }`}>
                          {l.estoqueDinamico < 0 ? "-" : ""}{fmtQtd(Math.abs(l.estoqueDinamico))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="sticky bottom-0 bg-card border-t-2 border-border font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={7}>Totais ({filtradas.length} produtos)</td>
                    <td className="px-3 py-2 text-right">{fmtQtd(totais.qtdCompra)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(totais.valorCompra)}</td>
                    <td className="px-3 py-2 text-right">{fmtQtd(totais.qtdVenda)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(totais.valorVenda)}</td>
                    <td className="px-3 py-2">{fmtPct(totais.progresso)}</td>
                    <td className="px-3 py-2 text-right">{fmtQtd(totais.estoqueDinamico)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {ordenadas.length > PAGE_SIZE && (
            <div className="flex items-center justify-between p-3 border-t border-border text-xs">
              <span className="text-muted-foreground">
                Página {page} de {totalPages} — {ordenadas.length} produtos
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </ClientLayout>
  );
};

export default EstoqueDinamico;
