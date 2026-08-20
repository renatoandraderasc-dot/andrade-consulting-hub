import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAGE_SIZE = 50;
const WINDOW_CAP = 2500; // _from acima disso e rejeitado
const UPSERT_BATCH = 500;
const LOTE_CATEGORIAS = 40;
const CONCURRENCY = 5;
const EAN_SONDA = "7891000100103";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ tipos

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
  sc: number;
  concorrenteId: string;
  cookie: string | null;
  regionId: string | null;
  cep: string | null;
  sellerId: string | null;
  sellerNome: string | null;
  fila: FilaItem[];
  rateLimitHits: number;
  requisicoes: number;
  pagesDone: number;
  skusGravados: number;
  skusValidos: number;
  skusIndisponiveis: number;
  skusSemEan: number;
  lojistas: Set<string>;
  categoriasIncompletas: { path: string; nome: string }[];
  log: string[];
}

function logLine(ctx: Ctx, msg: string) {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  ctx.log.push(line);
  if (ctx.log.length > 300) ctx.log.splice(0, ctx.log.length - 300);
  console.log(line);
}

// ---------------------------------------------------------------- request

function baseHeaders(ctx: Ctx): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/json",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
  };
  if (ctx.cookie) h["Cookie"] = ctx.cookie;
  return h;
}

async function fetchJson(
  ctx: Ctx,
  url: string,
  tries = 4,
): Promise<{ data: any | null; erro?: string }> {
  let ultimoErro = "sem resposta";
  for (let i = 0; i < tries; i++) {
    ctx.requisicoes++;
    try {
      const resp = await fetch(url, { headers: baseHeaders(ctx) });
      if (resp.status === 429 || resp.status >= 500) {
        if (resp.status === 429) ctx.rateLimitHits++;
        ultimoErro = `HTTP ${resp.status}`;
        await sleep(Math.round(600 * Math.pow(2, i) + Math.random() * 500));
        continue;
      }
      if (resp.status === 206 || resp.ok) {
        const text = await resp.text();
        if (!text) return { data: null };
        try {
          return { data: JSON.parse(text) };
        } catch {
          return { data: null, erro: "resposta invalida" };
        }
      }
      return { data: null, erro: `HTTP ${resp.status}` };
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
      await sleep(Math.round(500 * Math.pow(2, i) + Math.random() * 400));
    }
  }
  return { data: null, erro: ultimoErro };
}

// ---------------------------------------------------------------- regiao

function montarCookie(regionId: string, sc: number) {
  const seg = {
    campaigns: null,
    channel: String(sc || 1),
    priceTables: null,
    regionId,
    utm_campaign: null,
    utm_source: null,
    utmi_campaign: null,
    currencyCode: "BRL",
    currencySymbol: "R$",
    countryCode: "BRA",
    cultureInfo: "pt-BR",
    channelPrivacy: "public",
  };
  return "vtex_segment=" + btoa(JSON.stringify(seg));
}

async function resolverRegiao(host: string, cep: string) {
  const url =
    `https://${host}/api/checkout/pub/regions?country=BRA&postalCode=${encodeURIComponent(cep)}`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
  });
  if (!resp.ok) throw new Error(`nao foi possivel consultar a regiao do CEP (HTTP ${resp.status})`);
  const arr = await resp.json();
  const first = Array.isArray(arr) ? arr[0] : null;
  if (!first?.id) throw new Error("CEP sem regiao atendida neste site");
  const sellers = (first.sellers || []).map((s: any) => ({
    id: String(s.id ?? s.sellerId ?? ""),
    nome: String(s.name ?? s.sellerName ?? s.id ?? ""),
  })).filter((s: any) => s.id);
  return { regionId: String(first.id), sellers };
}

function lojistaDoItem(item: any): string | null {
  try {
    const sku = (item.items || [])[0];
    const offer = (sku?.sellers || [])[0]?.commertialOffer;
    return offer?.PaymentOptions?.installmentOptions?.[0]?.installments?.[0]
      ?.sellerMerchantInstallments?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

async function conferirPraca(ctx: Ctx, pracaEsperada: string) {
  const url =
    `https://${ctx.host}/api/catalog_system/pub/products/search/?fq=alternateIds_Ean:${EAN_SONDA}&sc=${ctx.sc}`;
  const { data } = await fetchJson(ctx, url, 3);
  const item = Array.isArray(data) ? data[0] : null;
  const lojista = item ? lojistaDoItem(item) : null;
  if (!lojista) {
    throw new Error(
      "não foi possível confirmar a praça do concorrente (produto de referência sem oferta) — coleta abortada",
    );
  }
  ctx.lojistas.add(lojista);
  const ok = lojista.toUpperCase().replace(/[^A-Z0-9]/g, "")
    .includes(pracaEsperada.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  if (!ok) {
    throw new Error(
      `praça divergente: o site respondeu como "${lojista}", mas o esperado é "${pracaEsperada}". Coleta abortada para não gravar preços de outra cidade.`,
    );
  }
  logLine(ctx, `praça confirmada: ${lojista}`);
  return lojista;
}

// ------------------------------------------------------------ arvore

function flattenTree(nodes: any[], ids: number[], names: string[], out: FilaItem[]) {
  for (const n of nodes || []) {
    const id = Number(n.id);
    if (!id) continue;
    const nextIds = [...ids, id];
    const nextNames = [...names, String(n.name || "")];
    const children = n.children || [];
    if (children.length === 0) {
      out.push({
        path: nextIds.join("/"),
        nome: n.name || String(id),
        arvore: nextNames.join(" > "),
        status: "pendente",
      });
    } else {
      flattenTree(children, nextIds, nextNames, out);
    }
  }
}

// ------------------------------------------------------------ mapeamento

const MULTI_RE = /leve\s*\d|pague\s*\d|2ª\s*unid|2a\s*unid|\d+%\s*off/i;

function mapProduct(item: any, ctx: Ctx, leaf: FilaItem) {
  const rows: any[] = [];
  const colecoes: string[] = Object.values(item.productClusters || {})
    .map((v) => String(v)).filter(Boolean);
  const multiplas = colecoes.filter((c) => MULTI_RE.test(c));
  const marca = item.brand || "";
  const url = item.link || (item.linkText ? `https://${ctx.host}/${item.linkText}/p` : null);

  for (const sku of item.items || []) {
    const seller = (sku.sellers || [])[0];
    const offer = seller?.commertialOffer;
    if (!offer) continue;

    const preco = Number(offer.Price) || 0;
    const precoDe = Number(offer.ListPrice) || 0;
    const disponivel = offer.IsAvailable === true &&
      Number(offer.AvailableQuantity) > 0 && preco > 0;

    let lojista: string | null = null;
    try {
      lojista = offer.PaymentOptions?.installmentOptions?.[0]?.installments?.[0]
        ?.sellerMerchantInstallments?.[0]?.id ?? null;
    } catch (_) { /* ignore */ }
    if (lojista) ctx.lojistas.add(lojista);

    const eanRaw = String(sku.ean || "").trim();
    const ean = eanRaw && eanRaw !== "0" ? eanRaw : null;
    if (!ean) ctx.skusSemEan++;
    if (disponivel) ctx.skusValidos++;
    else ctx.skusIndisponiveis++;

    rows.push({
      concorrente_id: ctx.concorrenteId,
      job_id: ctx.jobId,
      sku: String(sku.itemId || sku.id || ""),
      produto_id: String(item.productId || ""),
      ean,
      nome: sku.nameComplete || sku.name || item.productName || "",
      marca,
      categoria: leaf.nome,
      arvore_categoria: leaf.arvore,
      url,
      imagem_url: sku.images?.[0]?.imageUrl || null,
      preco: disponivel ? preco : null,
      preco_de: disponivel && precoDe > 0 ? precoDe : null,
      preco_auditoria: disponivel ? null : (preco || precoDe || null),
      disponivel,
      em_promocao: disponivel && precoDe > preco,
      promocao_multipla: multiplas.length ? multiplas : null,
      colecoes: colecoes.length ? colecoes : null,
      lojista,
      sales_channel: ctx.sc,
      region_id: ctx.regionId,
      cep_referencia: ctx.cep,
      seller_id: String(seller?.sellerId ?? ctx.sellerId ?? "") || null,
      seller_nome: seller?.sellerName || ctx.sellerNome || null,
      coletado_em: new Date().toISOString(),
    });
  }
  return rows.filter((r) => r.sku);
}

// ----------------------------------------------------------- persistencia

async function persist(ctx: Ctx, buffer: any[], force = false) {
  while (buffer.length >= UPSERT_BATCH || (force && buffer.length > 0)) {
    const chunk = buffer.splice(0, UPSERT_BATCH);
    const seen = new Map<string, any>();
    for (const r of chunk) seen.set(r.sku, r);
    const { error } = await supabase
      .from("precos_concorrente")
      .upsert([...seen.values()], { onConflict: "concorrente_id,sku" });
    if (error) logLine(ctx, `ERRO ao gravar: ${error.message}`);
    else ctx.skusGravados += seen.size;
  }
}

// -------------------------------------------------------------- crawling

async function crawlFilter(
  ctx: Ctx,
  fq: string[],
  leaf: FilaItem,
  buffer: any[],
): Promise<{ hitCap: boolean; erro?: string }> {
  let from = 0;
  const qs = fq.map((f) => `fq=${f}`).join("&");
  while (from < WINDOW_CAP) {
    const to = from + PAGE_SIZE - 1;
    const url =
      `https://${ctx.host}/api/catalog_system/pub/products/search/?${qs}&_from=${from}&_to=${to}&sc=${ctx.sc}`;
    const { data, erro } = await fetchJson(ctx, url);
    ctx.pagesDone++;
    if (erro && from === 0) return { hitCap: false, erro };
    if (!Array.isArray(data) || data.length === 0) return { hitCap: false };
    for (const item of data) buffer.push(...mapProduct(item, ctx, leaf));
    await persist(ctx, buffer);
    if (data.length < PAGE_SIZE) return { hitCap: false };
    from += PAGE_SIZE;
  }
  return { hitCap: true };
}

async function brandSliceCategory(ctx: Ctx, leaf: FilaItem, buffer: any[]) {
  const url =
    `https://${ctx.host}/api/catalog_system/pub/facets/search/?map=c&fq=C:/${leaf.path}/`;
  const { data: facets } = await fetchJson(ctx, url);
  const brands: any[] = facets?.Brands || facets?.brands || [];
  if (!brands.length) {
    logLine(ctx, `sem marcas para "${leaf.nome}" — categoria fica incompleta`);
    return;
  }
  logLine(ctx, `dividindo "${leaf.nome}" em ${brands.length} marcas`);
  for (const b of brands) {
    const bid = b.Id ?? b.id;
    if (!bid) continue;
    await crawlFilter(ctx, [`C:/${leaf.path}/`, `B:${bid}`], leaf, buffer);
  }
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
    categorias_incompletas: ctx.categoriasIncompletas,
    categorias_erro: ctx.fila.filter((f) => f.status === "erro")
      .map((f) => ({ nome: f.arvore, erro: f.erro })).slice(0, 100),
    log_lines: ctx.log.slice(-120),
    progress_pct: pct,
    region_id: ctx.regionId,
    cep_referencia: ctx.cep,
    updated_at: new Date().toISOString(),
    ...extra,
  }).eq("id", ctx.jobId);
}

async function carregarCtx(jobId: string): Promise<Ctx> {
  const { data: job, error } = await supabase
    .from("scrape_jobs").select("*").eq("id", jobId).maybeSingle();
  if (error) throw error;
  if (!job) throw new Error("coleta não encontrada");
  const ctx: Ctx = {
    jobId,
    host: job.host,
    sc: job.sales_channel ?? 1,
    concorrenteId: job.concorrente_id,
    regionId: job.region_id ?? null,
    cep: job.cep_referencia ?? null,
    cookie: job.region_id ? montarCookie(job.region_id, job.sales_channel ?? 1) : null,
    sellerId: null,
    sellerNome: null,
    fila: (job.fila as FilaItem[]) || [],
    rateLimitHits: job.rate_limit_hits ?? 0,
    requisicoes: 0,
    pagesDone: job.pages_crawled ?? 0,
    skusGravados: job.products_found ?? 0,
    skusValidos: job.skus_validos ?? 0,
    skusIndisponiveis: job.skus_indisponiveis ?? 0,
    skusSemEan: job.skus_sem_ean ?? 0,
    lojistas: new Set<string>(
      String(job.lojista_detectado || "").split(",").map((s) => s.trim()).filter(Boolean),
    ),
    categoriasIncompletas: (job.categorias_incompletas as any[]) || [],
    log: (job.log_lines as string[]) || [],
  };
  const { data: conc } = await supabase
    .from("concorrentes").select("seller_id, seller_nome").eq("id", ctx.concorrenteId).maybeSingle();
  ctx.sellerId = conc?.seller_id ?? null;
  ctx.sellerNome = conc?.seller_nome ?? null;
  return ctx;
}

function reinvocar(body: Record<string, unknown>) {
  return fetch(`${SUPABASE_URL}/functions/v1/vtex-catalog-collector`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  }).catch((e) => console.log("falha ao reinvocar:", e));
}

// ------------------------------------------------------------ lote

async function processarLote(jobId: string) {
  let ctx: Ctx;
  try {
    ctx = await carregarCtx(jobId);
  } catch (e) {
    console.log("lote abortado:", e);
    return;
  }
  const buffer: any[] = [];
  try {
    const pendentes = ctx.fila.filter((f) => f.status !== "feita");
    const lote = pendentes.slice(0, LOTE_CATEGORIAS);
    if (lote.length === 0) {
      await gravarJob(ctx, {
        status: "done",
        progress_pct: 100,
        finished_at: new Date().toISOString(),
      });
      return;
    }
    logLine(ctx, `processando lote de ${lote.length} categorias (${pendentes.length} pendentes)`);

    let cursor = 0;
    const worker = async () => {
      while (cursor < lote.length) {
        const leaf = lote[cursor++];
        const { hitCap, erro } = await crawlFilter(ctx, [`C:/${leaf.path}/`], leaf, buffer);
        if (erro) {
          leaf.status = "erro";
          leaf.erro = erro;
          logLine(ctx, `erro em "${leaf.arvore}": ${erro}`);
          continue;
        }
        if (hitCap) {
          ctx.categoriasIncompletas.push({ path: leaf.path, nome: leaf.arvore });
          logLine(ctx, `categoria grande "${leaf.arvore}" — refazendo por marca`);
          await brandSliceCategory(ctx, leaf, buffer);
        }
        leaf.status = "feita";
        leaf.erro = undefined;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    await persist(ctx, buffer, true);

    if (ctx.requisicoes > 0 && ctx.rateLimitHits / ctx.requisicoes > 0.05) {
      logLine(
        ctx,
        `ATENÇÃO: ${ctx.rateLimitHits} bloqueios em ${ctx.requisicoes} requisições (acima de 5%) — o site está limitando o acesso`,
      );
    }

    const { pendentes: restam, feitas, erros } = contarFila(ctx.fila);
    if (restam > 0) {
      await gravarJob(ctx, { status: "crawling" });
      await reinvocar({ action: "batch", jobId });
    } else {
      logLine(
        ctx,
        `concluído: ${ctx.skusGravados} produtos gravados, ${ctx.skusValidos} com preço válido, ` +
          `${ctx.skusIndisponiveis} indisponíveis, ${ctx.skusSemEan} sem código de barras, ` +
          `${feitas} categorias ok, ${erros} com erro`,
      );
      await gravarJob(ctx, {
        status: erros > 0 ? "done" : "done",
        progress_pct: 100,
        finished_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logLine(ctx, `FALHA no lote: ${msg}`);
    try { await persist(ctx, buffer, true); } catch (_) { /* ignore */ }
    await gravarJob(ctx, { status: "error", error_message: msg, finished_at: new Date().toISOString() });
  }
}

// ------------------------------------------------------------- preparacao

async function prepararJob(ctx: Ctx, pracaEsperada: string | null) {
  try {
    logLine(ctx, `iniciando coleta em ${ctx.host}${ctx.cep ? ` (CEP ${ctx.cep})` : ""}`);
    if (ctx.regionId) logLine(ctx, `região travada: ${ctx.regionId}`);

    if (pracaEsperada) await conferirPraca(ctx, pracaEsperada);
    else logLine(ctx, "sem praça esperada cadastrada — não foi possível conferir a loja");

    const { data: tree } = await fetchJson(
      ctx,
      `https://${ctx.host}/api/catalog_system/pub/category/tree/5`,
    );
    if (!Array.isArray(tree) || tree.length === 0) {
      throw new Error("não foi possível ler as categorias do site do concorrente");
    }
    const leaves: FilaItem[] = [];
    flattenTree(tree, [], [], leaves);
    ctx.fila = leaves;
    logLine(ctx, `${leaves.length} categorias encontradas`);
    await gravarJob(ctx, { status: "crawling" });
    await reinvocar({ action: "batch", jobId: ctx.jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logLine(ctx, `FALHA: ${msg}`);
    await gravarJob(ctx, { status: "error", error_message: msg, finished_at: new Date().toISOString() });
  }
}

// --------------------------------------------------------------- handler

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

    if (action === "regions") {
      const host = String(body.host || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
      const cep = String(body.cep || "").replace(/\D/g, "");
      if (!host || cep.length !== 8) throw new Error("informe o site e um CEP válido");
      const r = await resolverRegiao(host, cep);
      return json({ success: true, ...r });
    }

    if (action === "check") {
      const { data, error } = await supabase
        .from("scrape_jobs").select("*").eq("id", body.jobId).maybeSingle();
      if (error) throw error;
      return json({ success: true, job: data });
    }

    if (action === "batch") {
      if (!body.jobId) throw new Error("jobId obrigatório");
      // @ts-ignore EdgeRuntime global
      EdgeRuntime.waitUntil(processarLote(body.jobId));
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
        fila,
        status: "crawling",
        error_message: null,
        finished_at: null,
        ultima_atividade: new Date().toISOString(),
      }).eq("id", jobId);
      // @ts-ignore EdgeRuntime global
      EdgeRuntime.waitUntil(processarLote(jobId));
      return json({ success: true, jobId });
    }

    // ---- start
    const concorrenteId = body.concorrente_id;
    if (!concorrenteId) throw new Error("selecione um concorrente");

    const { data: conc, error: cErr } = await supabase
      .from("concorrentes").select("*").eq("id", concorrenteId).maybeSingle();
    if (cErr) throw cErr;
    if (!conc) throw new Error("concorrente não encontrado");

    const host = String(body.host || conc.host || "")
      .replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    if (!host) throw new Error("site do concorrente não informado");
    const sc = Number(body.sc ?? conc.sales_channel ?? 1) || 1;
    const cep = String(body.cep ?? conc.cep_referencia ?? "").replace(/\D/g, "");

    let regionId: string | null = conc.region_id ?? null;
    let sellerId: string | null = conc.seller_id ?? null;
    let sellerNome: string | null = conc.seller_nome ?? null;
    if (cep.length === 8) {
      const r = await resolverRegiao(host, cep);
      regionId = r.regionId;
      if (r.sellers[0]) {
        sellerId = r.sellers[0].id;
        sellerNome = r.sellers[0].nome;
      }
      await supabase.from("concorrentes").update({
        region_id: regionId, seller_id: sellerId, seller_nome: sellerNome, cep_referencia: cep,
      }).eq("id", concorrenteId);
    }
    if (!regionId) {
      throw new Error("cadastre o CEP de referência do concorrente antes de coletar");
    }

    const { data: job, error: jErr } = await supabase.from("scrape_jobs").insert({
      competitor_url: `https://${host}`,
      competitor_name: conc.nome,
      concorrente_id: concorrenteId,
      host,
      sales_channel: sc,
      status: "pending",
      progress_pct: 0,
      log_lines: [],
      fila: [],
      region_id: regionId,
      cep_referencia: cep || null,
      seller_esperado: conc.praca_esperada || null,
      ultima_atividade: new Date().toISOString(),
    }).select("id").single();
    if (jErr) throw jErr;

    const ctx: Ctx = {
      jobId: job.id,
      host,
      sc,
      concorrenteId,
      regionId,
      cep: cep || null,
      cookie: montarCookie(regionId, sc),
      sellerId,
      sellerNome,
      fila: [],
      rateLimitHits: 0,
      requisicoes: 0,
      pagesDone: 0,
      skusGravados: 0,
      skusValidos: 0,
      skusIndisponiveis: 0,
      skusSemEan: 0,
      lojistas: new Set<string>(),
      categoriasIncompletas: [],
      log: [],
    };

    // @ts-ignore EdgeRuntime global
    EdgeRuntime.waitUntil(prepararJob(ctx, conc.praca_esperada || null));

    return json({ success: true, jobId: job.id, host, sc, regionId, sellerId, sellerNome });
  } catch (e) {
    return json({ success: false, error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
