import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  Lightbulb,
  RefreshCw,
  Search,
} from "lucide-react";

import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { saveSelectedStore } from "@/lib/selectedStore";
import { salvarWorkbook } from "@/lib/exportBranding";
import {
  agruparSugestoes,
  contarPorCategoria,
  dataBaseMaisRecente,
  filtrarSugestoes,
  nomeAbaCategoria,
  normalizarBaseResumo,
  normalizarSugestao,
  ordenarSugestoes,
  resumoSugestoes,
  sugestaoParaExcel,
  type MixBaseResumo,
  type MixSortKey,
  type MixSugestao,
} from "@/lib/sugestaoMix";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface Store {
  id: string;
  name: string;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const numero = (valor: number, casas = 1) => valor.toLocaleString("pt-BR", {
  minimumFractionDigits: casas,
  maximumFractionDigits: casas,
});
const percentual = (valor: number, casas = 1) => `${numero(valor, casas)}%`;
const textoErro = (erro: { message?: string; code?: string } | null) => `${erro?.code ?? ""} ${erro?.message ?? ""}`;
const erroAcesso = (erro: { message?: string; code?: string } | null) =>
  /acesso restrito|administrador|permission denied|not authorized/i.test(textoErro(erro));

const SugestaoMix = () => {
  const { user, isGlobalAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [linhas, setLinhas] = useState<MixSugestao[] | null>(null);
  const [baseResumo, setBaseResumo] = useState<MixBaseResumo[] | null>(null);
  const [presencaMin, setPresencaMin] = useState(35);
  const [top, setTop] = useState(40);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [categorias, setCategorias] = useState<string[]>([]);
  const [situacao, setSituacao] = useState("todas");
  const [busca, setBusca] = useState("");
  const [soCurvaA3, setSoCurvaA3] = useState(false);
  const [sort, setSort] = useState<{ key: MixSortKey; dir: "asc" | "desc" }>({ key: "prioridade", dir: "asc" });
  const [recolhidas, setRecolhidas] = useState<Set<string>>(new Set());
  const [baseAberta, setBaseAberta] = useState(false);

  const consultaRef = useRef("");
  const sequenciaRef = useRef(0);
  const storeName = stores.find((s) => s.id === storeId)?.name ?? "";

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login?next=%2Fsugestao-mix");
      return;
    }
    if (!isGlobalAdmin) return;
    let ativo = true;
    supabase.from("stores").select("id, name").order("name").then(({ data, error }) => {
      if (!ativo) return;
      if (error) {
        setErro("Não foi possível carregar a lista de lojas.");
        return;
      }
      const lista = (data ?? []) as Store[];
      setStores(lista);
      const salva = sessionStorage.getItem("selectedStoreId");
      const selecionada = lista.find((s) => s.id === salva) ?? lista[0];
      if (selecionada) {
        setStoreId(selecionada.id);
        saveSelectedStore(selecionada.id);
      }
    });
    return () => { ativo = false; };
  }, [user, authLoading, isGlobalAdmin, navigate]);

  const buscar = async (forcar = false) => {
    if (!storeId || !isGlobalAdmin) return;
    const chave = `${storeId}|${presencaMin}|${top}`;
    if (!forcar && consultaRef.current === chave) return;
    consultaRef.current = chave;
    const sequencia = ++sequenciaRef.current;
    setLoading(true);
    setErro(null);

    const [sugestoes, resumo] = await Promise.all([
      (supabase as any).rpc("mix_sugestoes", { p_store_id: storeId, p_presenca_min: presencaMin, p_top: top }),
      (supabase as any).rpc("mix_base_resumo"),
    ]);
    if (sequencia !== sequenciaRef.current) return;

    if (erroAcesso(sugestoes.error) || erroAcesso(resumo.error)) {
      setLinhas([]);
      setBaseResumo([]);
      setErro("Disponível apenas para o administrador");
      setLoading(false);
      return;
    }

    if (sugestoes.error) {
      setLinhas([]);
      const detalhe = textoErro(sugestoes.error);
      setErro(/PGRST202|could not find the function|does not exist/i.test(detalhe)
        ? "A base da Sugestão de Mix ainda não está disponível. Aguarde a conclusão da instalação."
        : "Não foi possível carregar as sugestões salvas no Hub.");
    } else {
      setLinhas(((sugestoes.data ?? []) as Record<string, unknown>[]).map(normalizarSugestao));
    }

    if (resumo.error) {
      setBaseResumo([]);
      if (!sugestoes.error) setErro("As sugestões foram carregadas, mas o resumo das lojas da base está indisponível.");
    } else {
      setBaseResumo(((resumo.data ?? []) as Record<string, unknown>[]).map(normalizarBaseResumo));
    }
    setLoading(false);
  };

  // Abre uma vez e repete somente quando a loja muda. Os demais critérios entram ao clicar em Atualizar.
  useEffect(() => {
    void buscar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, isGlobalAdmin]);

  const categoriasDisponiveis = useMemo(
    () => Array.from(new Set((linhas ?? []).map((l) => l.categoria))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [linhas],
  );

  const filtradas = useMemo(
    () => filtrarSugestoes(linhas ?? [], { categorias, situacao, busca, soCurvaA3 }),
    [linhas, categorias, situacao, busca, soCurvaA3],
  );
  const totais = useMemo(() => resumoSugestoes(filtradas), [filtradas]);
  const distribuicao = useMemo(() => contarPorCategoria(filtradas), [filtradas]);
  const grupos = useMemo(
    () => agruparSugestoes(filtradas).map(([categoria, itens]) => [categoria, ordenarSugestoes(itens, sort.key, sort.dir)] as [string, MixSugestao[]]),
    [filtradas, sort],
  );
  const dataBase = useMemo(() => dataBaseMaisRecente(baseResumo ?? []), [baseResumo]);
  const lojaNaBase = baseResumo?.some((b) => b.store_id === storeId) ?? true;
  const quantidadeLojasBase = useMemo(() => {
    const informada = linhas?.find((l) => l.lojas_base > 0)?.lojas_base;
    if (informada) return informada;
    return (baseResumo ?? []).filter((b) => b.store_id !== storeId && b.dias >= 30).length;
  }, [linhas, baseResumo, storeId]);

  const alterarLoja = (id: string) => {
    saveSelectedStore(id);
    sequenciaRef.current += 1;
    consultaRef.current = "";
    setStoreId(id);
    setLinhas(null);
    setBaseResumo(null);
    setCategorias([]);
    setRecolhidas(new Set());
    setErro(null);
  };

  const alternarCategoria = (categoria: string) => {
    setCategorias((atual) => atual.includes(categoria)
      ? atual.filter((c) => c !== categoria)
      : [...atual, categoria]);
  };

  const alternarRecolhida = (categoria: string) => {
    setRecolhidas((atual) => {
      const novo = new Set(atual);
      if (novo.has(categoria)) novo.delete(categoria);
      else novo.add(categoria);
      return novo;
    });
  };

  const ordenar = (key: MixSortKey) => {
    setSort((atual) => ({
      key,
      dir: atual.key === key
        ? atual.dir === "asc" ? "desc" : "asc"
        : key === "prioridade" || ["grupo", "ean", "descricao", "situacao"].includes(key) ? "asc" : "desc",
    }));
  };

  const cabecalho = (key: MixSortKey, label: string, dica?: string, direita = false) => (
    <th className={`px-3 py-2 font-medium whitespace-nowrap ${direita ? "text-right" : "text-left"}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => ordenar(key)}
            className={`inline-flex items-center gap-1 hover:text-foreground ${direita ? "justify-end w-full" : ""}`}
            aria-label={`Ordenar por ${label}`}
          >
            {label}
            {sort.key === key && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
          </button>
        </TooltipTrigger>
        {dica && <TooltipContent className="max-w-xs">{dica}</TooltipContent>}
      </Tooltip>
    </th>
  );

  const exportar = () => {
    if (!filtradas.length) return;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtradas.map(sugestaoParaExcel)), "Sugestões");
    const usados = new Set(["sugestões", "critérios"]);
    if (grupos.length > 1) {
      for (const [categoria, itens] of grupos) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itens.map(sugestaoParaExcel)), nomeAbaCategoria(categoria, usados));
      }
    }
    const criterios: Array<[string, string | number]> = [
      ["Indicador", "Valor / explicação"],
      ["Loja", storeName],
      ["Data da base", dataBase ? format(new Date(dataBase), "dd/MM/yyyy HH:mm") : "—"],
      ["Presença mínima", `${presencaMin}%`],
      ["Itens por categoria", top],
      ["Quantidade de lojas da base", quantidadeLojasBase],
      ["Prioridade", "Ordem dentro da categoria: Curva A/B, presença e venda média."],
      ["Presença", "Percentual das lojas da base que vendem o produto."],
      ["Curva A", "Em quantas lojas o item está entre os que somam os primeiros 45% da venda da seção."],
      ["Curva A/B", "Em quantas lojas o item está entre os que somam os primeiros 70% da venda da seção."],
      ["Venda/mês por loja", "Média mensal das lojas que vendem; referência, não previsão."],
      ["Unid./mês por loja", "Volume mensal médio nas lojas que vendem."],
      ["Preço médio", "Venda total dividida pelo volume total nas lojas que vendem."],
      ["Margem %", "Lucro sobre a venda, calculado somente onde há lucro informado."],
      ["Part. na seção %", "Participação média do item na venda da seção."],
      ["Situação", "Não cadastrado ou cadastrado sem venda na loja analisada."],
      ["Venda potencial/mês", "Soma das médias das sugestões filtradas; referência, não previsão."],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(criterios), "Critérios");
    salvarWorkbook(wb, `sugestao-mix-${storeName || "loja"}`);
  };

  if (authLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><Skeleton className="h-8 w-56" /></div>;
  }

  if (!isGlobalAdmin) {
    return (
      <ClientLayout>
        <div className="min-h-[60vh] flex items-center justify-center p-6 text-sm text-muted-foreground">
          Disponível apenas para o administrador
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary"><Lightbulb className="h-5 w-5" /></div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Sugestão de Mix</h1>
              <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
                Produtos que a loja não vende e que são fortes nas demais lojas do Hub (últimos 12 meses, por código de barras)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs text-muted-foreground mr-2">
              Base atualizada em <span className="font-medium text-foreground">{dataBase ? format(new Date(dataBase), "dd/MM/yyyy 'às' HH:mm") : "—"}</span>
            </div>
            <Button variant="outline" onClick={exportar} disabled={!filtradas.length || loading} className="gap-2">
              <Download className="h-4 w-4" /> Exportar Excel
            </Button>
            <Button onClick={() => void buscar(true)} disabled={!storeId || loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
        </div>

        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Loja</label>
              <Select value={storeId} onValueChange={alterarLoja} disabled={!stores.length || loading}>
                <SelectTrigger className="w-[240px]"><SelectValue placeholder="Selecione a loja" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {stores.map((store) => <SelectItem key={store.id} value={store.id}>{store.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Presença mínima</label>
              <Select value={String(presencaMin)} onValueChange={(v) => setPresencaMin(Number(v))}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {[25, 35, 50, 70].map((v) => <SelectItem key={v} value={String(v)}>{v}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Itens por categoria</label>
              <Select value={String(top)} onValueChange={(v) => setTop(Number(v))}>
                <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {[20, 40, 80].map((v) => <SelectItem key={v} value={String(v)}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground pb-2">Presença e quantidade são aplicadas ao clicar em Atualizar.</p>
          </div>

          <div className="border-t border-border pt-4 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Categorias</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[240px] justify-between font-normal">
                    <span className="truncate">{categorias.length ? `${categorias.length} selecionada(s)` : "Todas as categorias"}</span>
                    <ChevronDown className="h-4 w-4 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2 bg-popover" align="start">
                  <div className="flex items-center justify-between px-2 pb-2 border-b border-border">
                    <span className="text-xs font-medium">Filtrar em memória</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCategorias([])}>Limpar</Button>
                  </div>
                  <div className="max-h-64 overflow-y-auto pt-1">
                    {categoriasDisponiveis.map((categoria) => (
                      <label key={categoria} className="flex items-center gap-2 rounded px-2 py-2 text-xs hover:bg-muted/50 cursor-pointer">
                        <Checkbox checked={categorias.includes(categoria)} onCheckedChange={() => alternarCategoria(categoria)} />
                        <span className="flex-1">{categoria}</span>
                        {categorias.includes(categoria) && <Check className="h-3 w-3 text-primary" />}
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Situação</label>
              <Select value={situacao} onValueChange={setSituacao}>
                <SelectTrigger className="w-[210px]"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="todas">Todas as situações</SelectItem>
                  <SelectItem value="Não cadastrado">Não cadastrado</SelectItem>
                  <SelectItem value="Cadastrado, sem venda">Cadastrado, sem venda</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[220px] max-w-md">
              <label className="text-xs text-muted-foreground">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Descrição ou EAN" className="pl-8" />
              </div>
            </div>
            <div className="flex items-center gap-2 h-10">
              <Switch checked={soCurvaA3} onCheckedChange={setSoCurvaA3} id="curva-a-3" />
              <label htmlFor="curva-a-3" className="text-xs cursor-pointer">Só curva A em 3+ lojas</label>
            </div>
          </div>
        </Card>

        {erro && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        {!loading && linhas !== null && baseResumo !== null && !lojaNaBase && (
          <Alert>
            <Database className="h-4 w-4" />
            <AlertDescription>Esta loja ainda não tem venda por produto salva no Hub — rode a sincronização e aguarde a próxima carga da base.</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {[
            { titulo: "Produtos sugeridos", valor: numero(totais.total, 0), legenda: "linhas com os filtros atuais" },
            { titulo: "Não cadastrados", valor: numero(totais.naoCadastrados, 0), legenda: "produtos fora do cadastro da loja" },
            { titulo: "Cadastrados sem venda", valor: numero(totais.cadastradosSemVenda, 0), legenda: "cadastro existe, mas não houve venda" },
            { titulo: "Venda potencial/mês", valor: brl.format(totais.vendaPotencial), legenda: "média das lojas que vendem — referência, não previsão" },
          ].map((card) => (
            <Card key={card.titulo} className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{card.titulo}</div>
              {loading && linhas === null ? <Skeleton className="h-7 w-28 mt-2" /> : <div className="text-xl font-bold mt-1 tabular-nums">{card.valor}</div>}
              <div className="text-[11px] text-muted-foreground mt-1">{card.legenda}</div>
            </Card>
          ))}
        </div>

        {loading && linhas === null ? (
          <Card className="p-4 space-y-3">
            <Skeleton className="h-5 w-56" />
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
          </Card>
        ) : filtradas.length > 0 && (
          <Card className="p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold">Sugestões por categoria</h2>
              <p className="text-[11px] text-muted-foreground">Quantidade de produtos com os filtros atuais</p>
            </div>
            <div className="space-y-2">
              {distribuicao.map(({ categoria, quantidade }) => (
                <button
                  key={categoria}
                  type="button"
                  onClick={() => alternarCategoria(categoria)}
                  className="w-full grid grid-cols-[minmax(110px,220px)_minmax(80px,1fr)_48px] items-center gap-3 rounded px-1 py-1 hover:bg-muted/30 text-left"
                  title={`Filtrar somente ${categoria}`}
                >
                  <span className="text-xs truncate">{categoria}</span>
                  <span className="h-4 rounded-sm bg-muted overflow-hidden">
                    <span className="block h-full rounded-sm bg-primary" style={{ width: `${Math.max(2, quantidade / Math.max(...distribuicao.map((d) => d.quantidade)) * 100)}%` }} />
                  </span>
                  <span className="text-xs font-semibold text-right tabular-nums">{quantidade}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {!loading && linhas !== null && filtradas.length === 0 && !erro && (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma sugestão com os critérios atuais. Reduza a presença mínima.
          </Card>
        )}

        {grupos.map(([categoria, itens]) => (
          <Collapsible key={categoria} open={!recolhidas.has(categoria)} onOpenChange={() => alternarRecolhida(categoria)}>
            <Card className="overflow-hidden">
              <CollapsibleTrigger asChild>
                <button type="button" className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/50 text-left">
                  <span className="flex items-center gap-2 min-w-0">
                    {recolhidas.has(categoria) ? <ChevronRight className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
                    <span className="text-sm font-semibold truncate">{categoria}</span>
                  </span>
                  <Badge variant="secondary">{itens.length} {itens.length === 1 ? "sugestão" : "sugestões"}</Badge>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-t border-border">
                    <thead className="bg-muted/20 text-muted-foreground">
                      <tr>
                        {cabecalho("prioridade", "#")}
                        {cabecalho("grupo", "Grupo")}
                        {cabecalho("ean", "EAN")}
                        {cabecalho("descricao", "Descrição")}
                        {cabecalho("situacao", "Situação")}
                        {cabecalho("presenca_pct", "Presença")}
                        {cabecalho("lojas_curva_a", "Curva A", "Em quantas lojas o item está entre os que somam os primeiros 45% da venda da seção", true)}
                        {cabecalho("lojas_curva_ab", "Curva A/B", "Em quantas lojas o item está entre os que somam os primeiros 70% da venda da seção", true)}
                        {cabecalho("venda_mes_loja", "Venda/mês por loja", undefined, true)}
                        {cabecalho("unid_mes_loja", "Unid./mês por loja", undefined, true)}
                        {cabecalho("preco_medio", "Preço médio", undefined, true)}
                        {cabecalho("margem_pct", "Margem %", undefined, true)}
                        {cabecalho("part_secao_pct", "Part. na seção %", undefined, true)}
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((linha) => (
                        <tr key={`${categoria}-${linha.ean}`} className="border-t border-border hover:bg-muted/20">
                          <td className="px-3 py-2 font-semibold">{linha.prioridade}</td>
                          <td className="px-3 py-2 min-w-[120px]">{linha.grupo || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]">{linha.ean}</td>
                          <td className="px-3 py-2 min-w-[240px] max-w-[360px]">{linha.descricao}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Badge variant="outline" className={linha.situacao === "Não cadastrado" ? "bg-muted text-muted-foreground" : "border-warning/40 bg-warning/10 text-warning"}>
                              {linha.situacao}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 min-w-[150px]">
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span>{linha.lojas_vendem}/{linha.lojas_base}</span>
                              <span className="font-medium">{percentual(linha.presenca_pct, 0)}</span>
                            </div>
                            <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Math.max(0, linha.presenca_pct))}%` }} />
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{linha.lojas_curva_a} lojas</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{linha.lojas_curva_ab} lojas</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{brl.format(linha.venda_mes_loja)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{numero(linha.unid_mes_loja)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{brl.format(linha.preco_medio)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{linha.margem_pct === null ? "—" : percentual(linha.margem_pct)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">{percentual(linha.part_secao_pct, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}

        <Collapsible open={baseAberta} onOpenChange={setBaseAberta}>
          <Card className="overflow-hidden">
            <CollapsibleTrigger asChild>
              <button type="button" className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 text-left">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {baseAberta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Lojas da base
                </span>
                <Badge variant="outline">{baseResumo?.length ?? 0} lojas</Badge>
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="overflow-x-auto border-t border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Loja</th>
                      <th className="px-4 py-2 text-right font-medium">Dias de venda salvos</th>
                      <th className="px-4 py-2 text-right font-medium">Itens com EAN</th>
                      <th className="px-4 py-2 text-right font-medium">Venda no período</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(baseResumo ?? []).map((loja) => (
                      <tr key={loja.store_id} className={`border-t border-border ${loja.store_id === storeId ? "bg-primary/5" : ""}`}>
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{loja.loja}</span>
                            {loja.store_id === storeId && <Badge variant="secondary">loja analisada</Badge>}
                            {loja.dias < 30 && <Badge variant="outline" className="border-warning/40 text-warning">fora da base (menos de 30 dias)</Badge>}
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">{loja.dias}</td>
                        <td className="px-4 py-2 text-right">{numero(loja.eans, 0)}</td>
                        <td className="px-4 py-2 text-right font-medium">{brl.format(loja.vendas)}</td>
                      </tr>
                    ))}
                    {baseResumo !== null && baseResumo.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nenhuma loja carregada na base.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </ClientLayout>
  );
};

export default SugestaoMix;
