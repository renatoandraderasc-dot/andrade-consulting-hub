const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface VtexProduct {
  id_produto: string;
  id_sku: string;
  nome_produto: string;
  nome_completo: string;
  slug: string;
  marca: string;
  cod_barras: string;
  referencia: string;
  departamento: string;
  categoria: string;
  subcategoria: string;
  mercadologico: string;
  arvore_completa: string;
  preco_regular: number;
  preco_promocional: number;
  preco_pix: number | null;
  seller: string;
  disponibilidade: boolean;
  unidade_venda: string;
  status_preco: 'PROMO' | 'REGULAR';
  imagem_url: string;
  data_hora_coleta: string;
}

interface CollectorLog {
  total_capturado: number;
  paginas_lidas: number;
  erros: { item: string; erro: string }[];
  itens_ignorados: number;
  duplicados_removidos: number;
  estrategia_usada: string[];
  tempo_execucao: string;
}

const BASE_URL = 'https://www.santoantonioemcasa.com.br';
const BATCH_SIZE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      });
      if (resp.status === 429) {
        console.warn(`Rate limited (429) on ${url}, waiting ${RETRY_DELAY_MS * (i + 1)}ms...`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
        continue;
      }
      if (resp.status >= 500) {
        console.warn(`Server error ${resp.status} on ${url}, retry ${i + 1}/${retries}`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
        continue;
      }
      return resp;
    } catch (e) {
      console.warn(`Fetch error on ${url}, retry ${i + 1}/${retries}:`, e);
      if (i < retries - 1) await new Promise(r => setTimeout(r, RETRY_DELAY_MS * (i + 1)));
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

function extractCategoryInfo(item: any): { departamento: string; categoria: string; subcategoria: string; mercadologico: string; arvore_completa: string } {
  // Try categories object (e.g. {"/Dep/Cat/Sub": "..."})
  const catKeys = Object.keys(item.categories || {});
  let parts: string[] = [];
  
  if (catKeys.length > 0) {
    // Pick the deepest path
    const deepest = catKeys.reduce((a, b) => a.split('/').length >= b.split('/').length ? a : b);
    parts = deepest.split('/').filter(Boolean);
  }
  
  // Also try categoriesIds and categoryTree
  if (parts.length === 0 && item.categoryTree) {
    parts = (item.categoryTree as any[]).map((c: any) => c.name || c).filter(Boolean);
  }

  const departamento = parts[0] || item.departmentName || '';
  const categoria = parts[1] || item.categoryName || '';
  const subcategoria = parts[2] || '';
  const mercadologico = [departamento, categoria, subcategoria].filter(Boolean).join(' > ');
  const arvore_completa = parts.join(' > ') || mercadologico;

  return { departamento, categoria, subcategoria, mercadologico, arvore_completa };
}

function mapVtexItem(item: any, coleta: string): VtexProduct[] {
  const products: VtexProduct[] = [];
  const catInfo = extractCategoryInfo(item);
  const productName = item.productName || item.nameComplete || '';
  const productId = String(item.productId || '');
  const brand = item.brand || '';
  const link = item.link || item.linkText ? `${BASE_URL}/${item.linkText}/p` : `${BASE_URL}/produto/${productId}`;

  const skus = item.items || [];
  if (skus.length === 0) return products;

  for (const sku of skus) {
    const skuId = String(sku.itemId || sku.id || '');
    const seller = sku.sellers?.[0];
    const offer = seller?.commertialOffer;
    
    if (!offer) continue;
    
    const price = offer.Price || 0;
    const listPrice = offer.ListPrice || price;
    const isAvailable = (offer.AvailableQuantity || offer.IsAvailable) ? true : (offer.AvailableQuantity > 0);
    
    if (price <= 0 && listPrice <= 0) continue;
    
    const effectivePrice = price > 0 ? price : listPrice;
    const effectiveList = listPrice > 0 ? listPrice : price;
    const isPromo = effectiveList > effectivePrice;
    
    // Try to find Pix price (some stores put it in paymentOptions or installmentOptions)
    let pixPrice: number | null = null;
    const installments = offer.Installments || [];
    for (const inst of installments) {
      if (inst.PaymentSystemName?.toLowerCase().includes('pix') || inst.Name?.toLowerCase().includes('pix')) {
        pixPrice = inst.Price || inst.Value || null;
        break;
      }
    }
    // Also check teasers
    const teasers = offer.Teasers || [];
    for (const t of teasers) {
      if (t.name?.toLowerCase().includes('pix') && t.effects?.value) {
        const discount = parseFloat(t.effects.value);
        if (discount > 0) pixPrice = effectivePrice * (1 - discount / 100);
      }
    }

    const ean = sku.ean || sku.Ean || '';
    const refId = sku.referenceId?.[0]?.Value || sku.refId || item.productReference || '';
    const nameComplete = sku.nameComplete || sku.complementName
      ? `${productName} ${sku.complementName || sku.name || ''}`.trim()
      : item.nameComplete || productName;
    const unitMultiplier = sku.unitMultiplier || 1;
    const measurementUnit = sku.measurementUnit || 'un';
    const imageUrl = sku.images?.[0]?.imageUrl || '';
    const sellerName = seller?.sellerName || seller?.sellerId || '';

    products.push({
      id_produto: productId,
      id_sku: skuId,
      nome_produto: productName,
      nome_completo: nameComplete,
      slug: link,
      marca: brand,
      cod_barras: ean,
      referencia: refId,
      ...catInfo,
      preco_regular: effectiveList,
      preco_promocional: effectivePrice,
      preco_pix: pixPrice,
      seller: sellerName,
      disponibilidade: isAvailable,
      unidade_venda: `${unitMultiplier} ${measurementUnit}`,
      status_preco: isPromo ? 'PROMO' : 'REGULAR',
      imagem_url: imageUrl,
      data_hora_coleta: coleta,
    });
  }

  return products;
}

// ===== STRATEGY 1: VTEX Search API with full pagination =====
async function searchApiFullPagination(log: CollectorLog, coleta: string): Promise<Map<string, VtexProduct>> {
  const products = new Map<string, VtexProduct>();
  let emptyStreak = 0;
  let page = 0;

  console.log('=== STRATEGY 1: VTEX Search API full pagination ===');
  log.estrategia_usada.push('search_api');

  // VTEX public search supports up to 2500 via _from/_to
  // But we can also try higher ranges
  while (page * BATCH_SIZE < 10000) {
    const from = page * BATCH_SIZE;
    const to = from + BATCH_SIZE - 1;
    
    try {
      const resp = await fetchWithRetry(`${BASE_URL}/api/catalog_system/pub/products/search/?_from=${from}&_to=${to}`);
      
      if (!resp.ok) {
        console.log(`Search API returned ${resp.status} at page ${page}`);
        if (resp.status === 404 || resp.status === 403) break;
        emptyStreak++;
        if (emptyStreak >= 3) break;
        page++;
        continue;
      }

      // Get total from resources header
      const resources = resp.headers.get('resources');
      if (resources && page === 0) {
        console.log(`VTEX resources header: ${resources}`);
      }

      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`No more products at page ${page} (from=${from})`);
        emptyStreak++;
        if (emptyStreak >= 2) break;
        page++;
        continue;
      }

      emptyStreak = 0;
      log.paginas_lidas++;

      for (const item of data) {
        try {
          const mapped = mapVtexItem(item, coleta);
          for (const p of mapped) {
            const key = p.id_sku || p.cod_barras || `${p.id_produto}-${p.nome_produto}`;
            if (!products.has(key)) {
              products.set(key, p);
            }
          }
        } catch (e) {
          log.erros.push({ item: item.productName || `product-${item.productId}`, erro: String(e) });
        }
      }

      console.log(`Page ${page} (${from}-${to}): ${data.length} items, ${products.size} total unique SKUs`);

      if (data.length < BATCH_SIZE) {
        console.log('Reached end of search results');
        break;
      }
      
      page++;
      // Small delay to respect rate limits
      if (page % 10 === 0) await new Promise(r => setTimeout(r, 500));
    } catch (e) {
      console.warn(`Error at page ${page}:`, e);
      log.erros.push({ item: `page-${page}`, erro: String(e) });
      emptyStreak++;
      if (emptyStreak >= 3) break;
      page++;
    }
  }

  console.log(`Strategy 1 result: ${products.size} unique SKUs from ${log.paginas_lidas} pages`);
  return products;
}

// ===== STRATEGY 2: Category tree + per-category search =====
async function categoryTreeSearch(existingProducts: Map<string, VtexProduct>, log: CollectorLog, coleta: string): Promise<Map<string, VtexProduct>> {
  console.log('=== STRATEGY 2: Category tree search ===');
  log.estrategia_usada.push('category_tree');

  const products = new Map(existingProducts);
  
  try {
    const resp = await fetchWithRetry(`${BASE_URL}/api/catalog_system/pub/category/tree/4`);
    if (!resp.ok) {
      console.log(`Category tree returned ${resp.status}`);
      return products;
    }

    const tree = await resp.json();
    const allCategories: { id: number; name: string; depth: number }[] = [];

    function flatten(cats: any[], depth = 0) {
      for (const cat of cats) {
        if (cat.id) allCategories.push({ id: cat.id, name: cat.name, depth });
        if (cat.children?.length) flatten(cat.children, depth + 1);
      }
    }
    flatten(tree);

    console.log(`Found ${allCategories.length} categories in tree`);

    // Search each leaf category (deepest level) for better coverage
    const leafCategories = allCategories.filter(c => {
      return !allCategories.some(other => other.depth > c.depth && other.name !== c.name);
    });

    // Actually search ALL categories to maximize coverage
    for (const cat of allCategories) {
      let catPage = 0;
      let catEmpty = 0;
      const beforeCount = products.size;

      while (catPage * BATCH_SIZE < 2500) {
        const from = catPage * BATCH_SIZE;
        const to = from + BATCH_SIZE - 1;

        try {
          const resp = await fetchWithRetry(
            `${BASE_URL}/api/catalog_system/pub/products/search/?fq=C:/${cat.id}/&_from=${from}&_to=${to}`
          );

          if (!resp.ok) break;
          const data = await resp.json();
          if (!Array.isArray(data) || data.length === 0) {
            catEmpty++;
            if (catEmpty >= 2) break;
            catPage++;
            continue;
          }

          catEmpty = 0;
          log.paginas_lidas++;

          for (const item of data) {
            try {
              const mapped = mapVtexItem(item, coleta);
              for (const p of mapped) {
                const key = p.id_sku || p.cod_barras || `${p.id_produto}-${p.nome_produto}`;
                if (!products.has(key)) {
                  products.set(key, p);
                }
              }
            } catch (e) {
              log.erros.push({ item: item.productName || 'unknown', erro: String(e) });
            }
          }

          if (data.length < BATCH_SIZE) break;
          catPage++;
        } catch (e) {
          log.erros.push({ item: `cat-${cat.id}-page-${catPage}`, erro: String(e) });
          break;
        }
      }

      const newInCat = products.size - beforeCount;
      if (newInCat > 0) {
        console.log(`Category "${cat.name}" (id:${cat.id}): +${newInCat} new SKUs (total: ${products.size})`);
      }
    }
  } catch (e) {
    console.warn('Category tree error:', e);
    log.erros.push({ item: 'category_tree', erro: String(e) });
  }

  console.log(`Strategy 2 result: ${products.size} total unique SKUs`);
  return products;
}

// ===== STRATEGY 3: Brand-based search =====
async function brandSearch(existingProducts: Map<string, VtexProduct>, log: CollectorLog, coleta: string): Promise<Map<string, VtexProduct>> {
  console.log('=== STRATEGY 3: Brand search ===');
  log.estrategia_usada.push('brand_search');

  const products = new Map(existingProducts);

  try {
    const resp = await fetchWithRetry(`${BASE_URL}/api/catalog_system/pub/brand/list`);
    if (!resp.ok) return products;

    const brands = await resp.json();
    console.log(`Found ${brands.length} brands`);

    for (const brand of brands) {
      if (!brand.isActive) continue;

      let brandPage = 0;
      const beforeCount = products.size;

      while (brandPage * BATCH_SIZE < 2500) {
        const from = brandPage * BATCH_SIZE;
        const to = from + BATCH_SIZE - 1;

        try {
          const resp = await fetchWithRetry(
            `${BASE_URL}/api/catalog_system/pub/products/search/?fq=B:/${brand.id}/&_from=${from}&_to=${to}`
          );
          if (!resp.ok) break;
          const data = await resp.json();
          if (!Array.isArray(data) || data.length === 0) break;

          log.paginas_lidas++;
          for (const item of data) {
            try {
              const mapped = mapVtexItem(item, coleta);
              for (const p of mapped) {
                const key = p.id_sku || p.cod_barras || `${p.id_produto}-${p.nome_produto}`;
                if (!products.has(key)) products.set(key, p);
              }
            } catch (_e) { /* skip */ }
          }

          if (data.length < BATCH_SIZE) break;
          brandPage++;
        } catch (_e) { break; }
      }

      const newInBrand = products.size - beforeCount;
      if (newInBrand > 0) {
        console.log(`Brand "${brand.name}": +${newInBrand} new SKUs`);
      }
    }
  } catch (e) {
    log.erros.push({ item: 'brand_search', erro: String(e) });
  }

  console.log(`Strategy 3 result: ${products.size} total unique SKUs`);
  return products;
}

// ===== STRATEGY 4: Sitemap fallback =====
async function sitemapFallback(existingProducts: Map<string, VtexProduct>, log: CollectorLog, coleta: string): Promise<Map<string, VtexProduct>> {
  console.log('=== STRATEGY 4: Sitemap fallback ===');
  log.estrategia_usada.push('sitemap');

  const products = new Map(existingProducts);
  const productUrls: string[] = [];

  const sitemapUrls = [
    `${BASE_URL}/sitemap.xml`,
    `${BASE_URL}/sitemap/products.xml`,
    `${BASE_URL}/sitemap_products.xml`,
  ];

  for (const sUrl of sitemapUrls) {
    try {
      const resp = await fetch(sUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!resp.ok) continue;
      const text = await resp.text();
      const matches = text.match(/<loc>([^<]+)<\/loc>/gi) || [];
      for (const m of matches) {
        const url = m.replace(/<\/?loc>/gi, '').trim();
        if (/\/p$|\/p\/|\/produto\//i.test(url)) {
          productUrls.push(url);
        }
        // Sub-sitemaps
        if (/sitemap.*\.xml/i.test(url)) {
          try {
            const subResp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (subResp.ok) {
              const subText = await subResp.text();
              const subMatches = subText.match(/<loc>([^<]+)<\/loc>/gi) || [];
              for (const sm of subMatches) {
                const subUrl = sm.replace(/<\/?loc>/gi, '').trim();
                if (/\/p$|\/p\/|\/produto\//i.test(subUrl)) {
                  productUrls.push(subUrl);
                }
              }
            }
          } catch (_) { /* ignore */ }
        }
      }
      if (productUrls.length > 0) break;
    } catch (_) { continue; }
  }

  const uniqueUrls = [...new Set(productUrls)];
  console.log(`Sitemap found ${uniqueUrls.length} product URLs`);

  // For each URL not already in our set, try to fetch product data
  // We use the VTEX product API by extracting the slug
  for (const url of uniqueUrls.slice(0, 500)) {
    // Extract slug from URL: /product-name/p -> product-name
    const slugMatch = url.match(/\/([^/]+)\/p\/?$/);
    if (!slugMatch) continue;
    const slug = slugMatch[1];

    // Check if we already have this product
    const alreadyHave = Array.from(products.values()).some(p => p.slug.includes(slug));
    if (alreadyHave) {
      log.itens_ignorados++;
      continue;
    }

    try {
      const resp = await fetchWithRetry(`${BASE_URL}/api/catalog_system/pub/products/search/${slug}/p`);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      log.paginas_lidas++;
      for (const item of data) {
        const mapped = mapVtexItem(item, coleta);
        for (const p of mapped) {
          const key = p.id_sku || p.cod_barras || `${p.id_produto}-${p.nome_produto}`;
          if (!products.has(key)) products.set(key, p);
        }
      }
    } catch (_) { /* skip */ }

    // Rate limit
    if (productUrls.indexOf(url) % 20 === 0) await new Promise(r => setTimeout(r, 300));
  }

  console.log(`Strategy 4 result: ${products.size} total unique SKUs`);
  return products;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const coleta = new Date().toISOString();

  const log: CollectorLog = {
    total_capturado: 0,
    paginas_lidas: 0,
    erros: [],
    itens_ignorados: 0,
    duplicados_removidos: 0,
    estrategia_usada: [],
    tempo_execucao: '',
  };

  try {
    const body = await req.json().catch(() => ({}));
    const mode = (body as any).mode || 'full'; // 'full' or 'incremental'
    const targetUrl = (body as any).url || BASE_URL;

    console.log(`=== VTEX COLLECTOR START (mode: ${mode}) ===`);
    console.log(`Target: ${targetUrl}`);

    // ETAPA 1: Full search API pagination
    let products = await searchApiFullPagination(log, coleta);
    console.log(`After Strategy 1: ${products.size} SKUs`);

    // ETAPA 2: Category tree enrichment (always run to fill gaps)
    products = await categoryTreeSearch(products, log, coleta);
    console.log(`After Strategy 2: ${products.size} SKUs`);

    // ETAPA 3: Brand search (if we still have room to find more)
    if (products.size < 5000) {
      products = await brandSearch(products, log, coleta);
      console.log(`After Strategy 3: ${products.size} SKUs`);
    }

    // ETAPA 4: Sitemap fallback (if coverage seems low)
    if (products.size < 100) {
      products = await sitemapFallback(products, log, coleta);
      console.log(`After Strategy 4: ${products.size} SKUs`);
    }

    // Final deduplication by EAN (prefer the one with more data)
    const byEan = new Map<string, VtexProduct>();
    const finalProducts: VtexProduct[] = [];
    let dupes = 0;

    for (const p of products.values()) {
      if (p.cod_barras && byEan.has(p.cod_barras)) {
        dupes++;
        // Keep the one with more complete data
        const existing = byEan.get(p.cod_barras)!;
        if (!existing.departamento && p.departamento) byEan.set(p.cod_barras, p);
        continue;
      }
      if (p.cod_barras) byEan.set(p.cod_barras, p);
      finalProducts.push(p);
    }

    log.duplicados_removidos = dupes;
    log.total_capturado = finalProducts.length;
    log.tempo_execucao = `${Math.round((Date.now() - startTime) / 1000)}s`;

    console.log(`=== VTEX COLLECTOR DONE ===`);
    console.log(`Total: ${finalProducts.length} SKUs, ${log.paginas_lidas} pages, ${log.erros.length} errors, ${log.duplicados_removidos} dupes removed`);
    console.log(`Time: ${log.tempo_execucao}`);

    return new Response(JSON.stringify({
      success: true,
      data: {
        products: finalProducts,
        log,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    log.tempo_execucao = `${Math.round((Date.now() - startTime) / 1000)}s`;
    console.error('Collector fatal error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      data: { products: [], log },
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
