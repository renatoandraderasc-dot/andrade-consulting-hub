import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  storeId: string;
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

const SyncStatusBadge = ({ storeId }: Props) => {
  const [info, setInfo] = useState<SyncInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInfo = async () => {
    const { data } = await supabase
      .from("store_vr_config")
      .select("last_sync_at, last_error")
      .eq("store_id", storeId)
      .maybeSingle();
    setInfo(data ?? { last_sync_at: null, last_error: null });
    setLoading(false);
  };

  useEffect(() => {
    if (!storeId) return;
    fetchInfo();
    const channel = supabase
      .channel(`sync-status-${storeId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "store_vr_config", filter: `store_id=eq.${storeId}` },
        () => fetchInfo(),
      )
      .subscribe();
    const interval = setInterval(fetchInfo, 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
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
      {hasSync && (
        <span className="text-muted-foreground">· {formatDateTime(info.last_sync_at!)}</span>
      )}
    </div>
  );
};

export default SyncStatusBadge;
