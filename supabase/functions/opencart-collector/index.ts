import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const LIMIT = 100;          // produtos por página de listagem
const MAX_PAGES = 40;       // trava de segurança por categoria
const CONCURRENCY = 3;      // HTML é pesado — ritmo baixo
const PAUSA_MS = 400;       // pausa entre requisições
const LOTE_CATEGORIAS = 15;
const UPSERT_BATCH = 400;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FilaItem {
  path: string;
  nome: string;
  arvore: string;
  status: "pendente" | "feita" | "erro";
  erro?: string;
}

interface Ctx {
  jobId: string;
  host: string;
  siteId: string;
  storeId: string | null;
  cookie: string;
  praca: string | null;
  fila: FilaItem[];
  pagesDone: number;
  requisicoes: number;
  rateLimitHits: number;
  skusGravados: number;
  skusValidos: number;
  skusIndisponiveis: number;
  skusSemEan: number;
  lojistas: Set<string>;
  log: string[];
}

function logLine(ctx: Ctx, msg: string) {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  ctx.log.push(line);
  if (ctx.log.length > 300) ctx.log.splice(0, ctx.log.length - 300);
  console.log(line);
}

// ------------------------------------------------------------------ http

async function pegar(ctx: Ctx, url: string, tries = 3): Promise<{ html: string | null; erro?: string; cookies?: string[] }> {
  let ultimo = "sem resposta";
  for (let i = 0; i < tries; i++) {
    ctx.requisicoes++;
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": UA,
          "Accept-Language": "pt-BR,pt;q=0.9",
          Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          ...(ctx.cookie ? { Cookie: ctx.cookie } : {}),
        },
        redirect: "follow",
      });
      if (resp.status === 429 || resp.status >= 500) {
        if (resp.status === 429) ctx.rateLimitHits++;
        ultimo = `HTTP ${resp.status}`;
        await sleep(800 * Math.pow(2, i));
        continue;
      }
      if (!resp.ok) return { html: null, erro: `HTTP ${resp.status}` };
      const cookies = (resp.headers as any).getSetCookie?.() ?? [];
      return { html: await resp.text(), cookies };
    } catch (e) {
      ultimo = e instanceof Error ? e.message : String(e);
      await sleep(600 * Math.pow(2, i));
    }
  }
  return { html: null, erro: ultimo };
}

// --------------------------------------------------------------- sessão/loja

async function abrirSessao(ctx: Ctx) {
  const home = await pegar(ctx, `https://${ctx.host}/`);
  for (const c of home.cookies || []) {
    const par = c.split(";")[0];
    if (/^OCSESSID=|^PHPSESSID=/i.test(par)) ctx.cookie = par;
  }
  if (!ctx.storeId) {
    throw new Error(
      "cadastre a loja/praça deste site (campo Loja externa) antes de coletar — sem isso os preços vêm de uma loja imprevisível",
    );
  }
  const sel = await pegar(
    ctx,
    `https://${ctx.host}/index.php?route=product/storebyproduct/selectStore&store_id=${ctx.storeId}&pickup=0`,
  );
  for (const c of sel.cookies || []) {
    const par = c.split(";")[0];
    if (/^OCSESSID=|^PHPSESSID=/i.test(par)) ctx.cookie = par;
  }
  const resposta = (sel.html || "").replace(/<[^>]*>/g, " ").trim().slice(0, 80);
  if (!resposta) throw new Error("o site não confirmou a loja selecionada");
  ctx.lojistas.add(resposta);
  logLine(ctx, `loja fixada: ${resposta}`);
  if (ctx.praca) {
    const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!norm(resposta).includes(norm(ctx.praca))) {
      throw new Error(
        `praça divergente: o site respondeu "${resposta}", mas o esperado é "${ctx.praca}". Coleta abortada para não gravar preços de outra cidade.`,
      );
    }
  }
  return resposta;
}

// ------------------------------------------------------------- categorias

function extrairCategorias(html: string): FilaItem[] {
  const re =
    /href="[^"]*index\.php\?route=product\/category(?:&amp;|&)path=([0-9_]+)"[^>]*>([\s\S]{0,120}?)<\/a>/g;
  const nomes = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const path = m[1];
    const nome = m[2].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    if (!nomes.has(path) && nome && !/ver todos/i.test(nome)) nomes.set(path, nome);
    else if (!nomes.has(path)) nomes.set(path, path);
  }
  const paths = [...nomes.keys()];
  // folhas = caminhos que não são prefixo de nenhum outro
  const folhas = paths.filter(
    (p) => !paths.some((o) => o !== p && o.startsWith(p + "_")),
  );
  return folhas.map((p) => {
    const partes = p.split("_");
    const arvore = partes
      .map((_, i) => nomes.get(partes.slice(0, i + 1).join("_")))
      .filter(Boolean)
      .join(" > ");
    return {
      path: p,
      nome: nomes.get(p) || p,
      arvore: arvore || nomes.get(p) || p,
      status: "pendente" as const,
    };
  });
}

// --------------------------------------------------------------- produtos

function numero(txt: string | undefined): number {
  if (!txt) return 0;
  const limpo = txt.replace(/[^\d.,]/g, "");
  // formatos possíveis: 19.90 · 1.234,56 · 19,90
  if (/,\d{1,2}$/.test(limpo)) return Number(limpo.replace(/\./g, "").replace(",", ".")) || 0;
  return Number(limpo.replace(/,/g, "")) || 0;
}

function campo(bloco: string, chave: string): string | undefined {
  const m = bloco.match(
    new RegExp(`['"]${chave}['"]\\s*:\\s*(?:'([^']*)'|"([^"]*)")`),
  );
  return m ? (m[1] ?? m[2]) : undefined;
}

interface Produto {
  ean: string | null;
  sku: string;
  produto: string;
  marca: string | null;
  categoria: string;
  arvore: string;
  preco: number | null;
  preco_de: number | null;
  disponivel: boolean;
  em_promocao: boolean;
  url: string | null;
  imagem_url: string | null;
  praca: string | null;
  coletado_em: string;
}

function extrairProdutos(html: string, leaf: FilaItem, praca: string | null): Produto[] {
  const out: Produto[] = [];
  const re = /const args = \{([\s\S]*?)\};/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const b = m[1];
    const sku = campo(b, "product_id");
    if (!sku) continue;
    const thumb = campo(b, "thumb") || "";
    const eanM = thumb.match(/product_picture\.php\?p=(\d{8,14})/);
    let ean: string | null = eanM ? eanM[1] : null;
    if (ean && (/^0+/.test(ean) || ean.length < 12)) ean = null; // código interno, não EAN
    const preco = numero(campo(b, "price"));
    const special = numero(campo(b, "special"));
    const estoque = Number(campo(b, "stock") || "0") || 0;
    const atual = special > 0 ? special : preco;
    const disponivel = estoque > 0 && atual > 0;
    out.push({
      ean,
      sku,
      produto: campo(b, "name") || "",
      marca: null,
      categoria: leaf.nome,
      arvore: leaf.arvore,
      preco: disponivel ? atual : null,
      preco_de: disponivel && preco > atual ? preco : null,
      disponivel,
      em_promocao: disponivel && preco > atual,
      url: campo(b, "href") || null,
      imagem_url: thumb || null,
      praca,
      coletado_em: new Date().toISOString(),
    });
  }
  return out;
}

function paraLinha(ctx: Ctx, p: Produto) {
  if (!p.ean) ctx.skusSemEan++;
  if (p.disponivel) ctx.skusValidos++;
  else ctx.skusIndisponiveis++;
  return {
    site_concorrente_id: ctx.siteId,
    job_id: ctx.jobId,
    sku: p.sku,
    produto_id: p.sku,
    ean: p.ean,
    nome: p.produto,
    marca: p.marca,
    categoria: p.categoria,
    arvore_categoria: p.arvore,
    url: p.url,
    imagem_url: p.imagem_url,
    preco: p.preco,
    preco_de: p.preco_de,
    preco_auditoria: p.disponivel ? null : null,
    disponivel: p.disponivel,
    em_promocao: p.em_promocao,
    lojista: p.praca,
    sales_channel: 1,
    seller_id: ctx.storeId,
    seller_nome: p.praca,
    coletado_em: p.coletado_em,
  };
}

async function persist(ctx: Ctx, buffer: any[], force = false) {
  while (buffer.length >= UPSERT_BATCH || (force && buffer.length > 0)) {
    const chunk = buffer.splice(0, UPSERT_BATCH);
    const seen = new Map<string, any>();
    for (const r of chunk) seen.set(r.sku, r);
    const { error } = await supabase
      .from("precos_concorrente")
      .upsert([...seen.values()], { onConflict: "site_concorrente_id,sku" });
    if (error) logLine(ctx, `ERRO ao gravar: ${error.message}`);
    else ctx.skusGravados += seen.size;
  }
}

async function coletarCategoria(ctx: Ctx, leaf: FilaItem, buffer: any[]) {
  const vistos = new Set<string>();
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      `https://${ctx.host}/index.php?route=product/category&path=${leaf.path}&limit=${LIMIT}&page=${page}`;
    const { html, erro } = await pegar(ctx, url);
    ctx.pagesDone++;
    if (erro) return page === 1 ? erro : undefined;
    if (!html) return undefined;
    const prods = extrairProdutos(html, leaf, [...ctx.lojistas][0] || null);
    const novos = prods.filter((p) => !vistos.has(p.sku));
    if (novos.length === 0) return undefined; // página vazia ou repetida
    for (const p of novos) {
      vistos.add(p.sku);
      buffer.push(paraLinha(ctx, p));
    }
    await persist(ctx, buffer);
    await sleep(PAUSA_MS);
    if (prods.length < LIMIT) return undefined;
  }
  return undefined;
}

// ------------------------------------------------------------- job state

function contarFila(fila: FilaItem[]) {
  let pendentes = 0, feitas = 0, erros = 0;
  for (const f of fila) {
    if (f.status === "feita") feitas++;
    else if (f.status === "erro") erros++;
    else pendentes++;
  }
  return { pendentes, feitas, erros };
}

async function gravarJob(ctx: Ctx, extra: Record<string, unknown> = {}) {
  const { feitas, erros } = contarFila(ctx.fila);
  const total = ctx.fila.length || 1;
  const pct = Math.min(99, Math.round(((feitas + erros) / total) * 100));
  await supabase.from("scrape_jobs").update({
    fila: ctx.fila,
    ultima_atividade: new Date().toISOString(),
    pages_crawled: ctx.pagesDone,
    total_pages: ctx.fila.length,
    products_found: ctx.skusGravados,
    skus_validos: ctx.skusValidos,
    skus_indisponiveis: ctx.skusIndisponiveis,
    skus_sem_ean: ctx.skusSemEan,
    rate_limit_hits: ctx.rateLimitHits,
    lojista_detectado: [...ctx.lojistas].slice(0, 5).join(", ") || null,
    categorias_erro: ctx.fila.filter((f) => f.status === "erro")
      .map((f) => ({ nome: f.arvore, erro: f.erro })).slice(0, 100),
    log_lines: ctx.log.slice(-120),
    progress_pct: pct,
    updated_at: new Date().toISOString(),
    ...extra,
  }).eq("id", ctx.jobId);
}

async function marcarSite(ctx: Ctx, status: string) {
  if (!ctx.siteId) return;
  await supabase.from("sites_concorrentes").update({
    ultima_coleta: new Date().toISOString(),
    status_ultima_coleta: status,
  }).eq("id", ctx.siteId);
}

async function carregarCtx(jobId: string): Promise<Ctx> {
  const { data: job } = await supabase
    .from("scrape_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) throw new Error("coleta não encontrada");
  const { data: site } = await supabase
    .from("sites_concorrentes").select("*").eq("id", job.site_concorrente_id).maybeSingle();
  return {
    jobId,
    host: job.host,
    siteId: job.site_concorrente_id,
    storeId: site?.loja_externa_id ?? null,
    cookie: "",
    praca: site?.praca_esperada ?? null,
    fila: (job.fila as FilaItem[]) || [],
    pagesDone: job.pages_crawled ?? 0,
    requisicoes: 0,
    rateLimitHits: job.rate_limit_hits ?? 0,
    skusGravados: job.products_found ?? 0,
    skusValidos: job.skus_validos ?? 0,
    skusIndisponiveis: job.skus_indisponiveis ?? 0,
    skusSemEan: job.skus_sem_ean ?? 0,
    lojistas: new Set(
      String(job.lojista_detectado || "").split(",").map((s) => s.trim()).filter(Boolean),
    ),
    log: (job.log_lines as string[]) || [],
  };
}

function reinvocar(body: Record<string, unknown>) {
  return fetch(`${SUPABASE_URL}/functions/v1/opencart-collector`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(body),
  }).catch((e) => console.log("falha ao reinvocar:", e));
}

// ------------------------------------------------------------------ lote

async function processarLote(jobId: string) {
  const { data: estado } = await supabase
    .from("scrape_jobs").select("status, finished_at").eq("id", jobId).maybeSingle();
  if (!estado || estado.finished_at ||
      (estado.status !== "crawling" && estado.status !== "pending")) return;

  let ctx: Ctx;
  try { ctx = await carregarCtx(jobId); } catch (e) { console.log("lote abortado:", e); return; }

  const buffer: any[] = [];
  try {
    await abrirSessao(ctx);
    const pendentes = ctx.fila.filter((f) => f.status === "pendente");
    const lote = pendentes.slice(0, LOTE_CATEGORIAS);
    if (lote.length === 0) {
      await gravarJob(ctx, { status: "done", progress_pct: 100, finished_at: new Date().toISOString() });
      await marcarSite(ctx, "concluída");
      return;
    }
    logLine(ctx, `processando ${lote.length} categorias (${pendentes.length} pendentes)`);

    let cursor = 0;
    const worker = async () => {
      while (cursor < lote.length) {
        const leaf = lote[cursor++];
        const erro = await coletarCategoria(ctx, leaf, buffer);
        if (erro) {
          leaf.status = "erro";
          leaf.erro = erro;
          logLine(ctx, `erro em "${leaf.arvore}": ${erro}`);
        } else {
          leaf.status = "feita";
          leaf.erro = undefined;
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    await persist(ctx, buffer, true);

    const { pendentes: restam, feitas, erros } = contarFila(ctx.fila);
    if (restam > 0) {
      await gravarJob(ctx, { status: "crawling" });
      await reinvocar({ action: "batch", jobId });
    } else {
      logLine(
        ctx,
        `concluído: ${ctx.skusGravados} produtos gravados, ${ctx.skusValidos} com preço válido, ` +
          `${ctx.skusSemEan} sem código de barras, ${feitas} categorias ok, ${erros} com erro`,
      );
      await gravarJob(ctx, { status: "done", progress_pct: 100, finished_at: new Date().toISOString() });
      await marcarSite(ctx, erros > 0 ? `concluída com ${erros} erro(s)` : "concluída");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logLine(ctx, `FALHA no lote: ${msg}`);
    try { await persist(ctx, buffer, true); } catch (_) { /* ignore */ }
    await gravarJob(ctx, { status: "error", error_message: msg, finished_at: new Date().toISOString() });
    await marcarSite(ctx, "erro");
  }
}

async function prepararJob(ctx: Ctx) {
  try {
    logLine(ctx, `iniciando coleta OpenCart em ${ctx.host}`);
    await abrirSessao(ctx);
    const { html, erro } = await pegar(ctx, `https://${ctx.host}/`);
    if (!html) throw new Error(erro || "não foi possível ler a home do site");
    const folhas = extrairCategorias(html);
    if (!folhas.length) throw new Error("não foi possível ler as categorias do site");
    ctx.fila = folhas;
    logLine(ctx, `${folhas.length} categorias encontradas`);
    await gravarJob(ctx, { status: "crawling" });
    await reinvocar({ action: "batch", jobId: ctx.jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logLine(ctx, `FALHA: ${msg}`);
    await gravarJob(ctx, { status: "error", error_message: msg, finished_at: new Date().toISOString() });
    await marcarSite(ctx, "erro");
  }
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "start";

    if (action === "batch") {
      if (!body.jobId) throw new Error("jobId obrigatório");
      // @ts-ignore EdgeRuntime global
      EdgeRuntime.waitUntil(processarLote(body.jobId));
      return json({ success: true });
    }

    if (action === "cancel") {
      await supabase.from("scrape_jobs").update({
        status: "error",
        error_message: "coleta cancelada pelo usuário",
        finished_at: new Date().toISOString(),
      }).eq("id", body.jobId);
      return json({ success: true });
    }

    if (action === "resume") {
      const jobId = body.jobId;
      if (!jobId) throw new Error("jobId obrigatório");
      const { data: job } = await supabase
        .from("scrape_jobs").select("fila").eq("id", jobId).maybeSingle();
      const fila = ((job?.fila as FilaItem[]) || []).map((f) =>
        f.status === "feita" ? f : { ...f, status: "pendente" as const, erro: undefined }
      );
      await supabase.from("scrape_jobs").update({
        fila, status: "crawling", error_message: null, finished_at: null,
        ultima_atividade: new Date().toISOString(),
      }).eq("id", jobId);
      // @ts-ignore EdgeRuntime global
      EdgeRuntime.waitUntil(processarLote(jobId));
      return json({ success: true, jobId });
    }

    if (action === "lojas") {
      const host = String(body.host || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
      const resp = await fetch(
        `https://${host}/index.php?route=product/storebyproduct/stores&product_id=0`,
        { headers: { "User-Agent": UA, Accept: "application/json" } },
      );
      const lojas = await resp.json().catch(() => []);
      return json({ success: true, lojas });
    }

    // ---- start
    const siteId = body.site_id ?? body.site_concorrente_id;
    if (!siteId) throw new Error("selecione um site do catálogo");
    const { data: site } = await supabase
      .from("sites_concorrentes").select("*").eq("id", siteId).maybeSingle();
    if (!site) throw new Error("site não encontrado no catálogo");
    if (site.ativo === false) throw new Error("site ainda não liberado para coleta");

    const host = String(site.host || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    const { data: job, error: jErr } = await supabase.from("scrape_jobs").insert({
      competitor_url: `https://${host}`,
      competitor_name: site.nome,
      site_concorrente_id: siteId,
      host,
      sales_channel: 1,
      status: "pending",
      progress_pct: 0,
      log_lines: [],
      fila: [],
      seller_esperado: site.praca_esperada || null,
      ultima_atividade: new Date().toISOString(),
    }).select("id").single();
    if (jErr) throw jErr;

    const ctx: Ctx = {
      jobId: job.id,
      host,
      siteId,
      storeId: site.loja_externa_id ?? null,
      cookie: "",
      praca: site.praca_esperada ?? null,
      fila: [],
      pagesDone: 0,
      requisicoes: 0,
      rateLimitHits: 0,
      skusGravados: 0,
      skusValidos: 0,
      skusIndisponiveis: 0,
      skusSemEan: 0,
      lojistas: new Set<string>(),
      log: [],
    };

    // @ts-ignore EdgeRuntime global
    EdgeRuntime.waitUntil(prepararJob(ctx));
    return json({ success: true, jobId: job.id, host });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
