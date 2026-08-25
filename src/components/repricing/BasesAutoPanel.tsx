import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Download, CheckCircle2, Package, Store, Building2, FileSpreadsheet } from "lucide-react";
import { carregarBaseCatalogo, carregarProdutosAtivos12m, avisoRelatorio } from "@/lib/catalogoProdutos";
import * as XLSX from "xlsx";

export type Linha = Record<string, unknown>;

interface Props {
  storeId: string;
  onProdutos: (rows: Linha[]) => void;
  onConcorrente: (rows: Linha[]) => void;
  onInterna: (rows: Linha[]) => void;
  produtosCount: number;
  concorrenteCount: number;
  internaCount: number;
}

interface ConcOpt { id: string; nome: string; host: string }
interface LojaOpt { id: string; name: string; host?: string | null }

/** "Sm União - Loja 2" → "sm uniao" — identifica lojas do mesmo cliente */
const clienteBase = (nome: string) =>
  String(nome ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(loja|filial|unidade)\b\s*\d+/g, "")
    .replace(/[-–—]/g, " ")
    .replace(/\d+/g, "")
    .replace(/\s+/g, " ")
    .trim();

type ModoCadastro = "ativos12m" | "completo";

const BasesAutoPanel = ({
  storeId, onProdutos, onConcorrente, onInterna,
  produtosCount, concorrenteCount, internaCount,
}: Props) => {
  const [concorrentes, setConcorrentes] = useState<ConcOpt[]>([]);
  const [concSel, setConcSel] = useState("todos");
  const [lojas, setLojas] = useState<LojaOpt[]>([]);
  const [modo, setModo] = useState<ModoCadastro>("ativos12m");
  const [modoCarregado, setModoCarregado] = useState<ModoCadastro | null>(null);
  const [loadingP, setLoadingP] = useState(false);
  const [loadingC, setLoadingC] = useState(false);
  const [loadingI, setLoadingI] = useState(false);
  const [progressoInterna, setProgressoInterna] = useState("");
  const [progressoConc, setProgressoConc] = useState("");
  const [rowsProdutos, setRowsProdutos] = useState<Linha[]>([]);
  const [rowsConc, setRowsConc] = useState<Linha[]>([]);
  const [rowsInterna, setRowsInterna] = useState<Linha[]>([]);

  const emitProdutos = (rows: Linha[]) => { setRowsProdutos(rows); onProdutos(rows); };
  const emitConc = (rows: Linha[]) => { setRowsConc(rows); onConcorrente(rows); };
  const emitInterna = (rows: Linha[]) => { setRowsInterna(rows); onInterna(rows); };

  /** cód. reduzido do cadastro da loja, indexado por código de barras */
  const reduzidoPorEan = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of rowsProdutos) {
      const ean = String(p.ean ?? "").replace(/\D/g, "").replace(/^0+/, "");
      const cod = String(p.codigo_reduzido ?? "");
      if (ean && cod && !m.has(ean)) m.set(ean, cod);
    }
    return m;
  }, [rowsProdutos]);

  const exportar = (
    rows: Linha[],
    nome: string,
    campos: { chave: string; titulo: string }[],
  ) => {
    if (!rows.length) return toast.error("Nada carregado para exportar");
    const dados = rows.map((r) =>
      Object.fromEntries(
        campos.map((c) => {
          if (c.chave === "codigo_reduzido") {
            const ean = String(r.ean ?? "").replace(/\D/g, "").replace(/^0+/, "");
            return [c.titulo, r.codigo_reduzido ?? reduzidoPorEan.get(ean) ?? ""];
          }
          return [c.titulo, r[c.chave] ?? ""];
        }),
      ),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados), "Base");
    XLSX.writeFile(wb, `${nome}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };


  const BotaoExportar = ({ onClick, disabled }: { onClick: () => void; disabled: boolean }) => (
    <Button size="sm" variant="ghost" onClick={onClick} disabled={disabled} className="gap-2 w-full">
      <FileSpreadsheet className="w-4 h-4" /> Exportar Excel
    </Button>
  );

  useEffect(() => {
    (async () => {
      const [{ data: cs }, { data: ls }] = await Promise.all([
        storeId
          ? supabase
              .from("cliente_concorrentes")
              .select("apelido, prioridade, sites_concorrentes(id, nome, host)")
              .eq("store_id", storeId)
              .eq("ativo", true)
              .order("prioridade")
          : Promise.resolve({ data: [] as unknown[] }),
        supabase.from("stores").select("id, name").order("name"),
      ]);
      const { data: vr } = await supabase.from("store_vr_config").select("store_id, api_url");
      const hostPorLoja = new Map<string, string>();
      for (const v of (vr as { store_id: string; api_url: string | null }[]) || []) {
        const h = String(v.api_url ?? "").replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
        if (h) hostPorLoja.set(v.store_id, h);
      }
      const opts = ((cs || []) as unknown as { apelido: string | null; sites_concorrentes: ConcOpt | null }[])
        .filter((v) => v.sites_concorrentes)
        .map((v) => ({
          id: v.sites_concorrentes!.id,
          nome: v.apelido || v.sites_concorrentes!.nome,
          host: v.sites_concorrentes!.host,
        }));
      setConcorrentes(opts);
      setLojas(
        ((ls as LojaOpt[]) || []).map((l) => ({ ...l, host: hostPorLoja.get(l.id) ?? null })),
      );
    })();
  }, [storeId]);

  // 1) Cadastro da loja — ativos 12 meses (padrao) ou cadastro completo
  const carregarProdutos = useCallback(async () => {
    if (!storeId) return toast.error("Selecione a loja para carregar o cadastro");
    setLoadingP(true);
    try {
      if (modo === "ativos12m") {
        const r = await carregarProdutosAtivos12m(storeId);
        if (!r.itens.length) {
          // A ponte desta loja não publica o relatório de ativos: cai para o
          // cadastro completo em vez de deixar a tela sem produto nenhum.
          const base = await carregarBaseCatalogo(storeId);
          const rows: Linha[] = base.map((p) => ({
            ean: String(p.ean ?? "").trim(),
            codigo_reduzido: p.codigo ?? "",
            descricao: p.descricao,
            custo: p.custo ?? 0,
            preco: p.precoOferta || p.preco || 0,
            mercadologico: p.n1 || "Outros",
          }));
          emitProdutos(rows);
          setModoCarregado("completo");
          const comEan = rows.filter((x) => String(x.ean).replace(/\D/g, "").length >= 8).length;
          rows.length
            ? toast.warning(
                `Esta loja não publica a lista de ativos 12 meses — carregamos o cadastro completo: ${rows.length} produtos (${comEan} com código de barras)`,
              )
            : toast.error(avisoRelatorio(r) || "Nenhum produto retornado pelo sistema da loja");
          setLoadingP(false);
          return;
        }
        const rows: Linha[] = r.itens.map((p) => ({
          ean: String(p.ean ?? "").trim(),
          codigo_reduzido: p.codigo ?? "",
          descricao: p.descricao,
          custo: p.custo ?? 0,
          preco: p.preco ?? 0,
          mercadologico: p.secao || "Outros",
          estoque: p.estoque,
          qtd_vendida_12m: p.qtdVendida12m,
          valor_vendido_12m: p.valorVendido12m,
          ultima_venda: p.ultimaVenda,
        }));
        emitProdutos(rows);
        setModoCarregado("ativos12m");
        const comEan = rows.filter((x) => String(x.ean).replace(/\D/g, "").length >= 8).length;
        toast.success(`${rows.length} produtos ativos com movimento em 12 meses (${comEan} com código de barras)`);

      } else {
        const base = await carregarBaseCatalogo(storeId);
        const rows: Linha[] = base.map((p) => ({
          ean: String(p.ean ?? "").trim(),
          codigo_reduzido: p.codigo ?? "",
          descricao: p.descricao,
          custo: p.custo ?? 0,
          preco: p.precoOferta || p.preco || 0,
          mercadologico: p.n1 || "Outros",
        }));
        emitProdutos(rows);
        setModoCarregado("completo");
        const comEan = rows.filter((x) => String(x.ean).replace(/\D/g, "").length >= 8).length;
        rows.length
          ? toast.success(`${rows.length} produtos do cadastro completo (${comEan} com código de barras)`)
          : toast.error("Nenhum produto retornado pelo sistema da loja");
      }
    } catch {
      toast.error("Falha ao carregar o cadastro de produtos");
    }
    setLoadingP(false);
  }, [storeId, modo, onProdutos]);

  // 2) Pesquisas dos concorrentes coletadas (uma coluna por concorrente)
  const carregarConcorrente = useCallback(async () => {
    const alvos = concSel === "todos" ? concorrentes : concorrentes.filter((c) => c.id === concSel);
    if (!alvos.length) return toast.error("Nenhum concorrente vinculado a esta loja");
    setLoadingC(true);
    const rows: Linha[] = [];
    const passo = 1000;
    for (let i = 0; i < alvos.length; i++) {
      const c = alvos[i];
      setProgressoConc(`${Math.round((i / alvos.length) * 100)}%`);
      for (let de = 0; de < 200000; de += passo) {
        const { data, error } = await supabase
          .from("precos_concorrente")
          .select("id, ean, nome, preco, preco_de, em_promocao, disponivel, coletado_em")
          .eq("site_concorrente_id", c.id)
          .eq("disponivel", true)
          .order("id", { ascending: true })
          .range(de, de + passo - 1);
        if (error) { toast.error(error.message); break; }
        const lote = data || [];
        for (const r of lote) {
          rows.push({
            ean: String(r.ean ?? "").trim(),
            descricao: r.nome ?? "",
            preco: r.preco_de ?? r.preco ?? 0,
            oferta: r.em_promocao ? (r.preco ?? 0) : 0,
            concorrente_id: c.id,
            concorrente_nome: c.nome,
            coletado_em: r.coletado_em ?? null,
          });
        }
        if (lote.length < passo) break;
      }
    }
    setProgressoConc("");
    emitConc(rows);
    setLoadingC(false);
    const comEanC = rows.filter((r) => String(r.ean).replace(/\D/g, "").length >= 8).length;
    rows.length
      ? toast.success(`${rows.length} preços carregados de ${alvos.length} concorrente(s) (${comEanC} com código de barras)`)
      : toast.error("Nenhum preço coletado para o(s) concorrente(s) selecionado(s)");
  }, [concSel, concorrentes, onConcorrente]);

  // 3) Base interna — preços das demais lojas da rede
  const carregarInterna = useCallback(async () => {
    // Exclui a própria loja e as lojas irmãs do mesmo cliente (mesmo domínio
    // da ponte ou mesmo nome-base, ex.: "Sm União - Loja 1" e "Loja 2").
    const atual = lojas.find((l) => l.id === storeId);
    const baseAtual = atual ? clienteBase(atual.name) : "";
    const outras = lojas.filter(
      (l) =>
        l.id !== storeId &&
        !(atual?.host && l.host && l.host === atual.host) &&
        !(baseAtual && clienteBase(l.name) === baseAtual),
    );
    if (!outras.length) return toast.error("Nenhuma outra loja de cliente diferente cadastrada");
    setLoadingI(true);
    const rows: Linha[] = [];
    for (let i = 0; i < outras.length; i++) {
      const l = outras[i];
      setProgressoInterna(`${Math.round((i / outras.length) * 100)}%`);
      try {
        const base = await carregarBaseCatalogo(l.id);
        for (const p of base) {
          if (!String(p.ean ?? "").trim()) continue;
          rows.push({
            ean: String(p.ean).trim(),
            descricao: p.descricao,
            preco: p.precoOferta || p.preco || 0,
            custo: p.custo ?? 0,
            codigo_reduzido: p.codigo ?? "",
            loja: l.name,
          });
        }
      } catch {
        /* loja sem conexão — segue para a próxima */
      }
    }
    setProgressoInterna("");
    emitInterna(rows);
    setLoadingI(false);
    rows.length
      ? toast.success(`${rows.length} preços de outras lojas carregados`)
      : toast.error("Nenhuma outra loja respondeu com cadastro de preços");
  }, [lojas, storeId, onInterna]);

  const Ok = ({ n, obs }: { n: number; obs?: string }) => (
    <div className="space-y-1">
      <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
        <CheckCircle2 className="w-3.5 h-3.5" /> {n.toLocaleString("pt-BR")} itens
      </Badge>
      {obs && <p className="text-[11px] text-muted-foreground">{obs}</p>}
    </div>
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Cadastro da loja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Traz por padrão apenas os produtos ativos com movimento nos últimos 12 meses — sem item parado há anos.
          </p>
          <Select value={modo} onValueChange={(v) => setModo(v as ModoCadastro)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="ativos12m">Ativos (12 meses)</SelectItem>
              <SelectItem value="completo">Cadastro completo</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={carregarProdutos} disabled={loadingP} className="gap-2 w-full">
            {loadingP ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Carregar cadastro
          </Button>
          {produtosCount > 0 && (
            <Ok
              n={produtosCount}
              obs={modoCarregado === "completo" ? "cadastro completo da loja" : "ativos com movimento em 12 meses"}
            />
          )}
          <BotaoExportar
            disabled={!rowsProdutos.length}
            onClick={() =>
              exportar(rowsProdutos, "cadastro-loja", [
                { chave: "ean", titulo: "Cod de Barras" },
                { chave: "codigo_reduzido", titulo: "Cod Reduzido" },
                { chave: "descricao", titulo: "Descrição" },
                { chave: "preco", titulo: "Preço" },
                { chave: "custo", titulo: "Custo" },
                { chave: "mercadologico", titulo: "Mercadológico" },
              ])
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Store className="w-4 h-4" /> Pesquisa dos concorrentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Usa as pesquisas de preços já coletadas. Cada concorrente vira um bloco de colunas na tabela.
          </p>
          <Select value={concSel} onValueChange={setConcSel} disabled={!concorrentes.length}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={concorrentes.length ? "Selecione" : "Nenhum concorrente vinculado a esta loja"} />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              <SelectItem value="todos">Todos os concorrentes</SelectItem>
              {concorrentes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={carregarConcorrente} disabled={loadingC || !concorrentes.length} className="gap-2 w-full">
            {loadingC ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Carregar pesquisa
          </Button>
          {loadingC && progressoConc && <p className="text-[11px] text-muted-foreground">Carregando pesquisas… {progressoConc}</p>}
          {concorrenteCount > 0 && <Ok n={concorrenteCount} />}
          <BotaoExportar
            disabled={!rowsConc.length}
            onClick={() =>
              exportar(rowsConc, "pesquisa-concorrentes", [
                { chave: "ean", titulo: "Cod de Barras" },
                { chave: "codigo_reduzido", titulo: "Cod Reduzido" },
                { chave: "descricao", titulo: "Descrição" },
                { chave: "preco", titulo: "Preço" },
                { chave: "oferta", titulo: "Oferta" },
                { chave: "concorrente_nome", titulo: "Concorrente" },
                { chave: "coletado_em", titulo: "Coletado em" },
              ])
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Building2 className="w-4 h-4" /> Base interna da rede</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Reúne os preços praticados nas demais lojas cadastradas no sistema, para comparação por código de barras.
          </p>
          <Button size="sm" variant="outline" onClick={carregarInterna} disabled={loadingI} className="gap-2 w-full">
            {loadingI ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Carregar base interna
          </Button>
          {loadingI && progressoInterna && <p className="text-[11px] text-muted-foreground">Carregando base interna… {progressoInterna}</p>}
          {internaCount > 0 && <Ok n={internaCount} obs="preços das outras lojas da rede" />}
          <BotaoExportar
            disabled={!rowsInterna.length}
            onClick={() =>
              exportar(rowsInterna, "base-interna-rede", [
                { chave: "ean", titulo: "Cod de Barras" },
                { chave: "codigo_reduzido", titulo: "Cod Reduzido" },
                { chave: "descricao", titulo: "Descrição" },
                { chave: "preco", titulo: "Preço" },
                { chave: "custo", titulo: "Custo" },
                { chave: "loja", titulo: "Loja" },
              ])
            }
          />
        </CardContent>
      </Card>
    </div>
  );
};

export default BasesAutoPanel;
