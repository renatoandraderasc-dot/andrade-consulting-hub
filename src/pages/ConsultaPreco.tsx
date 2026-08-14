import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, Search, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio, pick as col } from "@/lib/vrReport";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import BarcodeScanner from "@/components/consulta/BarcodeScanner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


interface Store { id: string; name: string }

interface Produto {
  codigo: string;
  descricao: string;
  estoque: string | number | null;
  categoria: string;
  preco: string | number | null;
  precoOferta: string | number | null;
  ean: string;
}

const fmtBRL = (v: any) => {
  const n = parseFloat(String(v ?? ""));
  if (isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const ConsultaPreco = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [codigo, setCodigo] = useState("");
  const [produto, setProduto] = useState<Produto | null>(null);
  const [resultados, setResultados] = useState<Produto[]>([]);

  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);


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
        const p = lojas.find((s) => s.id === sid) || lojas[0];
        setStoreId(p.id);
        setStoreName(p.name);
      }
    })();
  }, [user, isAdmin]);

  // variações do código lido: EAN-13 puro, sem zeros à esquerda, UPC-A -> EAN-13
  const variantes = (t: string) => {
    const so = t.replace(/\D/g, "");
    const vs = new Set<string>([t]);
    if (so) {
      vs.add(so);
      vs.add(so.replace(/^0+/, ""));
      if (so.length === 12) vs.add("0" + so);
      if (so.length === 13 && so.startsWith("0")) vs.add(so.slice(1));
    }
    return [...vs].filter(Boolean);
  };

  const mapear = (l: any, t: string): Produto => ({
    codigo: String(col(l, "codigo", "cod_produto", "codigo_reduzido", "produto") ?? ""),
    descricao: String(col(l, "descricao", "produto", "nome") ?? ""),
    estoque: col(l, "estoque", "saldo_estoque", "qtd_estoque", "estoque_atual") ?? null,
    categoria: String(col(l, "m2_grupo", "categoria", "m1_departamento", "departamento", "secao") ?? "—"),
    preco: col(l, "preco_venda", "preco", "venda") ?? null,
    precoOferta: col(l, "preco_oferta", "oferta") ?? null,
    ean: String(col(l, "codigo_barras", "ean", "barras") ?? t),
  });

  // Algumas lojas ainda não publicam o relatório "catalogo_produtos".
  // Nesses casos usamos o relatório "produtos" (+ "estoque_atual") e
  // filtramos localmente, para que a consulta funcione em toda loja.
  const cacheRef = useRef<Record<string, Produto[]>>({});

  const carregarBaseLocal = async (sid: string): Promise<Produto[]> => {
    if (cacheRef.current[sid]) return cacheRef.current[sid];
    const [rp, re] = await Promise.all([
      chamarRelatorio(sid, "produtos", {}),
      chamarRelatorio(sid, "estoque_atual", {}),
    ]);
    const estoques = new Map<string, any>();
    for (const l of re.dados || []) {
      const k = String(col(l, "id_produto", "codigo", "produto_id") ?? "");
      if (k) estoques.set(k, col(l, "estoque", "saldo_estoque", "qtd_estoque"));
    }
    const lista: Produto[] = (rp.dados || []).map((l: any) => {
      const codigo = String(col(l, "codigo", "cod_produto", "id_produto") ?? "");
      return {
        codigo,
        descricao: String(col(l, "descricao", "produto", "nome") ?? ""),
        estoque: estoques.get(codigo) ?? null,
        categoria: String(col(l, "grupo", "secao", "categoria", "subgrupo") ?? "—"),
        preco: col(l, "preco_venda", "preco", "venda") ?? null,
        precoOferta: col(l, "preco_oferta", "oferta") ?? null,
        ean: String(col(l, "codigo_barras", "ean", "barras") ?? ""),
      };
    });
    cacheRef.current[sid] = lista;
    return lista;
  };

  const buscarLocal = async (sid: string, t: string): Promise<Produto[]> => {
    const base = await carregarBaseLocal(sid);
    if (!base.length) return [];
    const limpar = (s: string) => s.replace(/\D/g, "").replace(/^0+/, "");
    const alvos = variantes(t).map(limpar).filter(Boolean);
    if (alvos.length) {
      const porCodigo = base.filter(
        (p) => alvos.includes(limpar(p.ean)) || alvos.includes(limpar(p.codigo)),
      );
      if (porCodigo.length) return porCodigo;
    }
    const termo = t.toLowerCase();
    return base.filter((p) => p.descricao.toLowerCase().includes(termo)).slice(0, 20);
  };

  const buscar = async (termo: string) => {
    const t = termo.trim();
    if (!t || !storeId) return;
    setLoading(true);
    setAviso(null);
    setProduto(null);
    setResultados([]);
    const numerico = /^\d+$/.test(t.replace(/\s/g, ""));
    let ultimoAviso: string | null = null;
    let indisponivel = false;
    try {
      for (const v of variantes(t)) {
        const r = await chamarRelatorio(storeId, "catalogo_produtos", { busca: v, limite: 20, offset: 0 });
        if (r.indisponivel) {
          indisponivel = true;
          break;
        }
        ultimoAviso = avisoRelatorio(r) || ultimoAviso;
        const linhas = r.dados || [];
        if (linhas.length) {
          const exato = linhas.find(
            (l: any) =>
              String(col(l, "codigo_barras", "ean", "barras") ?? "").replace(/^0+/, "") ===
              v.replace(/\D/g, "").replace(/^0+/, ""),
          );
          if (exato || linhas.length === 1) {
            setProduto(mapear(exato || linhas[0], t));
          } else {
            setResultados(linhas.map((l: any) => mapear(l, t)));
          }
          setLoading(false);
          return;
        }
      }

      if (indisponivel) {
        const achados = await buscarLocal(storeId, t);
        if (achados.length === 1) setProduto(achados[0]);
        else if (achados.length) setResultados(achados);
        else setAviso(`Produto ${t} não encontrado no cadastro desta loja.`);
        setLoading(false);
        return;
      }

      const { data: sistema } = await supabase.rpc("store_sistema", { _store_id: storeId });
      if (numerico && String(sistema || "").toLowerCase() === "oracle") {
        setAviso(
          "Esta loja usa o conector Oracle (Intersolid), que hoje só permite pesquisar o catálogo pelo NOME do produto — a busca por código de barras precisa ser liberada pelo fornecedor do ERP. Digite parte da descrição do produto para consultar o preço.",
        );
      } else {
        setAviso(ultimoAviso || `Produto ${t} não encontrado no cadastro desta loja.`);
      }
    } catch (err: any) {
      setAviso(err.message);
    } finally {
      setLoading(false);
    }
  };



  const iniciarScan = () => {
    setAviso(null);
    setProduto(null);
    setScanning(true);
  };


  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-4 max-w-2xl mx-auto">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Consulta de Preços</h1>
          <p className="text-sm text-muted-foreground">
            Escaneie o código de barras com a câmera ou digite o código.
          </p>
        </div>

        {stores.length > 1 && (
          <Select
            value={storeId}
            onValueChange={(v) => {
              setStoreId(v);
              setStoreName(stores.find((s) => s.id === v)?.name || "");
              setProduto(null);
            }}
          >
            <SelectTrigger className="w-full"><SelectValue placeholder="Loja" /></SelectTrigger>
            <SelectContent>
              {stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Button className="w-full h-14 text-base" onClick={iniciarScan} disabled={!storeId}>
          <ScanLine className="w-5 h-5 mr-2" /> Consultar Preço
        </Button>

        {scanning && (
          <BarcodeScanner
            onClose={() => setScanning(false)}
            onDetect={(texto) => {
              setScanning(false);
              setCodigo(texto);
              buscar(texto);
            }}
          />
        )}


        <div className="flex gap-2">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar(codigo)}
            placeholder="Código de barras, código reduzido ou nome do produto"
          />
          <Button variant="outline" onClick={() => buscar(codigo)} disabled={loading || !storeId}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>

        {aviso && (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            {aviso}
          </div>
        )}

        {resultados.length > 0 && !produto && (
          <div className="rounded-lg border border-border bg-card divide-y divide-border">
            {resultados.map((p, i) => (
              <button
                key={`${p.codigo}-${i}`}
                onClick={() => {
                  setProduto(p);
                  setResultados([]);
                }}
                className="w-full text-left p-3 hover:bg-muted/50 flex items-center justify-between gap-3"
              >
                <span className="text-sm text-foreground">{p.descricao}</span>
                <span className="text-sm font-semibold tabular-nums text-foreground">
                  {fmtBRL(p.preco)}
                </span>
              </button>
            ))}
          </div>
        )}


        {produto && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Descrição</p>
              <p className="text-lg font-semibold text-foreground leading-tight">{produto.descricao}</p>
              <p className="text-xs text-muted-foreground mt-1">EAN {produto.ean}</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
              <div className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Cód. Reduzido</p>
                <p className="text-base font-medium text-foreground tabular-nums">{produto.codigo || "—"}</p>
              </div>
              <div className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Estoque</p>
                <p className="text-base font-medium text-foreground tabular-nums">
                  {produto.estoque ?? "—"}
                </p>
              </div>
            </div>
            <div className="p-4 border-b border-border">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Categoria</p>
              <p className="text-base font-medium text-foreground">{produto.categoria || "—"}</p>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Preço Atual</p>
                <p className="text-2xl font-bold text-foreground tabular-nums">{fmtBRL(produto.preco)}</p>
              </div>
              <div className="p-4">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Preço Promo</p>
                <p className="text-2xl font-bold text-primary tabular-nums">{fmtBRL(produto.precoOferta)}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
};

export default ConsultaPreco;
