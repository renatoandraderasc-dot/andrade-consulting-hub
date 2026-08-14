import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScanLine, X, Search, Loader2 } from "lucide-react";
import { BrowserMultiFormatReader, IScannerControls } from "@zxing/browser";
import { supabase } from "@/integrations/supabase/client";
import { chamarRelatorio, avisoRelatorio, pick as col } from "@/lib/vrReport";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
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
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

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

  useEffect(() => () => controlsRef.current?.stop(), []);

  const buscar = async (termo: string) => {
    const t = termo.trim();
    if (!t || !storeId) return;
    setLoading(true);
    setAviso(null);
    setProduto(null);
    try {
      const r = await chamarRelatorio(storeId, "catalogo_produtos", { busca: t, limite: 5, offset: 0 });
      const av = avisoRelatorio(r);
      const l = r.dados[0];
      if (!l) {
        setAviso(av || "Produto não encontrado.");
      } else {
        setProduto({
          codigo: String(col(l, "codigo", "cod_produto", "codigo_reduzido", "produto") ?? ""),
          descricao: String(col(l, "descricao", "produto", "nome") ?? ""),
          estoque: col(l, "estoque", "saldo_estoque", "qtd_estoque", "estoque_atual") ?? null,
          categoria: String(
            col(l, "m2_grupo", "categoria", "m1_departamento", "departamento", "secao") ?? "—",
          ),
          preco: col(l, "preco_venda", "preco", "venda") ?? null,
          precoOferta: col(l, "preco_oferta", "oferta") ?? null,
          ean: String(col(l, "codigo_barras", "ean", "barras") ?? t),
        });
      }
    } catch (err: any) {
      setAviso(err.message);
    } finally {
      setLoading(false);
    }
  };

  const pararScan = () => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    const v = videoRef.current;
    const s = v?.srcObject as MediaStream | null;
    s?.getTracks().forEach((t) => t.stop());
    if (v) v.srcObject = null;
    setScanning(false);
  };

  // o <video> só existe depois que scanning vira true — por isso a câmera
  // é ligada aqui, com o elemento já montado no DOM.
  useEffect(() => {
    if (!scanning) return;
    let cancelado = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        const video = videoRef.current;
        if (cancelado || !video) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play().catch(() => undefined);

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoElement(video, (result) => {
          if (!result) return;
          const texto = result.getText();
          pararScan();
          setCodigo(texto);
          buscar(texto);
        });
        if (cancelado) controls.stop();
        else controlsRef.current = controls;
      } catch {
        if (cancelado) return;
        setScanning(false);
        setAviso(
          "Não foi possível acessar a câmera. Verifique a permissão do navegador e use HTTPS.",
        );
      }
    })();

    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

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

        {!scanning ? (
          <Button className="w-full h-14 text-base" onClick={iniciarScan} disabled={!storeId}>
            <ScanLine className="w-5 h-5 mr-2" /> Consultar Preço
          </Button>
        ) : (
          <div className="relative rounded-lg overflow-hidden border border-border bg-black">
            <video ref={videoRef} className="w-full aspect-[3/4] object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 h-24 border-2 border-primary rounded-md" />
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-2 right-2"
              onClick={pararScan}
            >
              <X className="w-4 h-4 mr-1" /> Fechar
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && buscar(codigo)}
            placeholder="Código de barras ou código reduzido"
            inputMode="numeric"
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
