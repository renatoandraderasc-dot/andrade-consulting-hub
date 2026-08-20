import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Download, CheckCircle2, Package, Store, Building2 } from "lucide-react";
import { carregarBaseCatalogo } from "@/lib/catalogoProdutos";

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
interface LojaOpt { id: string; name: string }

const BasesAutoPanel = ({
  storeId, onProdutos, onConcorrente, onInterna,
  produtosCount, concorrenteCount, internaCount,
}: Props) => {
  const [concorrentes, setConcorrentes] = useState<ConcOpt[]>([]);
  const [concSel, setConcSel] = useState("");
  const [lojas, setLojas] = useState<LojaOpt[]>([]);
  const [loadingP, setLoadingP] = useState(false);
  const [loadingC, setLoadingC] = useState(false);
  const [loadingI, setLoadingI] = useState(false);
  const [progressoInterna, setProgressoInterna] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: cs }, { data: ls }] = await Promise.all([
        supabase.from("concorrentes").select("id, nome, host").eq("ativo", true).order("nome"),
        supabase.from("stores").select("id, name").order("name"),
      ]);
      const list = (cs as ConcOpt[]) || [];
      setConcorrentes(list);
      setConcSel((p) => p || list[0]?.id || "");
      setLojas((ls as LojaOpt[]) || []);
    })();
  }, []);

  // 1) Cadastro atual da loja (gestão de produtos)
  const carregarProdutos = useCallback(async () => {
    if (!storeId) return toast.error("Selecione a loja para carregar o cadastro");
    setLoadingP(true);
    try {
      const base = await carregarBaseCatalogo(storeId);
      // Nunca usar o codigo interno como EAN: sem codigo de barras, campo vazio.
      const rows: Linha[] = base.map((p) => ({
        ean: String(p.ean ?? "").trim(),
        descricao: p.descricao,
        custo: p.custo ?? 0,
        preco: p.precoOferta || p.preco || 0,
        mercadologico: [p.n1, p.n2].filter(Boolean).join(" / ") || "Outros",
      }));
      const comEan = rows.filter((r) => String(r.ean).replace(/\D/g, "").length >= 8).length;
      onProdutos(rows);
      if (!rows.length) toast.error("Nenhum produto retornado pelo sistema da loja");
      else if (!comEan) toast.error(`${rows.length} produtos carregados, mas nenhum tem código de barras`);
      else toast.success(`${rows.length} produtos carregados (${comEan} com código de barras)`);
    } catch {
      toast.error("Falha ao carregar o cadastro de produtos");
    }
    setLoadingP(false);
  }, [storeId, onProdutos]);

  // 2) Pesquisa do concorrente coletada
  const carregarConcorrente = useCallback(async () => {
    if (!concSel) return toast.error("Selecione o concorrente");
    setLoadingC(true);
    const rows: Linha[] = [];
    const passo = 1000;
    for (let de = 0; de < 200000; de += passo) {
      const { data, error } = await supabase
        .from("precos_concorrente")
        .select("id, ean, nome, preco, preco_de, em_promocao, disponivel")
        .eq("concorrente_id", concSel)
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
        });
      }
      if (lote.length < passo) break;
    }
    onConcorrente(rows);
    setLoadingC(false);
    const comEanC = rows.filter((r) => String(r.ean).replace(/\D/g, "").length >= 8).length;
    rows.length
      ? toast.success(`${rows.length} preços carregados (${comEanC} com código de barras)`)
      : toast.error("Nenhum preço coletado para este concorrente ainda");
  }, [concSel, onConcorrente]);

  // 3) Base interna — preços das demais lojas da rede
  const carregarInterna = useCallback(async () => {
    const outras = lojas.filter((l) => l.id !== storeId);
    if (!outras.length) return toast.error("Nenhuma outra loja cadastrada");
    setLoadingI(true);
    const rows: Linha[] = [];
    for (let i = 0; i < outras.length; i++) {
      const l = outras[i];
      setProgressoInterna(`${i + 1}/${outras.length} — ${l.name}`);
      try {
        const base = await carregarBaseCatalogo(l.id);
        for (const p of base) {
          if (!String(p.ean ?? "").trim()) continue;
          rows.push({
            ean: String(p.ean).trim(),
            descricao: p.descricao,
            preco: p.precoOferta || p.preco || 0,
            custo: p.custo ?? 0,
            loja: l.name,
          });
        }
      } catch {
        /* loja sem conexão — segue para a próxima */
      }
    }
    setProgressoInterna("");
    onInterna(rows);
    setLoadingI(false);
    rows.length
      ? toast.success(`${rows.length} preços de outras lojas carregados`)
      : toast.error("Nenhuma outra loja respondeu com cadastro de preços");
  }, [lojas, storeId, onInterna]);

  const Ok = ({ n }: { n: number }) => (
    <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
      <CheckCircle2 className="w-3.5 h-3.5" /> {n.toLocaleString("pt-BR")} itens
    </Badge>
  );

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Package className="w-4 h-4" /> Cadastro atual da loja</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Puxa direto da gestão de produtos da loja selecionada: código de barras, descrição, custo, preço e classificação.
          </p>
          <Button size="sm" onClick={carregarProdutos} disabled={loadingP} className="gap-2 w-full">
            {loadingP ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Carregar cadastro
          </Button>
          {produtosCount > 0 && <Ok n={produtosCount} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Store className="w-4 h-4" /> Pesquisa do concorrente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Usa a pesquisa de preços já coletada do concorrente escolhido.
          </p>
          <Select value={concSel} onValueChange={setConcSel} disabled={!concorrentes.length}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder={concorrentes.length ? "Selecione o concorrente" : "Nenhum concorrente cadastrado"} />
            </SelectTrigger>
            <SelectContent className="bg-popover z-50">
              {concorrentes.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={carregarConcorrente} disabled={loadingC || !concSel} className="gap-2 w-full">
            {loadingC ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Carregar pesquisa
          </Button>
          {concorrenteCount > 0 && <Ok n={concorrenteCount} />}
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
          {loadingI && progressoInterna && <p className="text-[11px] text-muted-foreground">{progressoInterna}</p>}
          {internaCount > 0 && <Ok n={internaCount} />}
        </CardContent>
      </Card>
    </div>
  );
};

export default BasesAutoPanel;
