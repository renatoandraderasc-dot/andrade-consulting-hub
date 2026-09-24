import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  storeId: string;
  onSyncChange?: () => void;
}

interface SyncInfo {
  last_sync_at: string | null;
  last_error: string | null;
}

const formatDateTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const SyncStatusBadge = ({ storeId, onSyncChange }: Props) => {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!storeId) return;
    // Consulta o banco no máximo 1 vez por dia por loja; senão usa o salvo.
    const chave = `sync_status_${storeId}`;
    const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    try {
      const salvo = JSON.parse(localStorage.getItem(chave) || "null");
      if (salvo && salvo.dia === hoje) {
        setInfo(salvo.info);
        setLoading(false);
        return;
      }
    } catch { /* ignora */ }
    let ativo = true;
    (async () => {
      const { data, error } = await supabase
        .from("store_vr_config")
        .select("last_sync_at, last_error")
        .eq("store_id", storeId)
        .maybeSingle();
      if (!ativo) return;
      const nextInfo = data ?? { last_sync_at: null, last_error: null };
      if (!error) localStorage.setItem(chave, JSON.stringify({ dia: hoje, info: nextInfo }));
      setInfo(nextInfo);
      setLoading(false);
    })();
    return () => { ativo = false; };
  }, [storeId]);

  if (loading || !info) return null;

  const hasError = !!info.last_error;
  const hasSync = !!info.last_sync_at;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-body ${
        hasError
          ? "border-red-500/30 bg-red-500/10 text-red-400"
          : hasSync
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
          : "border-border bg-card text-muted-foreground"
      }`}
      title={info.last_error || undefined}
    >
      {hasError ? (
        <AlertTriangle className="w-3.5 h-3.5" />
      ) : hasSync ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : (
        <RefreshCw className="w-3.5 h-3.5" />
      )}
      <span className="font-medium">
        {hasError ? "Erro no sync" : hasSync ? "Sync OK" : "Sem sync"}
      </span>
      {info.last_sync_at && <span className="text-muted-foreground">· {formatDateTime(info.last_sync_at)}</span>}
    </div>
  );
};

export default SyncStatusBadge;
