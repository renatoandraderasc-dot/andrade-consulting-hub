import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Check, PackageX, Search, TrendingDown, Undo2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useDepartamentosPermitidos } from "@/hooks/useDepartamentosPermitidos";
import { useGestaoProdutos } from "@/hooks/useGestaoProdutos";
import { carregarLojasPermitidas, type LojaSimples } from "@/lib/lojasPermitidas";
import { saveSelectedStore } from "@/lib/selectedStore";
import { pendenciasGestao, type ProdutoGestao } from "@/lib/gestaoProdutos";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type Ciente = Tables<"produtos_gestao_cientes">;
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
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / 50));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = filtradas.slice((paginaAtual - 1) * 50, paginaAtual * 50);
  const pronto = !dados.loading && !dados.erro && dados.nivelProduto && !loadingDept && !cientes.isPending && !cientes.error;

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

  return <ClientLayout storeName={lojas.find((l) => l.id === storeId)?.name}>
    <div className="space-y-5">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="font-heading text-2xl font-bold flex items-start gap-3"><CheckCheck className="w-6 h-6 shrink-0 mt-1 text-primary" />Gestão Produtos sem giro e em queda</h1>
        <Button variant="outline" disabled={!storeId || dados.loading || !!salvando} onClick={() => { void dados.refresh(); void cientes.refetch(); }}><RefreshCw className="w-4 h-4 mr-2" />Atualizar</Button>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={storeId} onValueChange={(id) => { setStoreId(id); setCategoria("todas"); saveSelectedStore(id); }}><SelectTrigger aria-label="Loja"><SelectValue placeholder="Loja" /></SelectTrigger><SelectContent>{lojas.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent></Select>
        <Input type="month" aria-label="Mês" value={mes} disabled={!!salvando} onChange={(e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { setMes(e.target.value); setCategoria("todas"); } }} />
        <Select value={categoria} onValueChange={setCategoria}><SelectTrigger aria-label="Categoria"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todas">Todas as categorias</SelectItem>{categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
        <Select value={tipo} onValueChange={setTipo}><SelectTrigger aria-label="Situação"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todas as situações</SelectItem><SelectItem value="sem_giro">Sem giro</SelectItem><SelectItem value="em_queda">Em queda</SelectItem></SelectContent></Select>
        <div className="relative"><Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" /><Input className="pl-9" aria-label="Buscar produto" placeholder="Descrição, código ou EAN" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
      </div>
      <div className="flex flex-wrap gap-6 border-y border-border py-4 text-sm">
        <span className="flex items-center gap-2"><PackageX className="w-4 h-4 text-warning" /><strong>{pronto ? pendentes.filter((p) => p.tipo === "sem_giro").length : "—"}</strong> sem giro pendentes</span>
        <span className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-destructive" /><strong>{pronto ? pendentes.filter((p) => p.tipo === "em_queda").length : "—"}</strong> em queda pendentes</span>
        <span className="flex items-center gap-2"><CheckCheck className="w-4 h-4 text-success" /><strong>{cientes.isSuccess ? marcados.length : "—"}</strong> cientes no mês</span>
      </div>
      <Tabs value={aba} onValueChange={setAba}><TabsList><TabsTrigger value="pendentes">Pendentes</TabsTrigger><TabsTrigger value="cientes">Cientes do mês</TabsTrigger></TabsList></Tabs>
      {cientes.error && <div role="alert" className="text-destructive text-sm">Não foi possível carregar as marcações deste mês.<Button variant="link" onClick={() => void cientes.refetch()}>Tentar novamente</Button></div>}
      {aba === "pendentes" && <>
        <p className="text-sm text-muted-foreground">Volume do dia 1 ao dia {Number(dados.fim.slice(-2))} vs. os mesmos dias dos 3 meses anteriores</p>
        {dados.erro ? <p role="alert" className="text-destructive text-sm">Não foi possível concluir a análise: {dados.erro}</p> : dados.loading || cientes.isPending || loadingDept ? <p className="text-muted-foreground py-8">Analisando produtos…</p> : !dados.nivelProduto ? <p className="text-muted-foreground py-8">Sem dados de produtos disponíveis para esta loja e período.</p> : null}
      </>}
      {(aba === "cientes" ? cientes.isSuccess : pronto) && <>
        {!filtradas.length ? <div className="py-10 text-center text-muted-foreground"><CheckCheck className="w-8 h-8 mx-auto mb-3 text-success" />{aba === "cientes" ? "Nenhum produto ciente neste filtro." : "Nenhum produto pendente neste filtro."}</div> : <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="border-b border-border text-muted-foreground text-left"><th className="py-3 pr-4">Produto / EAN</th><th className="pr-4">Categoria</th><th className="pr-4">Situação</th>{aba === "pendentes" ? <><th className="text-right pr-4">Vol. atual</th><th className="text-right pr-4">Média 3 meses</th><th className="text-right pr-4">Queda</th><th className="text-right pr-4">Estoque</th></> : <th className="pr-4">Ciência em</th>}<th className="text-right">Ação</th></tr></thead><tbody>
              {visiveis.map((p) => <tr key={p.chave} className="border-b border-border hover:bg-muted/30"><td className="py-3 pr-4 min-w-56"><div className="font-medium">{p.produto}</div><div className="text-xs text-muted-foreground mt-1">Cód. {p.codigo || "—"} · {p.ean || "—"}</div></td><td className="pr-4">{p.categoria}</td><td className="pr-4"><Badge variant="outline" className={p.tipo === "sem_giro" ? "text-warning border-warning/30 whitespace-nowrap" : "text-destructive border-destructive/30 whitespace-nowrap"}>{p.tipo === "sem_giro" ? "Sem giro" : "Em queda"}</Badge></td>{aba === "pendentes" ? <><td className="text-right pr-4 tabular-nums">{volume(p.atualVol)}</td><td className="text-right pr-4 tabular-nums">{volume(p.mediaVol)}</td><td className="text-right pr-4 tabular-nums text-destructive">{volume(p.queda)}%</td><td className="text-right pr-4 tabular-nums">{volume(p.estoque)}</td></> : <td className="pr-4 whitespace-nowrap">{"created_at" in p ? new Date(p.created_at).toLocaleString("pt-BR") : "—"}</td>}<td className="text-right">{acao(p)}</td></tr>)}
            </tbody></table>
          </div>
          <div className="md:hidden divide-y divide-border">{visiveis.map((p) => <article key={p.chave} className="py-4 space-y-2"><h2 className="font-semibold break-words">{p.produto}</h2><p className="text-xs text-muted-foreground break-all">Cód. {p.codigo || "—"} · EAN {p.ean || "—"}</p><p className="text-sm text-muted-foreground">{p.categoria} · {p.tipo === "sem_giro" ? "Sem giro" : "Em queda"}</p>{aba === "pendentes" ? <dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-muted-foreground">Vol. atual</dt><dd>{volume(p.atualVol)}</dd></div><div><dt className="text-muted-foreground">Média 3 meses</dt><dd>{volume(p.mediaVol)}</dd></div><div><dt className="text-muted-foreground">Queda</dt><dd className="text-destructive">{volume(p.queda)}%</dd></div><div><dt className="text-muted-foreground">Estoque</dt><dd>{volume(p.estoque)}</dd></div></dl> : <p className="text-xs text-muted-foreground">{"created_at" in p ? new Date(p.created_at).toLocaleString("pt-BR") : ""}</p>}{acao(p)}</article>)}</div>
          <div className="flex items-center justify-between gap-3 text-sm"><span>{filtradas.length} produtos · {paginaAtual}/{totalPaginas}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>Próxima</Button></div></div>
        </>}
      </>}
    </div>
  </ClientLayout>;

  function acao(p: typeof linhas[number]) {
    return aba === "pendentes" ? <Button size="sm" variant="outline" disabled={!!salvando || !pronto} onClick={() => { const item = pendentes.find((i) => i.chave === p.chave); if (item) void marcar(item); }}><Check className="w-4 h-4 mr-2" />{salvando === p.chave ? "Salvando…" : "Ciente"}</Button> : <Button size="sm" variant="ghost" disabled={!!salvando} onClick={() => void desfazer(p.chave)}><Undo2 className="w-4 h-4 mr-2" />Desfazer</Button>;
  }
}