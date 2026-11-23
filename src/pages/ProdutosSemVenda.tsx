import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Download, Search, ArrowUp, ArrowDown, Info } from "lucide-react";
import * as XLSX from "xlsx";
import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { carregarLojasPermitidas, type LojaSimples } from "@/lib/lojasPermitidas";
import { saveSelectedStore } from "@/lib/selectedStore";
import { salvarWorkbook } from "@/lib/exportBranding";
import { chamarRelatorio, avisoRelatorio, pick, num, txt, ALIAS_EAN } from "@/lib/vrReport";
import { mercadologicoNivel1 } from "@/lib/mercadologico";
import { lerPeriodoCache } from "@/lib/relatorioCache";
import { limitesMes, somarMeses } from "@/lib/comparativoProdutos";
import { produtosSemVenda, type ProdutoVenda, type ProdutoParado } from "@/lib/produtosSemVenda";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const chave = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");
const brl = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtd = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const hojeSP = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const rotMes = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

const FAIXAS_ABC = [
  { classe: "A1", ate: 20.3 }, { classe: "A2", ate: 31.5 }, { classe: "A3", ate: 40.5 }, { classe: "A4", ate: 45.0 },
  { classe: "B1", ate: 56.3 }, { classe: "B2", ate: 62.5 }, { classe: "B3", ate: 67.5 }, { classe: "B4", ate: 70.0 },
  { classe: "C1", ate: 79.0 }, { classe: "C2", ate: 84.0 }, { classe: "C3", ate: 88.0 }, { classe: "C4", ate: 90.0 },
  { classe: "D1", ate: 94.5 }, { classe: "D2", ate: 97.0 }, { classe: "D3", ate: 99.0 }, { classe: "D4", ate: 100 },
];
const badgeAbc = (abc: string) => {
  const n = abc[0];
  if (n === "A") return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (n === "B") return "bg-sky-500/15 text-sky-500 border-sky-500/30";
  if (n === "C") return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
};

type Linha = ProdutoParado & { abc: string };
type SortKey = "codigo" | "descricao" | "departamento" | "abc" | "mesesComVenda" | "volume" | "venda";
const PAGE_SIZE = 50;

export default function ProdutosSemVenda() {
  const { user, isGlobalAdmin } = useAuth();
  const { restrito, permiteDept } = useDepartamentosPermitidos();
  const [lojas, setLojas] = useState<LojaSimples[]>([]);
  const [storeId, setStoreId] = useState("");
  const [ref, setRef] = useState<ProdutoVenda[][] | null>(null);
  const [atual, setAtual] = useState<ProdutoVenda[]>([]);
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string[]>([]);
  const [fDep, setFDep] = useState("__all__");
  const [fAbc1, setFAbc1] = useState<string[]>([]);
  const [fAbc2, setFAbc2] = useState("__all__");
  const [fCap, setFCap] = useState<number[]>([]);
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "venda", dir: "desc" });
  const [page, setPage] = useState(1);
  const carga = useRef(0);

  const ontem = useMemo(() => { const d = hojeSP(); d.setDate(d.getDate() - 1); return iso(d); }, []);
  const mesAtual = ontem.slice(0, 7);
  const mesesRef = useMemo(() => [3, 2, 1].map((n) => somarMeses(mesAtual, -n)), [mesAtual]);

  useEffect(() => {
    (async () => {
      const ls = await carregarLojasPermitidas(user?.id, !!isGlobalAdmin);
      setLojas(ls);
      const sid = sessionStorage.getItem("selectedStoreId");
      setStoreId(sid && ls.some((l) => l.id === sid) ? sid : ls[0]?.id ?? "");
    })();
  }, [user?.id, isGlobalAdmin]);

  async function lerMes(de: string, ate: string, fechado: boolean, apenasSalvos: boolean): Promise<{ linhas: ProdutoVenda[]; aviso?: string }> {
    if (fechado) {
      const c = await lerPeriodoCache(storeId, "comparativo_produtos_v1", "", de, ate).catch(() => null);
      if (c) return { linhas: (c as any[]).map((x) => ({ codigo: x.c, descricao: x.d, barras: x.b, departamento: x.n1, venda: x.v, volume: x.q })) };
    }
    const r = await chamarRelatorio(storeId, "ranking_produtos", { inicio: de, fim: ate, limite: 200000 }, { apenasSalvos });
    const msg = avisoRelatorio(r);
    if (msg) return { linhas: [], aviso: `${rotMes(de.slice(0, 7))}: ${msg}` };
    const linhas = (r.dados || []).map((l: any) => ({
      codigo: chave(pick(l, "codigo", "cod", "codigo_produto", "cod_produto", "id_produto")),
      descricao: txt(pick(l, "produto", "descricao", "nome")),
      barras: txt(pick(l, ...ALIAS_EAN)),
      departamento: mercadologicoNivel1(l),
      venda: num(pick(l, "vendas", "total_vendido", "valor_venda", "venda", "valor")),
      volume: num(pick(l, "volume", "quantidade", "qtd", "qtde")),
    })).filter((p: ProdutoVenda) => p.codigo);
    return { linhas };
  }

  const carregar = async (apenasSalvos: boolean) => {
    if (!storeId) return;
    const id = ++carga.current;
    setLoading(true); setAviso([]);
    try {
      const avisos: string[] = [];
      const meses: ProdutoVenda[][] = [];
      // Um mês por vez: pontes lentas caem com consultas em paralelo.
      for (const m of mesesRef) {
        const { de, ate } = limitesMes(m);
        const r = await lerMes(de, ate, true, apenasSalvos);
        if (id !== carga.current) return;
        meses.push(r.linhas); if (r.aviso) avisos.push(r.aviso);
      }
      const a = await lerMes(`${mesAtual}-01`, ontem, false, apenasSalvos);
      if (id !== carga.current) return;
      if (a.aviso) avisos.push(a.aviso);
      setRef(meses); setAtual(a.linhas); setAviso(avisos);
    } finally { if (id === carga.current) setLoading(false); }
  };

  // Abre com o que já está salvo no Hub; consultar a loja só pelo botão.
  useEffect(() => { if (storeId) carregar(true); return () => { carga.current += 1; }; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [storeId]);

  // Lista plana com curva ABC pela venda dos 3 meses de referência.
  const linhas = useMemo<Linha[]>(() => {
    if (!ref) return [];
    const lista = [...produtosSemVenda(ref, atual).values()].flat().filter((p) => permiteDept(p.departamento || "SEM DEPARTAMENTO"));
    const total = lista.reduce((s, p) => s + Math.max(0, p.venda), 0);
    let acum = 0;
    const abc = new Map<string, string>();
    [...lista].sort((a, b) => b.venda - a.venda).forEach((p) => {
      if (total > 0 && p.venda > 0) { acum += (p.venda / total) * 100; abc.set(p.codigo, FAIXAS_ABC.find((f) => acum <= f.ate)?.classe ?? "D4"); }
      else abc.set(p.codigo, "D4");
    });
    return lista.map((p) => ({ ...p, departamento: p.departamento || "SEM DEPARTAMENTO", abc: abc.get(p.codigo) ?? "D4" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, atual, restrito]);

  const vendaMes = useMemo(() => {
    const m = new Map<string, number[]>();
    (ref ?? []).forEach((lista, i) => { for (const p of lista) { const a = m.get(p.codigo) ?? [0, 0, 0]; a[i] += p.venda; m.set(p.codigo, a); } });
    return m;
  }, [ref]);
  const mesLongo = (m: string) => { const t = new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long" }); return t[0].toUpperCase() + t.slice(1); };

  const departamentos = useMemo(() => [...new Set(linhas.map((l) => l.departamento))].sort(), [linhas]);

  const semFiltroCap = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (fDep !== "__all__" && l.departamento !== fDep) return false;
      if (fAbc1.length && !fAbc1.includes(l.abc[0])) return false;
      if (fAbc2 !== "__all__" && l.abc !== fAbc2) return false;
      if (q && ![l.codigo, l.descricao, l.barras].some((v) => String(v ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [linhas, fDep, fAbc1, fAbc2, busca]);
  const filtradas = useMemo(() => (fCap.length ? semFiltroCap.filter((l) => fCap.includes(l.mesesComVenda)) : semFiltroCap), [semFiltroCap, fCap]);

  const ordenadas = useMemo(() => {
    const { key, dir } = sort;
    return [...filtradas].sort((a, b) => {
      const va = (a as any)[key], vb = (b as any)[key];
      let cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      if (cmp === 0) cmp = a.venda - b.venda;
      return dir === "asc" ? cmp : -cmp;
    });
  }, [filtradas, sort]);

  useEffect(() => { setPage(1); }, [fDep, fAbc1, fAbc2, fCap, busca, storeId]);
  const totalPages = Math.max(1, Math.ceil(ordenadas.length / PAGE_SIZE));
  const pagina = ordenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const distribuicao = useMemo(() => {
    const cont = [0, 0, 0, 0];
    for (const l of semFiltroCap) cont[l.mesesComVenda] = (cont[l.mesesComVenda] ?? 0) + 1;
    const max = Math.max(1, ...cont.slice(1));
    return [3, 2, 1].map((c) => ({ cap: c, qtd: cont[c], pct: semFiltroCap.length ? (cont[c] / semFiltroCap.length) * 100 : 0, largura: (cont[c] / max) * 100 }));
  }, [semFiltroCap]);

  const totais = useMemo(() => {
    let venda = 0, plena = 0;
    for (const l of filtradas) { venda += l.venda; if (l.mesesComVenda >= 3) plena++; }
    return { n: filtradas.length, venda, plena, deps: new Set(filtradas.map((l) => l.departamento)).size };
  }, [filtradas]);

  const nomeLoja = lojas.find((l) => l.id === storeId)?.name ?? "";

  const exportar = () => {
    const rows = ordenadas.map((l) => ({
      "Cód.": l.codigo, "Descrição": l.descricao, "Barras": l.barras, "Departamento": l.departamento, "ABC": l.abc,
      "Meses com venda (de 3)": l.mesesComVenda, ...Object.fromEntries(mesesRef.map((m, i) => [mesLongo(m), vendaMes.get(l.codigo)?.[i] ?? 0])), "Venda 3 meses": l.venda,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Sem venda no mês");
    salvarWorkbook(wb, `Produtos sem venda ${mesAtual} ${nomeLoja}`);
  };

  const toggle = <T,>(arr: T[], set: (v: T[]) => void, v: T) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const th = (key: SortKey, label: string, align = "left") => (
    <th className={`px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none text-${align}`}
      onClick={() => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }))}>
      <span className="inline-flex items-center gap-1">{label}
        {sort.key === key && (sort.dir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
      </span>
    </th>
  );

  return (
    <ClientLayout storeName={nomeLoja}>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Produtos sem venda no mês</h1>
          <Tooltip>
            <TooltipTrigger asChild><button className="text-muted-foreground hover:text-foreground" aria-label="Como é calculado"><Info className="w-4 h-4" /></button></TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Produtos que venderam em {mesesRef.map(rotMes).join(", ")} e não venderam de {rotMes(mesAtual)} até ontem.
              "Meses com venda" = em quantos desses 3 meses o produto vendeu. ABC pela venda dos 3 meses.
            </TooltipContent>
          </Tooltip>
        </div>

        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {lojas.length > 1 && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Loja</label>
                <Select value={storeId} onValueChange={(v) => { setStoreId(v); saveSelectedStore(v); setRef(null); }}>
                  <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">{lojas.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <Button data-no-print="true" disabled={loading || !storeId} onClick={() => carregar(false)}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar
            </Button>
            <div className="space-y-1 flex-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">Buscar</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" placeholder="Código, descrição ou barras" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>
            <Button variant="outline" onClick={exportar} disabled={!ordenadas.length} className="gap-2"><Download className="w-4 h-4" /> Exportar Excel</Button>
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
                    <Button key={c} size="sm" variant={fAbc1.includes(c) ? "default" : "secondary"} className="h-7 w-8 text-[11px]" onClick={() => toggle(fAbc1, setFAbc1, c)}>{c}</Button>
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
              <div className="text-xs text-muted-foreground">Meses com venda (de 3)</div>
              <div className="flex gap-1">
                {[3, 2, 1].map((c) => (
                  <Button key={c} size="sm" variant={fCap.includes(c) ? "default" : "secondary"} className="h-7 min-w-8 px-2 text-[11px]" onClick={() => toggle(fCap, setFCap, c)}>{c}</Button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {aviso.length > 0 && <Card className="border-destructive/40 p-3 text-sm text-destructive">{aviso.map((a) => <div key={a}>{a}</div>)}</Card>}
        {loading && <Skeleton className="h-40 w-full" />}

        {!loading && ref && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: "Produtos sem venda", valor: totais.n.toLocaleString("pt-BR"), sub: `em ${totais.deps} departamentos` },
                { label: "Venda perdida (3 meses)", valor: brl(totais.venda), sub: "vendido antes nos 3 meses" },
                { label: "Vendiam todo mês (3/3)", valor: totais.plena.toLocaleString("pt-BR"), sub: totais.n ? `${((totais.plena / totais.n) * 100).toFixed(1).replace(".", ",")}% da lista` : "" },
                { label: "Período sem venda", valor: rotMes(mesAtual), sub: "até ontem" },
              ].map((c) => (
                <Card key={c.label} className="p-4">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
                  <div className="text-lg md:text-xl font-bold text-foreground mt-1">{c.valor}</div>
                  {c.sub && <div className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</div>}
                </Card>
              ))}
            </div>

            {semFiltroCap.length > 0 && (
              <Card className="p-4 space-y-2">
                <div className="text-sm font-medium">Distribuição por meses com venda</div>
                {distribuicao.map((d) => (
                  <button key={d.cap} className="flex w-full items-center gap-3 text-xs" onClick={() => toggle(fCap, setFCap, d.cap)}>
                    <span className="w-10 text-right">{d.cap}/3</span>
                    <div className="h-4 flex-1 rounded bg-muted"><div className={`h-4 rounded ${fCap.includes(d.cap) ? "bg-accent" : "bg-primary"}`} style={{ width: `${d.largura}%` }} /></div>
                    <span className="w-28 text-left tabular-nums">{d.qtd} ({d.pct.toFixed(1).replace(".", ",")}%)</span>
                  </button>
                ))}
              </Card>
            )}

            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground">
                  <tr>{th("codigo", "Cód.")}{th("descricao", "Descrição")}{th("departamento", "Departamento")}{th("abc", "ABC")}{th("mesesComVenda", "Meses c/ venda", "center")}{mesesRef.map((m) => <th key={m} className="px-3 py-2 text-right font-medium">{mesLongo(m)}</th>)}{th("venda", "Venda 3 meses", "right")}</tr>
                </thead>
                <tbody>
                  {pagina.map((l) => (
                    <tr key={l.codigo} className="border-t border-border">
                      <td className="px-3 py-1.5 tabular-nums">{l.codigo}</td>
                      <td className="px-3 py-1.5">{l.descricao}<div className="text-[11px] text-muted-foreground">{l.barras}</div></td>
                      <td className="px-3 py-1.5">{l.departamento}</td>
                      <td className="px-3 py-1.5"><Badge variant="outline" className={badgeAbc(l.abc)}>{l.abc}</Badge></td>
                      <td className="px-3 py-1.5 text-center">{l.mesesComVenda}/3</td>
                      {mesesRef.map((m, i) => <td key={m} className="px-3 py-1.5 text-right tabular-nums">{brl(vendaMes.get(l.codigo)?.[i] ?? 0)}</td>)}
                      <td className="px-3 py-1.5 text-right tabular-nums">{brl(l.venda)}</td>
                    </tr>
                  ))}
                  {!pagina.length && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Nenhum produto com esses filtros.</td></tr>}
                </tbody>
              </table>
              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 p-3 text-xs" data-no-print="true">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
                  <span>Página {page} de {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </ClientLayout>
  );
}
