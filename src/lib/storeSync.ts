import { supabase } from "@/integrations/supabase/client";

export interface SyncJob {
  id: string; store_id: string; status: string; started_at: string; updated_at: string;
  finished_at: string | null; d1: string; total: number; processed: number;
  succeeded: number; failed: number; unavailable: number;
  current_report: string | null; last_error: string | null;
}
export interface SyncSummary { store_id: string; last_saved_at: string | null; saved_reports: number; data_through: string | null }
export const syncAtiva = (job?: SyncJob | null) => !!job && ["pending", "running"].includes(job.status);
export const syncInterrompida = (job?: SyncJob | null) => syncAtiva(job) && !!job && Date.now() - Date.parse(job.updated_at) > 160000;
export const fmtSync = (iso?: string | null) => iso ? new Date(iso).toLocaleString("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "Nunca sincronizada";

export async function iniciarSync(storeId: string, job?: SyncJob | null): Promise<string> {
  const { data, error } = await supabase.functions.invoke("sync-diario-d1", {
    body: syncAtiva(job) ? { action: "resume", job_id: job?.id } : { store_id: storeId },
  });
  if (error) {
    const context = error.context;
    const body = context instanceof Response ? await context.json().catch(() => null) : null;
    throw new Error(body?.erro ?? error.message);
  }
  if (data?.erro || !data?.job_id) throw new Error(data?.erro ?? "A sincronização não foi iniciada");
  return String(data.job_id);
}

export async function lerJob(id: string): Promise<SyncJob> {
  const { data, error } = await supabase.from("store_sync_jobs")
    .select("id, store_id, status, started_at, updated_at, finished_at, d1, total, processed, succeeded, failed, unavailable, current_report, last_error")
    .eq("id", id).single();
  if (error) throw new Error("Não foi possível ler o progresso da sincronização");
  return data;
}

// Poll only an explicitly requested synchronization; never query the ERP on mount.
export async function acompanharSync(id: string, onProgress?: (job: SyncJob) => void): Promise<SyncJob> {
  for (;;) {
    const job = await lerJob(id);
    onProgress?.(job);
    if (!syncAtiva(job)) return job;
    if (syncInterrompida(job)) throw new Error("Sincronização interrompida. Os dados concluídos ficaram salvos; clique em Retomar.");
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}