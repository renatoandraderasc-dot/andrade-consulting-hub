import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Check, Info, Search, Undo2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { useGestaoProdutos } from "@/hooks/useGestaoProdutos";
import { carregarLojasPermitidas, type LojaSimples } from "@/lib/lojasPermitidas";
import { saveSelectedStore } from "@/lib/selectedStore";
import { pendenciasGestao, type ProdutoGestao } from "@/lib/gestaoProdutos";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Ciente = Tables<"produtos_gestao_cientes">;
const PAGE_SIZE = 50;
const volume = (v: number | null) => v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const normalizar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function GestaoProdutos() {
  const { user, isGlobalAdmin } = useAuth();
  const { permiteDept, loading: loadingDept } = useDepartamentosPermitidos();
  const [lojas, setLojas] = useState<LojaSimples[]>([]);
  const [storeId, setStoreId] = useState("");
  const [mes, setMes] = useState(() => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7));
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("todas");
  const [tipo, setTipo] = useState("todos");
  const [aba, setAba] = useState("pendentes");
  const [salvando, setSalvando] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [ano, numeroMes] = mes.split("-").map(Number);
  const dados = useGestaoProdutos(storeId, ano, numeroMes);
  const queryClient = useQueryClient();
  const mesData = `${mes}-01`;
  const queryKey = ["gestao-produtos-cientes", user?.id, storeId, mesData];
  const cientes = useQuery({
    queryKey, enabled: !!storeId && !!user,
    queryFn: async () => {
      const lista: Ciente[] = [];
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error } = await supabase.from("produtos_gestao_cientes").select("*").eq("store_id", storeId).eq("mes", mesData).order("id").range(inicio, inicio + 999);
        if (error) throw error;
        lista.push(...data);
        if (data.length < 1000) return lista;
      }
    },
  });

  useEffect(() => {
    let ativo = true;
    void carregarLojasPermitidas(user?.id, isGlobalAdmin).then((lista) => {
      if (!ativo) return;
      setLojas(lista);
      const sid = sessionStorage.getItem("selectedStoreId");
      setStoreId(lista.find((l) => l.id === sid)?.id ?? lista[0]?.id ?? "");
    });
    return () => { ativo = false; };
  }, [user?.id, isGlobalAdmin]);

  useEffect(() => { setPagina(1); }, [busca, categoria, tipo, aba, storeId, mes]);
  const permitidos = dados.produtos.filter((p) => !loadingDept && permiteDept(p.categoria));
  const marcados = (cientes.data ?? []).filter((p) => !loadingDept && permiteDept(p.categoria));
  const pendentes = pendenciasGestao(permitidos, marcados, storeId, mesData);
  const categorias = [...new Set([...permitidos, ...marcados].map((p) => p.categoria))].sort();
  const linhas = aba === "pendentes" ? pendentes : marcados.map((p) => ({ ...p, chave: p.produto_chave, produto: p.descricao, atualVol: null, mediaVol: null, queda: null, estoque: null }));
  const filtradas = linhas.filter((p) => (categoria === "todas" || p.categoria === categoria) && (tipo === "todos" || p.tipo === tipo) && (!busca.trim() || normalizar([p.produto, p.codigo, p.ean].join(" ")).includes(normalizar(busca.trim()))));
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaAtual - 1) * PAGE_SIZE, paginaAtual * PAGE_SIZE);
  const pronto = !dados.loading && !dados.erro && dados.nivelProduto && !loadingDept && !cientes.isPending && !cientes.error;
  const carregando = aba === "pendentes" ? dados.loading || cientes.isPending || loadingDept : cientes.isPending || loadingDept;
  const podeExibir = aba === "cientes" ? cientes.isSuccess && !loadingDept : pronto;
  const semBase = aba === "pendentes" && !dados.loading && !dados.erro && !dados.nivelProduto;

  async function marcar(p: ProdutoGestao) {
    if (!user || !pronto || salvando) return;
    setSalvando(p.chave);
    const chaveConsulta = [...queryKey];
    try {
      const { error } = await supabase.from("produtos_gestao_cientes").insert({ store_id: storeId, mes: mesData, produto_chave: p.chave, codigo: p.codigo, ean: p.ean, descricao: p.produto, categoria: p.categoria, tipo: p.tipo, user_id: user.id });
      if (error && error.code !== "23505") throw error;
      await queryClient.invalidateQueries({ queryKey: chaveConsulta });
      toast.success("Ciente registrado neste mês.");
    } catch { toast.error("Não foi possível salvar a ciência. O produto continua pendente."); }
    finally { setSalvando(null); }
  }

  async function desfazer(chave: string) {
    if (!user || salvando) return;
    setSalvando(chave);
    const chaveConsulta = [...queryKey];
    try {
      const { error } = await supabase.from("produtos_gestao_cientes").delete().eq("store_id", storeId).eq("mes", mesData).eq("produto_chave", chave);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: chaveConsulta });
      toast.success("Ciência desfeita.");
    } catch { toast.error("Não foi possível desfazer a ciência."); }
    finally { setSalvando(null); }
  }

  return (
    <ClientLayout storeName={lojas.find((l) => l.id === storeId)?.name}>
      <div className="w-full mx-auto space-y-4 p-3 sm:p-4 md:p-6">
        <div className="flex items-center gap-2">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Gestão Produtos sem giro e em queda</h1>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground" aria-label="Como é calculado">
                <Info className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Volume do dia 1 ao dia {Number(dados.fim.slice(-2))} comparado com os mesmos dias dos 3 meses anteriores.
              Ao marcar Ciente, o produto sai das pendências somente neste mês.
            </TooltipContent>
          </Tooltip>
        </div>

        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[auto_auto_auto_minmax(240px,1fr)] xl:items-end">
            {lojas.length > 1 && (
              <div className="min-w-0 space-y-1">
                <label className="text-xs text-muted-foreground">Loja</label>
                <Select value={storeId} onValueChange={(id) => { setStoreId(id); setCategoria("todas"); saveSelectedStore(id); }}>
                  <SelectTrigger className="w-full xl:w-[220px]" aria-label="Loja"><SelectValue placeholder="Loja" /></SelectTrigger>
                  <SelectContent className="bg-popover">{lojas.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            <div className="min-w-0 space-y-1">
              <label className="text-xs text-muted-foreground">Mês</label>
              <Input
                type="month"
                aria-label="Mês"
                className="w-full xl:w-[180px]"
                value={mes}
                disabled={!!salvando}
                onChange={(e) => {
                  if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                    setMes(e.target.value);
                    setCategoria("todas");
                  }
                }}
              />
            </div>

            <Button className="w-full sm:w-auto" disabled={!storeId || dados.loading || !!salvando} onClick={() => { void dados.refresh(); void cientes.refetch(); }}>
              <RefreshCw className="w-4 h-4 mr-2" />Atualizar
            </Button>

            <div className="min-w-0 space-y-1">
              <label className="text-xs text-muted-foreground">Buscar</label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-8" aria-label="Buscar produto" placeholder="Código, descrição ou EAN" value={busca} onChange={(e) => setBusca(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[220px_220px_1fr] xl:items-end">
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Categoria</div>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger className="h-8 w-full text-xs" aria-label="Categoria"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="todas">Todas as categorias</SelectItem>
                  {categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Situação</div>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="h-8 w-full text-xs" aria-label="Situação"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="todos">Todas as situações</SelectItem>
                  <SelectItem value="sem_giro">Sem giro</SelectItem>
                  <SelectItem value="em_queda">Em queda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 sm:col-span-2 xl:col-span-1 xl:justify-self-end">
              <div className="text-xs text-muted-foreground">Exibir</div>
              <Tabs value={aba} onValueChange={setAba}>
                <TabsList className="h-8">
                  <TabsTrigger value="pendentes">Pendentes</TabsTrigger>
                  <TabsTrigger value="cientes">Cientes do mês</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
        </Card>

        {(dados.erro || cientes.error) && (
          <Card className="p-4 text-sm text-muted-foreground flex flex-wrap items-center gap-2" role="alert">
            <Info className="w-4 h-4 text-destructive" />
            <span>{dados.erro ? `Não foi possível concluir a análise: ${dados.erro}` : "Não foi possível carregar as marcações deste mês."}</span>
            {cientes.error && <Button variant="link" className="h-auto p-0" onClick={() => void cientes.refetch()}>Tentar novamente</Button>}
          </Card>
        )}

        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
          {[
            { label: "Sem giro pendentes", valor: pronto ? pendentes.filter((p) => p.tipo === "sem_giro").length : "—" },
            { label: "Em queda pendentes", valor: pronto ? pendentes.filter((p) => p.tipo === "em_queda").length : "—" },
            { label: "Cientes no mês", valor: cientes.isSuccess ? marcados.length : "—" },
          ].map((c) => (
            <Card key={c.label} className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.label}</div>
              <div className="mt-1 break-words text-lg font-bold text-foreground md:text-xl">{c.valor}</div>
            </Card>
          ))}
        </div>

        <Card className="overflow-hidden">
          {carregando ? (
            <div className="p-4 space-y-2">
              <p className="text-sm text-muted-foreground">Analisando produtos…</p>
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : semBase ? (
            <div className="p-10 text-center text-muted-foreground text-sm">Sem dados de produtos disponíveis para esta loja e período.</div>
          ) : !podeExibir ? (
            <div className="p-10 text-center text-muted-foreground text-sm">Não foi possível exibir os produtos. Tente atualizar.</div>
          ) : !filtradas.length ? (
            <div className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <CheckCheck className="w-6 h-6 text-success" />
              {aba === "cientes" ? "Nenhum produto ciente neste filtro." : "Nenhum produto pendente neste filtro."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-left">Cód.</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-left">Descrição</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-left">EAN</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-left">Categoria</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-left">Situação</th>
                    {aba === "pendentes" ? (
                      <>
                        <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Vol. atual</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Média 3 meses</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Queda</th>
                        <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Estoque</th>
                      </>
                    ) : <th className="px-3 py-2 font-medium whitespace-nowrap text-left">Ciência em</th>}
                    <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => (
                    <tr key={p.chave} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 whitespace-nowrap">{p.codigo || "—"}</td>
                      <td className="px-3 py-2 min-w-[220px] font-medium">{p.produto}</td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{p.ean || "—"}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{p.categoria}</td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className={p.tipo === "sem_giro" ? "text-warning border-warning/30 whitespace-nowrap" : "text-destructive border-destructive/30 whitespace-nowrap"}>
                          {p.tipo === "sem_giro" ? "Sem giro" : "Em queda"}
                        </Badge>
                      </td>
                      {aba === "pendentes" ? (
                        <>
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{volume(p.atualVol)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{volume(p.mediaVol)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-destructive">{volume(p.queda)}%</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{volume(p.estoque)}</td>
                        </>
                      ) : <td className="px-3 py-2 whitespace-nowrap">{"created_at" in p ? new Date(p.created_at).toLocaleString("pt-BR") : "—"}</td>}
                      <td className="px-3 py-2 text-right whitespace-nowrap">{acao(p)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {podeExibir && filtradas.length > PAGE_SIZE && (
            <div className="flex flex-col gap-3 border-t border-border p-3 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span className="text-muted-foreground">Página {paginaAtual} de {totalPaginas} — {filtradas.length} produtos</span>
              <div className="grid grid-cols-2 gap-2">
                <Button className="w-full" size="sm" variant="outline" disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>Anterior</Button>
                <Button className="w-full" size="sm" variant="outline" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>Próxima</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </ClientLayout>
  );

  function acao(p: typeof linhas[number]) {
    return aba === "pendentes" ? <Button size="sm" variant="outline" disabled={!!salvando || !pronto} onClick={() => { const item = pendentes.find((i) => i.chave === p.chave); if (item) void marcar(item); }}><Check className="w-4 h-4 mr-2" />{salvando === p.chave ? "Salvando…" : "Ciente"}</Button> : <Button size="sm" variant="ghost" disabled={!!salvando} onClick={() => void desfazer(p.chave)}><Undo2 className="w-4 h-4 mr-2" />Desfazer</Button>;
  }
}
