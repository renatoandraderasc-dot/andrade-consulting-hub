import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import {
  ArrowDown, ArrowDownRight, ArrowRight, ArrowUp, ArrowUpRight, ChevronRight, Download, GitCompare, Info, RefreshCw, Search,
} from "lucide-react";

import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { carregarLojasPermitidas, type LojaSimples } from "@/lib/lojasPermitidas";
import {
  ALIAS_EAN, chamarRelatorio, chamarRelatorioFatiado, avisoRelatorio, maxDiasConsulta, lucroDaLinha, pick, num, txt,
} from "@/lib/vrReport";
import { mercadologicoNivel1, mercadologicoNivel2, mercadologicoNivel3 } from "@/lib/mercadologico";
import { chaveDept } from "@/lib/departamentosPermitidos";
import { lerPeriodoCache, gravarPeriodoCache } from "@/lib/relatorioCache";
import { salvarWorkbook } from "@/lib/exportBranding";
import {
  agregar, limitesMes, margemPct, mesesEntre, precoMedio, situacao, somarMeses, variacaoPct,
  type LinhaComparativo, type Metricas, type Nivel, type ProdutoMes, type Situacao,
} from "@/lib/comparativoProdutos";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CartProgressOverlay } from "@/components/CartProgress";

const TODOS = "__all__";
const CACHE_REL = "comparativo_produtos_v1";
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const NIVEL_LABEL: Record<Nivel, string> = { departamento: "Departamento", grupo: "Grupo", subgrupo: "Subgrupo", produto: "Produto" };
const PAGE_SIZE = 50;

const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtBRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQtd = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtPct = (v: number) => `${nf1.format(v || 0)}%`;
const chave = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");
const rotuloMes = (m: string) => { const [y, mm] = m.split("-"); return `${MESES[Number(mm) - 1]}/${y}`; };
const rotuloPeriodo = (de: string, ate: string) => {
  const ms = mesesEntre(de, ate);
  if (!ms.length) return "—";
  return ms.length === 1 ? rotuloMes(ms[0]) : `${rotuloMes(ms[0])} a ${rotuloMes(ms[ms.length - 1])}`;
};
const mesAtual = () => {
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Linha compacta guardada no banco (meses encerrados). */
interface Compacto { c: string; d: string; b: string; n1: string; n2: string; n3: string; q: number; v: number; k: number }

type Metrica = "venda" | "volume" | "custo" | "lucro" | "margem" | "cupons" | "mix" | "preco";
type SortKey = "rotulo" | `${"a" | "b" | "var" | "dif"}_${Metrica}`;

const SITUACOES: { key: Situacao; label: string }[] = [
  { key: "cresceu", label: "Cresceu" }, { key: "caiu", label: "Caiu" },
  { key: "novo", label: "Novo no período B" }, { key: "perdido", label: "Parou de vender" }, { key: "estavel", label: "Estável" },
];

function Variacao({ a, b, pp = false, invertido = false }: { a: number; b: number; pp?: boolean; invertido?: boolean }) {
  const d = pp ? b - a : variacaoPct(a, b);
  if (d === null) return <span className="text-muted-foreground">{b ? "novo" : "—"}</span>;
  const neutro = Math.abs(d) < 0.05;
  const bom = invertido ? d < 0 : d > 0;
  const Icone = neutro ? ArrowRight : d > 0 ? ArrowUpRight : ArrowDownRight;
  const cor = neutro ? "text-muted-foreground" : bom ? "text-success" : "text-destructive";
  return (
    <span className={`inline-flex items-center justify-end gap-0.5 font-semibold tabular-nums ${cor}`}>
      <Icone className="h-3 w-3" />{d > 0 ? "+" : ""}{nf1.format(d)}{pp ? " p.p." : "%"}
    </span>
  );
}

export default function ComparativoProdutos() {
  const { user, isGlobalAdmin } = useAuth() as any;
  const { restrito, permiteDept } = useDepartamentosPermitidos();

  const ultimoFechado = somarMeses(mesAtual(), -1);
  const [lojas, setLojas] = useState<LojaSimples[]>([]);
  const [storeId, setStoreId] = useState("");
  const [aDe, setADe] = useState(somarMeses(ultimoFechado, -1));
  const [aAte, setAAte] = useState(somarMeses(ultimoFechado, -1));
  const [bDe, setBDe] = useState(ultimoFechado);
  const [bAte, setBAte] = useState(ultimoFechado);

  const [produtos, setProdutos] = useState<ProdutoMes[] | null>(null);
  const [cupons, setCupons] = useState<Map<string, { total: number; porDep: Map<string, number> }>>(new Map());
  const [mesesCarregados, setMesesCarregados] = useState<{ a: string[]; b: string[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [avisos, setAvisos] = useState<string[]>([]);
  const cargaAtual = useRef(0);

  const [nivel, setNivel] = useState<Nivel>("departamento");
  const [fDep, setFDep] = useState(TODOS);
  const [fGrupo, setFGrupo] = useState(TODOS);
  const [fSub, setFSub] = useState(TODOS);
  const [busca, setBusca] = useState("");
  const [fSit, setFSit] = useState<Situacao[]>([]);
  const [fAbc, setFAbc] = useState<string[]>([]);
  const [vendaMin, setVendaMin] = useState(0);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "b_venda", dir: "desc" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      const ls = await carregarLojasPermitidas(user?.id, !!isGlobalAdmin);
      setLojas(ls);
      const sid = sessionStorage.getItem("selectedStoreId");
      setStoreId(sid && ls.some((l) => l.id === sid) ? sid : ls[0]?.id ?? "");
    })();
  }, [user?.id, isGlobalAdmin]);

  const nomeLoja = lojas.find((l) => l.id === storeId)?.name ?? "";

  // ---------- Atalhos de período ----------
  const aplicarAtalho = (tipo: "anterior" | "anoAnterior") => {
    const n = mesesEntre(bDe, bAte).length || 1;
    const ini = mesesEntre(bDe, bAte)[0] ?? bDe;
    if (tipo === "anterior") { setADe(somarMeses(ini, -n)); setAAte(somarMeses(ini, -1)); }
    else { setADe(somarMeses(ini, -12)); setAAte(somarMeses(ini, n - 13)); }
  };

  // ---------- Carga ----------
  async function carregarMes(mes: string, forcar: boolean, cadastro: () => Promise<Map<string, any>>, limite: number, apenasSalvos: boolean) {
    const { de, ate } = limitesMes(mes);
    const fimReal = mes === mesAtual() ? new Date(Date.now() - 86400000).toISOString().slice(0, 10) : ate;
    if (fimReal < de) return { linhas: [] as ProdutoMes[], aviso: null as string | null };
    // The Hub may have a corrected full month even when a compact copy was
    // written later from an older parameter variant. Always read the Hub first.
    const salvo = forcar ? null : await chamarRelatorio(storeId, "ranking_produtos", { inicio: de, fim: fimReal, limite: 200000 }, { apenasSalvos: true });
    if (!forcar && (!salvo || avisoRelatorio(salvo))) {
      const guardado = await lerPeriodoCache(storeId, CACHE_REL, "", de, ate);
      if (guardado) return { linhas: (guardado as Compacto[]).map((c) => expandir(c, mes)), aviso: null };
    }
    if (apenasSalvos && (!salvo || avisoRelatorio(salvo))) return { linhas: [], aviso: `${rotuloMes(mes)}: período ainda não salvo no Hub.` };
    const r = salvo && !avisoRelatorio(salvo) ? salvo : limite > 0 && limite < 31
      ? await chamarRelatorioFatiado(storeId, "ranking_produtos", { inicio: de, fim: fimReal, limite: 200000 }, { diasPorLote: limite, forcar })
      : await chamarRelatorio(storeId, "ranking_produtos", { inicio: de, fim: fimReal, limite: 200000 }, { forcar });
    const msg = avisoRelatorio(r);
    if (msg) return { linhas: [], aviso: `${rotuloMes(mes)}: ${msg}` };
    const cad = await cadastro();
    const agg = new Map<string, Compacto>();
    for (const l of r.dados || []) {
      const k = chave(pick(l, "codigo", "cod", "codigo_produto", "cod_produto", "id_produto"));
      if (!k) continue;
      const prod = cad.get(k);
      const venda = num(pick(l, "vendas", "total_vendido", "valor_venda", "venda", "valor"));
      const lucro = lucroDaLinha(l, venda);
      const cur = agg.get(k) ?? {
        c: k,
        d: txt(pick(l, "produto", "descricao", "nome") ?? pick(prod, "descricao", "produto")),
        b: txt(pick(l, ...ALIAS_EAN) ?? pick(prod, ...ALIAS_EAN)),
        n1: mercadologicoNivel1(l) || mercadologicoNivel1(prod) || "SEM DEPARTAMENTO",
        n2: mercadologicoNivel2(l) || mercadologicoNivel2(prod),
        n3: mercadologicoNivel3(l) || mercadologicoNivel3(prod),
        q: 0, v: 0, k: 0,
      };
      cur.q += num(pick(l, "volume", "quantidade", "qtd", "qtde"));
      cur.v += venda;
      cur.k += venda - lucro;
      agg.set(k, cur);
    }
    // Preserve ERP precision in storage; format cents only after totals are
    // calculated, otherwise thousands of rounded products change the profit.
    const compactos = [...agg.values()];
    if (!r.aviso) await gravarPeriodoCache(storeId, CACHE_REL, "", de, ate, compactos).catch(() => undefined);
    return { linhas: compactos.map((c) => expandir(c, mes)), aviso: r.aviso ? `${rotuloMes(mes)}: ${r.aviso}` : null };
  }

  /** Lê um relatório mensal guardado (mês encerrado) ou busca na loja e guarda. */
  async function lerMensal(relatorio: string, mes: string, forcar: boolean, apenasSalvos: boolean): Promise<any[] | null> {
    const { de, ate } = limitesMes(mes);
    const guardado = forcar ? null : await lerPeriodoCache(storeId, relatorio, "", de, ate);
    if (guardado) return guardado;
    const r = await chamarRelatorio(storeId, relatorio, { inicio: de, fim: ate }, { forcar, apenasSalvos }).catch(() => null);
    if (!r || avisoRelatorio(r)) return null;
    await gravarPeriodoCache(storeId, relatorio, "", de, ate, r.dados ?? []).catch(() => undefined);
    return r.dados ?? [];
  }

  // Total da loja: cupons_e_ticket (cupom único). Por departamento: diagnostico_mensal
  // (um mesmo cupom pode aparecer em vários departamentos, por isso não somamos para o total).
  async function carregarCupons(mes: string, forcar: boolean, apenasSalvos: boolean) {
    const porDep = new Map<string, number>();
    let somaDiag = 0, temDiag = false;
    for (const l of (await lerMensal("diagnostico_mensal", mes, forcar, apenasSalvos)) ?? []) {
      const c = num(pick(l, "clientes", "cupons"));
      if (!c) continue;
      temDiag = true;
      somaDiag += c;
      const d = chaveDept(mercadologicoNivel1(l) || txt(pick(l, "setor")));
      if (d) porDep.set(d, (porDep.get(d) ?? 0) + c);
    }
    const diarios = (await lerMensal("cupons_e_ticket", mes, forcar, apenasSalvos)) ?? [];
    const somaDiaria = diarios.reduce((s, l) => s + num(pick(l, "cupons", "clientes", "qtd_cupons")), 0);
    const total = somaDiaria > 0 ? somaDiaria : !porDep.size && temDiag ? somaDiag : 0;
    if (!total && !porDep.size) return null;
    return { total, porDep };
  }

  const buscar = async (forcar = false, apenasSalvos = false) => {
    if (!storeId) return;
    const ma = mesesEntre(aDe, aAte), mb = mesesEntre(bDe, bAte);
    const todos = [...new Set([...ma, ...mb])].filter((m) => m <= mesAtual()).sort();
    if (!todos.length) return;
    const carga = ++cargaAtual.current;
    setLoading(true); setAvisos([]); setPage(1);
    try {
      const limite = apenasSalvos ? 0 : await maxDiasConsulta(storeId);
      let cad: Promise<Map<string, any>> | null = null;
      const cadastro = () => (cad ??= chamarRelatorio(storeId, "produtos", {}, { apenasSalvos }).then((r) => {
        const m = new Map<string, any>();
        for (const l of r.dados || []) {
          const k = chave(pick(l, "codigo", "cod", "cod_produto", "id_produto"));
          if (k) m.set(k, l);
        }
        return m;
      }).catch(() => new Map()));
      const linhas: ProdutoMes[] = [];
      const novosAvisos: string[] = [];
      const cup = new Map<string, { total: number; porDep: Map<string, number> }>();
      // Um mês por vez: pontes lentas caem com consultas em paralelo.
      for (let i = 0; i < todos.length; i++) {
        if (carga !== cargaAtual.current) return;
        setProgresso(`${rotuloMes(todos[i])} (${i + 1}/${todos.length})`);
        const r = await carregarMes(todos[i], forcar, cadastro, limite, apenasSalvos);
        linhas.push(...r.linhas);
        if (r.aviso) novosAvisos.push(r.aviso);
        const c = await carregarCupons(todos[i], forcar, apenasSalvos);
        if (c) cup.set(todos[i], c);
      }
      if (carga !== cargaAtual.current) return;
      setProdutos(linhas);
      setCupons(cup);
      setMesesCarregados({ a: ma, b: mb });
      setAvisos(novosAvisos);
    } catch {
      if (carga === cargaAtual.current) setAvisos(["A consulta não respondeu a tempo. Tente de novo ou use menos meses."]);
    } finally {
      if (carga === cargaAtual.current) { setLoading(false); setProgresso(""); }
    }
  };

  // Opening or selecting months reads saved data only; no ERP auto-refresh.
  useEffect(() => {
    setProdutos(null); setMesesCarregados(null); setCupons(new Map());
    setFDep(TODOS); setFGrupo(TODOS); setFSub(TODOS);
    if (storeId) void buscar(false, true);
    return () => { cargaAtual.current += 1; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, aDe, aAte, bDe, bAte]);

  // ---------- Filtros ----------
  const permitidas = useMemo(() => (produtos || []).filter((p) => permiteDept(p.departamento)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [produtos, restrito]);
  const departamentos = useMemo(() => [...new Set(permitidas.map((p) => p.departamento))].sort(), [permitidas]);
  const grupos = useMemo(() => [...new Set(permitidas.filter((p) => fDep === TODOS || p.departamento === fDep)
    .map((p) => p.grupo).filter(Boolean))].sort(), [permitidas, fDep]);
  const subgrupos = useMemo(() => [...new Set(permitidas
    .filter((p) => (fDep === TODOS || p.departamento === fDep) && (fGrupo === TODOS || p.grupo === fGrupo))
    .map((p) => p.subgrupo).filter(Boolean))].sort(), [permitidas, fDep, fGrupo]);

  const escopo = useMemo(() => permitidas.filter((p) =>
    (fDep === TODOS || p.departamento === fDep) &&
    (fGrupo === TODOS || p.grupo === fGrupo) &&
    (fSub === TODOS || p.subgrupo === fSub)), [permitidas, fDep, fGrupo, fSub]);

  const setA = useMemo(() => new Set(mesesCarregados?.a ?? []), [mesesCarregados]);
  const setB = useMemo(() => new Set(mesesCarregados?.b ?? []), [mesesCarregados]);

  const cuponsPeriodo = (meses: Set<string>, dep?: string) => {
    let t = 0, tem = false;
    for (const m of meses) {
      const c = cupons.get(m);
      if (!c) continue;
      if (dep === undefined) { if (c.total) { t += c.total; tem = true; } }
      else if (c.porDep.has(chaveDept(dep))) { t += c.porDep.get(chaveDept(dep)) ?? 0; tem = true; }
    }
    return tem ? t : null;
  };
  const mostraCupons = nivel === "departamento";

  // Curva ABC pelo faturamento do período B, dentro do escopo
  const abcProduto = useMemo(() => {
    const porCod = agregar(escopo, "produto", setA, setB);
    const total = porCod.reduce((s, l) => s + l.b.venda, 0);
    let acc = 0;
    const m = new Map<string, string>();
    [...porCod].sort((x, y) => y.b.venda - x.b.venda).forEach((l) => {
      acc += total > 0 ? (l.b.venda / total) * 100 : 100;
      m.set(l.chave, l.b.venda <= 0 ? "D" : acc <= 50 ? "A" : acc <= 80 ? "B" : acc <= 95 ? "C" : "D");
    });
    return m;
  }, [escopo, setA, setB]);

  const linhas = useMemo(() => {
    const base = fAbc.length ? escopo.filter((p) => fAbc.includes(abcProduto.get(p.codigo) ?? "D")) : escopo;
    const q = busca.trim().toLowerCase();
    return agregar(base, nivel, setA, setB).filter((l) => {
      if (Math.max(l.a.venda, l.b.venda) < vendaMin) return false;
      if (fSit.length && !fSit.includes(situacao(l))) return false;
      if (q && ![l.rotulo, l.codigo ?? "", l.barras ?? ""].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [escopo, nivel, setA, setB, busca, fSit, fAbc, abcProduto, vendaMin]);

  const valor = (l: LinhaComparativo, k: SortKey): number | string => {
    if (k === "rotulo") return l.rotulo;
    const [lado, met] = k.split("_") as ["a" | "b" | "var" | "dif", Metrica];
    const v = (m: Metricas, s: Set<string>): number =>
      met === "margem" ? margemPct(m) : met === "preco" ? precoMedio(m)
        : met === "cupons" ? cuponsPeriodo(s, l.departamento) ?? 0 : (m as any)[met];
    const a = v(l.a, setA), b = v(l.b, setB);
    if (lado === "a") return a;
    if (lado === "b") return b;
    if (lado === "dif") return b - a;
    return met === "margem" ? b - a : variacaoPct(a, b) ?? (b > 0 ? Infinity : -Infinity);
  };

  const ordenadas = useMemo(() => [...linhas].sort((x, y) => {
    const va = valor(x, sort.key), vb = valor(y, sort.key);
    const cmp = typeof va === "number" ? (va as number) - (vb as number) : String(va).localeCompare(String(vb), "pt-BR");
    return sort.dir === "asc" ? cmp : -cmp;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [linhas, sort, cupons]);

  useEffect(() => { setPage(1); }, [nivel, fDep, fGrupo, fSub, busca, fSit, fAbc, vendaMin, sort]);
  const totalPages = Math.max(1, Math.ceil(ordenadas.length / PAGE_SIZE));
  const pagina = ordenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const totais = useMemo(() => {
    const soma = (lado: "a" | "b") => linhas.reduce((s, l) => {
      const m = l[lado];
      s.venda += m.venda; s.custo += m.custo; s.lucro += m.lucro; s.volume += m.volume; s.mix += m.mix;
      return s;
    }, { venda: 0, custo: 0, lucro: 0, volume: 0, mix: 0 } as Metricas);
    const filtradoPorDep = fDep !== TODOS;
    const semRecorte = fGrupo === TODOS && fSub === TODOS && !busca && !fSit.length && !fAbc.length && !vendaMin;
    const cup = (s: Set<string>) => !semRecorte ? null : filtradoPorDep ? cuponsPeriodo(s, fDep)
      : restrito ? departamentos.reduce<number | null>((t, d) => { const c = cuponsPeriodo(s, d); return c === null ? t : (t ?? 0) + c; }, null)
        : cuponsPeriodo(s);
    return { a: soma("a"), b: soma("b"), cupA: cup(setA), cupB: cup(setB) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, cupons, setA, setB, fDep, fGrupo, fSub, busca, fSit, fAbc, vendaMin, restrito, departamentos]);

  // ---------- Drill ----------
  const descer = (l: LinhaComparativo) => {
    if (nivel === "departamento") { setFDep(l.departamento); setFGrupo(TODOS); setFSub(TODOS); setNivel("grupo"); }
    else if (nivel === "grupo") { setFDep(l.departamento); setFGrupo(l.grupo); setFSub(TODOS); setNivel("subgrupo"); }
    else if (nivel === "subgrupo") { setFDep(l.departamento); setFGrupo(l.grupo); setFSub(l.subgrupo); setNivel("produto"); }
  };
  const migalhas = [
    { label: "Loja toda", on: () => { setFDep(TODOS); setFGrupo(TODOS); setFSub(TODOS); setNivel("departamento"); } },
    ...(fDep !== TODOS ? [{ label: fDep, on: () => { setFGrupo(TODOS); setFSub(TODOS); setNivel("grupo"); } }] : []),
    ...(fGrupo !== TODOS ? [{ label: fGrupo, on: () => { setFSub(TODOS); setNivel("subgrupo"); } }] : []),
    ...(fSub !== TODOS ? [{ label: fSub, on: () => setNivel("produto") }] : []),
  ];

  // ---------- Exportação ----------
  const rotA = mesesCarregados ? rotuloPeriodo(mesesCarregados.a[0], mesesCarregados.a.at(-1)!) : rotuloPeriodo(aDe, aAte);
  const rotB = mesesCarregados ? rotuloPeriodo(mesesCarregados.b[0], mesesCarregados.b.at(-1)!) : rotuloPeriodo(bDe, bAte);

  const exportar = () => {
    const rows = ordenadas.map((l) => {
      const cA = mostraCupons ? cuponsPeriodo(setA, l.departamento) : null;
      const cB = mostraCupons ? cuponsPeriodo(setB, l.departamento) : null;
      const r: Record<string, string | number> = {};
      if (nivel === "produto") { r["Cód."] = l.codigo ?? ""; r["Barras"] = l.barras ?? ""; }
      r[NIVEL_LABEL[nivel]] = l.rotulo;
      if (nivel !== "departamento") r["Departamento"] = l.departamento;
      if (nivel === "subgrupo" || nivel === "produto") r["Grupo"] = l.grupo;
      if (nivel === "produto") r["Subgrupo"] = l.subgrupo;
      r[`Faturamento ${rotA}`] = +l.a.venda.toFixed(2);
      r[`Faturamento ${rotB}`] = +l.b.venda.toFixed(2);
      r["Var. faturamento (%)"] = +(variacaoPct(l.a.venda, l.b.venda) ?? 0).toFixed(2);
      r[`Volume ${rotA}`] = +l.a.volume.toFixed(3);
      r[`Volume ${rotB}`] = +l.b.volume.toFixed(3);
      r["Var. volume (%)"] = +(variacaoPct(l.a.volume, l.b.volume) ?? 0).toFixed(2);
      r[`Custo ${rotA}`] = +l.a.custo.toFixed(2);
      r[`Custo ${rotB}`] = +l.b.custo.toFixed(2);
      r[`Lucro ${rotA}`] = +l.a.lucro.toFixed(2);
      r[`Lucro ${rotB}`] = +l.b.lucro.toFixed(2);
      r[`Margem ${rotA} (%)`] = +margemPct(l.a).toFixed(2);
      r[`Margem ${rotB} (%)`] = +margemPct(l.b).toFixed(2);
      if (nivel === "produto") {
        r[`Preço médio ${rotA}`] = +precoMedio(l.a).toFixed(2);
        r[`Preço médio ${rotB}`] = +precoMedio(l.b).toFixed(2);
      } else {
        r[`Mix ${rotA}`] = l.a.mix; r[`Mix ${rotB}`] = l.b.mix;
      }
      if (mostraCupons) { r[`Cupons ${rotA}`] = cA ?? ""; r[`Cupons ${rotB}`] = cB ?? ""; }
      return r;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Comparativo");
    salvarWorkbook(wb, `Comparativo ${NIVEL_LABEL[nivel]}`);
  };

  // ---------- UI helpers ----------
  const toggle = <T,>(arr: T[], set: (v: T[]) => void, v: T) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const ordenar = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));
  const seta = (key: SortKey) => sort.key === key && (sort.dir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />);
  const thS = (key: SortKey, label: string, cls = "") => (
    <th className={`px-2 py-1.5 font-medium whitespace-nowrap text-right cursor-pointer select-none ${cls}`} onClick={() => ordenar(key)}>
      <span className="inline-flex items-center gap-1">{label}{seta(key)}</span>
    </th>
  );

  const grupoMetricas: { met: Metrica; titulo: string; fmt: (v: number) => string; pp?: boolean; invertido?: boolean; so?: boolean }[] = [
    { met: "venda", titulo: "Faturamento", fmt: fmtBRL },
    { met: "volume", titulo: "Volume", fmt: fmtQtd },
    { met: "custo", titulo: "Custo", fmt: fmtBRL, invertido: true },
    { met: "lucro", titulo: "Lucro", fmt: fmtBRL },
    { met: "margem", titulo: "Margem", fmt: fmtPct, pp: true },
    ...(nivel === "produto"
      ? [{ met: "preco" as Metrica, titulo: "Preço médio", fmt: fmtBRL }]
      : [{ met: "mix" as Metrica, titulo: "Mix (itens)", fmt: (v: number) => nf0.format(v) }]),
    ...(mostraCupons ? [{ met: "cupons" as Metrica, titulo: "Cupons", fmt: (v: number) => nf0.format(v) }] : []),
  ];

  const celulas = (l: LinhaComparativo) => grupoMetricas.map((g) => {
    let a: number | null, b: number | null;
    if (g.met === "cupons") { a = cuponsPeriodo(setA, l.departamento); b = cuponsPeriodo(setB, l.departamento); }
    else if (g.met === "margem") { a = margemPct(l.a); b = margemPct(l.b); }
    else if (g.met === "preco") { a = precoMedio(l.a); b = precoMedio(l.b); }
    else { a = (l.a as any)[g.met]; b = (l.b as any)[g.met]; }
    return (
      <FragmentCells key={g.met}
        a={a === null ? "—" : g.fmt(a)} b={b === null ? "—" : g.fmt(b)}
        varEl={a === null || b === null ? <span className="text-muted-foreground">—</span> : <Variacao a={a} b={b} pp={g.pp} invertido={g.invertido} />} />
    );
  });

  const ticket = (v: number, c: number | null) => (c ? fmtBRL(v / c) : "—");
  const cards = [
    { t: "Faturamento", a: fmtBRL(totais.a.venda), b: fmtBRL(totais.b.venda), v: <Variacao a={totais.a.venda} b={totais.b.venda} /> },
    { t: "Volume", a: fmtQtd(totais.a.volume), b: fmtQtd(totais.b.volume), v: <Variacao a={totais.a.volume} b={totais.b.volume} /> },
    { t: "Custo", a: fmtBRL(totais.a.custo), b: fmtBRL(totais.b.custo), v: <Variacao a={totais.a.custo} b={totais.b.custo} invertido /> },
    { t: "Lucro / Margem", a: `${fmtBRL(totais.a.lucro)} · ${fmtPct(margemPct(totais.a))}`, b: `${fmtBRL(totais.b.lucro)} · ${fmtPct(margemPct(totais.b))}`, v: <Variacao a={margemPct(totais.a)} b={margemPct(totais.b)} pp /> },
    { t: "Cupons", a: totais.cupA === null ? "—" : nf0.format(totais.cupA), b: totais.cupB === null ? "—" : nf0.format(totais.cupB),
      v: totais.cupA && totais.cupB ? <Variacao a={totais.cupA} b={totais.cupB} /> : <span className="text-[11px] text-muted-foreground">só para loja ou departamento inteiro</span> },
    { t: "Ticket médio", a: ticket(totais.a.venda, totais.cupA), b: ticket(totais.b.venda, totais.cupB),
      v: totais.cupA && totais.cupB ? <Variacao a={totais.a.venda / totais.cupA} b={totais.b.venda / totais.cupB} /> : <span className="text-[11px] text-muted-foreground">—</span> },
  ];

  const mesInput = (v: string, set: (s: string) => void, label: string) => (
    <label className="space-y-1 block min-w-0">
      <span className="block text-[11px] text-muted-foreground">{label}</span>
      <Input type="month" className="h-9 w-full min-w-0 sm:w-[150px]" value={v} max={mesAtual()} onChange={(e) => e.target.value && set(e.target.value)} />
    </label>
  );

  return (
    <ClientLayout storeName={nomeLoja}>
      <div className="w-full mx-auto space-y-4 p-3 sm:p-4 md:p-6">
        <div className="flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-primary" />
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Comparativo de Departamentos e Produtos</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground" aria-label="Como funciona"><Info className="w-4 h-4" /></button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Compara dois intervalos de meses livres. Clique numa linha para descer: Departamento → Grupo → Subgrupo → Produto.
              Meses já encerrados ficam salvos e abrem na hora; o mês atual vai até ontem. Cupons vêm do sistema da loja por
              departamento, por isso não aparecem por grupo ou produto.
            </TooltipContent>
          </Tooltip>
        </div>

        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            {lojas.length > 1 && (
              <div className="space-y-1">
                <span className="block text-[11px] text-muted-foreground">Loja</span>
                <Select value={storeId} onValueChange={(v) => { setStoreId(v); sessionStorage.setItem("selectedStoreId", v); setProdutos(null); setMesesCarregados(null); }}>
                  <SelectTrigger className="h-9 w-[230px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {lojas.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="w-full sm:w-auto rounded-md border border-border p-2 space-y-1">
              <div className="text-xs font-semibold text-muted-foreground">Período A (base)</div>
              <div className="grid grid-cols-2 gap-2">{mesInput(aDe, setADe, "De")}{mesInput(aAte, setAAte, "Até")}</div>
            </div>
            <div className="w-full sm:w-auto rounded-md border border-primary/50 p-2 space-y-1">
              <div className="text-xs font-semibold text-primary">Período B (comparado)</div>
              <div className="grid grid-cols-2 gap-2">{mesInput(bDe, setBDe, "De")}{mesInput(bAte, setBAte, "Até")}</div>
            </div>
            <div className="space-y-1">
              <span className="block text-[11px] text-muted-foreground">Preencher o Período A com</span>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" className="h-9 text-xs" onClick={() => aplicarAtalho("anterior")}>Meses anteriores ao B</Button>
                <Button size="sm" variant="secondary" className="h-9 text-xs" onClick={() => aplicarAtalho("anoAnterior")}>Mesmos meses do ano anterior</Button>
              </div>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button onClick={() => buscar(false)} disabled={!storeId || loading}>Comparar</Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" onClick={() => buscar(true)} disabled={!storeId || loading} aria-label="Buscar de novo na loja">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Buscar de novo no sistema da loja, ignorando o que está salvo</TooltipContent>
              </Tooltip>
              <Button variant="outline" onClick={exportar} disabled={!ordenadas.length} className="gap-2">
                <Download className="w-4 h-4" /> Excel
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">Ver por</div>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(NIVEL_LABEL) as Nivel[]).map((n) => (
                  <Button key={n} size="sm" variant={nivel === n ? "default" : "secondary"} className="h-8 text-[11px]" onClick={() => setNivel(n)}>{NIVEL_LABEL[n]}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">Departamento</div>
              <Select value={fDep} onValueChange={(v) => { setFDep(v); setFGrupo(TODOS); setFSub(TODOS); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {departamentos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">Grupo</div>
              <Select value={fGrupo} onValueChange={(v) => { setFGrupo(v); setFSub(TODOS); }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {grupos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">Subgrupo</div>
              <Select value={fSub} onValueChange={setFSub}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value={TODOS}>Todos</SelectItem>
                  {subgrupos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">Curva ABC (faturamento do B)</div>
              <div className="flex gap-1">
                {["A", "B", "C", "D"].map((c) => (
                  <Button key={c} size="sm" variant={fAbc.includes(c) ? "default" : "secondary"} className="h-8 w-8 text-[11px]" onClick={() => toggle(fAbc, setFAbc, c)}>{c}</Button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">Faturamento mínimo (R$)</div>
              <Input type="number" className="h-8 text-xs" min={0} step={100} value={vendaMin} onChange={(e) => setVendaMin(Math.max(0, Number(e.target.value) || 0))} />
            </div>
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">Buscar</div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="h-8 pl-7 text-xs" placeholder="Nome, código ou barras" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[11px] text-muted-foreground mr-1">Situação:</span>
            {SITUACOES.map((s) => (
              <Button key={s.key} size="sm" variant={fSit.includes(s.key) ? "default" : "secondary"} className="h-7 text-[11px]" onClick={() => toggle(fSit, setFSit, s.key)}>{s.label}</Button>
            ))}
          </div>
        </Card>

        {avisos.length > 0 && (
          <Card className="p-3 text-sm text-muted-foreground space-y-1">
            {avisos.map((a) => <div key={a} className="flex items-center gap-2"><Info className="w-4 h-4 shrink-0" /> {a}</div>)}
          </Card>
        )}

        {mesesCarregados && !loading && (
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {cards.map((c) => (
              <Card key={c.t} className="p-3 space-y-1">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.t}</div>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground">A · {rotA}</span><span className="tabular-nums text-muted-foreground">{c.a}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs text-primary">B · {rotB}</span><span className="tabular-nums text-base font-bold text-foreground">{c.b}</span>
                </div>
                <div className="text-right text-xs">{c.v}</div>
              </Card>
            ))}
          </div>
        )}

        <Card className="overflow-hidden">
          {mesesCarregados && !loading && (
            <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2 text-xs">
              {migalhas.map((m, i) => (
                <span key={i} className="inline-flex items-center gap-1">
                  {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  <button className="hover:underline text-foreground font-medium" onClick={m.on}>{m.label}</button>
                </span>
              ))}
              <span className="text-muted-foreground ml-2">· por {NIVEL_LABEL[nivel].toLowerCase()} · {ordenadas.length.toLocaleString("pt-BR")} linhas</span>
            </div>
          )}
          {loading ? (
            <div className="p-4 space-y-2">
              <CartProgressOverlay label={`Buscando vendas${progresso ? ` de ${progresso}` : ""}...`} />
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !mesesCarregados ? (
            <div className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <GitCompare className="w-6 h-6" />
              Escolha os dois períodos e clique em Comparar
            </div>
          ) : ordenadas.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">Nada encontrado com esses filtros.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th rowSpan={2} className="sticky left-0 z-10 bg-muted px-3 py-1.5 text-left font-medium cursor-pointer min-w-[220px]" onClick={() => ordenar("rotulo")}>
                      <span className="inline-flex items-center gap-1">{NIVEL_LABEL[nivel]}{seta("rotulo")}</span>
                    </th>
                    {grupoMetricas.map((g) => (
                      <th key={g.met} colSpan={3} className="border-l border-border px-2 py-1.5 text-center font-semibold text-foreground">{g.titulo}</th>
                    ))}
                  </tr>
                  <tr>
                    {grupoMetricas.map((g) => [
                      thS(`a_${g.met}` as SortKey, "A", "border-l border-border"),
                      thS(`b_${g.met}` as SortKey, "B", "text-primary"),
                      thS(`var_${g.met}` as SortKey, g.pp ? "Dif." : "Var."),
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((l) => {
                    const podeDescer = nivel !== "produto";
                    return (
                      <tr key={l.chave} className={`border-t border-border hover:bg-muted/30 ${podeDescer ? "cursor-pointer" : ""}`}
                        onClick={() => podeDescer && descer(l)}>
                        <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                          <div className="flex items-center gap-1">
                            <div className="min-w-0">
                              <div className="font-medium text-foreground">{l.rotulo}</div>
                              {nivel === "produto" && (
                                <div className="text-[10px] text-muted-foreground font-mono">{l.codigo}{l.barras ? ` · ${l.barras}` : ""}</div>
                              )}
                              {nivel !== "departamento" && fDep === TODOS && (
                                <div className="text-[10px] text-muted-foreground">{l.departamento}</div>
                              )}
                            </div>
                            {podeDescer && <ChevronRight className="w-3.5 h-3.5 text-muted-foreground ml-auto shrink-0" />}
                          </div>
                        </td>
                        {celulas(l)}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {mesesCarregados && !loading && ordenadas.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-2 border-t border-border p-3 text-xs text-muted-foreground">
              <span>Página {page} de {totalPages}</span>
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

function FragmentCells({ a, b, varEl }: { a: string; b: string; varEl: React.ReactNode }) {
  return (
    <>
      <td className="border-l border-border px-2 py-1.5 text-right tabular-nums whitespace-nowrap text-muted-foreground">{a}</td>
      <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap font-semibold text-foreground">{b}</td>
      <td className="px-2 py-1.5 text-right whitespace-nowrap">{varEl}</td>
    </>
  );
}

function expandir(c: Compacto, mes: string): ProdutoMes {
  return {
    mes, codigo: c.c, descricao: c.d, barras: c.b, departamento: c.n1 || "SEM DEPARTAMENTO",
    grupo: c.n2, subgrupo: c.n3, volume: c.q, venda: c.v, custo: c.k,
  };
}
