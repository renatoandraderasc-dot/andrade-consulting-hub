import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ClientLayout from "@/components/ClientLayout";
import { ContRedeTab } from "@/components/controladoria/ContRedeTab";
import { LancamentosTab } from "@/components/controladoria/LancamentosTab";
import { HistoricoTab } from "@/components/controladoria/HistoricoTab";
import { ClassificacoesConfigTab } from "@/components/controladoria/ClassificacoesConfigTab";
import { CategoriasConfigTab } from "@/components/controladoria/CategoriasConfigTab";
import { AgendaFinanceiraTab } from "@/components/controladoria/AgendaFinanceiraTab";
import { AgendaAnaliseTab } from "@/components/controladoria/AgendaAnaliseTab";
import { DadosVrTab } from "@/components/controladoria/DadosVrTab";
import { ClipboardList } from "lucide-react";
import { motion } from "framer-motion";

const Controladoria = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
      return;
    }
    if (user) fetchStoreInfo();
  }, [user, authLoading]);

  const fetchStoreInfo = async () => {
    const sid = sessionStorage.getItem("selectedStoreId");
    if (sid) {
      const { data } = await supabase.from("stores").select("id, name").eq("id", sid).single();
      if (data) {
        setStoreName(data.name);
        setStoreId(data.id);
      }
    } else {
      const { data } = await supabase
        .from("user_store_access")
        .select("stores(id, name)")
        .eq("user_id", user!.id)
        .eq("approved", true)
        .limit(1);
      if (data && data.length > 0) {
        const store = (data[0] as any).stores;
        if (store) {
          setStoreName(store.name);
          setStoreId(store.id);
        }
      }
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  return (
    <ClientLayout storeName={storeName}>
      <div className="container mx-auto px-4 py-6 max-w-[1400px]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-7 h-7 text-primary" />
            <div>
              <h1 className="font-display text-2xl font-bold">
                Controladoria <span className="text-gradient-gold">{storeName}</span>
              </h1>
              <p className="text-muted-foreground font-body text-xs">
                Gestão financeira e gerencial
              </p>
            </div>
          </div>
        </motion.div>

        <Tabs defaultValue="contrede" className="w-full">
          <TabsList className="mb-6 bg-card border border-border h-11 flex-wrap">
            <TabsTrigger
              value="contrede"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-3 sm:px-6 font-medium text-xs sm:text-sm"
            >
              Cont Rede
            </TabsTrigger>
            <TabsTrigger
              value="lancamentos"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-3 sm:px-6 font-medium text-xs sm:text-sm"
            >
              Lançamentos
            </TabsTrigger>
            <TabsTrigger
              value="historico"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-3 sm:px-6 font-medium text-xs sm:text-sm"
            >
              Histórico
            </TabsTrigger>
            <TabsTrigger
              value="classificacoes"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-3 sm:px-6 font-medium text-xs sm:text-sm"
            >
              Classificações
            </TabsTrigger>
            <TabsTrigger
              value="categorias"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-3 sm:px-6 font-medium text-xs sm:text-sm"
            >
              Categorias
            </TabsTrigger>
            <TabsTrigger
              value="agenda"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-3 sm:px-6 font-medium text-xs sm:text-sm"
            >
              Agenda Financeira
            </TabsTrigger>
            <TabsTrigger
              value="agenda-analise"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-3 sm:px-6 font-medium text-xs sm:text-sm"
            >
              Análise Agenda
            </TabsTrigger>
            <TabsTrigger
              value="dados-vr"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-3 sm:px-6 font-medium text-xs sm:text-sm"
            >
              Dados do VR
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger
                value="classificacao-vr"
                className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-3 sm:px-6 font-medium text-xs sm:text-sm"
              >
                Classificação VR
              </TabsTrigger>
            )}
          </TabsList>


          <TabsContent value="contrede">
            <ContRedeTab storeId={storeId} onGoClassificacao={() => setTab("classificacao-vr")} />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="classificacao-vr">
              <ClassificacaoVrTab storeId={storeId} />
            </TabsContent>
          )}


          <TabsContent value="lancamentos">
            <LancamentosTab storeId={storeId} storeName={storeName} />
          </TabsContent>

          <TabsContent value="historico">
            <HistoricoTab storeId={storeId} />
          </TabsContent>

          <TabsContent value="classificacoes">
            <ClassificacoesConfigTab />
          </TabsContent>

          <TabsContent value="categorias">
            <CategoriasConfigTab />
          </TabsContent>

          <TabsContent value="agenda">
            <AgendaFinanceiraTab storeId={storeId} />
          </TabsContent>

          <TabsContent value="agenda-analise">
            <AgendaAnaliseTab storeId={storeId} />
          </TabsContent>

          <TabsContent value="dados-vr">
            <DadosVrTab storeId={storeId} />
          </TabsContent>

        </Tabs>
      </div>
    </ClientLayout>
  );
};

export default Controladoria;
