import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Info, Loader2, Search, Store as StoreIcon } from "lucide-react";
import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, pick as col, num } from "@/lib/vrReport";
import { carregarBaseCatalogo } from "@/lib/catalogoProdutos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import PricingTable from "@/components/pricing/PricingTable";
import { eanUtilizavel, type ConcorrenteInfo, type PricingRow } from "@/components/pricing/pricingTypes";

interface Store { id: string; name: string }

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pctFmt = (v: number) => (isFinite(v) ? `${v.toFixed(1)}%` : "—");

const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

type Estado = "inicial" | "sem_concorrente" | "sem_coleta" | "sem_vinculo" | "ok";

const Pricing = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [concorrentes, setConcorrentes] = useState<ConcorrenteInfo[]>([]);
  const [selConc, setSelConc] = useState<string[]>([]);
  const [merc, setMerc] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [dias, setDias] = useState("90");

  const [loading, setLoading] = useState(false);
  const [estado, setEstado] = useState<Estado>("inicial");
  const [rowsBase, setRowsBase] = useState<PricingRow[]>([]);
  const [totalCatalogo, setTotalCatalogo] = useState(0);
  const [semEanTotal, setSemEanTotal] = useState(0);
  const [totalColetado, setTotalColetado] = useState(0);
  const [mercs, setMercs] = useState<string[]>([]);
  const [concUsados, setConcUsados] = useState<ConcorrenteInfo[]>([]);
  const [pracaAlertas, setPracaAlertas] = useState<{ nome: string; obtida: string; esperada: string }[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      let lojas: Store[] = [];
      if (isAdmin) {
        const { data } = await supabase.from("stores").select("id, name").order("name");
        lojas = data || [];
      } else {
        const { data } = await supabase
          .from("user_store_access")
          .select("store_id, approved, stores(id, name)")
          .eq("user_id", user.id)
          .eq("approved", true);
        lojas = (data || []).map((r) => (r as unknown as { stores: Store }).stores).filter(Boolean);
      }
      setStores(lojas);
      const sel = sessionStorage.getItem("selectedStoreId");
      setStoreId(sel && lojas.some((l) => l.id === sel) ? sel : lojas[0]?.id || "");
    })();
  }, [user, isAdmin]);

  // Concorrentes cadastrados + data da coleta
  useEffect(() => {
    (async () => {
      const { data: cs } = await supabase
        .from("concorrentes")
        .select("id, nome, host, praca_esperada, ativo")
        .eq("ativo", true)
        .order("nome");
      const lista: ConcorrenteInfo[] = [];
      for (const c of cs || []) {
        const { data: ult } = await supabase
          .from("precos_concorrente")
          .select("coletado_em, lojista")
          .eq("concorrente_id", c.id)
          .order("coletado_em", { ascending: false })
          .limit(1);
        lista.push({
          id: c.id,
          nome: c.nome,
          host: c.host,
          praca_esperada: c.praca_esperada,
          coletadoEm: ult?.[0]?.coletado_em ?? null,
          lojista: ult?.[0]?.lojista ?? null,
          totalLinhas: 0,
          semEan: 0,
        });
      }
      setConcorrentes(lista);
      setSelConc(lista.filter((c) => c.coletadoEm).map((c) => c.id));
    })();
  }, []);

  const storeName = stores.find((s) => s.id === storeId)?.name || "";

  const consultar = async () => {
    if (!storeId) return;
    if (concorrentes.length === 0) { setEstado("sem_concorrente"); return; }
    const alvos = concorrentes.filter((c) => selConc.includes(c.id));
    if (alvos.length === 0 || alvos.every((c) => !c.coletadoEm)) { setEstado("sem_coleta"); return; }

    setLoading(true);
    try {
      const fim = new Date().toISOString().slice(0, 10);
      const inicio = isoDaysAgo(Number(dias));

      const [catalogo, rank] = await Promise.all([
        carregarBaseCatalogo(storeId),
        chamarRelatorio(storeId, "ranking_produtos", { inicio, fim, limite: 200000 }),
      ]);

      // Vendas do período por código
      const vendas = new Map<string, { qtd: number; valor: number }>();
      for (const l of rank.dados || []) {
        const k = String(col(l, "codigo", "codigo_produto", "cod_produto", "id_produto") ?? "").replace(/^0+/, "");
        if (!k) continue;
        const cur = vendas.get(k) ?? { qtd: 0, valor: 0 };
        cur.qtd += num(col(l, "quantidade", "volume", "qtde", "qtd"));
        cur.valor += num(col(l, "total_vendido", "vendas", "venda", "valor_venda"));
        vendas.set(k, cur);
      }

      // Preços dos concorrentes (paginado)
      const precos: Record<string, Map<string, PricingRow["concorrentes"][string] & { imagem: string | null }>> = {};
      let semEan = 0;
      let coletado = 0;
      const lojistas: Record<string, Set<string>> = {};
      for (const c of alvos) {
        const mapa = new Map<string, PricingRow["concorrentes"][string] & { imagem: string | null }>();
        lojistas[c.id] = new Set();
        let from = 0;
        for (;;) {
          const { data } = await supabase
            .from("precos_concorrente")
            .select("ean, preco, preco_auditoria, disponivel, promocao_multipla, lojista, coletado_em, imagem_url")
            .eq("concorrente_id", c.id)
            .range(from, from + 999);
          const linhas = data || [];
          for (const l of linhas) {
            coletado++;
            if (l.lojista) lojistas[c.id].add(l.lojista);
            const ean = eanUtilizavel(l.ean);
            if (!ean) { semEan++; continue; }
            const cel = {
              preco: l.disponivel ? (l.preco == null ? null : Number(l.preco)) : null,
              precoAuditoria: l.preco_auditoria == null ? null : Number(l.preco_auditoria),
              disponivel: !!l.disponivel,
              promocaoMultipla: (l.promocao_multipla || []) as string[],
              coletadoEm: l.coletado_em,
              imagem: l.imagem_url ?? null,
            };
            const anterior = mapa.get(ean);
            if (!anterior || (!anterior.disponivel && cel.disponivel)) mapa.set(ean, cel);
          }
          if (linhas.length < 1000) break;
          from += 1000;
        }
        precos[c.id] = mapa;
      }
      setSemEanTotal(semEan);
      setTotalColetado(coletado);

      // Alerta de praça
      setPracaAlertas(
        alvos
          .filter((c) => c.praca_esperada)
          .flatMap((c) => {
            const obtidas = [...(lojistas[c.id] || [])];
            const divergente = obtidas.find(
              (l) => l.toUpperCase() !== String(c.praca_esperada).toUpperCase(),
            );
            return divergente ? [{ nome: c.nome, obtida: divergente, esperada: String(c.praca_esperada) }] : [];
          }),
      );

      // Curva ABC pelo valor de venda
      const itens = catalogo.map((p) => {
        const k = String(p.codigo).replace(/^0+/, "");
        const v = vendas.get(k) ?? { qtd: 0, valor: 0 };
        return { p, qtd: v.qtd, valor: v.valor };
      });
      const totalVendas = itens.reduce((s, i) => s + i.valor, 0);
      const ordenados = [...itens].sort((a, b) => b.valor - a.valor);
      const curva = new Map<string, "A" | "B" | "C">();
      let acc = 0;
      for (const i of ordenados) {
        acc += i.valor;
        const p = totalVendas > 0 ? acc / totalVendas : 1;
        curva.set(i.p.codigo, p <= 0.8 ? "A" : p <= 0.95 ? "B" : "C");
      }

      const linhas: PricingRow[] = [];
      for (const { p, qtd, valor } of itens) {
        const ean = eanUtilizavel(p.ean);
        const cels: PricingRow["concorrentes"] = {};
        let imagem: string | null = null;
        let melhor: number | null = null;
        if (ean) {
          for (const c of alvos) {
            const cel = precos[c.id].get(ean);
            if (!cel) continue;
            cels[c.id] = cel;
            imagem = imagem || cel.imagem;
            if (cel.disponivel && cel.preco != null && (melhor == null || cel.preco < melhor)) melhor = cel.preco;
          }
        }
        if (Object.keys(cels).length === 0) continue; // só produtos vinculados entram na comparação
        const meuPreco = p.preco ?? 0;
        linhas.push({
          codigo: p.codigo,
          descricao: p.descricao,
          ean,
          imagem,
          meuPreco,
          custo: p.custo ?? 0,
          qtdVendas: qtd,
          vlrVendas: valor,
          curva: curva.get(p.codigo) ?? "C",
          mercadologico: p.n1 || "SEM DEPARTAMENTO",
          concorrentes: cels,
          melhorPrecoConcorrente: melhor,
          status:
            melhor == null
              ? "sem_vinculo"
              : meuPreco < melhor
                ? "barato"
                : meuPreco > melhor
                  ? "caro"
                  : "igual",
        });
      }

      setTotalCatalogo(catalogo.length);
      setMercs([...new Set(catalogo.map((p) => p.n1 || "SEM DEPARTAMENTO"))].sort());
      setRowsBase(linhas);
      setConcUsados(alvos);
      setEstado(linhas.length === 0 ? "sem_vinculo" : "ok");
    } finally {
      setLoading(false);
    }
  };

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rowsBase.filter((r) => {
      if (merc !== "todos" && r.mercadologico !== merc) return false;
      if (status === "barato" && r.status !== "barato") return false;
      if (status === "caro" && r.status !== "caro") return false;
      if (status === "igual" && r.status !== "igual") return false;
      if (q && !r.descricao.toLowerCase().includes(q) && !r.codigo.toLowerCase().includes(q) && !r.ean.includes(q))
        return false;
      return true;
    });
  }, [rowsBase, merc, status, busca]);

  const kpis = useMemo(() => {
    let vendaAtual = 0, vendaConc = 0, lucroAtual = 0, lucroConc = 0;
    let barato = 0, caro = 0, igual = 0;
    for (const r of filtradas) {
      const ref = r.melhorPrecoConcorrente ?? r.meuPreco;
      vendaAtual += r.meuPreco * r.qtdVendas;
      vendaConc += ref * r.qtdVendas;
      lucroAtual += (r.meuPreco - r.custo) * r.qtdVendas;
      lucroConc += (ref - r.custo) * r.qtdVendas;
      if (r.status === "barato") barato++;
      else if (r.status === "caro") caro++;
      else if (r.status === "igual") igual++;
    }
    return {
      vendaAtual, vendaConc, lucroAtual, lucroConc, barato, caro, igual,
      margemAtual: vendaAtual > 0 ? (lucroAtual / vendaAtual) * 100 : 0,
      margemConc: vendaConc > 0 ? (lucroConc / vendaConc) * 100 : 0,
    };
  }, [filtradas]);

  const statusLabel: Record<string, string> = {
    barato: "Mais Barato", caro: "Mais Caro", igual: "Iguais",
  };

  const Card = ({ label, value, hint, tone = "" }: { label: string; value: string; hint?: string; tone?: string }) => (
    <div className="bg-card border border-border rounded-lg p-3">
      <p className="text-[11px] text-muted-foreground uppercase tracking-wide leading-tight">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );

  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1600px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pricing</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Comparativo dos preços da loja com os concorrentes já coletados.
          </p>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-2 bg-card border border-border rounded-lg p-3">
          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground uppercase">Loja</label>
            <Select value={storeId} onValueChange={setStoreId}>
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground uppercase">Concorrente</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[200px] justify-start font-normal">
                  {selConc.length === 0 ? "Nenhum" : `${selConc.length} selecionado(s)`}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[280px] space-y-2">
                {concorrentes.length === 0 && <p className="text-sm text-muted-foreground">Nenhum concorrente cadastrado.</p>}
                {concorrentes.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selConc.includes(c.id)}
                      onCheckedChange={(v) =>
                        setSelConc((prev) => (v ? [...prev, c.id] : prev.filter((x) => x !== c.id)))
                      }
                    />
                    <span className="flex-1">{c.nome}</span>
                    {!c.coletadoEm && <Badge variant="outline" className="text-[10px]">sem coleta</Badge>}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground uppercase">Mercadológico</label>
            <Select value={merc} onValueChange={setMerc}>
              <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {mercs.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground uppercase">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="barato">Mais Barato</SelectItem>
                <SelectItem value="caro">Mais Caro</SelectItem>
                <SelectItem value="igual">Iguais</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 flex-1 min-w-[200px]">
            <label className="text-[11px] text-muted-foreground uppercase">Buscar Produto</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Nome, código interno ou EAN" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-muted-foreground uppercase">Dias de Vendas</label>
            <Select value={dias} onValueChange={setDias}>
              <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["30", "60", "90", "180"].map((d) => <SelectItem key={d} value={d}>{d} dias</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Button onClick={consultar} disabled={!storeId || loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Search className="w-4 h-4 mr-1" />}
            Consultar
          </Button>
        </div>

        {/* Alerta de praça */}
        {pracaAlertas.map((a) => (
          <div key={a.nome} className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>Os preços do concorrente <strong>{a.nome}</strong> são da praça <strong>{a.obtida}</strong>, e não da praça esperada <strong>{a.esperada}</strong>.</span>
          </div>
        ))}

        {/* Estados vazios */}
        {estado === "sem_concorrente" && (
          <div className="text-center py-12 space-y-2">
            <StoreIcon className="w-10 h-10 mx-auto opacity-40" />
            <p className="font-medium">Nenhum concorrente cadastrado</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/repricing")}>Ir para Concorrentes</Button>
          </div>
        )}
        {estado === "sem_coleta" && (
          <div className="text-center py-12 space-y-2">
            <Info className="w-10 h-10 mx-auto opacity-40" />
            <p className="font-medium">Nenhuma coleta executada ainda</p>
            <Button variant="outline" size="sm" onClick={() => navigate("/vtex-collector")}>Ir para o coletor</Button>
          </div>
        )}
        {estado === "sem_vinculo" && (
          <div className="text-center py-12 space-y-1">
            <Info className="w-10 h-10 mx-auto opacity-40" />
            <p className="font-medium">Nenhum produto casou por EAN</p>
            <p className="text-sm text-muted-foreground">
              {totalColetado.toLocaleString("pt-BR")} linhas coletadas • {semEanTotal.toLocaleString("pt-BR")} sem EAN utilizável
            </p>
          </div>
        )}
        {estado === "inicial" && (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Defina os filtros e clique em Consultar</p>
          </div>
        )}

        {estado === "ok" && (
          <>
            {status !== "todos" && (
              <p className="text-xs text-amber-600">Números refletem o filtro Status = {statusLabel[status]}</p>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Card label="Total de Produtos (ignora filtros)" value={totalCatalogo.toLocaleString("pt-BR")} />
              <Card label="Vinculados (filtrado)" value={filtradas.length.toLocaleString("pt-BR")} />
              <Card label="Mais Caro (filtrado)" value={kpis.caro.toLocaleString("pt-BR")} tone="text-destructive" />
              <Card label="Mais Barato (filtrado)" value={kpis.barato.toLocaleString("pt-BR")} tone="text-green-600" />
              <Card label="Iguais (filtrado)" value={kpis.igual.toLocaleString("pt-BR")} />
              <Card label="Venda Atual (filtrado)" value={brl(kpis.vendaAtual)} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <Card label="Venda no Preço do Concorrente" value={brl(kpis.vendaConc)} hint="filtrado" />
              <Card label="Lucro Total" value={brl(kpis.lucroAtual)} hint="filtrado" />
              <Card label="Lucro no Preço do Concorrente" value={brl(kpis.lucroConc)} hint="filtrado" />
              <Card label="Margem Atual" value={pctFmt(kpis.margemAtual)} hint="filtrado" />
              <Card label="Margem no Preço do Concorrente" value={pctFmt(kpis.margemConc)} hint="filtrado" />
            </div>

            <PricingTable rows={filtradas} concorrentes={concUsados} semEanTotal={semEanTotal} />
          </>
        )}
      </div>
    </ClientLayout>
  );
};

export default Pricing;
