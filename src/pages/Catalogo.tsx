import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Download, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio, pick as col } from "@/lib/vrReport";
import { carregarBaseCatalogo, filtrarCatalogo, type CatalogoItem } from "@/lib/catalogoProdutos";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Store { id: string; name: string }

interface Linha {
  codigo: string | number;
  descricao: string;
  custo: string | number | null;
  preco_venda: string | number | null;
  preco_oferta: string | number | null;
  codigo_barras: string | null;
  m1_departamento: string | null;
  m2_grupo: string | null;
  m3_subgrupo: string | null;
  m4_familia: string | null;
}

const PAGE_SIZE = 50;

const fmtBRL = (v: any) => {
  const n = parseFloat(String(v ?? ""));
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const Catalogo = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAtiva, setBuscaAtiva] = useState("");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [periodoAtivo, setPeriodoAtivo] = useState<{ inicio: string; fim: string } | null>(null);
  const [pagina, setPagina] = useState(0);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [localTotal, setLocalTotal] = useState<number | null>(null);


  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const sid = sessionStorage.getItem("selectedStoreId");
      let lojas: Store[] = [];
      if (isAdmin) {
        const { data } = await supabase.from("stores").select("id, name").order("name");
        lojas = data || [];
      } else {
        const { data } = await supabase
          .from("user_store_access")
          .select("stores(id, name)")
          .eq("user_id", user.id)
          .eq("approved", true);
        lojas = ((data || []) as any[]).map((r) => r.stores).filter(Boolean);
      }
      setStores(lojas);
      if (lojas.length) {
        const pick = lojas.find((s) => s.id === sid) || lojas[0];
        setStoreId(pick.id);
        setStoreName(pick.name);
      }
    })();
  }, [user, isAdmin]);

  const consultar = async (
    pg: number,
    termo: string,
    periodo: { inicio: string; fim: string } | null,
    limite = PAGE_SIZE,
  ): Promise<{ linhas: Linha[]; aviso: string | null }> => {
    const r = await chamarRelatorio(storeId, periodo ? "catalogo_produtos_vendidos" : "catalogo_produtos", {
      busca: termo,
      limite,
      offset: pg * limite,
      ...(periodo ? { inicio: periodo.inicio, fim: periodo.fim } : {}),
    });
    const linhas: Linha[] = r.dados.map((l) => ({
      codigo: col(l, "codigo", "cod_produto", "produto") ?? "",
      descricao: String(col(l, "descricao", "produto", "nome") ?? ""),
      custo: col(l, "custo", "preco_custo") ?? null,
      preco_venda: col(l, "preco_venda", "preco", "venda") ?? null,
      preco_oferta: col(l, "preco_oferta", "oferta") ?? null,
      codigo_barras: (col(l, "codigo_barras", "ean", "barras") as string) ?? null,
      m1_departamento: (col(l, "m1_departamento", "departamento", "nivel1", "secao") as string) ?? null,
      m2_grupo: (col(l, "m2_grupo", "grupo", "nivel2", "categoria") as string) ?? null,
      m3_subgrupo: (col(l, "m3_subgrupo", "subgrupo", "nivel3") as string) ?? null,
      m4_familia: (col(l, "m4_familia", "familia", "nivel4") as string) ?? null,
    }));
    // Alguns ERPs repetem o mesmo item (uma linha por tabela de preco/embalagem):
    // mantemos apenas a primeira ocorrencia de cada codigo (ou codigo de barras).
    const vistos = new Set<string>();
    const unicas = linhas.filter((l) => {
      const chave =
        String(l.codigo ?? "").trim().replace(/^0+/, "") ||
        String(l.codigo_barras ?? "").trim() ||
        l.descricao.trim().toUpperCase();
      if (!chave || vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
    return { linhas: unicas, aviso: avisoRelatorio(r) };
  };

  const doItem = (p: CatalogoItem): Linha => ({
    codigo: p.codigo,
    descricao: p.descricao,
    custo: p.custo,
    preco_venda: p.preco,
    preco_oferta: p.precoOferta,
    codigo_barras: p.ean || null,
    m1_departamento: p.n1 || null,
    m2_grupo: p.n2 || null,
    m3_subgrupo: p.n3 || null,
    m4_familia: p.n4 || null,
  });

  // Lojas cujo conector nao publica "catalogo_produtos" (caso dos VR)
  // montam a base com produtos + produtos_precos + estoque_atual.
  const buscarLocal = async (
    pg: number,
    termo: string,
    limite = PAGE_SIZE,
  ): Promise<{ linhas: Linha[]; total: number }> => {
    const base = await carregarBaseCatalogo(storeId);
    const filtradas = filtrarCatalogo(base, termo, base.length);
    return {
      linhas: filtradas.slice(pg * limite, pg * limite + limite).map(doItem),
      total: filtradas.length,
    };
  };

  const buscar = async (pg = pagina, termo = buscaAtiva, periodo = periodoAtivo) => {
    if (!storeId) return;
    setLoading(true);
    try {
      const { linhas: l, aviso: a } = await consultar(pg, termo, periodo);
      if (l.length) {
        setLocalTotal(null);
        setLinhas(l);
        setAviso(a);
        return;
      }
      // fallback: base montada localmente
      const { linhas: locais, total } = await buscarLocal(pg, termo);
      if (total) {
        setLocalTotal(total);
        setLinhas(locais);
        setAviso(periodo ? "Esta loja não tem o relatório por período; exibindo o cadastro completo." : null);
      } else {
        setLocalTotal(null);
        setLinhas([]);
        setAviso(a ?? "Nenhum produto encontrado.");
      }
    } catch (err: any) {
      setLinhas([]);
      setAviso(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (storeId) buscar(pagina, buscaAtiva, periodoAtivo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, pagina, buscaAtiva, periodoAtivo]);

  const aplicarBusca = () => {
    setPagina(0);
    setBuscaAtiva(busca.trim());
    setPeriodoAtivo(inicio && fim ? { inicio, fim } : null);
  };

  const limparPeriodo = () => {
    setInicio("");
    setFim("");
    setPagina(0);
    setPeriodoAtivo(null);
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const LOTE = 1000;
      const todas: Linha[] = [];
      if (localTotal !== null) {
        const base = await carregarBaseCatalogo(storeId);
        todas.push(...filtrarCatalogo(base, buscaAtiva, base.length).map(doItem));
      } else {
        for (let pg = 0; pg < 200; pg++) {
          const { linhas: parte } = await consultar(pg, buscaAtiva, periodoAtivo, LOTE);
          todas.push(...parte);
          if (parte.length < LOTE) break;
        }
      }
      const dados = todas.map((l) => ({
        Código: l.codigo,
        Descrição: l.descricao,
        Custo: parseFloat(String(l.custo ?? "")) || 0,
        "Preço de Venda": parseFloat(String(l.preco_venda ?? "")) || 0,
        "Preço Oferta": parseFloat(String(l.preco_oferta ?? "")) || 0,
        "Cód. Barras": l.codigo_barras ?? "",
        "M1 Departamento": l.m1_departamento ?? "",
        "M2 Grupo": l.m2_grupo ?? "",
        "M3 Subgrupo": l.m3_subgrupo ?? "",
        "M4 Família": l.m4_familia ?? "",
      }));
      const ws = XLSX.utils.json_to_sheet(dados);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Catálogo");
      XLSX.writeFile(wb, `catalogo-produtos.xlsx`);
      toast({ title: `Exportado`, description: `${dados.length} produto(s) exportado(s).` });
    } catch (err: any) {
      toast({ title: "Falha ao exportar", description: err.message, variant: "destructive" });
    } finally {
      setExportando(false);
    }
  };



  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Catálogo de Produtos</h1>
          <p className="text-sm text-muted-foreground">Consulta ao vivo no sistema da loja — nada é gravado.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
          {stores.length > 1 && (
            <Select
              value={storeId}
              onValueChange={(v) => {
                setStoreId(v);
                setStoreName(stores.find((s) => s.id === v)?.name || "");
                setPagina(0);
              }}
            >
              <SelectTrigger className="w-56"><SelectValue placeholder="Loja" /></SelectTrigger>
              <SelectContent>
                {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && aplicarBusca()}
              placeholder="Buscar por código ou descrição"
              className="pl-8"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Com venda de</span>
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-[150px]" />
            <span className="text-xs text-muted-foreground">até</span>
            <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-[150px]" />
            {periodoAtivo && (
              <Button variant="ghost" size="sm" onClick={limparPeriodo}>Limpar</Button>
            )}
          </div>
          <Button onClick={aplicarBusca} disabled={loading}>Buscar</Button>
          <Button variant="outline" onClick={() => buscar()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button variant="outline" onClick={exportar} disabled={exportando || !linhas.length}>
            <Download className={`w-4 h-4 mr-1.5 ${exportando ? "animate-pulse" : ""}`} />
            {exportando ? "Exportando…" : "Exportar Excel"}
          </Button>

        </div>

        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-muted-foreground">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Código</th>
                <th className="px-3 py-2 font-medium">Descrição</th>
                <th className="px-3 py-2 font-medium text-right">Custo</th>
                <th className="px-3 py-2 font-medium text-right">Preço de Venda</th>
                <th className="px-3 py-2 font-medium text-right">Preço Oferta</th>
                <th className="px-3 py-2 font-medium">Cód. Barras</th>
                <th className="px-3 py-2 font-medium">M1 Departamento</th>
                <th className="px-3 py-2 font-medium">M2 Grupo</th>
                <th className="px-3 py-2 font-medium">M3 Subgrupo</th>
                <th className="px-3 py-2 font-medium">M4 Família</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">Consultando…</td></tr>
              )}
              {!loading && !linhas.length && (
                <tr><td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">{aviso || "Nenhum produto encontrado."}</td></tr>
              )}
              {!loading && linhas.map((l, i) => (
                <tr key={`${l.codigo}-${i}`} className="border-t border-border hover:bg-secondary/30">
                  <td className="px-3 py-2 tabular-nums">{l.codigo}</td>
                  <td className="px-3 py-2">{l.descricao}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.custo)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.preco_venda)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtBRL(l.preco_oferta)}</td>
                  <td className="px-3 py-2 tabular-nums">{l.codigo_barras || "—"}</td>
                  <td className="px-3 py-2">{l.m1_departamento || "—"}</td>
                  <td className="px-3 py-2">{l.m2_grupo || "—"}</td>
                  <td className="px-3 py-2">{l.m3_subgrupo || "—"}</td>
                  <td className="px-3 py-2">{l.m4_familia || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Exibindo {linhas.length} produto(s) — página {pagina + 1}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={pagina === 0 || loading} onClick={() => setPagina((p) => Math.max(0, p - 1))}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Anterior
            </Button>
            <span className="text-sm text-foreground tabular-nums px-2">{pagina + 1}</span>
            <Button variant="outline" size="sm" disabled={linhas.length < PAGE_SIZE || loading} onClick={() => setPagina((p) => p + 1)}>
              Próxima <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
};

export default Catalogo;
