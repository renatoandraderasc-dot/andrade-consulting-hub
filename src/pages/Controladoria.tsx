import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassificacaoTab } from "@/components/controladoria/ClassificacaoTab";
import { ContRedeTab } from "@/components/controladoria/ContRedeTab";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const Controladoria = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground font-[DM_Sans]">
              Controladoria
            </h1>
            <p className="text-sm text-muted-foreground">
              Gestão financeira e gerencial da rede
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <Tabs defaultValue="classificacao" className="w-full">
          <TabsList className="mb-6 bg-card border border-border h-11">
            <TabsTrigger
              value="classificacao"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-6 font-medium"
            >
              Classificação
            </TabsTrigger>
            <TabsTrigger
              value="contrede"
              className="data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground px-6 font-medium"
            >
              Cont Rede
            </TabsTrigger>
          </TabsList>

          <TabsContent value="classificacao">
            <ClassificacaoTab />
          </TabsContent>

          <TabsContent value="contrede">
            <ContRedeTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Controladoria;
