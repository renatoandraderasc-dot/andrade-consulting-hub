import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ClientLayout from "@/components/ClientLayout";
import BasesAutoPanel from "@/components/repricing/BasesAutoPanel";
import RepricingResultTable from "@/components/repricing/RepricingResultTable";
import { useRepricingProcessor, useRepricingDiagnostico } from "@/components/repricing/useRepricingProcessor";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RotateCcw, FileSpreadsheet } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import ConcorrentesTab from "@/components/repricing/ConcorrentesTab";

const Repricing = () => {
  const [searchParams] = useSearchParams();
  const [storeId, setStoreId] = useState(
    () => searchParams.get("store") || sessionStorage.getItem("selectedStoreId") || "",
  );
  const [storeName, setStoreName] = useState("");

  const [produtos, setProdutos] = useState<Record<string, unknown>[]>([]);
  const [concorrentes, setConcorrentes] = useState<Record<string, unknown>[]>([]);
  const [auxiliar, setAuxiliar] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    const handleStoreChange = (event: Event) => {
      const nextStoreId = (event as CustomEvent<string>).detail;
      if (!nextStoreId) return;
      setStoreId(nextStoreId);
      setProdutos([]);
      setConcorrentes([]);
      setAuxiliar([]);
    };
    window.addEventListener("store-changed", handleStoreChange);
    return () => window.removeEventListener("store-changed", handleStoreChange);
  }, []);

  useEffect(() => {
    if (!storeId) {
      setStoreName("");
      return;
    }
    supabase.from("stores").select("name").eq("id", storeId).single()
      .then(({ data }) => { if (data) setStoreName(data.name); });
  }, [storeId]);

  const rows = useRepricingProcessor(produtos, concorrentes, auxiliar);
  const diag = useRepricingDiagnostico(produtos, concorrentes);
  const allLoaded = produtos.length > 0 && concorrentes.length > 0;

  const handleReset = () => {
    setProdutos([]);
    setConcorrentes([]);
    setAuxiliar([]);
    toast.info("Bases resetadas. Faça upload novamente.");
  };

  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Re-PRICING</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Carregue as bases do próprio sistema para cruzar preços e analisar competitividade
            </p>
          </div>
          {allLoaded && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4 mr-1" /> Nova Análise
            </Button>
          )}
        </div>

        <Tabs defaultValue="bases">
          <TabsList>
            <TabsTrigger value="bases">Bases de Comparação</TabsTrigger>
            <TabsTrigger value="concorrentes">Concorrentes & Coleta</TabsTrigger>
          </TabsList>

          <TabsContent value="concorrentes" className="mt-4">
            <ConcorrentesTab />
          </TabsContent>

          <TabsContent value="bases" className="mt-4 space-y-5">
        <BasesAutoPanel
          storeId={storeId}
          onProdutos={setProdutos}
          onConcorrente={setConcorrentes}
          onInterna={setAuxiliar}
          produtosCount={produtos.length}
          concorrenteCount={concorrentes.length}
          internaCount={auxiliar.length}
        />

        {/* Status */}
        {(produtos.length > 0 || concorrentes.length > 0) && (
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className="gap-1.5 py-1">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {rows.length} produtos cruzados por código de barras
            </Badge>
            <Badge variant="outline" className={`py-1 ${diag.produtosComEan ? "" : "bg-destructive/10 text-destructive border-destructive/30"}`}>
              Loja: {diag.produtosComEan.toLocaleString("pt-BR")} com código · {diag.produtosSemEan.toLocaleString("pt-BR")} sem código
            </Badge>
            <Badge variant="outline" className={`py-1 ${diag.concorrentesComEan ? "" : "bg-destructive/10 text-destructive border-destructive/30"}`}>
              Concorrente: {diag.concorrentesComEan.toLocaleString("pt-BR")} com código · {diag.concorrentesSemEan.toLocaleString("pt-BR")} sem código
            </Badge>
            {auxiliar.length > 0 && (
              <Badge variant="outline" className="gap-1.5 py-1 bg-amber-500/10 text-amber-700 border-amber-500/20">
                <Sparkles className="w-3.5 h-3.5" />
                Base auxiliar disponível para correspondência IA
              </Badge>
            )}
          </div>
        )}

        {/* Results */}
        {allLoaded && rows.length > 0 && <RepricingResultTable rows={rows} />}

        {allLoaded && rows.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nenhum produto cruzado</p>
            <p className="text-sm mt-1">
              {diag.produtosComEan === 0 && diag.concorrentesComEan === 0
                ? "Nenhum dos dois lados tem código de barras: a loja e o concorrente estão sem essa informação."
                : diag.produtosComEan === 0
                  ? "O cadastro da loja não traz código de barras — o sistema da loja não está publicando esse campo."
                  : diag.concorrentesComEan === 0
                    ? "A pesquisa do concorrente está sem código de barras nos itens coletados."
                    : "Os dois lados têm código de barras, mas nenhum código coincide entre as bases."}
            </p>
          </div>
        )}

        {!allLoaded && (
          <div className="text-center py-12 text-muted-foreground">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Aguardando o carregamento das bases</p>
            <p className="text-sm mt-1">Carregue pelo menos o <strong>cadastro atual da loja</strong> e a <strong>pesquisa do concorrente</strong> para iniciar a análise.</p>
          </div>
        )}
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
};

export default Repricing;
