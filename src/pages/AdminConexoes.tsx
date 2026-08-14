import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClientLayout from "@/components/ClientLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw, Plug } from "lucide-react";

interface Row {
  store_id: string;
  name: string;
  api_url: string | null;
  api_key: string | null;
  sistema: string | null;
  enabled: boolean | null;
  codigo_loja: number | null;
  online?: boolean | null;
  latency?: number | null;
  erro?: string | null;
  checking?: boolean;
}

const pendencias = (r: Row): string[] => {
  const out: string[] = [];
  if (!r.api_url && !r.api_key && !r.sistema) return ["Conexão não cadastrada (sem ERP configurado)"];
  if (!r.sistema) out.push("Definir o sistema (VR / ORACLE / WEBSAC)");
  if (!r.api_url || /SEU-DOMINIO|SEU_DOMINIO|example/i.test(r.api_url))
    out.push("Informar a URL real do conector (URL ainda é placeholder)");
  if (!r.api_key) out.push("Informar a chave de acesso da API");
  if ((r.sistema ?? "").toUpperCase() === "ORACLE" && r.codigo_loja == null)
    out.push("Informar o código da loja (obrigatório no Oracle)");
  if (r.enabled === false) out.push("Conexão desativada — ativar o conector");
  if (r.online === false && out.length === 0)
    out.push(r.erro?.includes("tunel") || r.erro?.includes("túnel")
      ? "Servidor/túnel da loja fora do ar — ligar o conector na loja"
      : `Servidor não respondeu: ${r.erro ?? "sem resposta"}`);
  return out;
};

const AdminConexoes = () => {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingAll, setTestingAll] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) navigate("/login");
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const load = async () => {
    setLoading(true);
    const [{ data: stores }, { data: cfgs }] = await Promise.all([
      supabase.from("stores").select("id, name").order("name"),
      supabase.from("store_vr_config").select("*"),
    ]);
    const map = new Map((cfgs || []).map((c: any) => [c.store_id, c]));
    setRows(
      (stores || []).map((s) => {
        const c: any = map.get(s.id) || {};
        return {
          store_id: s.id,
          name: s.name,
          api_url: c.api_url ?? null,
          api_key: c.api_key ?? null,
          sistema: c.sistema ?? null,
          enabled: c.enabled ?? null,
          codigo_loja: c.codigo_loja ?? null,
        } as Row;
      }),
    );
    setLoading(false);
  };

  const testar = async (storeId: string) => {
    setRows((prev) => prev.map((r) => (r.store_id === storeId ? { ...r, checking: true } : r)));
    const { data, error } = await supabase.functions.invoke("vr-health", { body: { store_id: storeId } });
    setRows((prev) =>
      prev.map((r) =>
        r.store_id === storeId
          ? {
              ...r,
              checking: false,
              online: error ? false : !!data?.online,
              latency: data?.latency_ms ?? null,
              erro: error ? error.message : data?.erro ?? null,
            }
          : r,
      ),
    );
  };

  const testarTodos = async () => {
    setTestingAll(true);
    for (const r of rows) {
      if (r.api_url || r.sistema) await testar(r.store_id);
    }
    setTestingAll(false);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground font-body">Carregando...</p>
      </div>
    );
  }

  const conectadas = rows.filter((r) => r.online === true).length;
  const comProblema = rows.filter((r) => r.online === false).length;
  const semCadastro = rows.filter((r) => !r.api_url && !r.sistema).length;

  return (
    <ClientLayout>
      <div className="container mx-auto px-6 py-10 max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-heading font-bold flex items-center gap-3">
              <Plug className="w-7 h-7 text-primary" /> Gestão de Conexão
            </h1>
            <p className="text-sm text-muted-foreground font-body mt-1">
              Situação da conexão de cada cliente com o ERP (VR, Oracle ou WebSac).
            </p>
          </div>
          <Button onClick={testarTodos} disabled={testingAll}>
            <RefreshCw className={`w-4 h-4 mr-2 ${testingAll ? "animate-spin" : ""}`} />
            Testar todas
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Clientes", value: rows.length },
            { label: "Conectados", value: conectadas },
            { label: "Com problema", value: comProblema },
            { label: "Sem cadastro", value: semCadastro },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground font-body">{k.label}</p>
              <p className="text-2xl font-heading font-bold">{k.value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          {rows.map((r) => {
            const faltas = pendencias(r);
            const status =
              r.checking ? "checking" : r.online === true ? "on" : r.online === false ? "off" : "unknown";
            return (
              <div key={r.store_id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {status === "on" ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : status === "off" ? (
                      <XCircle className="w-5 h-5 text-red-500" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-heading font-semibold">{r.name}</p>
                      <p className="text-xs text-muted-foreground font-body break-all">
                        {(r.sistema ?? "sem sistema").toUpperCase()} ·{" "}
                        {r.api_url || "sem URL"}
                        {r.latency != null && status === "on" ? ` · ${r.latency} ms` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-body px-2.5 py-1 rounded-full border ${
                        status === "on"
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                          : status === "off"
                          ? "border-red-500/30 bg-red-500/10 text-red-500"
                          : "border-border text-muted-foreground"
                      }`}
                    >
                      {status === "on"
                        ? "Conectado"
                        : status === "off"
                        ? "Sem conexão"
                        : status === "checking"
                        ? "Testando..."
                        : "Não testado"}
                    </span>
                    <Button size="sm" variant="outline" onClick={() => testar(r.store_id)} disabled={r.checking}>
                      Testar
                    </Button>
                  </div>
                </div>

                {faltas.length > 0 && (
                  <ul className="mt-3 pl-8 space-y-1">
                    {faltas.map((f) => (
                      <li key={f} className="text-xs font-body text-amber-500 flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {f}
                      </li>
                    ))}
                  </ul>
                )}
                {faltas.length === 0 && status === "on" && (
                  <p className="mt-3 pl-8 text-xs font-body text-emerald-500">Conexão completa e respondendo.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ClientLayout>
  );
};

export default AdminConexoes;
