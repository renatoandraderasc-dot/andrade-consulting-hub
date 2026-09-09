import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings2, Save, Clock, Loader2, RefreshCw } from "lucide-react";
import { CartProgressOverlay } from "@/components/CartProgress";

type ConfigRow = {
  id: string;
  chave: string;
  valor: string | null;
  tipo: string;
  descricao: string | null;
  categoria: string;
  opcoes: any;
  updated_at: string;
};

const OPCOES_INTERVALO = [
  { label: "15 minutos", value: "15" },
  { label: "30 minutos", value: "30" },
  { label: "1 hora", value: "60" },
  { label: "2 horas", value: "120" },
  { label: "6 horas", value: "360" },
  { label: "12 horas", value: "720" },
  { label: "Diário", value: "1440" },
];

const booleanValue = (v: string | null) =>
  v === "true" || v === "1" || v === "yes" || v === "sim";

const AdminParametrizacoes = () => {
  const { user, isGlobalAdmin: isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cronStatus, setCronStatus] = useState<{ schedule?: string; next_run?: string } | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("saas_config")
        .select("*")
        .order("categoria", { ascending: true })
        .order("chave", { ascending: true });
      if (error) throw error;
      setConfigs(data || []);
      await loadCronStatus();
    } catch (err: any) {
      toast({ title: "Erro ao carregar", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadCronStatus = async () => {
    try {
      const { data, error } = await supabase.rpc("get_sync_rede_cron_status" as any);
      if (!error && data) setCronStatus(data as any);
    } catch {
      setCronStatus(null);
    }
  };

  const handleChange = (id: string, novoValor: string) => {
    setConfigs((prev) => prev.map((c) => (c.id === id ? { ...c, valor: novoValor } : c)));
  };

  const salvar = async () => {
    setSaving(true);
    try {
      for (const c of configs) {
        const { error } = await supabase
          .from("saas_config")
          .update({ valor: c.valor })
          .eq("id", c.id);
        if (error) throw error;
      }
      toast({ title: "Configurações salvas", description: "As parametrizações foram atualizadas." });
      await loadCronStatus();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const categorias = useMemo(() => {
    const map = new Map<string, ConfigRow[]>();
    for (const c of configs) {
      const lista = map.get(c.categoria) || [];
      lista.push(c);
      map.set(c.categoria, lista);
    }
    return Array.from(map.entries());
  }, [configs]);

  const renderInput = (c: ConfigRow) => {
    if (c.tipo === "boolean") {
      return (
        <div className="flex items-center gap-3">
          <Switch
            id={c.id}
            checked={booleanValue(c.valor)}
            onCheckedChange={(v) => handleChange(c.id, v ? "true" : "false")}
          />
          <Label htmlFor={c.id} className="text-sm text-muted-foreground">
            {booleanValue(c.valor) ? "Ativado" : "Desativado"}
          </Label>
        </div>
      );
    }

    if (c.tipo === "select") {
      const opcoes = Array.isArray(c.opcoes)
        ? c.opcoes.map((o: any) => ({ label: o.label || o.value, value: String(o.value) }))
        : OPCOES_INTERVALO;
      return (
        <Select value={c.valor || ""} onValueChange={(v) => handleChange(c.id, v)}>
          <SelectTrigger className="w-full md:w-64">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            {opcoes.map((o: any) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (c.tipo === "number") {
      return (
        <Input
          type="number"
          value={c.valor || ""}
          onChange={(e) => handleChange(c.id, e.target.value)}
          className="w-full md:w-48"
        />
      );
    }

    return (
      <Input
        value={c.valor || ""}
        onChange={(e) => handleChange(c.id, e.target.value)}
        className="w-full"
      />
    );
  };

  if (authLoading || loading) {
    return (
      <ClientLayout>
        <CartProgressOverlay label="Carregando parametrizações..." />
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Settings2 className="w-5 h-5 text-primary" />
              <h1 className="font-display text-2xl font-bold">Parametrizações Gerais</h1>
            </div>
            <p className="text-sm text-muted-foreground font-body">
              Ajuste aqui todos os comportamentos parametrizáveis dos SaaS.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading || saving}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Recarregar
            </Button>
            <Button onClick={salvar} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Salvar alterações
            </Button>
          </div>
        </div>

        {cronStatus && (
          <Card className="mb-6 border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-body flex items-center gap-2">
                <Clock className="w-4 h-4" /> Status da atualização automática — Visão da Rede
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-body">
                <span className="font-medium">Agendamento:</span>{" "}
                {cronStatus.schedule || "Não agendado"}
              </p>
              {cronStatus.next_run && (
                <p className="text-sm font-body text-muted-foreground mt-1">
                  Próxima execução: {new Date(cronStatus.next_run).toLocaleString("pt-BR")}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {categorias.map(([categoria, items]) => (
            <Card key={categoria}>
              <CardHeader>
                <CardTitle className="text-base font-display">{categoria}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {items.map((c) => (
                  <div key={c.id} className="grid md:grid-cols-[1fr,auto] gap-3 items-start border-b border-border pb-4 last:border-0 last:pb-0">
                    <div>
                      <Label className="text-sm font-medium font-body">{c.chave}</Label>
                      {c.descricao && (
                        <p className="text-xs text-muted-foreground font-body mt-0.5">{c.descricao}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/70 font-body mt-1">
                        Tipo: {c.tipo} · Atualizado em: {new Date(c.updated_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="md:text-right">{renderInput(c)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={salvar} disabled={saving} size="lg">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar alterações
          </Button>
        </div>
      </div>
    </ClientLayout>
  );
};

export default AdminParametrizacoes;
