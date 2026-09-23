import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { salvarWorkbook } from "@/lib/exportBranding";
import { Download, Info, Search, ArrowUp, ArrowDown, Layers } from "lucide-react";

import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { supabase } from "@/integrations/supabase/client";
import { ALIAS_EAN, chamarRelatorio, avisoRelatorio, pick as col, num } from "@/lib/vrReport";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CartProgressOverlay } from "@/components/CartProgress";

// ============================================================
// Capilaridade de Mix
// Quantidade vendida de cada produto em cada mes do ano (jan ate o mes
// atual). Capilaridade = numero de meses em que o produto vendeu.
// Ex.: vendeu todos os meses de jan a set => capilaridade 9 (de 9).
//
// Fonte: relatorio "capilaridade_mix" da ponte (1 chamada, colunas
// qtd_01..qtd_12 / valor_01..valor_12). Se a ponte ainda nao publica esse
// relatorio, a tela monta o mesmo resultado com "ranking_produtos" mes a
// mes + "produtos" (departamento/grupo) — funciona em qualquer ERP.
// ============================================================

interface Store { id: string; name: string }

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

const fmtBRL = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtQtd = (v: number) =>
  (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const fmtNum = (v: number, d = 1) =>
  (Number(v) || 0).toLocaleString("pt-BR", { maximumFractionDigits: d });
const fmtDate = (v: string | undefined | null) => {
  if (!v || v === "0000-00-00") return "";
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
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

interface Linha {
  codigo: string;
  descricao: string;
  barras: string;
  departamento: string;
  grupo: string;
  ultimaVenda: string;
  qtdMes: number[];
  valorMes: number[];
  qtdTotal: number;
  valorTotal: number;
  capilaridade: number;
  abc: string;
}

const badgeAbc = (abc: string) => {
  const n = abc[0];
  if (n === "A") return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (n === "B") return "bg-sky-500/15 text-sky-500 border-sky-500/30";
  if (n === "C") return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  return "bg-muted text-muted-foreground border-border";
};

/** Cor da capilaridade pela fracao de meses com venda. */
const corCap = (cap: number, total: number) => {
  const f = total > 0 ? cap / total : 0;
  if (f >= 1) return "bg-emerald-500";
  if (f >= 0.75) return "bg-sky-500";
  if (f >= 0.5) return "bg-amber-500";
  return "bg-red-500";
};
const badgeCap = (cap: number, total: number) => {
  const f = total > 0 ? cap / total : 0;
  if (f >= 1) return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (f >= 0.75) return "bg-sky-500/15 text-sky-500 border-sky-500/30";
  if (f >= 0.5) return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  return "bg-red-500/15 text-red-500 border-red-500/30";
};

type SortKey =
  | "codigo" | "descricao" | "departamento" | "abc" | "capilaridade"
  | "qtdTotal" | "valorTotal" | "ultimaVenda" | `m${number}`;

const PAGE_SIZE = 50;
const chaveCod = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");
const mm = (m: number) => String(m).padStart(2, "0");

const CapilaridadeMix = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const { restrito, permiteDept } = useDepartamentosPermitidos();
  const navigate = useNavigate();

  const anoAtual = new Date().getFullYear();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [ano, setAno] = useState<number>(anoAtual);

  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [mesesPeriodo, setMesesPeriodo] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const [fDep, setFDep] = useState<string>("__all__");
  const [fAbc1, setFAbc1] = useState<string[]>([]);
  const [fAbc2, setFAbc2] = useState<string>("__all__");
  const [fCap, setFCap] = useState<number[]>([]);
  const [soFalhas, setSoFalhas] = useState(false);
  const [busca, setBusca] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "valorTotal", dir: "desc" });
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

  // ---------- fonte 1: relatorio capilaridade_mix (1 chamada) ----------
  const deRelatorio = (dados: any[]): Linha[] =>
    dados.map((l: any) => {
      const qtdMes = Array.from({ length: 12 }, (_, i) => num(col(l, `qtd_${mm(i + 1)}`, `qtd_m${mm(i + 1)}`, `qtd${i + 1}`)));
      const valorMes = Array.from({ length: 12 }, (_, i) => num(col(l, `valor_${mm(i + 1)}`, `valor_m${mm(i + 1)}`, `valor${i + 1}`)));
      return {
        codigo: String(col(l, "codigo", "cod_produto", "id_produto") ?? ""),
        descricao: String(col(l, "descricao", "produto") ?? ""),
        barras: String(col(l, ...ALIAS_EAN) ?? ""),
        departamento: String(col(l, "departamento", "m1_departamento", "secao") ?? "").trim(),
        grupo: String(col(l, "grupo", "m2_grupo") ?? "").trim(),
        ultimaVenda: String(col(l, "ultima_venda", "data_ultima_venda", "dt_ultima_venda") ?? ""),
        qtdMes,
        valorMes,
        qtdTotal: 0, valorTotal: 0, capilaridade: 0, abc: "D4",
      };
    });

  // ---------- fonte 2 (fallback): ranking_produtos mes a mes ----------
  const deRanking = async (sid: string, anoSel: number, nMeses: number, hojeIso: string): Promise<Linha[] | null> => {
    const cad = await chamarRelatorio(sid, "produtos", {});
    const cadastro = new Map<string, { descricao: string; dep: string; grupo: string; barras: string }>();
    for (const p of cad.dados || []) {
      const k = chaveCod(col(p, "codigo", "cod_produto", "id_produto", "cod"));
      if (!k) continue;
      cadastro.set(k, {
        descricao: String(col(p, "descricao", "produto") ?? ""),
        dep: String(col(p, "secao", "departamento", "nivel1") ?? "").trim(),
        grupo: String(col(p, "grupo", "nivel2", "categoria") ?? "").trim(),
        barras: String(col(p, ...ALIAS_EAN) ?? ""),
      });
    }

    const acc = new Map<string, Linha>();
    let algumOk = false;
    let ultimaFalha: string | null = null;
    const lote = 3;
    for (let i = 0; i < nMeses; i += lote) {
      const meses = Array.from({ length: Math.min(lote, nMeses - i) }, (_, j) => i + j + 1);
      setProgresso(`Lendo vendas de ${meses.map((m) => MESES[m - 1]).join(", ")}…`);
      const partes = await Promise.all(
        meses.map((m) => {
          const ini = `${anoSel}-${mm(m)}-01`;
          let fim = `${anoSel}-${mm(m)}-${new Date(anoSel, m, 0).getDate()}`;
          if (fim > hojeIso) fim = hojeIso;
          return chamarRelatorio(sid, "ranking_produtos", { inicio: ini, fim, limite: 200000 })
            .then((r) => ({ m, r }))
            .catch(() => null);
        }),
      );
      for (const parte of partes) {
        if (!parte) continue;
        const msg = avisoRelatorio(parte.r);
        if (msg) { ultimaFalha = msg; continue; }
        algumOk = true;
        for (const l of parte.r.dados) {
          const k = chaveCod(col(l, "codigo", "cod", "id_produto", "codigo_produto", "cod_produto"));
          if (!k) continue;
          let cur = acc.get(k);
          if (!cur) {
            const c = cadastro.get(k);
            cur = {
              codigo: k,
              descricao: c?.descricao || String(col(l, "produto", "descricao") ?? ""),
              barras: c?.barras ?? "",
              departamento: (c?.dep || String(col(l, "secao", "departamento") ?? "")).trim(),
              grupo: (c?.grupo || String(col(l, "grupo") ?? "")).trim(),
              ultimaVenda: "",
              qtdMes: Array(12).fill(0),
              valorMes: Array(12).fill(0),
              qtdTotal: 0, valorTotal: 0, capilaridade: 0, abc: "D4",
            };
            acc.set(k, cur);
          }
          cur.qtdMes[parte.m - 1] += num(col(l, "volume", "quantidade", "qtde", "qtd"));
          cur.valorMes[parte.m - 1] += num(col(l, "vendas", "total_vendido", "venda", "valor_venda", "valor", "total"));
        }
      }
    }
    if (!algumOk) { setAviso(ultimaFalha ?? "Sem dados de vendas para o período."); return null; }
    return Array.from(acc.values());
  };

  const buscar = async () => {
    if (!storeId) return;
    setLoading(true); setAviso(null); setPage(1); setProgresso("");
    const hoje = new Date();
    const hojeIso = format(hoje, "yyyy-MM-dd");
    const nMeses = ano === hoje.getFullYear() ? hoje.getMonth() + 1 : 12;
    const inicio = `${ano}-01-01`;
    const fim = ano === hoje.getFullYear() ? hojeIso : `${ano}-12-31`;

    try {
      let base: Linha[] | null = null;
      const r = await chamarRelatorio(storeId, "capilaridade_mix", { inicio, fim });
      if (r.indisponivel) {
        base = await deRanking(storeId, ano, nMeses, hojeIso);
      } else {
        const msg = avisoRelatorio(r);
        if (msg) { setAviso(msg); setLinhas([]); return; }
        base = deRelatorio(r.dados || []);
      }
      if (!base) { setLinhas([]); return; }

      // Totais e capilaridade (so meses do periodo: jan..mes atual)
      for (const l of base) {
        l.qtdTotal = l.qtdMes.slice(0, nMeses).reduce((s, v) => s + v, 0);
        l.valorTotal = l.valorMes.slice(0, nMeses).reduce((s, v) => s + v, 0);
        l.capilaridade = l.qtdMes.slice(0, nMeses).filter((q) => q > 0).length;
        if (!l.departamento) l.departamento = "SEM DEPARTAMENTO";
      }
      const vendidos = base.filter((l) => l.capilaridade > 0);

      // Curva ABC pelo valor vendido no ano (mesma regua do Estoque Dinamico)
      const totalVenda = vendidos.reduce((s, l) => s + Math.max(0, l.valorTotal), 0);
      let acum = 0;
      [...vendidos].sort((a, b) => b.valorTotal - a.valorTotal).forEach((l) => {
        if (totalVenda > 0 && l.valorTotal > 0) {
          acum += (l.valorTotal / totalVenda) * 100;
          l.abc = FAIXAS_ABC.find((f) => acum <= f.ate)?.classe ?? "D4";
        } else {
          l.abc = "D4";
        }
      });

      setMesesPeriodo(nMeses);
      setLinhas(vendidos);
    } finally {
      setLoading(false);
      setProgresso("");
    }
  };

  const departamentos = useMemo(
    () =>
      Array.from(new Set((linhas || []).map((l) => l.departamento).filter(Boolean)))
        .filter((d) => permiteDept(d))
        .sort(),
    [linhas, restrito],
  );

  // Base para o grafico de distribuicao: todos os filtros menos o de capilaridade
  const semFiltroCap = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (linhas || []).filter((l) => {
      if (!permiteDept(l.departamento)) return false;
      if (fDep !== "__all__" && l.departamento !== fDep) return false;
      if (fAbc1.length && !fAbc1.includes(l.abc[0])) return false;
      if (fAbc2 !== "__all__" && l.abc !== fAbc2) return false;
      if (soFalhas && l.capilaridade >= mesesPeriodo) return false;
      if (q && ![l.codigo, l.descricao, l.barras].some((v) => v.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [linhas, fDep, fAbc1, fAbc2, soFalhas, busca, mesesPeriodo, restrito]);

  const filtradas = useMemo(
    () => (fCap.length ? semFiltroCap.filter((l) => fCap.includes(l.capilaridade)) : semFiltroCap),
    [semFiltroCap, fCap],
  );

  const ordenadas = useMemo(() => {
    const arr = [...filtradas];
    const { key, dir } = sort;
    const val = (l: Linha): any => (key.startsWith("m") && /^m\d+$/.test(key) ? l.qtdMes[Number(key.slice(1))] : (l as any)[key]);
    arr.sort((a, b) => {
      const va = val(a), vb = val(b);
      let cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb), "pt-BR");
      if (cmp === 0) cmp = a.valorTotal - b.valorTotal;
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtradas, sort]);

  useEffect(() => { setPage(1); }, [fDep, fAbc1, fAbc2, fCap, soFalhas, busca]);

  const totalPages = Math.max(1, Math.ceil(ordenadas.length / PAGE_SIZE));
  const pagina = ordenadas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const distribuicao = useMemo(() => {
    const cont = Array(mesesPeriodo + 1).fill(0) as number[];
    for (const l of semFiltroCap) cont[l.capilaridade] = (cont[l.capilaridade] ?? 0) + 1;
    const max = Math.max(1, ...cont.slice(1));
    return Array.from({ length: mesesPeriodo }, (_, i) => mesesPeriodo - i).map((c) => ({
      cap: c, qtd: cont[c] ?? 0, pct: semFiltroCap.length ? ((cont[c] ?? 0) / semFiltroCap.length) * 100 : 0,
      largura: ((cont[c] ?? 0) / max) * 100,
    }));
  }, [semFiltroCap, mesesPeriodo]);

  const totais = useMemo(() => {
    const qtdMes = Array(12).fill(0) as number[];
    const mixMes = Array(12).fill(0) as number[];
    let qtd = 0, valor = 0, somaCap = 0, plena = 0, umMes = 0;
    for (const l of filtradas) {
      qtd += l.qtdTotal; valor += l.valorTotal; somaCap += l.capilaridade;
      if (l.capilaridade >= mesesPeriodo) plena++;
      if (l.capilaridade === 1) umMes++;
      for (let i = 0; i < 12; i++) {
        qtdMes[i] += l.qtdMes[i];
        if (l.qtdMes[i] > 0) mixMes[i]++;
      }
    }
    const n = filtradas.length;
    return {
      n, qtd, valor, plena, umMes, qtdMes, mixMes,
      media: n ? somaCap / n : 0,
      pctPlena: n ? (plena / n) * 100 : 0,
    };
  }, [filtradas, mesesPeriodo]);

  const exportar = () => {
    const rows = ordenadas.map((l) => {
      const o: Record<string, unknown> = {
        "Cód.": l.codigo,
        "Descrição": l.descricao,
        "Barras": l.barras,
        "Departamento": l.departamento,
        "Grupo": l.grupo,
        "ABC": l.abc,
        "Capilaridade": l.capilaridade,
        "Meses no período": mesesPeriodo,
      };
      for (let i = 0; i < mesesPeriodo; i++) o[`Qtd ${MESES[i]}`] = l.qtdMes[i];
      o["Qtd. total"] = l.qtdTotal;
      o["Valor total"] = l.valorTotal;
      o["Última venda"] = fmtDate(l.ultimaVenda);
      return o;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Capilaridade de Mix");
    salvarWorkbook(wb, `Capilaridade de Mix ${ano}`);
  };

  const toggle = <T,>(arr: T[], set: (v: T[]) => void, v: T) =>
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

  const anos = [anoAtual, anoAtual - 1, anoAtual - 2];
  const mesesVis = MESES.slice(0, mesesPeriodo);

  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
        <div className="flex items-center gap-2">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Capilaridade de Mix</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground" aria-label="Como é calculado">
                <Info className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Quantidade vendida de cada produto em cada mês, de janeiro até o mês atual.
              Capilaridade = número de meses em que o produto teve venda. Quem vendeu em
              todos os meses de janeiro a setembro tem capilaridade 9 (de 9).
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
              <label className="text-xs text-muted-foreground">Ano</label>
              <Select value={String(ano)} onValueChange={(v) => { setAno(Number(v)); setLinhas(null); }}>
                <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <Button onClick={buscar} disabled={!storeId || loading}>Aplicar</Button>

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
              <div className="text-xs text-muted-foreground">Capilaridade (meses com venda)</div>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: mesesPeriodo }, (_, i) => mesesPeriodo - i).map((c) => (
                  <Button key={c} size="sm" variant={fCap.includes(c) ? "default" : "secondary"}
                    className="h-7 min-w-8 px-2 text-[11px]" onClick={() => toggle(fCap, setFCap, c)}>{c}</Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Somente com mês sem venda</div>
              <div className="h-7 flex items-center">
                <Switch checked={soFalhas} onCheckedChange={setSoFalhas} />
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
            { label: "Mix vendido no ano", valor: fmtNum(totais.n, 0), sub: `${fmtBRL(totais.valor)} vendidos` },
            { label: `Capilaridade plena (${mesesPeriodo}/${mesesPeriodo})`, valor: fmtNum(totais.plena, 0), sub: `${fmtNum(totais.pctPlena)}% do mix` },
            { label: "Capilaridade média", valor: `${fmtNum(totais.media)} / ${mesesPeriodo}`, sub: "meses com venda por produto" },
            { label: "Vendidos em 1 mês só", valor: fmtNum(totais.umMes, 0), sub: totais.n ? `${fmtNum((totais.umMes / totais.n) * 100)}% do mix` : "" },
          ].map((c) => (
            <Card key={c.label} className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
              <div className="text-lg md:text-xl font-bold text-foreground mt-1">{c.valor}</div>
              {c.sub && <div className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</div>}
            </Card>
          ))}
        </div>

        {linhas !== null && !loading && semFiltroCap.length > 0 && (
          <Card className="p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div className="text-sm font-semibold text-foreground">Produtos por capilaridade</div>
              <div className="text-[11px] text-muted-foreground">Clique numa barra para filtrar</div>
            </div>
            <div className="space-y-1.5">
              {distribuicao.map((d) => (
                <button
                  key={d.cap}
                  type="button"
                  onClick={() => toggle(fCap, setFCap, d.cap)}
                  className={`w-full grid grid-cols-[64px_1fr_120px] items-center gap-2 text-xs rounded px-1 py-0.5 hover:bg-muted/40 ${
                    fCap.includes(d.cap) ? "bg-muted/60" : ""
                  }`}
                >
                  <span className="text-left font-medium text-foreground">{d.cap} de {mesesPeriodo}</span>
                  <span className="h-4 rounded bg-muted overflow-hidden">
                    <span className={`block h-full ${corCap(d.cap, mesesPeriodo)}`} style={{ width: `${Math.max(d.largura, d.qtd ? 1 : 0)}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-foreground">
                    {fmtNum(d.qtd, 0)} <span className="text-muted-foreground">({fmtNum(d.pct)}%)</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-2">
              <CartProgressOverlay label={progresso || "Consultando capilaridade de mix..."} />
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : linhas === null ? (
            <div className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Layers className="w-6 h-6" />
              Selecione o ano e clique em Aplicar
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
                    {th("capilaridade", "Capilaridade")}
                    {mesesVis.map((m, i) => (
                      <th key={m} className="px-2 py-2 font-medium whitespace-nowrap text-right cursor-pointer select-none"
                        onClick={() => setSort((s) => ({ key: `m${i}`, dir: s.key === `m${i}` && s.dir === "desc" ? "asc" : "desc" }))}>
                        <span className="inline-flex items-center gap-1">
                          {m}
                          {sort.key === `m${i}` && (sort.dir === "desc" ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />)}
                        </span>
                      </th>
                    ))}
                    {th("qtdTotal", "Qtd. total", "right")}
                    {th("valorTotal", "Valor total", "right")}
                    {th("ultimaVenda", "Última venda")}
                  </tr>
                </thead>
                <tbody>
                  {pagina.map((l, idx) => (
                    <tr key={`${l.codigo}-${idx}`} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap">{l.codigo}</td>
                      <td className="px-3 py-2 min-w-[220px]">{l.descricao}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{l.barras}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{l.departamento}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={badgeAbc(l.abc)}>{l.abc}</Badge>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={badgeCap(l.capilaridade, mesesPeriodo)}>
                            {l.capilaridade}/{mesesPeriodo}
                          </Badge>
                          <div className="flex gap-0.5" aria-hidden>
                            {mesesVis.map((m, i) => (
                              <span key={m} title={m}
                                className={`w-1.5 h-3 rounded-sm ${l.qtdMes[i] > 0 ? corCap(l.capilaridade, mesesPeriodo) : "bg-muted"}`} />
                            ))}
                          </div>
                        </div>
                      </td>
                      {mesesVis.map((m, i) => (
                        <td key={m} className={`px-2 py-2 text-right whitespace-nowrap tabular-nums ${
                          l.qtdMes[i] > 0 ? "" : "text-red-500/70 bg-red-500/5"
                        }`}>
                          {l.qtdMes[i] > 0 ? fmtQtd(l.qtdMes[i]) : "—"}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{fmtQtd(l.qtdTotal)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{fmtBRL(l.valorTotal)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{fmtDate(l.ultimaVenda)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-card border-t-2 border-border font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={5}>Totais ({filtradas.length} produtos)</td>
                    <td className="px-3 py-2 whitespace-nowrap">média {fmtNum(totais.media)}/{mesesPeriodo}</td>
                    {mesesVis.map((m, i) => (
                      <td key={m} className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                        <div>{fmtQtd(totais.qtdMes[i])}</div>
                        <div className="text-[10px] font-normal text-muted-foreground">mix {fmtNum(totais.mixMes[i], 0)}</div>
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right">{fmtQtd(totais.qtd)}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(totais.valor)}</td>
                    <td className="px-3 py-2" />
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

export default CapilaridadeMix;
