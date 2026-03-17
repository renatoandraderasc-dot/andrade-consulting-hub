import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { RefreshCw, CheckCircle2, AlertTriangle, Clock, Database, Loader2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";

interface SyncResult {
  status: "success" | "error" | "partial";
  message: string;
  stores_synced: string[];
  records_inserted: number;
  errors: string[];
  timestamp: string;
  duration_ms: number;
  discovery?: {
    reportUrls: string[];
    dailyRecords: number;
    sampleData: any[];
    htmlSize: number;
  };
}

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const WebSacSync = () => {
  const { user, loading: authLoading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [history, setHistory] = useState<SyncResult[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading]);

  const runSync = async (mode: "full" | "incremental" = "full") => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-websac", {
        body: { mode, month: selectedMonth, year: selectedYear },
      });

      if (error) throw error;

      const result = data as SyncResult;
      setLastResult(result);
      setHistory((prev) => [result, ...prev].slice(0, 10));

      toast({
        title: result.status === "success" ? "Sincronização concluída" : "Sincronização parcial",
        description: result.message,
        variant: result.status === "error" ? "destructive" : "default",
      });
    } catch (err: any) {
      const errorResult: SyncResult = {
        status: "error",
        message: err.message || "Erro ao sincronizar",
        stores_synced: [],
        records_inserted: 0,
        errors: [err.message],
        timestamp: new Date().toISOString(),
        duration_ms: 0,
      };
      setLastResult(errorResult);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSyncing(false);
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
    <ClientLayout>
      <div className="container mx-auto px-4 py-6 max-w-[1200px]">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <Database className="w-7 h-7 text-primary" />
              <div>
                <h1 className="font-display text-2xl font-bold">
                  Sincronização <span className="text-gradient-gold">WebSac</span>
                </h1>
                <p className="text-muted-foreground font-body text-xs">
                  SM Nascimento Embu & Osasco — Atualização automática de indicadores
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="bg-card border border-border rounded-lg px-3 py-1.5 font-body text-xs"
              >
                {MONTHS.slice(1).map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="bg-card border border-border rounded-lg px-3 py-1.5 font-body text-xs"
              >
                {[2024, 2025, 2026].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* Action buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-sm font-semibold">Coleta Completa</h3>
                  <p className="text-muted-foreground text-xs font-body mt-1">
                    Busca todos os dados do mês selecionado no WebSac
                  </p>
                </div>
                <Button onClick={() => runSync("full")} disabled={syncing} size="sm">
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  {syncing ? "Sincronizando..." : "Executar"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display text-sm font-semibold">Atualização Incremental</h3>
                  <p className="text-muted-foreground text-xs font-body mt-1">
                    Atualiza apenas dados novos desde última sincronização
                  </p>
                </div>
                <Button onClick={() => runSync("incremental")} disabled={syncing} variant="outline" size="sm">
                  {syncing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
                  {syncing ? "Atualizando..." : "Atualizar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Last Result */}
        {lastResult && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card className={`mb-6 border ${
              lastResult.status === "success" ? "border-green-500/30" : 
              lastResult.status === "partial" ? "border-yellow-500/30" : "border-red-500/30"
            }`}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-display">
                  {lastResult.status === "success" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                  {lastResult.status === "partial" && <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                  {lastResult.status === "error" && <AlertTriangle className="w-4 h-4 text-red-500" />}
                  Resultado da Última Sincronização
                  <Badge variant={lastResult.status === "success" ? "default" : "destructive"} className="ml-auto text-[10px]">
                    {lastResult.status.toUpperCase()}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm font-body text-muted-foreground">{lastResult.message}</p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-background rounded-lg p-3 text-center">
                    <p className="text-lg font-bold font-display">{lastResult.records_inserted}</p>
                    <p className="text-[10px] text-muted-foreground font-body">Registros salvos</p>
                  </div>
                  <div className="bg-background rounded-lg p-3 text-center">
                    <p className="text-lg font-bold font-display">{lastResult.stores_synced.length}</p>
                    <p className="text-[10px] text-muted-foreground font-body">Lojas sincronizadas</p>
                  </div>
                  <div className="bg-background rounded-lg p-3 text-center">
                    <p className="text-lg font-bold font-display">{lastResult.discovery?.reportUrls?.length || 0}</p>
                    <p className="text-[10px] text-muted-foreground font-body">Relatórios encontrados</p>
                  </div>
                  <div className="bg-background rounded-lg p-3 text-center">
                    <p className="text-lg font-bold font-display">{(lastResult.duration_ms / 1000).toFixed(1)}s</p>
                    <p className="text-[10px] text-muted-foreground font-body">Duração</p>
                  </div>
                </div>

                {lastResult.stores_synced.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold font-body mb-1">Lojas atualizadas:</p>
                    <div className="flex flex-wrap gap-1">
                      {lastResult.stores_synced.map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {lastResult.discovery?.reportUrls && lastResult.discovery.reportUrls.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold font-body mb-1">URLs de relatórios descobertos:</p>
                    <div className="bg-background rounded-lg p-2 max-h-32 overflow-y-auto">
                      {lastResult.discovery.reportUrls.map((url, i) => (
                        <p key={i} className="text-[10px] font-mono text-muted-foreground">{url}</p>
                      ))}
                    </div>
                  </div>
                )}

                {lastResult.discovery?.sampleData && lastResult.discovery.sampleData.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold font-body mb-1">Amostra dos dados coletados:</p>
                    <div className="bg-background rounded-lg p-2 max-h-40 overflow-auto">
                      <pre className="text-[10px] font-mono text-muted-foreground">
                        {JSON.stringify(lastResult.discovery.sampleData, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                {lastResult.errors.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-500 font-body mb-1">Erros:</p>
                    {lastResult.errors.map((e, i) => (
                      <p key={i} className="text-[10px] text-red-400 font-mono">{e}</p>
                    ))}
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground font-body flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(lastResult.timestamp).toLocaleString("pt-BR")}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Sync History */}
        {history.length > 1 && (
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display">Histórico de Sincronizações</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.slice(1).map((h, i) => (
                  <div key={i} className="flex items-center justify-between bg-background rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      {h.status === "success" ? (
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 text-red-500" />
                      )}
                      <span className="text-xs font-body">{h.records_inserted} registros</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-body">
                      {new Date(h.timestamp).toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </ClientLayout>
  );
};

export default WebSacSync;
