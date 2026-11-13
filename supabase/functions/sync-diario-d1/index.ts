import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@4";
import { consultarComCache, ontemBrasilia, type ConfigLojaCache } from "../_shared/cacheRelatorio.ts";
import { planejarSincronizacao, type TarefaSync } from "../_shared/hubDados.ts";
import { permiteSincronizar } from "../_shared/syncAutorizacao.ts";

const DataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)), "Data inválida");
const Body = z.object({
  store_id: z.string().uuid().optional(),
  action: z.enum(["start", "resume"]).default("start"),
  job_id: z.string().uuid().optional(),
  so_existentes: z.boolean().optional(),
  backfill: z.object({ inicio: DataISO, fim: DataISO }).refine(v => v.inicio <= v.fim && (Date.parse(v.fim) - Date.parse(v.inicio)) / 86400000 < 366, "Intervalo inválido ou maior que 366 dias").optional(),
});

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ erro: "Método não permitido" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ erro: "Serviço de sincronização indisponível" }, 500);
  const service = createClient(supabaseUrl, serviceKey);
  try {
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ erro: "Informe uma loja e datas válidas" }, 400);
    const body = parsed.data;
    const authorization = req.headers.get("Authorization") ?? "";
    const secret = Deno.env.get("SYNC_VR_SECRET");
    const interno = authorization === `Bearer ${serviceKey}` || (!!secret && req.headers.get("x-sync-secret") === secret);
    let admin = interno;
    let userId: string | undefined;
    if (!interno) {
      if (!authorization.startsWith("Bearer ")) return json({ erro: "Não autenticado" }, 401);
      const auth = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
      const { data, error } = await auth.auth.getClaims(authorization.slice(7));
      if (error || !data?.claims?.sub) return json({ erro: "Sessão inválida" }, 401);
      userId = String(data.claims.sub);
      const { data: roles } = await service.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin");
      admin = !!roles?.length;
    }
    let storeId = body.store_id;
    if (body.action === "resume") {
      if (!body.job_id) return json({ erro: "Sincronização não informada" }, 400);
      const { data: job } = await service.from("store_sync_jobs").select("store_id").eq("id", body.job_id).maybeSingle();
      if (!job) return json({ erro: "Sincronização não encontrada" }, 404);
      storeId = job.store_id;
    }
    let aprovado = false;
    if (!admin && userId && storeId) {
      const { data } = await service.from("user_store_access").select("id").eq("user_id", userId).eq("store_id", storeId).eq("approved", true).limit(1);
      aprovado = !!data?.length;
    }
    if (!permiteSincronizar(admin, aprovado, storeId)) return json({ erro: "Sem permissão para sincronizar esta loja" }, 403);
    if (body.backfill && !storeId) return json({ erro: "Informe a loja para carregar o histórico" }, 400);

    // A request returns immediately. The persisted queue is processed in short
    // invocations, each with a lease, so slow stores do not hit gateway timeouts.
    const executar = async (id: string) => {
      const lease = crypto.randomUUID();
      const agora = new Date().toISOString();
      const { data: job, error: leaseError } = await service.from("store_sync_jobs").update({
        status: "running", lease_id: lease, lease_until: new Date(Date.now() + 155000).toISOString(), updated_at: agora,
      }).eq("id", id).in("status", ["pending", "running"])
        .or(`lease_until.is.null,lease_until.lt.${agora}`).select("*").maybeSingle();
      if (leaseError || !job) return;
      try {
        const { data: config } = await service.from("store_vr_config").select("api_url, api_key, sistema, codigo_loja, modo_sync, enabled").eq("store_id", job.store_id).maybeSingle();
        if (!config || config.enabled === false) throw new Error("Conexão desligada ou não cadastrada");
        const cfg = config as ConfigLojaCache;
        const tasks = job.tasks as TarefaSync[];
        let processed = job.processed, succeeded = job.succeeded, failed = job.failed, unavailable = job.unavailable;
        let lastError = job.last_error as string | null;
        const inicio = Date.now();
        while (processed < tasks.length && Date.now() - inicio < 65000) {
          const t = tasks[processed];
          await service.from("store_sync_jobs").update({ current_report: t.relatorio, updated_at: new Date().toISOString() }).eq("id", id).eq("lease_id", lease);
          const resultado = await consultarComCache({ supabaseUrl, serviceKey, storeId: job.store_id, relatorio: t.relatorio, params: t.params,
            cfg, forcar: true, origem: "job", timeoutMs: 90000 });
          if (resultado.ok) succeeded++;
          else if (/relatorio.*(nao encontrado|não encontrado|nao existe)|404|não publicado/i.test(resultado.erro ?? "")) unavailable++;
          else { failed++; lastError = `${t.relatorio}: ${resultado.erro ?? "Sem resposta"}`.slice(0, 400); }
          processed++;
          const { error: progressError } = await service.from("store_sync_jobs").update({ processed, succeeded, failed, unavailable, last_error: lastError, updated_at: new Date().toISOString() }).eq("id", id).eq("lease_id", lease);
          if (progressError) throw new Error("Não foi possível salvar o progresso");
        }
        if (processed === tasks.length) {
          const status = failed ? (succeeded ? "partial" : "failed") : (succeeded ? "completed" : "failed");
          const finishedAt = new Date().toISOString();
          const mensagem = lastError ?? (succeeded ? null : "Nenhum relatório disponível nesta loja");
          await service.from("store_sync_jobs").update({ status, finished_at: finishedAt, updated_at: finishedAt, lease_until: null, current_report: null, last_error: mensagem }).eq("id", id).eq("lease_id", lease);
          await service.from("store_vr_config").update({ ...(status === "completed" ? { last_sync_at: finishedAt } : {}), last_error: status === "completed" ? null : mensagem }).eq("store_id", job.store_id);
        } else {
          await service.from("store_sync_jobs").update({ lease_until: null }).eq("id", id).eq("lease_id", lease);
          // Start the next short worker, rather than holding this HTTP request.
          const next = await fetch(`${supabaseUrl}/functions/v1/sync-diario-d1`, {
            method: "POST", headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ action: "resume", job_id: id }), signal: AbortSignal.timeout(15000),
          });
          if (!next.ok) throw new Error("Sincronização interrompida. Retome para buscar somente os relatórios pendentes.");
          await next.body?.cancel();
        }
      } catch (e) {
        // Saved tasks remain resumable; UI explicitly offers Resume after failure.
        await service.from("store_sync_jobs").update({ lease_until: null, last_error: e instanceof Error ? e.message : "Sincronização interrompida", updated_at: new Date(Date.now() - 180000).toISOString() }).eq("id", id).eq("lease_id", lease);
      }
    };
    if (body.action === "resume" && body.job_id) {
      EdgeRuntime.waitUntil(executar(body.job_id));
      return json({ ok: true, job_id: body.job_id, store_id: storeId });
    }
    let q = service.from("store_vr_config").select("store_id, enabled, modo_sync").neq("enabled", false);
    q = storeId ? q.eq("store_id", storeId) : q.eq("modo_sync", "diario_d1");
    const { data: configs, error } = await q;
    if (error) return json({ erro: "Não foi possível carregar as lojas" }, 500);
    if (!configs?.length) return json({ erro: "Loja sem conexão ativa cadastrada" }, 400);
    const jobs: { id: string; store_id: string }[] = [];
    const d1 = ontemBrasilia();
    for (const cfg of configs) {
      const { data: active } = await service.from("store_sync_jobs").select("id, store_id").eq("store_id", cfg.store_id).in("status", ["pending", "running"]).maybeSingle();
      if (active) { jobs.push(active); continue; }
      const existentes: TarefaSync[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data: page, error: cacheError } = await service.from("relatorio_cache").select("relatorio, params").eq("store_id", cfg.store_id).order("id").range(offset, offset + 999);
        if (cacheError) throw new Error("Não foi possível ler o Hub");
        existentes.push(...(page ?? []).map(r => ({ relatorio: r.relatorio, params: r.params as Record<string, unknown> })));
        if ((page?.length ?? 0) < 1000) break;
      }
      const tasks = planejarSincronizacao(d1, existentes, body.so_existentes, body.backfill);
      const { data: created, error: createError } = await service.from("store_sync_jobs").insert({ store_id: cfg.store_id, d1, tasks, total: tasks.length }).select("id, store_id").single();
      if (createError) {
        if (createError.code !== "23505") throw new Error("Não foi possível iniciar a sincronização");
        const { data: concurrent } = await service.from("store_sync_jobs").select("id, store_id").eq("store_id", cfg.store_id).in("status", ["pending", "running"]).single();
        if (concurrent) jobs.push(concurrent);
      } else jobs.push(created);
    }
    for (const job of jobs) EdgeRuntime.waitUntil(executar(job.id));
    return json({ ok: true, d1, jobs, job_id: jobs[0]?.id });
  } catch (e) {
    return json({ erro: e instanceof Error ? e.message : "Erro ao iniciar sincronização" }, 500);
  }
});
