import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ClientLayout from "@/components/ClientLayout";
import FileUploadCard from "@/components/repricing/FileUploadPanel";
import RepricingResultTable from "@/components/repricing/RepricingResultTable";
import { useRepricingProcessor } from "@/components/repricing/useRepricingProcessor";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, RotateCcw, FileSpreadsheet } from "lucide-react";

const Repricing = () => {
  const [searchParams] = useSearchParams();
  const storeId = searchParams.get("store") || "";
  const [storeName, setStoreName] = useState("");

  const [produtos, setProdutos] = useState<Record<string, unknown>[]>([]);
  const [concorrentes, setConcorrentes] = useState<Record<string, unknown>[]>([]);
  const [auxiliar, setAuxiliar] = useState<Record<string, unknown>[]>([]);

  useEffect(() => {
    if (!storeId) return;
    supabase.from("stores").select("name").eq("id", storeId).single()
      .then(({ data }) => { if (data) setStoreName(data.name); });
  }, [storeId]);

  const rows = useRepricingProcessor(produtos, concorrentes, auxiliar);
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
              Importe as bases para cruzar preços e analisar competitividade
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
            <TabsTrigger value="bases">Importação de Bases</TabsTrigger>
            <TabsTrigger value="concorrentes">Concorrentes & Coleta</TabsTrigger>
          </TabsList>

          <TabsContent value="concorrentes" className="mt-4">
            <ConcorrentesTab />
          </TabsContent>

          <TabsContent value="bases" className="mt-4 space-y-5">
        {/* Upload Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <FileUploadCard
            label="Tipo 1: Cadastro Atual dos Produtos"
            description="Base com EAN, preço atual, custo e classificação mercadológica dos produtos da loja."
            expectedColumns={["EAN", "Descrição", "Custo", "Preço", "Mercadológico"]}
            onDataLoaded={(data) => { setProdutos(data); if (data.length) toast.success(`${data.length} produtos carregados`); }}
            loaded={produtos.length > 0}
            rowCount={produtos.length}
          />
          <FileUploadCard
            label="Tipo 2: Pesquisa Grandes"
            description="Base do concorrente com EAN, preço normal e preço de oferta."
            expectedColumns={["EAN", "Preço", "Oferta"]}
            onDataLoaded={(data) => { setConcorrentes(data); if (data.length) toast.success(`${data.length} itens do concorrente carregados`); }}
            loaded={concorrentes.length > 0}
            rowCount={concorrentes.length}
          />
          <FileUploadCard
            label="Tipo 3: Pesquisa Base Interna"
            description="Cadastro auxiliar ampliado para correspondência por descrição quando EAN não for encontrado."
            expectedColumns={["EAN", "Descrição"]}
            onDataLoaded={(data) => { setAuxiliar(data); if (data.length) toast.success(`${data.length} itens auxiliares carregados`); }}
            loaded={auxiliar.length > 0}
            rowCount={auxiliar.length}
          />
        </div>

        {/* Status */}
        {allLoaded && (
          <div className="flex items-center gap-3 flex-wrap">
            <Badge variant="outline" className="gap-1.5 py-1">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {rows.length} produtos cruzados por EAN
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
            <p className="text-sm mt-1">Verifique se as colunas de EAN estão corretas nas duas bases.</p>
          </div>
        )}

        {!allLoaded && (
          <div className="text-center py-12 text-muted-foreground">
            <FileSpreadsheet className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Aguardando upload das bases</p>
            <p className="text-sm mt-1">Importe pelo menos a <strong>Base de Produtos</strong> e a <strong>Pesquisa Grandes</strong> para iniciar a análise.</p>
          </div>
        )}
      </div>
    </ClientLayout>
  );
};

export default Repricing;
