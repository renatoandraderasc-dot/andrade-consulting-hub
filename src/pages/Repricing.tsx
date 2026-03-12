import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import ClientLayout from "@/components/ClientLayout";
import RepricingKPIs from "@/components/repricing/RepricingKPIs";
import RepricingFilters from "@/components/repricing/RepricingFilters";
import RepricingTable from "@/components/repricing/RepricingTable";
import SimulacaoPanel from "@/components/repricing/SimulacaoPanel";
import ConcorrentesTab from "@/components/repricing/ConcorrentesTab";
import { mockProducts, allCategorias, type Product } from "@/components/repricing/mockData";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Store } from "lucide-react";

const Repricing = () => {
  const [searchParams] = useSearchParams();
  const storeId = searchParams.get("store") || "";
  const [storeName, setStoreName] = useState("");

  const [products, setProducts] = useState<Product[]>(mockProducts);
  const [search, setSearch] = useState("");
  const [categoria, setCategoria] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [margemRange, setMargemRange] = useState("todos");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (!storeId) return;
    supabase.from("stores").select("name").eq("id", storeId).single()
      .then(({ data }) => { if (data) setStoreName(data.name); });
  }, [storeId]);

  const filtered = useMemo(() => {
    return products.filter(p => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.descricao.toLowerCase().includes(q) && !p.codigo.includes(q) && !p.categoria.toLowerCase().includes(q)) return false;
      }
      if (categoria !== "todos" && p.categoria !== categoria) return false;
      if (status !== "todos" && p.status !== status) return false;
      if (margemRange !== "todos") {
        const [min, max] = margemRange === "50+" ? [50, Infinity] : margemRange.split("-").map(Number);
        if (p.margem < min || p.margem >= (max === Infinity ? Infinity : max)) return false;
      }
      return true;
    });
  }, [products, search, categoria, status, margemRange]);

  const handleSimulacaoChange = (id: string, value: number | null) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, simulacao: value } : p));
  };

  const handleExport = (format: "csv" | "xlsx") => {
    const header = ["Categoria", "Código", "Descrição", "Custo", "Preço Atual", "Margem%", "Ampla", "Baixa", "Direto", "Simulação", "Status"];
    const rows = filtered.map(p => [
      p.categoria, p.codigo, p.descricao,
      p.custo.toFixed(2), p.precoAtual.toFixed(2), p.margem.toFixed(1),
      p.amplaConcorrente?.toFixed(2) ?? "", p.baixaConcorrencia?.toFixed(2) ?? "",
      p.direto?.toFixed(2) ?? "", p.simulacao?.toFixed(2) ?? "", p.status
    ]);
    const csv = [header, ...rows].map(r => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `repricing-${new Date().toISOString().slice(0, 10)}.${format === "csv" ? "csv" : "csv"}`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Arquivo ${format.toUpperCase()} exportado com sucesso`);
  };

  const handleImport = () => toast.info("Funcionalidade de importação será integrada em breve.");
  const handleRefresh = () => toast.info("Atualização de preços da concorrência será integrada em breve.");

  return (
    <ClientLayout storeName={storeName}>
      <div className="p-4 md:p-6 space-y-5 max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Re-PRICING</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Comparativo de preços entre produtos ativos da loja e concorrência
          </p>
        </div>

        <Tabs defaultValue="produtos" className="space-y-4">
          <TabsList>
            <TabsTrigger value="produtos" className="gap-1.5"><ShoppingCart className="w-4 h-4" /> Produtos</TabsTrigger>
            <TabsTrigger value="concorrentes" className="gap-1.5"><Store className="w-4 h-4" /> Concorrentes</TabsTrigger>
          </TabsList>

          <TabsContent value="produtos" className="space-y-5">
            <RepricingKPIs products={filtered} />

            <RepricingFilters
              search={search} onSearchChange={setSearch}
              categoria={categoria} onCategoriaChange={setCategoria}
              status={status} onStatusChange={setStatus}
              margemRange={margemRange} onMargemRangeChange={setMargemRange}
              categorias={allCategorias}
              onImport={handleImport}
              onExport={handleExport}
              onRefresh={handleRefresh}
            />

            {selectedProduct && (
              <SimulacaoPanel
                product={selectedProduct}
                onClose={() => setSelectedProduct(null)}
              />
            )}

            <RepricingTable
              products={filtered}
              onSimulacaoChange={handleSimulacaoChange}
              onSelectProduct={setSelectedProduct}
            />
          </TabsContent>

          <TabsContent value="concorrentes">
            <ConcorrentesTab />
          </TabsContent>
        </Tabs>
      </div>
    </ClientLayout>
  );
};

export default Repricing;
