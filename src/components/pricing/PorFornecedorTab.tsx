import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Loader2, Search, Download, Info, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio, pick as col, num, txt, ALIAS_EAN, ALIAS_ESTOQUE } from "@/lib/vrReport";
import { salvarWorkbook } from "@/lib/exportBranding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { eanUtilizavel } from "./pricingTypes";
import AplicarPrecosDialog, { type ItemAplicar } from "./AplicarPrecosDialog";
import { carregarMargens, indexarMargens, resolverMargem, precoMeta as calcPrecoMeta, type MargemPadrao } from "@/lib/margensPadrao";

const brl = (v: number | null | undefined) =>
  v == null || !isFinite(Number(v)) ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? "—" : `${v.toFixed(1)}%`;
const dataBR = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  return isNaN(d.getTime()) ? String(s) : d.toLocaleDateString("pt-BR");
};
const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

interface Fornecedor { id: string; nome: string; cnpj: string }
interface ConcCol { id: string; nome: string }

interface Linha {
  idProduto: number;
  idFornecedor: string;
  idDepartamento: string;
  codigo: string;
  ean: string;
  descricao: string;
  secao: string;
  abc: string;
  fornecedor: string;
  dataEntrada: string | null;
  qtdEntrada: number;
  custoUnit: number;
  valorEntrada: number;
  qtdEntradasPeriodo: number;
  custoMedioPeriodo: number;
  precoAtual: number;
  precoOferta: number | null;
  estoque: number;
  qtdVendida: number;
  valorVendido: number;
  concorrentes: Record<string, number | null>;
}

const corAbc = (c: string) =>
  c === "A" ? "bg-green-100 text-green-800" :
  c === "B" ? "bg-blue-100 text-blue-800" :
  c === "C" ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground";

interface Props { storeId: string }

const PorFornecedorTab = ({ storeId }: Props) => {
  const [inicio, setInicio] = useState(isoDaysAgo(30));
  const [fim, setFim] = useState(new Date().toISOString().slice(0, 10));
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [buscaForn, setBuscaForn] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [codigoLoja, setCodigoLoja] = useState<string | null>(null);

  const [carregandoForn, setCarregandoForn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [concCols, setConcCols] = useState<ConcCol[]>([]);

  // filtros pós-carga
  const [curvas, setCurvas] = useState<string[]>([]);
  const [depto, setDepto] = useState("todos");
  const [margemMax, setMargemMax] = useState("");
  const [soEstoque, setSoEstoque] = useState(false);
  const [soConcMaisBarato, setSoConcMaisBarato] = useState(false);
  const [sobreOferta, setSobreOferta] = useState(false);
  const [alvoMarkup, setAlvoMarkup] = useState("35");
  const [sortKey, setSortKey] = useState("valorVendido");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [aplicados, setAplicados] = useState<Record<string, number>>({});
  const [confirmar, setConfirmar] = useState<{ linha: Linha; preco: number } | null>(null);

  useEffect(() => {
    if (!storeId) return;
    setLinhas([]); setSel([]); setAviso(null);
    supabase.from("store_vr_config").select("codigo_loja").eq("store_id", storeId).maybeSingle()
      .then(({ data }) => setCodigoLoja(data?.codigo_loja ?? null));
    (async () => {
      setCarregandoForn(true);
      try {
        const mapear = (dados: any[]) =>
          dados.map((l) => ({
            id: String(
              col(l, "id", "id_fornecedor", "codigo", "codigo_fornecedor", "cod_fornecedor", "fornecedor_id") ??
                txt(col(l, "razao_social", "fornecedor", "nome_fornecedor", "nome")),
            ),
            nome: txt(col(l, "razao_social", "nome", "fornecedor", "nome_fornecedor"), "(sem nome)"),
            cnpj: txt(col(l, "cnpj", "cnpj_cpf", "documento")),
          })).filter((f) => f.id);

        let r = await chamarRelatorio(storeId, "fornecedores", {});
        let lista = mapear(r.dados || []);

        // Nem toda ponte publica o relatorio "fornecedores": caimos para a lista
        // de quem teve nota nos ultimos 12 meses (compras_por_fornecedor).
        if (lista.length === 0) {
          const hoje = new Date();
          const de = new Date(hoje.getFullYear() - 1, hoje.getMonth(), hoje.getDate());
          const iso = (d: Date) => d.toISOString().slice(0, 10);
          const alt = await chamarRelatorio(storeId, "compras_por_fornecedor", {
            inicio: iso(de), fim: iso(hoje), ...(codigoLoja ? { loja: codigoLoja } : {}),
          });
          const vistos = new Set<string>();
          lista = mapear(alt.dados || []).filter((f) => {
            const k = f.id.toLowerCase();
            if (vistos.has(k)) return false;
            vistos.add(k);
            return true;
          });
          if (lista.length > 0) r = alt;
        }

        lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
        setFornecedores(lista);
        if (lista.length === 0) setAviso(avisoRelatorio(r) ?? "Nenhum fornecedor com nota nos últimos 12 meses.");
      } finally {
        setCarregandoForn(false);
      }
    })();

  }, [storeId]);

  const carregar = async () => {
    if (!storeId || sel.length === 0) return;
    setLoading(true);
    setAviso(null);
    try {
      const r = await chamarRelatorio(storeId, "pricing_por_fornecedor", {
        inicio, fim, loja: codigoLoja ?? "", fornecedores: sel.join(","),
      });
      const msg = r.indisponivel
        ? "O relatório de preços por fornecedor ainda não foi publicado no sistema desta loja."
        : avisoRelatorio(r);
      if (msg) { setAviso(msg); setLinhas([]); setConcCols([]); return; }


      const base: Linha[] = (r.dados || []).map((l) => ({
        idProduto: Math.trunc(num(col(l, "id_produto", "idproduto", "codigo", "cod", "codigo_produto", "cod_produto"))),
        idFornecedor: String(col(l, "id_fornecedor", "idfornecedor", "fornecedor_id", "cod_fornecedor") ?? "").replace(/\D/g, ""),
        idDepartamento: String(col(l, "id_departamento", "mercadologico1", "cod_departamento", "id_secao") ?? "").replace(/\D/g, ""),
        codigo: String(col(l, "codigo", "cod", "codigo_produto", "cod_produto") ?? "").replace(/^0+/, ""),
        ean: eanUtilizavel(col(l, ...ALIAS_EAN)),
        descricao: txt(col(l, "descricao", "descricao_completa", "produto", "nome"), "—"),
        secao: txt(col(l, "secao", "departamento", "depto", "grupo"), "SEM DEPARTAMENTO"),
        abc: String(col(l, "abc", "curva", "curva_abc") ?? "D").toUpperCase().slice(0, 1) || "D",
        fornecedor: txt(col(l, "fornecedor", "razao_social", "nome_fornecedor")),
        dataEntrada: (col(l, "data_ultima_entrada", "ultima_entrada", "data_entrada") as string) ?? null,
        qtdEntrada: num(col(l, "qtd_ultima_entrada", "qtd_entrada", "quantidade_entrada")),
        custoUnit: num(col(l, "custo_unitario", "custo_unit", "custo")),
        valorEntrada: num(col(l, "valor_total_entrada", "valor_entrada", "total_entrada")),
        qtdEntradasPeriodo: num(col(l, "qtd_entradas_periodo", "entradas_periodo")),
        custoMedioPeriodo: num(col(l, "custo_medio_periodo", "custo_medio")),
        precoAtual: num(col(l, "preco_atual", "preco_venda", "preco")),
        precoOferta: col(l, "preco_oferta", "preco_promocao") == null ? null : num(col(l, "preco_oferta", "preco_promocao")),
        estoque: num(col(l, ...ALIAS_ESTOQUE)),
        qtdVendida: num(col(l, "qtd_vendida", "quantidade_vendida", "volume", "qtd_venda")),
        valorVendido: num(col(l, "valor_vendido", "total_vendido", "vendas", "valor_venda")),
        concorrentes: {},
      })).filter((x) => x.codigo || x.ean);

      // preços dos concorrentes ativos vinculados à loja (por EAN)
      const { data: vs } = await supabase
        .from("cliente_concorrentes")
        .select("apelido, prioridade, sites_concorrentes(id, nome, ativo)")
        .eq("store_id", storeId)
        .eq("ativo", true)
        .order("prioridade");
      const sites = ((vs || []) as unknown as {
        apelido: string | null;
        sites_concorrentes: { id: string; nome: string; ativo: boolean } | null;
      }[]).filter((v) => v.sites_concorrentes?.ativo);

      const eans = [...new Set(base.map((l) => l.ean).filter(Boolean))];
      const cols: ConcCol[] = [];
      for (const v of sites) {
        const s = v.sites_concorrentes!;
        const mapa = new Map<string, number>();
        for (let i = 0; i < eans.length; i += 300) {
          const lote = eans.slice(i, i + 300);
          const { data } = await supabase
            .from("precos_concorrente")
            .select("ean, preco, disponivel")
            .eq("site_concorrente_id", s.id)
            .in("ean", lote);
          for (const p of data || []) {
            if (!p.disponivel || p.preco == null) continue;
            const e = eanUtilizavel(p.ean);
            if (!e) continue;
            const atual = mapa.get(e);
            const valor = Number(p.preco);
            if (atual == null || valor < atual) mapa.set(e, valor);
          }
        }
        if (mapa.size === 0) continue;
        cols.push({ id: s.id, nome: v.apelido || s.nome });
        for (const l of base) l.concorrentes[s.id] = l.ean ? mapa.get(l.ean) ?? null : null;
      }

      setConcCols(cols);
      setLinhas(base);
      setAplicados({});
      if (base.length === 0) setAviso("Nenhuma entrada de nota encontrada para os fornecedores e período informados.");
    } finally {
      setLoading(false);
    }
  };

  const precoBase = (l: Linha) => (sobreOferta ? l.precoOferta ?? l.precoAtual : l.precoAtual);
  const markup = (l: Linha) => {
    const p = precoBase(l);
    return l.custoUnit > 0 ? ((p - l.custoUnit) / l.custoUnit) * 100 : null;
  };
  const markdown = (l: Linha) => {
    const p = precoBase(l);
    return p > 0 ? ((p - l.custoUnit) / p) * 100 : null;
  };
  const margemRs = (l: Linha) => precoBase(l) - l.custoUnit;
  const menorConc = (l: Linha) => {
    const vals = Object.values(l.concorrentes).filter((v): v is number => v != null);
    return vals.length ? Math.min(...vals) : null;
  };
  const sugestao = (l: Linha) => {
    const alvo = Number(alvoMarkup);
    if (!isFinite(alvo) || l.custoUnit <= 0) return null;
    return Math.round(l.custoUnit * (1 + alvo / 100) * 100) / 100;
  };

  const deptos = useMemo(() => [...new Set(linhas.map((l) => l.secao))].sort(), [linhas]);

  const filtradas = useMemo(() => {
    const lim = margemMax === "" ? null : Number(margemMax);
    const arr = linhas.filter((l) => {
      if (curvas.length && !curvas.includes(l.abc)) return false;
      if (depto !== "todos" && l.secao !== depto) return false;
      if (lim != null && isFinite(lim)) {
        const m = markdown(l);
        if (m == null || m >= lim) return false;
      }
      if (soEstoque && !(l.estoque > 0)) return false;
      if (soConcMaisBarato) {
        const mc = menorConc(l);
        if (mc == null || mc >= precoBase(l)) return false;
      }
      return true;
    });
    arr.sort((a, b) => {
      const get = (l: Linha): number | string => {
        if (sortKey === "markup") return markup(l) ?? -Infinity;
        if (sortKey === "markdown") return markdown(l) ?? -Infinity;
        if (sortKey === "margemRs") return margemRs(l);
        const v = (l as unknown as Record<string, unknown>)[sortKey];
        return typeof v === "number" ? v : String(v ?? "");
      };
      const va = get(a), vb = get(b);
      const cmp = typeof va === "number" && typeof vb === "number"
        ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, curvas, depto, margemMax, soEstoque, soConcMaisBarato, sortKey, sortDir, sobreOferta]);

  const ordenar = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };
  const Th = ({ k, children, className = "" }: { k: string; children: React.ReactNode; className?: string }) => (
    <TableHead className={`cursor-pointer select-none whitespace-nowrap ${className}`} onClick={() => ordenar(k)}>
      {children}
    </TableHead>
  );

  const aplicar = (l: Linha, forcar = false) => {
    const novo = sugestao(l);
    if (novo == null) return;
    if (novo <= l.custoUnit) {
      toast({ title: "Preço bloqueado", description: "A sugestão ficaria abaixo do custo.", variant: "destructive" });
      return;
    }
    const delta = l.precoAtual > 0 ? Math.abs(novo - l.precoAtual) / l.precoAtual : 0;
    if (delta > 0.3 && !forcar) { setConfirmar({ linha: l, preco: novo }); return; }
    setAplicados((p) => ({ ...p, [l.codigo || l.ean]: novo }));
    toast({ title: "Preço marcado", description: `${l.descricao}: ${brl(novo)} — vai no arquivo do Excel.` });
  };

  const exportar = () => {
    const nomeForn = sel.length === 1
      ? (fornecedores.find((f) => f.id === sel[0])?.nome || sel[0]).slice(0, 30)
      : `${sel.length}-fornecedores`;
    const dados = filtradas.map((l) => {
      const base: Record<string, unknown> = {
        Cod: l.codigo,
        EAN: l.ean,
        Descrição: l.descricao,
        Depto: l.secao,
        ABC: l.abc,
        Fornecedor: l.fornecedor,
        "Última entrada": dataBR(l.dataEntrada),
        "Qtd entrada": l.qtdEntrada,
        "Custo unit.": l.custoUnit,
        "Valor total entrada": l.valorEntrada,
        "Entradas no período": l.qtdEntradasPeriodo,
        "Custo médio período": l.custoMedioPeriodo,
        "Preço atual": l.precoAtual,
        "Preço oferta": l.precoOferta ?? "",
        Estoque: l.estoque,
        "Qtd vendida": l.qtdVendida,
        "Valor vendido": l.valorVendido,
        "Markup %": markup(l)?.toFixed(1) ?? "",
        "Markdown %": markdown(l)?.toFixed(1) ?? "",
        "Margem R$": margemRs(l),
      };
      for (const c of concCols) base[c.nome] = l.concorrentes[c.id] ?? "";
      base["Sugestão de preço"] = sugestao(l) ?? "";
      base["Preço aplicado"] = aplicados[l.codigo || l.ean] ?? "";
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(dados);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Por Fornecedor");
    salvarWorkbook(wb, `pricing-fornecedor-${nomeForn}`);
  };

  const fornFiltrados = fornecedores.filter((f) => {
    const q = buscaForn.trim().toLowerCase();
    return !q || f.nome.toLowerCase().includes(q) || f.cnpj.includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2 bg-card border border-border rounded-lg p-3">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground uppercase">Entradas de</label>
          <Input type="date" className="w-[150px]" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground uppercase">até</label>
          <Input type="date" className="w-[150px]" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground uppercase">Fornecedor(es)</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[240px] justify-start font-normal">
                {carregandoForn ? "Carregando..." : sel.length === 0 ? "Selecione" : `${sel.length} selecionado(s)`}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[340px] space-y-2">
              <Input placeholder="Buscar por nome ou CNPJ" value={buscaForn} onChange={(e) => setBuscaForn(e.target.value)} />
              <div className="max-h-[280px] overflow-auto space-y-1">
                {fornFiltrados.length === 0 && (
                  <p className="text-sm text-muted-foreground py-2">Nenhum fornecedor encontrado.</p>
                )}
                {fornFiltrados.slice(0, 300).map((f) => (
                  <label key={f.id} className="flex items-start gap-2 text-sm cursor-pointer py-0.5">
                    <Checkbox
                      checked={sel.includes(f.id)}
                      onCheckedChange={(v) => setSel((p) => (v ? [...p, f.id] : p.filter((x) => x !== f.id)))}
                    />
                    <span className="flex-1 leading-tight">
                      {f.nome}
                      {f.cnpj && <span className="block text-[10px] text-muted-foreground">{f.cnpj}</span>}
                    </span>
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <Button onClick={carregar} disabled={!storeId || sel.length === 0 || loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
          Carregar
        </Button>
        {linhas.length > 0 && (
          <Button variant="outline" onClick={exportar} className="ml-auto">
            <Download className="w-4 h-4 mr-1" /> Exportar Excel
          </Button>
        )}
      </div>

      {/* Chips dos fornecedores selecionados */}
      {sel.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sel.map((id) => {
            const f = fornecedores.find((x) => x.id === id);
            return (
              <Badge key={id} variant="secondary" className="gap-1">
                {f?.nome || id}
                <button onClick={() => setSel((p) => p.filter((x) => x !== id))} aria-label="Remover fornecedor">
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}

      {aviso && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <Info className="w-4 h-4 mt-0.5 shrink-0" /> <span>{aviso}</span>
        </div>
      )}

      {linhas.length > 0 && (
        <>
          {/* Filtros pós-carga */}
          <div className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg p-3">
            <span className="text-[11px] text-muted-foreground uppercase">Curva</span>
            {["A", "B", "C", "D"].map((c) => (
              <Badge
                key={c}
                variant={curvas.includes(c) ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setCurvas((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))}
              >
                {c}
              </Badge>
            ))}
            <Select value={depto} onValueChange={setDepto}>
              <SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os departamentos</SelectItem>
                {deptos.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">Margem abaixo de</span>
              <Input className="w-[80px]" value={margemMax} onChange={(e) => setMargemMax(e.target.value)} placeholder="%" />
            </div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox checked={soEstoque} onCheckedChange={(v) => setSoEstoque(!!v)} /> Só com estoque
            </label>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <Checkbox checked={soConcMaisBarato} onCheckedChange={(v) => setSoConcMaisBarato(!!v)} /> Só com concorrente mais barato
            </label>
            <div className="flex items-center gap-1.5 text-xs ml-auto">
              <span className="text-muted-foreground">Markup alvo</span>
              <Input className="w-[70px]" value={alvoMarkup} onChange={(e) => setAlvoMarkup(e.target.value)} />
              <span>%</span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{filtradas.length.toLocaleString("pt-BR")} produtos</span>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-muted-foreground">Margem sobre preço normal</span>
              <Switch checked={sobreOferta} onCheckedChange={setSobreOferta} aria-label="Margem sobre preço de oferta" />
              <span className="text-xs text-muted-foreground">de oferta</span>
            </div>
          </div>

          <div className="border border-border rounded-lg overflow-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead colSpan={5} className="text-center">Identificação</TableHead>
                  <TableHead colSpan={5} className="text-center bg-sky-50 dark:bg-sky-950/30 border-l border-border">Última entrada</TableHead>
                  <TableHead colSpan={5} className="text-center border-l border-border">Situação atual</TableHead>
                  <TableHead colSpan={3} className="text-center border-l border-border">Margem</TableHead>
                  {concCols.length > 0 && (
                    <TableHead colSpan={concCols.length} className="text-center border-l border-border">Concorrentes</TableHead>
                  )}
                  <TableHead colSpan={2} className="text-center border-l border-border">Ação</TableHead>
                </TableRow>
                <TableRow className="bg-muted/20">
                  <Th k="codigo">Cod</Th>
                  <Th k="ean">EAN</Th>
                  <Th k="descricao">Descrição</Th>
                  <Th k="secao">Depto</Th>
                  <Th k="abc" className="text-center">ABC</Th>
                  <Th k="fornecedor" className="border-l border-border text-[11px]">Fornecedor</Th>
                  <Th k="dataEntrada" className="text-[11px]">Data</Th>
                  <Th k="qtdEntrada" className="text-right text-[11px]">Qtd</Th>
                  <Th k="custoUnit" className="text-right text-[11px]">Custo unit.</Th>
                  <Th k="valorEntrada" className="text-right text-[11px]">Valor total</Th>
                  <Th k="precoAtual" className="text-right border-l border-border text-[11px]">Preço atual</Th>
                  <Th k="precoOferta" className="text-right text-[11px]">Preço oferta</Th>
                  <Th k="estoque" className="text-right text-[11px]">Estoque</Th>
                  <Th k="qtdVendida" className="text-right text-[11px]">Vend. qtd</Th>
                  <Th k="valorVendido" className="text-right text-[11px]">Vend. R$</Th>
                  <Th k="markup" className="text-right border-l border-border text-[11px] bg-blue-50 dark:bg-blue-950/30">
                    <Tooltip>
                      <TooltipTrigger asChild><span>Markup %</span></TooltipTrigger>
                      <TooltipContent className="max-w-[280px]">
                        Markup é quanto foi somado sobre o custo; Markdown é o quanto do preço final é lucro.
                        Um item com 50% de markup tem 33% de markdown.
                      </TooltipContent>
                    </Tooltip>
                  </Th>
                  <Th k="markdown" className="text-right text-[11px] bg-green-50 dark:bg-green-950/30">Markdown %</Th>
                  <Th k="margemRs" className="text-right text-[11px]">Margem R$</Th>
                  {concCols.map((c) => (
                    <TableHead key={c.id} className="text-right text-[11px] border-l border-border whitespace-nowrap">{c.nome}</TableHead>
                  ))}
                  <TableHead className="text-right text-[11px] border-l border-border">Sugestão</TableHead>
                  <TableHead className="text-[11px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtradas.slice(0, 400).map((l) => {
                  const chave = l.codigo || l.ean;
                  const sug = sugestao(l);
                  const mk = markup(l), md = markdown(l);
                  return (
                    <TableRow key={`${l.codigo}-${l.ean}-${l.fornecedor}`}>
                      <TableCell className="font-mono text-xs">{l.codigo}</TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">{l.ean || "—"}</TableCell>
                      <TableCell className="text-sm max-w-[260px] truncate" title={l.descricao}>{l.descricao}</TableCell>
                      <TableCell className="text-xs">{l.secao}</TableCell>
                      <TableCell className="text-center">
                        <Badge className={`text-[10px] ${corAbc(l.abc)}`} variant="secondary">{l.abc}</Badge>
                      </TableCell>
                      <TableCell className="text-xs border-l border-border bg-sky-50/60 dark:bg-sky-950/20 max-w-[160px] truncate" title={l.fornecedor}>{l.fornecedor || "—"}</TableCell>
                      <TableCell className="text-xs bg-sky-50/60 dark:bg-sky-950/20 whitespace-nowrap">
                        <Tooltip>
                          <TooltipTrigger asChild><span>{dataBR(l.dataEntrada)}</span></TooltipTrigger>
                          <TooltipContent>
                            {l.qtdEntradasPeriodo || 0} entradas no período, custo médio {brl(l.custoMedioPeriodo)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums bg-sky-50/60 dark:bg-sky-950/20">{l.qtdEntrada.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums bg-sky-50/60 dark:bg-sky-950/20">{brl(l.custoUnit)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums bg-sky-50/60 dark:bg-sky-950/20">{brl(l.valorEntrada)}</TableCell>
                      <TableCell className="text-right text-sm font-semibold tabular-nums border-l border-border">{brl(l.precoAtual)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{l.precoOferta ? brl(l.precoOferta) : "—"}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{l.estoque.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{l.qtdVendida.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{brl(l.valorVendido)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums border-l border-border bg-blue-50/60 dark:bg-blue-950/20">{pct(mk)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums bg-green-50/60 dark:bg-green-950/20">{pct(md)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{brl(margemRs(l))}</TableCell>
                      {concCols.map((c) => {
                        const p = l.concorrentes[c.id] ?? null;
                        const cor = p == null ? "" : p < precoBase(l) ? "text-destructive" : "text-green-600";
                        return (
                          <TableCell key={c.id} className={`text-right text-sm tabular-nums border-l border-border ${cor}`}>
                            {p == null ? "—" : brl(p)}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right text-sm tabular-nums border-l border-border font-semibold">
                        {aplicados[chave] ? brl(aplicados[chave]) : brl(sug)}
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant={aplicados[chave] ? "secondary" : "outline"} onClick={() => aplicar(l)}>
                          {aplicados[chave] ? "Aplicado" : "Aplicar"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {filtradas.length > 400 && (
            <p className="text-xs text-muted-foreground">Mostrando os 400 primeiros. Use os filtros ou exporte para ver tudo.</p>
          )}
        </>
      )}

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Variação muito grande</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar && (
                <>O preço de <strong>{confirmar.linha.descricao}</strong> mudaria de {brl(confirmar.linha.precoAtual)} para {brl(confirmar.preco)}. Confirma?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmar) aplicar(confirmar.linha, true); setConfirmar(null); }}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PorFornecedorTab;
