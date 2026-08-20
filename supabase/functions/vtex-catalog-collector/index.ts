import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAGE_SIZE = 50;
const VTEX_WINDOW_CAP = 2500; // _from acima disso e rejeitado
const UPSERT_BATCH = 500;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ---------------------------------------------------------------- utils

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Ctx {
  jobId: string;
  host: string;
  sc: number;
  concorrenteId: string;
  rateLimitHits: number;
  pagesDone: number;
  pagesTotal: number;
  skusGravados: number;
  skusValidos: number;
  skusIndisponiveis: number;
  skusSemEan: number;
  lojistas: Set<string>;
  categoriasIncompletas: { path: string; nome: string }[];
  log: string[];
  dirty: boolean;
}

function logLine(ctx: Ctx, msg: string) {
  const line = `${new Date().toISOString().slice(11, 19)} ${msg}`;
  ctx.log.push(line);
  if (ctx.log.length > 300) ctx.log.splice(0, ctx.log.length - 300);
  console.log(line);
  ctx.dirty = true;
}

async function flushJob(ctx: Ctx, extra: Record<string, unknown> = {}) {
  const pct = ctx.pagesTotal > 0
    ? Math.min(99, Math.round((ctx.pagesDone / ctx.pagesTotal) * 100))
    : 0;
  await supabase.from("scrape_jobs").update({
    pages_crawled: ctx.pagesDone,
    total_pages: ctx.pagesTotal,
    products_found: ctx.skusGravados,
    skus_validos: ctx.skusValidos,
    skus_indisponiveis: ctx.skusIndisponiveis,
    skus_sem_ean: ctx.skusSemEan,
    rate_limit_hits: ctx.rateLimitHits,
    lojista_detectado: [...ctx.lojistas].slice(0, 5).join(", ") || null,
    categorias_incompletas: ctx.categoriasIncompletas,
    log_lines: ctx.log.slice(-120),
    progress_pct: pct,
    updated_at: new Date().toISOString(),
    ...extra,
  }).eq("id", ctx.jobId);
  ctx.dirty = false;
}

async function fetchJson(ctx: Ctx, url: string, tries = 5): Promise<any | null> {
  for (let i = 0; i < tries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
          "Accept-Language": "pt-BR,pt;q=0.9",
        },
      });
      if (resp.status === 429 || resp.status >= 500) {
        if (resp.status === 429) ctx.rateLimitHits++;
        const wait = Math.round(600 * Math.pow(2, i) + Math.random() * 500);
        await sleep(wait);
        continue;
      }
      if (resp.status === 206 || resp.ok) {
        const text = await resp.text();
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      }
      return null; // 4xx definitivo
    } catch (_e) {
      await sleep(Math.round(500 * Math.pow(2, i) + Math.random() * 400));
    }
  }
  return null;
}

// ------------------------------------------------------- category tree

interface Leaf {
  id: number;
  nome: string;
  path: string; // "15463/15466/15468"
  arvore: string;
}

function flattenTree(nodes: any[], ids: number[], names: string[], out: Leaf[]) {
  for (const n of nodes || []) {
    const id = Number(n.id);
    if (!id) continue;
    const nextIds = [...ids, id];
    const nextNames = [...names, String(n.name || "")];
    const children = n.children || [];
    if (children.length === 0) {
      out.push({
        id,
        nome: n.name || String(id),
        path: nextIds.join("/"),
        arvore: nextNames.join(" > "),
      });
    } else {
      flattenTree(children, nextIds, nextNames, out);
    }
  }
}

// ------------------------------------------------------------ mapping

const MULTI_RE = /leve\s*\d|pague\s*\d|2ª\s*unid|2a\s*unid|\d+%\s*off/i;

function mapProduct(item: any, ctx: Ctx, leaf: Leaf) {
  const rows: any[] = [];
  const colecoes: string[] = Object.values(item.productClusters || {})
    .map((v) => String(v))
    .filter(Boolean);
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
      // item indisponivel devolve preco-lixo: nunca exposto como preco
      preco: disponivel ? preco : null,
      preco_de: disponivel && precoDe > 0 ? precoDe : null,
      preco_auditoria: disponivel ? null : (preco || precoDe || null),
      disponivel,
      // promocao SOMENTE por ListPrice > Price
      em_promocao: disponivel && precoDe > preco,
      promocao_multipla: multiplas.length ? multiplas : null,
      colecoes: colecoes.length ? colecoes : null,
      lojista,
      sales_channel: ctx.sc,
      coletado_em: new Date().toISOString(),
    });
  }
  return rows.filter((r) => r.sku);
}

// ---------------------------------------------------------- persistence

async function persist(ctx: Ctx, buffer: any[], force = false) {
  while (buffer.length >= UPSERT_BATCH || (force && buffer.length > 0)) {
    const chunk = buffer.splice(0, UPSERT_BATCH);
    // dedup dentro do lote (mesmo sku pode vir de 2 categorias)
    const seen = new Map<string, any>();
    for (const r of chunk) seen.set(r.sku, r);
    const { error } = await supabase
      .from("precos_concorrente")
      .upsert([...seen.values()], { onConflict: "concorrente_id,sku" });
    if (error) logLine(ctx, `ERRO upsert: ${error.message}`);
    else ctx.skusGravados += seen.size;
    await flushJob(ctx);
  }
}

// ------------------------------------------------------------- crawling

async function crawlFilter(
  ctx: Ctx,
  fq: string[],
  leaf: Leaf,
  buffer: any[],
): Promise<{ hitCap: boolean }> {
  let from = 0;
  const qs = fq.map((f) => `fq=${f}`).join("&");
  while (from < VTEX_WINDOW_CAP) {
    const to = from + PAGE_SIZE - 1;
    const url =
      `https://${ctx.host}/api/catalog_system/pub/products/search/?${qs}&_from=${from}&_to=${to}&sc=${ctx.sc}`;
    const data = await fetchJson(ctx, url);
    ctx.pagesDone++;
    if (!Array.isArray(data) || data.length === 0) return { hitCap: false };
    for (const item of data) {
      buffer.push(...mapProduct(item, ctx, leaf));
    }
    await persist(ctx, buffer);
    // nao confiar em header de contagem: paginar ate vir menos de 50
    if (data.length < PAGE_SIZE) return { hitCap: false };
    from += PAGE_SIZE;
  }
  return { hitCap: true };
}

async function brandSliceCategory(ctx: Ctx, leaf: Leaf, buffer: any[]) {
  const url =
    `https://${ctx.host}/api/catalog_system/pub/facets/search/?map=c&fq=C:/${leaf.path}/`;
  const facets = await fetchJson(ctx, url);
  const brands: any[] = facets?.Brands || facets?.brands || [];
  if (!brands.length) {
    logLine(ctx, `sem facetas de marca para "${leaf.nome}" — categoria fica incompleta`);
    return;
  }
  logLine(ctx, `fatiando "${leaf.nome}" por ${brands.length} marcas`);
  for (const b of brands) {
    const bid = b.Id ?? b.id;
    if (!bid) continue;
    ctx.pagesTotal += 1;
    await crawlFilter(ctx, [`C:/${leaf.path}/`, `B:${bid}`], leaf, buffer);
  }
}

async function runCollection(ctx: Ctx & { concurrency?: number }) {
  const buffer: any[] = [];
  try {
    logLine(ctx, `iniciando coleta em ${ctx.host} (sc=${ctx.sc})`);

    const tree = await fetchJson(
      ctx,
      `https://${ctx.host}/api/catalog_system/pub/category/tree/5`,
    );
    if (!Array.isArray(tree) || tree.length === 0) {
      throw new Error("arvore de categorias vazia ou inacessivel");
    }
    const leaves: Leaf[] = [];
    flattenTree(tree, [], [], leaves);
    logLine(ctx, `${leaves.length} categorias-folha encontradas`);
    // estimativa inicial: 1 pagina por folha, cresce conforme pagina
    ctx.pagesTotal = leaves.length;
    await flushJob(ctx, { status: "crawling" });

    const concurrency = ctx.concurrency ?? 8;
    let cursor = 0;
    const worker = async () => {
      while (cursor < leaves.length) {
        const leaf = leaves[cursor++];
        const before = ctx.pagesDone;
        const { hitCap } = await crawlFilter(ctx, [`C:/${leaf.path}/`], leaf, buffer);
        const pages = ctx.pagesDone - before;
        if (pages > 1) ctx.pagesTotal += pages - 1;
        if (hitCap) {
          ctx.categoriasIncompletas.push({ path: leaf.path, nome: leaf.arvore });
          logLine(ctx, `TETO 2500 atingido em "${leaf.arvore}" — refazendo por marca`);
          await brandSliceCategory(ctx, leaf, buffer);
        }
        if (ctx.dirty) await flushJob(ctx);
      }
    };
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(16, concurrency)) }, worker),
    );

    await persist(ctx, buffer, true);
    logLine(
      ctx,
      `concluido: ${ctx.skusGravados} SKUs gravados, ${ctx.skusValidos} com preco valido, ` +
        `${ctx.skusIndisponiveis} indisponiveis, ${ctx.skusSemEan} sem EAN, ${ctx.rateLimitHits} rate limits`,
    );
    await flushJob(ctx, {
      status: "done",
      progress_pct: 100,
      finished_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logLine(ctx, `FALHA: ${msg}`);
    try {
      await persist(ctx, buffer, true);
    } catch (_) { /* ignore */ }
    await flushJob(ctx, {
      status: "error",
      error_message: msg,
      finished_at: new Date().toISOString(),
    });
  }
}

// ------------------------------------------------------------- handler

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || "start";

    if (action === "check") {
      const { data, error } = await supabase
        .from("scrape_jobs").select("*").eq("id", body.jobId).maybeSingle();
      if (error) throw error;
      return new Response(JSON.stringify({ success: true, job: data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const concorrenteId = body.concorrente_id;
    if (!concorrenteId) throw new Error("concorrente_id obrigatorio");

    const { data: conc, error: cErr } = await supabase
      .from("concorrentes").select("*").eq("id", concorrenteId).maybeSingle();
    if (cErr) throw cErr;
    if (!conc) throw new Error("concorrente nao encontrado");

    const host = String(body.host || conc.host || "")
      .replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
    if (!host) throw new Error("host obrigatorio");
    const sc = Number(body.sc ?? conc.sales_channel ?? 1) || 1;
    const concurrency = Number(body.concurrency) || 8;

    const { data: job, error: jErr } = await supabase.from("scrape_jobs").insert({
      competitor_url: `https://${host}`,
      competitor_name: conc.nome,
      concorrente_id: concorrenteId,
      host,
      sales_channel: sc,
      status: "pending",
      progress_pct: 0,
      log_lines: [],
    }).select("id").single();
    if (jErr) throw jErr;

    const ctx: Ctx & { concurrency?: number } = {
      jobId: job.id,
      host,
      sc,
      concorrenteId,
      rateLimitHits: 0,
      pagesDone: 0,
      pagesTotal: 0,
      skusGravados: 0,
      skusValidos: 0,
      skusIndisponiveis: 0,
      skusSemEan: 0,
      lojistas: new Set<string>(),
      categoriasIncompletas: [],
      log: [],
      dirty: false,
      concurrency,
    };

    // @ts-ignore EdgeRuntime global
    EdgeRuntime.waitUntil(runCollection(ctx));

    return new Response(
      JSON.stringify({ success: true, jobId: job.id, host, sc }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
