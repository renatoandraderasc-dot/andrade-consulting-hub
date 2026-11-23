import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import ClientLayout from "@/components/ClientLayout";
import { useAuth } from "@/hooks/useAuth";
import { carregarLojasPermitidas, type LojaSimples } from "@/lib/lojasPermitidas";
import { chamarRelatorio, avisoRelatorio, pick, num, txt, ALIAS_EAN } from "@/lib/vrReport";
import { mercadologicoNivel1 } from "@/lib/mercadologico";
import { lerPeriodoCache } from "@/lib/relatorioCache";
import { limitesMes, somarMeses } from "@/lib/comparativoProdutos";
import { produtosSemVenda, type ProdutoVenda } from "@/lib/produtosSemVenda";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const chave = (v: unknown) => String(v ?? "").trim().replace(/^0+/, "");
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hojeSP = () => new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const rotMes = (m: string) => new Date(`${m}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });

export default function ProdutosSemVenda() {
  const { user, isGlobalAdmin } = useAuth();
  const [lojas, setLojas] = useState<LojaSimples[]>([]);
  const [storeId, setStoreId] = useState("");
  const [ref, setRef] = useState<ProdutoVenda[][] | null>(null);
  const [atual, setAtual] = useState<ProdutoVenda[]>([]);
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string[]>([]);
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

  const grupos = useMemo(() => (ref ? produtosSemVenda(ref, atual) : new Map()), [ref, atual]);
  const total = [...grupos.values()].reduce((s, l) => s + l.length, 0);
  const nomeLoja = lojas.find((l) => l.id === storeId)?.name ?? "";

  return (
    <ClientLayout>
      <div className="space-y-4 p-4 md:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-bold">Produtos sem venda no mês</h1>
            <p className="text-muted-foreground">
              {nomeLoja} · venderam em {mesesRef.map(rotMes).join(", ")} e não venderam de {rotMes(mesAtual)} até ontem
            </p>
          </div>
          <Button data-no-print="true" variant="outline" disabled={loading || !storeId} onClick={() => carregar(false)}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar
          </Button>
        </div>
        {aviso.length > 0 && <Card className="border-destructive/40 p-3 text-sm text-destructive">{aviso.map((a) => <div key={a}>{a}</div>)}</Card>}
        {loading && <Skeleton className="h-40 w-full" />}
        {!loading && ref && (
          <>
            <Card className="p-4"><span className="text-2xl font-bold">{total}</span> <span className="text-muted-foreground">produtos sem venda em {grupos.size} departamentos</span></Card>
            <div className="grid gap-4 lg:grid-cols-2">
              {[...grupos.entries()].map(([dep, lista]) => (
                <Card key={dep} className="p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h2 className="font-semibold">{dep}</h2>
                    <Badge variant="secondary">{lista.length}</Badge>
                  </div>
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-muted-foreground"><th>Código</th><th>Produto</th><th className="text-right">Venda 3 meses</th></tr></thead>
                    <tbody>
                      {lista.slice(0, 15).map((p) => (
                        <tr key={p.codigo} className="border-t border-border"><td className="py-1 pr-2">{p.codigo}</td><td className="pr-2">{p.descricao}</td><td className="text-right tabular-nums">{brl(p.venda)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {lista.length > 15 && <p className="mt-1 text-xs text-muted-foreground">+ {lista.length - 15} produtos</p>}
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </ClientLayout>
  );
}
