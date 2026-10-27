import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import * as XLSX from "xlsx";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Legend } from "recharts";
import { CalendarDays, ChevronDown, ChevronRight, Download, Filter, RefreshCw, Search, Settings, ArrowUp, ArrowDown } from "lucide-react";

import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio, pick, num, txt } from "@/lib/vrReport";
import { salvarWorkbook } from "@/lib/exportBranding";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import {
  buscarLimite, statusVariacao, impactoVariacao, statusAlcada, compraApos30, piorAlcada,
  type LimiteAlcada, type StatusAlcada, type StatusVariacao,
} from "@/lib/analiseCompras";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { CartProgressOverlay } from "@/components/CartProgress";

interface Store { id: string; name: string }

const brl = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null) => v == null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const qt = (v: number | null) => v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const iso = (d: Date) => format(d, "yyyy-MM-dd");
const dt = (v: string) => { if (!v) return ""; const d = new Date(v.length === 10 ? v + "T00:00:00" : v); return isNaN(d.getTime()) ? v : format(d, "dd/MM/yyyy"); };
const numOuNull = (v: unknown) => (v === undefined || v === null || String(v).trim() === "") ? null : num(v);

interface Item {
  data: string; idNota: string; nota: string; tipo: string; fornecedor: string;
  codigo: string; descricao: string; ean: string; departamento: string; grupo: string;
  qtd: number; custo: number; valor: number; custoAnt: number | null; variacao: number | null;
  diasUltima: number | null; vendaDia: number; cobCompra: number | null; estoque: number | null;
  cobEstoque: number | null; preco: number; margem: number | null; curva: string;
  custoBruto: number | null; quebraPct: number | null;
  sv: StatusVariacao; impacto: number; alcada: StatusAlcada; apos30: boolean;
}

const ALCADA_INFO: Record<StatusAlcada, { label: string; cls: string; cor: string }> = {
  na: { label: "Na Alçada", cls: "bg-emerald-600 text-white", cor: "#16a34a" },
  fora: { label: "Fora da Alçada", cls: "bg-amber-500 text-white", cor: "#f59e0b" },
  critico: { label: "Crítico +1 mês", cls: "bg-red-600 text-white", cor: "#dc2626" },
  sem: { label: "Sem histórico", cls: "bg-muted text-muted-foreground", cor: "#9ca3af" },
};
const VAR_INFO: Record<StatusVariacao, { label: string; cls: string }> = {
  alta: { label: "Alta", cls: "bg-red-600 text-white" },
  queda: { label: "Queda", cls: "bg-emerald-600 text-white" },
  estavel: { label: "Estável", cls: "bg-secondary text-secondary-foreground" },
  primeira: { label: "1ª compra", cls: "bg-muted text-muted-foreground" },
  bonificacao: { label: "Bonificação", cls: "bg-muted text-muted-foreground" },
};

/* ---------- Multi-seleção ---------- */
function Multi({ label, opcoes, valor, onChange, busca }: { label: string; opcoes: string[]; valor: string[]; onChange: (v: string[]) => void; busca?: boolean }) {
  const [q, setQ] = useState("");
  const lista = opcoes.filter((o) => !q || o.toLowerCase().includes(q.toLowerCase()));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="justify-between min-w-[140px]">
          <span className="truncate">{label}{valor.length ? ` (${valor.length})` : ""}</span><ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        {busca && <Input placeholder="Buscar..." value={q} onChange={(e) => setQ(e.target.value)} className="h-8 mb-2" />}
        <div className="max-h-64 overflow-auto space-y-1">
          {lista.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm cursor-pointer px-1 py-0.5 rounded hover:bg-muted">
              <Checkbox checked={valor.includes(o)} onCheckedChange={(c) => onChange(c ? [...valor, o] : valor.filter((x) => x !== o))} />
              <span className="truncate">{o || "(vazio)"}</span>
            </label>
          ))}
          {!lista.length && <p className="text-xs text-muted-foreground p-1">Nada encontrado</p>}
        </div>
        {valor.length > 0 && <Button variant="ghost" size="sm" className="w-full mt-1" onClick={() => onChange([])}>Limpar</Button>}
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Tabela genérica ---------- */
interface Col<T> { key: string; label: string; val: (r: T) => string | number | null; render?: (r: T) => React.ReactNode; num?: boolean }
function Tabela<T>({ linhas, cols, titulo, expandir, destaque, chave }: {
  linhas: T[]; cols: Col<T>[]; titulo: string; expandir?: (r: T) => React.ReactNode; destaque?: (r: T) => boolean; chave: (r: T) => string;
}) {
  const mobile = useIsMobile();
  const [sort, setSort] = useState<{ k: string; d: 1 | -1 } | null>(null);
  const [page, setPage] = useState(1);
  const [aberto, setAberto] = useState<Set<string>>(new Set());
  const POR = 50;
  const ord = useMemo(() => {
    if (!sort) return linhas;
    const c = cols.find((x) => x.key === sort.k)!;
    return [...linhas].sort((a, b) => {
      const va = c.val(a), vb = c.val(b);
      if (va == null) return 1; if (vb == null) return -1;
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR")) * sort.d;
    });
  }, [linhas, sort, cols]);
  useEffect(() => setPage(1), [linhas]);
  const pags = Math.max(1, Math.ceil(ord.length / POR));
  const vis = ord.slice((page - 1) * POR, page * POR);
  const exportar = () => {
    const ws = XLSX.utils.json_to_sheet(ord.map((r) => Object.fromEntries(cols.map((c) => [c.label, c.val(r)]))));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, titulo.slice(0, 30));
    salvarWorkbook(wb, `Análise de Compras - ${titulo}`);
  };
  const toggle = (k: string) => setAberto((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const cel = (c: Col<T>, r: T) => c.render ? c.render(r) : (c.val(r) ?? "—");

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{ord.length.toLocaleString("pt-BR")} linhas</span>
        <Button size="sm" variant="outline" onClick={exportar}><Download className="h-4 w-4 mr-1" />Exportar .xlsx</Button>
      </div>
      {mobile ? (
        <div className="space-y-2">
          {vis.map((r) => { const k = chave(r); return (
            <Card key={k} className={`p-3 text-sm ${destaque?.(r) ? "bg-destructive/15 text-foreground" : ""}`}>
              {cols.map((c) => <div key={c.key} className="flex justify-between gap-2 py-0.5"><span className="text-muted-foreground">{c.label}</span><span className="text-right">{cel(c, r)}</span></div>)}
              {expandir && <Button size="sm" variant="ghost" className="w-full mt-1" onClick={() => toggle(k)}>{aberto.has(k) ? "Fechar" : "Ver itens"}</Button>}
              {expandir && aberto.has(k) && <div className="mt-2">{expandir(r)}</div>}
            </Card>); })}
        </div>
      ) : (
        <div className="overflow-auto border rounded-md max-h-[70vh]">
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0 z-10">
              <tr>
                {expandir && <th className="w-6" />}
                {cols.map((c) => (
                  <th key={c.key} className={`px-2 py-2 font-semibold cursor-pointer whitespace-nowrap ${c.num ? "text-right" : "text-left"}`}
                    onClick={() => setSort((s) => s?.k === c.key ? { k: c.key, d: (s.d * -1) as 1 | -1 } : { k: c.key, d: -1 })}>
                    {c.label}{sort?.k === c.key && (sort.d === 1 ? <ArrowUp className="inline h-3 w-3" /> : <ArrowDown className="inline h-3 w-3" />)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vis.map((r) => { const k = chave(r); return (
                <Fragment key={k}>
                  <tr className={`border-t ${destaque?.(r) ? "bg-destructive/15 text-foreground" : ""}`}>
                    {expandir && <td className="px-1"><button onClick={() => toggle(k)}>{aberto.has(k) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>}
                    {cols.map((c) => <td key={c.key} className={`px-2 py-1.5 whitespace-nowrap ${c.num ? "text-right tabular-nums" : ""}`}>{cel(c, r)}</td>)}
                  </tr>
                  {expandir && aberto.has(k) && <tr><td colSpan={cols.length + 1} className="bg-muted/40 p-2">{expandir(r)}</td></tr>}
                </Fragment>); })}
              {!vis.length && <tr><td colSpan={cols.length + 1} className="text-center p-6 text-muted-foreground">Nenhum registro</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {pags > 1 && (
        <div className="flex justify-center items-center gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</Button>
          <span>{page} / {pags}</span>
          <Button size="sm" variant="outline" disabled={page === pags} onClick={() => setPage(page + 1)}>Próxima</Button>
        </div>
      )}
    </div>
  );
}

const B = ({ cls, children }: { cls: string; children: React.ReactNode }) => <Badge className={`${cls} border-0 whitespace-nowrap`}>{children}</Badge>;

const AnaliseCompras = () => {
  const { user, isAdmin, isGlobalAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const mobile = useIsMobile();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [range, setRange] = useState<DateRange | undefined>({ from: subDays(new Date(), 29), to: new Date() });
  const [pendente, setPendente] = useState(false);
  const [brutos, setBrutos] = useState<any[]>([]);
  const [deParaSecao, setDeParaSecao] = useState<Record<string, string>>({});
  const [limites, setLimites] = useState<LimiteAlcada[]>([]);
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cfgOpen, setCfgOpen] = useState(false);

  // filtros (todos no front)
  const [fDep, setFDep] = useState<string[]>([]);
  const [fGrupo, setFGrupo] = useState<string[]>([]);
  const [fForn, setFForn] = useState<string[]>([]);
  const [fTipo, setFTipo] = useState<string[] | null>(null);
  const [fCurva, setFCurva] = useState<string[]>([]);
  const [fSub, setFSub] = useState<string[]>([]);
  const [fAlc, setFAlc] = useState<string[]>([]);
  const [fVar, setFVar] = useState("todas");
  const [limitePct, setLimitePct] = useState(5);
  const [fApos30, setFApos30] = useState(false);
  const [fComAnt, setFComAnt] = useState(false);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
    if (user) carregarLojas();
  }, [user, authLoading]);

  const carregarLojas = async () => {
    const sid = sessionStorage.getItem("selectedStoreId");
    let lojas: Store[] = [];
    if (isAdmin) {
      const { data } = await supabase.from("stores").select("id, name").order("name");
      lojas = data || [];
    } else {
      const { data } = await supabase.from("user_store_access").select("stores(id, name)").eq("user_id", user!.id).eq("approved", true);
      lojas = (data || []).map((r: any) => r.stores).filter(Boolean);
    }
    setStores(lojas);
    const p = lojas.find((s) => s.id === sid) || lojas[0];
    if (p) { setStoreId(p.id); buscar(p.id); }
  };

  const carregarLimites = async () => {
    const { data } = await supabase.from("compras_alcada_config").select("*");
    setLimites((data || []).map((d: any) => ({ ...d, limite_dentro_dias: Number(d.limite_dentro_dias), limite_fora_dias: Number(d.limite_fora_dias), limite_variacao_pct: Number(d.limite_variacao_pct) })));
  };

  const buscar = async (sid = storeId) => {
    if (!sid || !range?.from || !range?.to) return;
    setLoading(true); setAviso(null); setPendente(false);
    try {
      const [{ data: cfg }, { data: dp }] = await Promise.all([
        supabase.from("store_vr_config").select("codigo_loja").eq("store_id", sid).maybeSingle(),
        supabase.from("vr_secao_departamento").select("secao_vr, department").eq("store_id", sid),
        carregarLimites(),
      ]);
      setDeParaSecao(Object.fromEntries((dp || []).map((r) => [r.secao_vr.trim().toUpperCase(), r.department])));
      const r = await chamarRelatorio(sid, "analise_compras", {
        inicio: iso(range.from), fim: iso(range.to), loja: (cfg as any)?.codigo_loja || 0,
      });
      const msg = r.indisponivel ? "Relatório não disponível no sistema desta loja." : avisoRelatorio(r);
      setAviso(msg);
      setBrutos(msg ? [] : r.dados);
    } finally { setLoading(false); }
  };

  const itens: Item[] = useMemo(() => brutos.map((l) => {
    const secao = txt(pick(l, "secao", "departamento"));
    const departamento = deParaSecao[secao.toUpperCase()] || secao || "SEM SEÇÃO";
    const qtd = num(pick(l, "qtd_compra")); const custo = num(pick(l, "custo_unit"));
    const custoAnt = numOuNull(pick(l, "custo_unit_anterior"));
    const variacao = numOuNull(pick(l, "variacao_pct"));
    const vendaDia = num(pick(l, "venda_media_dia"));
    const cobCompra = numOuNull(pick(l, "dias_cobertura_compra"));
    const lim = buscarLimite(limites, storeId, departamento);
    return {
      data: txt(pick(l, "data_entrada")).slice(0, 10), idNota: txt(pick(l, "id_nota", "numero_nota")), nota: txt(pick(l, "numero_nota")),
      tipo: txt(pick(l, "tipo_entrada")), fornecedor: txt(pick(l, "fornecedor"), "(sem fornecedor)"),
      codigo: txt(pick(l, "codigo")), descricao: txt(pick(l, "descricao")), ean: txt(pick(l, "ean")),
      departamento, grupo: txt(pick(l, "grupo")), qtd, custo, valor: num(pick(l, "valor_compra")) || qtd * custo,
      custoAnt, variacao, diasUltima: numOuNull(pick(l, "dias_desde_ultima_compra")), vendaDia, cobCompra,
      ...(() => {
        const bruto = pick(l, "estoque_atual");
        const vazio = bruto === undefined || bruto === null || String(bruto).trim() === "";
        return vazio
          ? { estoque: null, cobEstoque: null }
          : { estoque: num(bruto), cobEstoque: numOuNull(pick(l, "dias_cobertura_estoque")) };
      })(),
      custoBruto: (() => { const v = numOuNull(pick(l, "custo_bruto_unit")); return v != null && v > 0 ? v : null; })(),
      quebraPct: numOuNull(pick(l, "quebra_pct")),
      preco: num(pick(l, "preco_venda_atual")), margem: numOuNull(pick(l, "margem_sobre_custo_novo")),
      curva: txt(pick(l, "curva_abcd"), "SEM VENDA").toUpperCase(),
      sv: statusVariacao(custo, custoAnt, variacao, limitePct), impacto: impactoVariacao(custo, custoAnt, qtd),
      alcada: statusAlcada(cobCompra, vendaDia, lim.limite_dentro_dias, lim.limite_fora_dias),
      apos30: compraApos30(numOuNull(pick(l, "dias_desde_ultima_compra"))),
    };
  }), [brutos, deParaSecao, limites, storeId, limitePct]);

  const uniq = (a: string[]) => Array.from(new Set(a)).sort((x, y) => x.localeCompare(y, "pt-BR"));
  const opDep = useMemo(() => uniq(itens.map((i) => i.departamento)), [itens]);
  const opGrupo = useMemo(() => uniq(itens.filter((i) => !fDep.length || fDep.includes(i.departamento)).map((i) => i.grupo)), [itens, fDep]);
  const opForn = useMemo(() => uniq(itens.map((i) => i.fornecedor)), [itens]);
  const opTipo = useMemo(() => uniq(itens.map((i) => i.tipo)), [itens]);
  const tiposSel = fTipo ?? opTipo.filter((t) => !/BONIFICA/i.test(t));

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return itens.filter((i) =>
      (!fDep.length || fDep.includes(i.departamento)) &&
      (!fGrupo.length || fGrupo.includes(i.grupo)) &&
      (!fForn.length || fForn.includes(i.fornecedor)) &&
      tiposSel.includes(i.tipo) &&
      (!fCurva.length || fCurva.includes(i.curva[0])) &&
      (!fSub.length || fSub.includes(i.curva)) &&
      (!fAlc.length || fAlc.includes(i.alcada)) &&
      (fVar === "todas" || (fVar === "alta" && i.sv === "alta") || (fVar === "queda" && i.sv === "queda") ||
        (fVar === "fora" && (i.sv === "alta" || i.sv === "queda")) || (fVar === "primeira" && i.sv === "primeira")) &&
      (!fApos30 || i.apos30) && (!fComAnt || i.custoAnt != null) &&
      (!q || i.descricao.toLowerCase().includes(q) || i.codigo.includes(q) || i.ean.includes(q)));
  }, [itens, fDep, fGrupo, fForn, tiposSel, fCurva, fSub, fAlc, fVar, fApos30, fComAnt, busca]);

  const limpar = () => { setFDep([]); setFGrupo([]); setFForn([]); setFTipo(null); setFCurva([]); setFSub([]); setFAlc([]); setFVar("todas"); setLimitePct(5); setFApos30(false); setFComAnt(false); setBusca(""); };

  const kpi = useMemo(() => {
    const total = filtrados.reduce((s, i) => s + i.valor, 0);
    const alta = filtrados.filter((i) => i.sv === "alta"); const queda = filtrados.filter((i) => i.sv === "queda");
    const fora = filtrados.filter((i) => i.alcada === "fora" || i.alcada === "critico").reduce((s, i) => s + i.valor, 0);
    return {
      total, notas: new Set(filtrados.map((i) => i.idNota)).size, itens: filtrados.length,
      alta: alta.length, impAlta: alta.reduce((s, i) => s + i.impacto, 0),
      queda: queda.length, econ: -queda.reduce((s, i) => s + i.impacto, 0),
      pctFora: total ? (fora / total) * 100 : 0,
      critico: filtrados.filter((i) => i.alcada === "critico").reduce((s, i) => s + i.valor, 0),
    };
  }, [filtrados]);

  const pctForaDe = (l: Item[]) => { const t = l.reduce((s, i) => s + i.valor, 0); return t ? l.filter((i) => i.alcada === "fora" || i.alcada === "critico").reduce((s, i) => s + i.valor, 0) / t * 100 : 0; };
  const agrupar = (f: (i: Item) => string) => { const m = new Map<string, Item[]>(); filtrados.forEach((i) => { const k = f(i); m.set(k, [...(m.get(k) || []), i]); }); return m; };

  const porNota = useMemo(() => Array.from(agrupar((i) => i.idNota)).map(([k, l]) => ({
    k, itens: l, data: l[0].data, nota: l[0].nota, fornecedor: l[0].fornecedor, tipo: l[0].tipo,
    valor: l.reduce((s, i) => s + i.valor, 0), n: l.length, alta: l.filter((i) => i.sv === "alta").length,
    impacto: l.reduce((s, i) => s + i.impacto, 0), fora: pctForaDe(l), pior: l.reduce<StatusAlcada>((a, i) => piorAlcada(a, i.alcada), "sem"),
  })), [filtrados]);
  const porForn = useMemo(() => Array.from(agrupar((i) => i.fornecedor)).map(([k, l]) => {
    const comVar = l.filter((i) => i.variacao != null && i.custo > 0); const pv = comVar.reduce((s, i) => s + i.valor, 0);
    return { k, itens: l, notas: new Set(l.map((i) => i.idNota)).size, valor: l.reduce((s, i) => s + i.valor, 0),
      alta: l.filter((i) => i.sv === "alta").length, queda: l.filter((i) => i.sv === "queda").length,
      impacto: l.reduce((s, i) => s + i.impacto, 0), impAlta: l.filter((i) => i.sv === "alta").reduce((s, i) => s + i.impacto, 0),
      varMedia: pv ? comVar.reduce((s, i) => s + (i.variacao || 0) * i.valor, 0) / pv : null, fora: pctForaDe(l) };
  }), [filtrados]);
  const porData = useMemo(() => Array.from(agrupar((i) => i.data)).map(([k, l]) => ({
    k, valor: l.reduce((s, i) => s + i.valor, 0), notas: new Set(l.map((i) => i.idNota)).size,
    alta: l.filter((i) => i.sv === "alta").length, impacto: l.reduce((s, i) => s + i.impacto, 0),
    critico: l.filter((i) => i.alcada === "critico").reduce((s, i) => s + i.valor, 0),
  })), [filtrados]);

  const topForn = useMemo(() => porForn.filter((f) => f.impAlta > 0).sort((a, b) => b.impAlta - a.impAlta).slice(0, 10).map((f) => ({ nome: f.k.slice(0, 28), v: Math.round(f.impAlta * 100) / 100 })), [porForn]);
  const porDepAlc = useMemo(() => Array.from(agrupar((i) => i.departamento)).map(([k, l]) => {
    const o: any = { nome: k, total: 0 };
    (["na", "fora", "critico", "sem"] as StatusAlcada[]).forEach((s) => { o[s] = l.filter((i) => i.alcada === s).reduce((x, i) => x + i.valor, 0); o.total += o[s]; });
    return o;
  }).sort((a, b) => b.total - a.total), [filtrados]);

  /* colunas */
  const temCustoBruto = itens.some((i) => i.custoBruto != null);
  const colsItem: Col<Item>[] = [
    { key: "data", label: "Data", val: (r) => r.data, render: (r) => dt(r.data) },
    { key: "nota", label: "Nota", val: (r) => r.nota },
    { key: "forn", label: "Fornecedor", val: (r) => r.fornecedor },
    { key: "cod", label: "Código", val: (r) => r.codigo },
    { key: "desc", label: "Descrição", val: (r) => r.descricao },
    { key: "ean", label: "EAN", val: (r) => r.ean },
    { key: "dep", label: "Departamento", val: (r) => r.departamento },
    { key: "curva", label: "Curva", val: (r) => r.curva },
    { key: "qtd", label: "Qtd", num: true, val: (r) => r.qtd, render: (r) => qt(r.qtd) },
    { key: "cant", label: "Custo ant.", num: true, val: (r) => r.custoAnt, render: (r) => r.custoAnt == null ? "—" : brl(r.custoAnt) },
    { key: "custo", label: "Custo atual", num: true, val: (r) => r.custo, render: (r) => brl(r.custo) },
    ...(temCustoBruto ? [{ key: "cbruto", label: "Custo bruto", num: true, val: (r: Item) => r.custoBruto, render: (r: Item) => r.custoBruto == null ? "—" : <span title={r.quebraPct != null ? `Quebra ${pct(r.quebraPct)}` : undefined}>{brl(r.custoBruto)}</span> }] : []),
    { key: "var", label: "Variação", num: true, val: (r) => r.variacao, render: (r) => <span className="inline-flex items-center gap-1">{r.variacao != null && pct(r.variacao)} <B cls={VAR_INFO[r.sv].cls}>{VAR_INFO[r.sv].label}</B></span> },
    { key: "imp", label: "Impacto R$", num: true, val: (r) => r.impacto, render: (r) => brl(r.impacto) },
    { key: "dias", label: "Dias s/ compra", num: true, val: (r) => r.diasUltima, render: (r) => <span>{qt(r.diasUltima)}{r.apos30 && <B cls="bg-amber-500 text-white ml-1">+30d</B>}</span> },
    { key: "vdia", label: "Venda/dia", num: true, val: (r) => r.vendaDia, render: (r) => qt(r.vendaDia) },
    { key: "cob", label: "Cobertura (dias)", num: true, val: (r) => r.cobCompra, render: (r) => qt(r.cobCompra) },
    { key: "alc", label: "Alçada", val: (r) => ALCADA_INFO[r.alcada].label, render: (r) => <B cls={ALCADA_INFO[r.alcada].cls}>{ALCADA_INFO[r.alcada].label}</B> },
    { key: "est", label: "Estoque", num: true, val: (r) => r.estoque, render: (r) => r.estoque == null ? "—" : qt(r.estoque) },
    { key: "cobe", label: "Cob. estoque", num: true, val: (r) => r.cobEstoque, render: (r) => r.cobEstoque == null ? "—" : qt(r.cobEstoque) },
    { key: "preco", label: "Preço venda", num: true, val: (r) => r.preco, render: (r) => brl(r.preco) },
    { key: "marg", label: temCustoBruto ? "Margem bruta" : "Margem c/ custo novo", num: true, val: (r) => r.margem, render: (r) => pct(r.margem) },
  ];
  const miniItens = (l: Item[]) => <Tabela titulo="Itens" linhas={l} cols={colsItem.filter((c) => ["cod", "desc", "qtd", "cant", "custo", "var", "imp", "cob", "alc"].includes(c.key))} chave={(r) => r.idNota + r.codigo + r.qtd} destaque={(r) => r.sv === "alta"} />;

  const filtrosUI = (
    <div className="flex flex-wrap gap-2 items-center">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm"><CalendarDays className="h-4 w-4 mr-1" />{range?.from ? format(range.from, "dd/MM/yyyy") : ""} – {range?.to ? format(range.to, "dd/MM/yyyy") : ""}</Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar mode="range" locale={ptBR} selected={range} onSelect={(r) => { setRange(r); setPendente(true); }} numberOfMonths={mobile ? 1 : 2} />
        </PopoverContent>
      </Popover>
      {stores.length > 1 && (
        <Select value={storeId} onValueChange={(v) => { setStoreId(v); setPendente(true); }}>
          <SelectTrigger className="h-9 w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      )}
      <Multi label="Departamento" opcoes={opDep} valor={fDep} onChange={(v) => { setFDep(v); setFGrupo([]); }} />
      <Multi label="Grupo" opcoes={opGrupo} valor={fGrupo} onChange={setFGrupo} busca />
      <Multi label="Fornecedor" opcoes={opForn} valor={fForn} onChange={setFForn} busca />
      <Multi label="Tipo de entrada" opcoes={opTipo} valor={tiposSel} onChange={setFTipo} />
      <Multi label="Curva" opcoes={["A", "B", "C", "D", "S"]} valor={fCurva} onChange={setFCurva} />
      <Multi label="Subnível" opcoes={["A1","A2","A3","A4","B1","B2","B3","B4","C1","C2","C3","C4","D1","D2","D3","D4","SEM VENDA"]} valor={fSub} onChange={setFSub} />
      <Multi label="Alçada" opcoes={["na", "fora", "critico", "sem"]} valor={fAlc} onChange={setFAlc} />
      <Select value={fVar} onValueChange={setFVar}>
        <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Variação: todas</SelectItem><SelectItem value="alta">Só alta</SelectItem>
          <SelectItem value="queda">Só queda</SelectItem><SelectItem value="fora">Só fora do limite</SelectItem>
          <SelectItem value="primeira">1ª compra</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1"><Label className="text-xs">Limite %</Label>
        <Input type="number" className="h-9 w-16" value={limitePct} onChange={(e) => setLimitePct(Math.max(0, Number(e.target.value) || 0))} /></div>
      <label className="flex items-center gap-1 text-xs"><Switch checked={fApos30} onCheckedChange={setFApos30} />Compra após +30 dias</label>
      <label className="flex items-center gap-1 text-xs"><Switch checked={fComAnt} onCheckedChange={setFComAnt} />Só com entrada anterior</label>
      <div className="relative"><Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
        <Input className="h-9 pl-7 w-[220px]" placeholder="Descrição, código ou EAN" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      <Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros</Button>
    </div>
  );

  const KPI = ({ t, v, s }: { t: string; v: string; s?: string }) => (
    <Card className="p-3"><p className="text-xs text-muted-foreground">{t}</p><p className="text-lg font-bold tabular-nums">{v}</p>{s && <p className="text-xs text-muted-foreground">{s}</p>}</Card>
  );

  return (
    <ClientLayout storeName={stores.find((s) => s.id === storeId)?.name || ""}>
      {loading && <CartProgressOverlay />}
      <div className="space-y-4 p-1">
        {loading && (
          <div className="rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-foreground">
            Consolidando histórico de compras, estoque e vendas. Na primeira consulta do período isso pode levar cerca de 1 a 2 minutos; depois abre na hora.
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold font-display">Análise de Compras</h1>
          <div className="flex gap-2">
            {isGlobalAdmin && <Button variant="outline" size="sm" onClick={() => setCfgOpen(true)}><Settings className="h-4 w-4 mr-1" />Limites de alçada</Button>}
            <Button size="sm" variant={pendente ? "default" : "outline"} onClick={() => buscar()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />Atualizar{pendente && " •"}
            </Button>
          </div>
        </div>

        {mobile ? (
          <Drawer>
            <DrawerTrigger asChild><Button variant="outline" size="sm"><Filter className="h-4 w-4 mr-1" />Filtros</Button></DrawerTrigger>
            <DrawerContent><DrawerHeader><DrawerTitle>Filtros</DrawerTitle></DrawerHeader><div className="p-4 max-h-[70vh] overflow-auto">{filtrosUI}</div></DrawerContent>
          </Drawer>
        ) : <Card className="p-3">{filtrosUI}</Card>}

        {aviso && <Card className="p-4 text-sm text-muted-foreground">{aviso}</Card>}

        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2">
          <KPI t="Total comprado" v={brl(kpi.total)} />
          <KPI t="Nº de notas" v={kpi.notas.toLocaleString("pt-BR")} />
          <KPI t="Nº de itens" v={kpi.itens.toLocaleString("pt-BR")} />
          <KPI t={`Itens em alta >${limitePct}%`} v={String(kpi.alta)} s={`Impacto ${brl(kpi.impAlta)}`} />
          <KPI t={`Itens em queda >${limitePct}%`} v={String(kpi.queda)} s={`Economia ${brl(kpi.econ)}`} />
          <KPI t="% do valor fora da alçada" v={pct(kpi.pctFora)} />
          <KPI t="Valor em Crítico +1 mês" v={brl(kpi.critico)} />
        </div>

        <div className="grid lg:grid-cols-2 gap-3">
          <Card className="p-3">
            <p className="text-sm font-semibold mb-2">Top 10 fornecedores por impacto de alta</p>
            <ResponsiveContainer width="100%" height={Math.max(160, topForn.length * 32)}>
              <BarChart data={topForn} layout="vertical" margin={{ left: 10, right: 90 }}>
                <XAxis type="number" hide /><YAxis type="category" dataKey="nome" width={150} tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: number) => brl(v)} />
                <Bar dataKey="v" fill="#dc2626" name="Impacto"><LabelList dataKey="v" position="right" formatter={(v: number) => brl(v)} style={{ fontSize: 11 }} /></Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card className="p-3">
            <p className="text-sm font-semibold mb-2">Valor comprado por departamento e alçada</p>
            <ResponsiveContainer width="100%" height={Math.max(160, porDepAlc.length * 32)}>
              <BarChart data={porDepAlc} layout="vertical" margin={{ left: 10, right: 100 }}>
                <XAxis type="number" hide /><YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 11 }} />
                <RTooltip formatter={(v: number) => brl(v)} /><Legend />
                {(["na", "fora", "critico", "sem"] as StatusAlcada[]).map((s, idx, arr) => (
                  <Bar key={s} dataKey={s} stackId="a" fill={ALCADA_INFO[s].cor} name={ALCADA_INFO[s].label}>
                    {idx === arr.length - 1 && <LabelList dataKey="total" position="right" formatter={(v: number) => brl(v)} style={{ fontSize: 11 }} />}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        <Tabs defaultValue="produto">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="produto">Por Produto</TabsTrigger><TabsTrigger value="entrada">Por Entrada</TabsTrigger>
            <TabsTrigger value="fornecedor">Por Fornecedor</TabsTrigger><TabsTrigger value="data">Por Data</TabsTrigger>
          </TabsList>
          <TabsContent value="produto">
            <Tabela titulo="Por Produto" linhas={filtrados} cols={colsItem} chave={(r) => r.idNota + "|" + r.codigo + "|" + r.qtd + "|" + r.custo} destaque={(r) => r.sv === "alta"} />
          </TabsContent>
          <TabsContent value="entrada">
            <Tabela titulo="Por Entrada" linhas={porNota} chave={(r) => r.k} expandir={(r) => miniItens(r.itens)} cols={[
              { key: "data", label: "Data", val: (r) => r.data, render: (r) => dt(r.data) },
              { key: "nota", label: "Nº nota", val: (r) => r.nota }, { key: "forn", label: "Fornecedor", val: (r) => r.fornecedor },
              { key: "tipo", label: "Tipo", val: (r) => r.tipo },
              { key: "valor", label: "Valor total", num: true, val: (r) => r.valor, render: (r) => brl(r.valor) },
              { key: "n", label: "Itens", num: true, val: (r) => r.n }, { key: "alta", label: "Em alta", num: true, val: (r) => r.alta },
              { key: "imp", label: "Impacto R$", num: true, val: (r) => r.impacto, render: (r) => brl(r.impacto) },
              { key: "fora", label: "% fora alçada", num: true, val: (r) => r.fora, render: (r) => pct(r.fora) },
              { key: "pior", label: "Pior status", val: (r) => ALCADA_INFO[r.pior].label, render: (r) => <B cls={ALCADA_INFO[r.pior].cls}>{ALCADA_INFO[r.pior].label}</B> },
            ]} />
          </TabsContent>
          <TabsContent value="fornecedor">
            <Tabela titulo="Por Fornecedor" linhas={porForn} chave={(r) => r.k} expandir={(r) => miniItens(r.itens)} cols={[
              { key: "forn", label: "Fornecedor", val: (r) => r.k }, { key: "notas", label: "Notas", num: true, val: (r) => r.notas },
              { key: "valor", label: "Valor comprado", num: true, val: (r) => r.valor, render: (r) => brl(r.valor) },
              { key: "alta", label: "Em alta", num: true, val: (r) => r.alta }, { key: "queda", label: "Em queda", num: true, val: (r) => r.queda },
              { key: "imp", label: "Impacto líquido", num: true, val: (r) => r.impacto, render: (r) => brl(r.impacto) },
              { key: "vm", label: "Variação média pond.", num: true, val: (r) => r.varMedia, render: (r) => pct(r.varMedia) },
              { key: "fora", label: "% fora alçada", num: true, val: (r) => r.fora, render: (r) => pct(r.fora) },
            ]} />
          </TabsContent>
          <TabsContent value="data">
            <Tabela titulo="Por Data" linhas={porData} chave={(r) => r.k} expandir={(r) => (
              <div className="space-y-1">{porNota.filter((n) => n.data === r.k).map((n) => (
                <div key={n.k} className="flex flex-wrap justify-between text-xs border-b py-1 gap-2"><span>Nota {n.nota} · {n.fornecedor}</span><span>{brl(n.valor)} · {n.alta} em alta · <B cls={ALCADA_INFO[n.pior].cls}>{ALCADA_INFO[n.pior].label}</B></span></div>
              ))}</div>
            )} cols={[
              { key: "data", label: "Data", val: (r) => r.k, render: (r) => dt(r.k) },
              { key: "valor", label: "Valor comprado", num: true, val: (r) => r.valor, render: (r) => brl(r.valor) },
              { key: "notas", label: "Notas", num: true, val: (r) => r.notas }, { key: "alta", label: "Em alta", num: true, val: (r) => r.alta },
              { key: "imp", label: "Impacto R$", num: true, val: (r) => r.impacto, render: (r) => brl(r.impacto) },
              { key: "crit", label: "Valor Crítico", num: true, val: (r) => r.critico, render: (r) => brl(r.critico) },
            ]} />
          </TabsContent>
        </Tabs>
      </div>

      <LimitesSheet open={cfgOpen} onOpenChange={setCfgOpen} limites={limites} stores={stores} userId={user?.id} onSalvo={carregarLimites} />
    </ClientLayout>
  );
};

function LimitesSheet({ open, onOpenChange, limites, stores, userId, onSalvo }: {
  open: boolean; onOpenChange: (v: boolean) => void; limites: (LimiteAlcada & { id?: string })[]; stores: Store[]; userId?: string; onSalvo: () => void;
}) {
  const [linhas, setLinhas] = useState<(LimiteAlcada & { id?: string })[]>([]);
  useEffect(() => { if (open) setLinhas(limites.map((l) => ({ ...l }))); }, [open, limites]);
  const set = (i: number, k: string, v: any) => setLinhas((a) => a.map((l, j) => j === i ? { ...l, [k]: v } : l));
  const salvar = async () => {
    for (const l of linhas) {
      const row = { store_id: l.store_id, departamento: l.departamento.trim().toUpperCase(), limite_dentro_dias: Number(l.limite_dentro_dias), limite_fora_dias: Number(l.limite_fora_dias), limite_variacao_pct: Number(l.limite_variacao_pct), updated_at: new Date().toISOString(), updated_by: userId };
      const { error } = l.id ? await supabase.from("compras_alcada_config").update(row).eq("id", l.id) : await supabase.from("compras_alcada_config").insert(row);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Limites salvos"); onSalvo(); onOpenChange(false);
  };
  const excluir = async (i: number) => {
    const l = linhas[i];
    if (l.id) await supabase.from("compras_alcada_config").delete().eq("id", l.id);
    setLinhas((a) => a.filter((_, j) => j !== i)); onSalvo();
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-auto">
        <SheetHeader><SheetTitle>Limites de alçada</SheetTitle></SheetHeader>
        <p className="text-xs text-muted-foreground my-2">Departamento vazio = padrão para os demais. Ordem: loja + departamento → padrão + departamento → padrão geral.</p>
        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={l.id ?? i} className="grid grid-cols-12 gap-1 items-center">
              <Select value={l.store_id ?? "__all__"} onValueChange={(v) => set(i, "store_id", v === "__all__" ? null : v)}>
                <SelectTrigger className="col-span-3 h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__all__">Todas (padrão)</SelectItem>{stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="col-span-3 h-8 text-xs" placeholder="(padrão)" value={l.departamento} onChange={(e) => set(i, "departamento", e.target.value)} />
              <Input className="col-span-2 h-8 text-xs" type="number" title="Na alçada até (dias)" value={l.limite_dentro_dias} onChange={(e) => set(i, "limite_dentro_dias", e.target.value)} />
              <Input className="col-span-2 h-8 text-xs" type="number" title="Fora da alçada até (dias)" value={l.limite_fora_dias} onChange={(e) => set(i, "limite_fora_dias", e.target.value)} />
              <Input className="col-span-1 h-8 text-xs" type="number" title="Limite variação %" value={l.limite_variacao_pct} onChange={(e) => set(i, "limite_variacao_pct", e.target.value)} />
              <Button size="sm" variant="ghost" className="col-span-1" onClick={() => excluir(i)}>✕</Button>
            </div>
          ))}
          <div className="grid grid-cols-12 text-[10px] text-muted-foreground"><span className="col-span-3">Loja</span><span className="col-span-3">Departamento</span><span className="col-span-2">Na alçada ≤</span><span className="col-span-2">Fora ≤</span><span className="col-span-1">Var %</span></div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={() => setLinhas((a) => [...a, { store_id: null, departamento: "", limite_dentro_dias: 15, limite_fora_dias: 30, limite_variacao_pct: 5 }])}>Adicionar</Button>
          <Button onClick={salvar}>Salvar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default AnaliseCompras;
