import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScrapedProduct {
  name: string;
  price: number;
  originalPrice: number | null;
  isPromotion: boolean;
  category: string | null;
  brand: string | null;
  unit: string | null;
  barcode: string | null;
  sku: string | null;
  imageUrl: string | null;
  sourceUrl: string;
}

function parseLocalizedNumber(value: string): number {
  if (!value || value === "") return 0;
  let str = String(value).trim().replace(/[R$\s]/g, "");
  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");
  if (lastComma > lastDot) {
    str = str.replace(/\./g, "").replace(",", ".");
  } else {
    str = str.replace(/,/g, "");
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

// ========== DETECT PLATFORM ==========
async function detectPlatform(baseUrl: string): Promise<'vtex' | 'vipcommerce' | 'unknown'> {
  try {
    const resp = await fetch(`${baseUrl}/api/catalog_system/pub/products/search/?_from=0&_to=0`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (resp.ok) {
      const text = await resp.text();
      if (text.startsWith('[')) return 'vtex';
    }
  } catch (_) {}

  try {
    const domain = baseUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, '');
    const resp = await fetch(`https://services.vipcommerce.com.br/organizacoes/filiais/dominio/${domain}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.success && data.data?.organizacao?.id) return 'vipcommerce';
    }
  } catch (_) {}

  return 'unknown';
}

// ========== VTEX STRATEGIES ==========
async function tryVtexApi(baseUrl: string): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  const seenNames = new Set<string>();
  const batchSize = 50;
  const maxProducts = 10000;
  let consecutiveEmpty = 0;

  for (let from = 0; from < maxProducts; from += batchSize) {
    const to = from + batchSize - 1;
    try {
      const response = await fetch(`${baseUrl}/api/catalog_system/pub/products/search/?_from=${from}&_to=${to}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      if (!response.ok) {
        if (response.status === 404 || response.status === 403) break;
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) break;
        continue;
      }
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2) break;
        continue;
      }
      consecutiveEmpty = 0;
      for (const item of data) {
        const name = item.productName || item.nameComplete || '';
        if (!name || seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());
        const sku = item.items?.[0];
        const seller = sku?.sellers?.[0];
        const price = seller?.commertialOffer?.Price || 0;
        const listPrice = seller?.commertialOffer?.ListPrice || 0;
        if (price <= 0) continue;
        const isPromo = listPrice > price;
        const categories = Object.values(item.categories || {}) as string[];
        products.push({
          name, price,
          originalPrice: isPromo ? listPrice : null,
          isPromotion: isPromo,
          category: categories[0] ? String(categories[0]).replace(/^\//,'').replace(/\/$/,'') : null,
          brand: item.brand || null,
          unit: sku?.measurementUnit || null,
          barcode: sku?.ean || null,
          sku: sku?.itemId || item.productId || null,
          imageUrl: sku?.images?.[0]?.imageUrl || null,
          sourceUrl: item.link || `${baseUrl}/produto/${item.productId}`,
        });
      }
      console.log(`VTEX API ${from}-${to}: ${products.length} total unique`);
      if (data.length < batchSize) break;
    } catch (e) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3) break;
    }
  }
  return products;
}

async function tryVtexCategorySearch(baseUrl: string, existing: Set<string>): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  const seenNames = new Set(existing);
  try {
    const catResponse = await fetch(`${baseUrl}/api/catalog_system/pub/category/tree/3`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!catResponse.ok) return products;
    const categories = await catResponse.json();
    const categoryIds: { id: number; name: string }[] = [];
    function extractCats(cats: any[]) {
      for (const cat of cats) {
        if (cat.id) categoryIds.push({ id: cat.id, name: cat.name });
        if (cat.children?.length) extractCats(cat.children);
      }
    }
    extractCats(categories);
    for (const cat of categoryIds) {
      for (let from = 0; from < 2500; from += 50) {
        try {
          const resp = await fetch(`${baseUrl}/api/catalog_system/pub/products/search/?fq=C:/${cat.id}/&_from=${from}&_to=${from + 49}`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          });
          if (!resp.ok) break;
          const data = await resp.json();
          if (!Array.isArray(data) || data.length === 0) break;
          for (const item of data) {
            const name = item.productName || item.nameComplete || '';
            if (!name || seenNames.has(name.toLowerCase())) continue;
            seenNames.add(name.toLowerCase());
            const sku = item.items?.[0];
            const seller = sku?.sellers?.[0];
            const price = seller?.commertialOffer?.Price || 0;
            const listPrice = seller?.commertialOffer?.ListPrice || 0;
            if (price <= 0) continue;
            const isPromo = listPrice > price;
            products.push({ name, price, originalPrice: isPromo ? listPrice : null, isPromotion: isPromo, category: cat.name, brand: item.brand || null, unit: sku?.measurementUnit || null, barcode: sku?.ean || null, sku: sku?.itemId || null, imageUrl: sku?.images?.[0]?.imageUrl || null, sourceUrl: item.link || `${baseUrl}/produto/${item.productId}` });
          }
          if (data.length < 50) break;
        } catch (_) { break; }
      }
    }
  } catch (_) {}
  return products;
}

async function tryVtexBrandSearch(baseUrl: string, existing: Set<string>): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  const seenNames = new Set(existing);
  try {
    const brandResp = await fetch(`${baseUrl}/api/catalog_system/pub/brand/list`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!brandResp.ok) return products;
    const brands = await brandResp.json();
    if (!Array.isArray(brands)) return products;
    const activeBrands = brands.filter((b: any) => b.isActive).slice(0, 200);
    for (const brand of activeBrands) {
      for (let from = 0; from < 500; from += 50) {
        try {
          const resp = await fetch(`${baseUrl}/api/catalog_system/pub/products/search/?fq=B:${brand.id}&_from=${from}&_to=${from + 49}`, {
            headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
          });
          if (!resp.ok) break;
          const data = await resp.json();
          if (!Array.isArray(data) || data.length === 0) break;
          for (const item of data) {
            const name = item.productName || item.nameComplete || '';
            if (!name || seenNames.has(name.toLowerCase())) continue;
            seenNames.add(name.toLowerCase());
            const sku = item.items?.[0];
            const seller = sku?.sellers?.[0];
            const price = seller?.commertialOffer?.Price || 0;
            const listPrice = seller?.commertialOffer?.ListPrice || 0;
            if (price <= 0) continue;
            const isPromo = listPrice > price;
            products.push({ name, price, originalPrice: isPromo ? listPrice : null, isPromotion: isPromo, category: null, brand: item.brand || brand.name || null, unit: sku?.measurementUnit || null, barcode: sku?.ean || null, sku: sku?.itemId || null, imageUrl: sku?.images?.[0]?.imageUrl || null, sourceUrl: item.link || `${baseUrl}/produto/${item.productId}` });
          }
          if (data.length < 50) break;
        } catch (_) { break; }
      }
    }
  } catch (_) {}
  return products;
}

// ========== PRODUCT EXTRACTION FROM HTML/MARKDOWN ==========
function extractProductsFromHtml(html: string, sourceUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      const items = data['@type'] === 'Product' ? [data] :
                    Array.isArray(data) ? data.filter((d: any) => d['@type'] === 'Product') :
                    data['@type'] === 'ItemList' ? (data.itemListElement || []).map((e: any) => e.item || e) : [];
      for (const item of items) {
        if (!item?.name) continue;
        const offers = item.offers || {};
        const price = offers.price || offers.lowPrice || offers[0]?.price || 0;
        const originalPrice = offers.highPrice || null;
        const parsedPrice = typeof price === 'string' ? parseLocalizedNumber(price) : price;
        const parsedOriginal = originalPrice ? (typeof originalPrice === 'string' ? parseLocalizedNumber(originalPrice) : originalPrice) : null;
        if (parsedPrice > 0) {
          products.push({
            name: item.name, price: parsedPrice,
            originalPrice: parsedOriginal && parsedOriginal > parsedPrice ? parsedOriginal : null,
            isPromotion: !!(parsedOriginal && parsedOriginal > parsedPrice),
            category: item.category || null, brand: item.brand?.name || item.brand || null,
            unit: null, barcode: item.gtin13 || item.gtin || null, sku: item.sku || item.productID || null,
            imageUrl: Array.isArray(item.image) ? item.image[0] : item.image || null, sourceUrl,
          });
        }
      }
    } catch (_) {}
  }
  return products;
}

function extractProductsFromMarkdown(markdown: string, sourceUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  const lines = markdown.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const priceMatch = line.match(/R\$\s*([\d.,]+)/);
    if (!priceMatch) continue;
    const price = parseLocalizedNumber(priceMatch[1]);
    if (price <= 0 || price >= 10000) continue;
    let originalPrice: number | null = null;
    let isPromotion = false;
    const promoMatch = line.match(/(?:de|antes|era)\s*R\$\s*([\d.,]+)/i);
    if (promoMatch) {
      const origPrice = parseLocalizedNumber(promoMatch[1]);
      if (origPrice > price) { originalPrice = origPrice; isPromotion = true; }
    }
    const contextLines = lines.slice(Math.max(0, i - 3), i + 3).join(' ');
    if (!isPromotion && /promoção|oferta|desconto|\d+%\s*off/i.test(contextLines)) {
      isPromotion = true;
      const allPrices = contextLines.match(/R\$\s*([\d.,]+)/g);
      if (allPrices && allPrices.length >= 2) {
        const prices = allPrices.map(p => parseLocalizedNumber(p.replace(/R\$\s*/, ''))).filter(p => p > 0 && p < 10000).sort((a, b) => b - a);
        if (prices.length >= 2 && prices[0] > price) originalPrice = prices[0];
      }
    }
    let productName = '';
    for (let j = Math.max(0, i - 5); j < i; j++) {
      const prevLine = lines[j].trim();
      if (prevLine && prevLine.length > 3 && !prevLine.startsWith('![') && !prevLine.startsWith('http')) {
        productName = prevLine.replace(/\(https?:\/\/[^)]+\)/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*_\[\]]/g, '').trim();
      }
    }
    const junkPatterns = /^\d+%\s*(OFF|off|desconto)|^Compartilhar|^Adicionar|^Ver mais|^Comprar|^Voltar|^Menu|^Carrinho|^Buscar|^Home|^Login|^Cadastr/i;
    if (!productName || productName.length <= 5 || productName.length >= 200 || junkPatterns.test(productName)) continue;
    const barcodeMatch = contextLines.match(/\b(\d{13})\b/);
    const unitMatch = productName.match(/(\d+\s*(?:kg|g|mg|ml|l|L|lt|un|und|pct|cx|caixa|lata|garrafa|pet|fardo|pack|rolos?|folhas?|sachê|envelope)s?)\b/i);
    let category = null;
    const catFromUrl = sourceUrl.match(/(?:departamento|categoria|c)\/([^/?]+)/i);
    if (catFromUrl) {
      category = decodeURIComponent(catFromUrl[1]).replace(/-/g, ' ');
      category = category.charAt(0).toUpperCase() + category.slice(1);
    }
    const exists = products.some(p => p.name.toLowerCase() === productName.toLowerCase());
    if (!exists) {
      products.push({
        name: productName, price, originalPrice, isPromotion, category,
        brand: null, unit: unitMatch ? unitMatch[1] : null,
        barcode: barcodeMatch ? barcodeMatch[1] : null,
        sku: null, imageUrl: null, sourceUrl,
      });
    }
  }
  return products;
}

// ========== MAIN HANDLER ==========
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'Firecrawl não está configurado.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ===== ACTION: CHECK JOB STATUS =====
    if (action === 'check') {
      const { jobId } = body;
      if (!jobId) {
        return new Response(JSON.stringify({ success: false, error: 'jobId é obrigatório' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const { data: job, error: jobError } = await supabaseAdmin
        .from('scrape_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

      if (jobError || !job) {
        return new Response(JSON.stringify({ success: false, error: 'Job não encontrado' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // If already done or error, return cached result
      if (job.status === 'done' || job.status === 'error') {
        return new Response(JSON.stringify({
          success: true,
          job: {
            id: job.id,
            status: job.status,
            progress_pct: job.progress_pct,
            total_urls_found: job.total_urls_found,
            pages_crawled: job.pages_crawled,
            products_found: job.products_found,
            error_message: job.error_message,
            products: job.status === 'done' ? job.products_json : null,
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Check Firecrawl crawl status
      if (!job.firecrawl_crawl_id) {
        return new Response(JSON.stringify({
          success: true,
          job: { id: job.id, status: job.status, progress_pct: 5, total_urls_found: 0, pages_crawled: 0, products_found: 0 }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const crawlStatusResp = await fetch(`https://api.firecrawl.dev/v1/crawl/${job.firecrawl_crawl_id}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });

      if (!crawlStatusResp.ok) {
        const errText = await crawlStatusResp.text();
        console.error('Firecrawl crawl status error:', errText);
        return new Response(JSON.stringify({
          success: true,
          job: { id: job.id, status: 'crawling', progress_pct: job.progress_pct, total_urls_found: job.total_urls_found, pages_crawled: job.pages_crawled, products_found: job.products_found }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const crawlStatus = await crawlStatusResp.json();
      console.log(`Crawl status: ${crawlStatus.status}, completed: ${crawlStatus.completed}/${crawlStatus.total}`);

      const completed = crawlStatus.completed || 0;
      const total = crawlStatus.total || 1;
      const progressPct = Math.min(95, Math.round((completed / total) * 100));

      if (crawlStatus.status === 'completed') {
        // Extract products from all crawled pages
        const allProducts: ScrapedProduct[] = [];
        const seenNames = new Set<string>();
        const pages = crawlStatus.data || [];

        for (const page of pages) {
          const html = page.html || '';
          const markdown = page.markdown || '';
          const pageUrl = page.metadata?.sourceURL || job.competitor_url;

          const htmlProducts = extractProductsFromHtml(html, pageUrl);
          for (const p of htmlProducts) {
            if (!seenNames.has(p.name.toLowerCase())) {
              seenNames.add(p.name.toLowerCase());
              allProducts.push(p);
            }
          }

          if (markdown) {
            const mdProducts = extractProductsFromMarkdown(markdown, pageUrl);
            for (const p of mdProducts) {
              if (!seenNames.has(p.name.toLowerCase())) {
                seenNames.add(p.name.toLowerCase());
                allProducts.push(p);
              }
            }
          }
        }

        allProducts.sort((a, b) => {
          const catA = a.category || 'zzz';
          const catB = b.category || 'zzz';
          if (catA !== catB) return catA.localeCompare(catB);
          return a.name.localeCompare(b.name);
        });

        // Update job as done
        await supabaseAdmin.from('scrape_jobs').update({
          status: 'done',
          progress_pct: 100,
          pages_crawled: completed,
          products_found: allProducts.length,
          products_json: allProducts,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);

        return new Response(JSON.stringify({
          success: true,
          job: {
            id: job.id,
            status: 'done',
            progress_pct: 100,
            total_urls_found: total,
            pages_crawled: completed,
            products_found: allProducts.length,
            products: allProducts,
          }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (crawlStatus.status === 'failed' || crawlStatus.status === 'cancelled') {
        await supabaseAdmin.from('scrape_jobs').update({
          status: 'error',
          error_message: `Crawl ${crawlStatus.status}`,
          progress_pct: progressPct,
          pages_crawled: completed,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);

        return new Response(JSON.stringify({
          success: true,
          job: { id: job.id, status: 'error', progress_pct: progressPct, error_message: `Crawl ${crawlStatus.status}`, pages_crawled: completed, products_found: 0 }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Still in progress
      await supabaseAdmin.from('scrape_jobs').update({
        status: 'crawling',
        progress_pct: progressPct,
        total_urls_found: total,
        pages_crawled: completed,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      return new Response(JSON.stringify({
        success: true,
        job: { id: job.id, status: 'crawling', progress_pct: progressPct, total_urls_found: total, pages_crawled: completed, products_found: 0 }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== ACTION: START (default) =====
    const { url, maxPages, competitorName } = body;
    if (!url) {
      return new Response(JSON.stringify({ success: false, error: 'URL é obrigatória' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) formattedUrl = `https://${formattedUrl}`;
    formattedUrl = formattedUrl.replace(/\/+$/, '');

    const pageLimit = Math.min(maxPages || 5000, 5000);

    // Detect platform
    console.log('Detecting platform...');
    const platform = await detectPlatform(formattedUrl);
    console.log(`Platform detected: ${platform}`);

    // ===== VTEX: synchronous (works well) =====
    if (platform === 'vtex') {
      const allProducts: ScrapedProduct[] = [];
      const seenNames = new Set<string>();
      const strategies: string[] = [];

      console.log('Strategy 1: VTEX Search API...');
      const vtexProducts = await tryVtexApi(formattedUrl);
      if (vtexProducts.length > 0) {
        strategies.push(`VTEX API: ${vtexProducts.length}`);
        for (const p of vtexProducts) { seenNames.add(p.name.toLowerCase()); allProducts.push(p); }
      }

      console.log('Strategy 2: VTEX Category Tree...');
      const catProducts = await tryVtexCategorySearch(formattedUrl, seenNames);
      if (catProducts.length > 0) {
        strategies.push(`Categories: +${catProducts.length}`);
        for (const p of catProducts) { seenNames.add(p.name.toLowerCase()); allProducts.push(p); }
      }

      console.log('Strategy 3: VTEX Brand Search...');
      const brandProducts = await tryVtexBrandSearch(formattedUrl, seenNames);
      if (brandProducts.length > 0) {
        strategies.push(`Brands: +${brandProducts.length}`);
        for (const p of brandProducts) { seenNames.add(p.name.toLowerCase()); allProducts.push(p); }
      }

      allProducts.sort((a, b) => {
        const catA = a.category || 'zzz';
        const catB = b.category || 'zzz';
        if (catA !== catB) return catA.localeCompare(catB);
        return a.name.localeCompare(b.name);
      });

      console.log(`VTEX FINAL: ${allProducts.length} products | Strategies: ${strategies.join(' | ')}`);

      return new Response(JSON.stringify({
        success: true,
        data: {
          products: allProducts,
          totalFound: allProducts.length,
          pagesScraped: allProducts.length,
          totalUrlsFound: allProducts.length,
          scrapedUrl: formattedUrl,
          scrapedAt: new Date().toISOString(),
          platform,
          strategies,
        }
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ===== NON-VTEX: async background crawl via Firecrawl =====
    console.log(`Starting async Firecrawl crawl for ${formattedUrl} (limit: ${pageLimit})...`);

    // Create job record
    const { data: jobRow, error: insertError } = await supabaseAdmin.from('scrape_jobs').insert({
      competitor_url: formattedUrl,
      competitor_name: competitorName || null,
      status: 'crawling',
      progress_pct: 0,
    }).select('id').single();

    if (insertError || !jobRow) {
      console.error('Failed to create job:', insertError);
      return new Response(JSON.stringify({ success: false, error: 'Falha ao criar job de coleta' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const jobId = jobRow.id;

    // Start Firecrawl crawl (async) with webhook
    const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/firecrawl-webhook`;
    console.log(`Webhook URL: ${webhookUrl}`);

    try {
      const crawlResp = await fetch('https://api.firecrawl.dev/v1/crawl', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: formattedUrl,
          limit: pageLimit,
          webhook: webhookUrl,
          scrapeOptions: {
            formats: ['html', 'markdown'],
            waitFor: 3000,
            onlyMainContent: false,
          },
        }),
      });

      if (!crawlResp.ok) {
        const errBody = await crawlResp.text();
        console.error('Firecrawl crawl start failed:', errBody);
        await supabaseAdmin.from('scrape_jobs').update({
          status: 'error',
          error_message: `Firecrawl error (${crawlResp.status}): ${errBody.slice(0, 200)}`,
          updated_at: new Date().toISOString(),
        }).eq('id', jobId);

        return new Response(JSON.stringify({ success: false, error: `Firecrawl retornou erro ${crawlResp.status}`, jobId }), { status: crawlResp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const crawlData = await crawlResp.json();
      const crawlId = crawlData.id;
      console.log(`Firecrawl crawl started: ${crawlId}`);

      // Update job with crawl ID
      await supabaseAdmin.from('scrape_jobs').update({
        firecrawl_crawl_id: crawlId,
        status: 'crawling',
        progress_pct: 5,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      return new Response(JSON.stringify({
        success: true,
        async: true,
        jobId,
        message: 'Coleta iniciada em background. Use action=check com jobId para acompanhar o progresso.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    } catch (crawlErr) {
      console.error('Crawl start error:', crawlErr);
      await supabaseAdmin.from('scrape_jobs').update({
        status: 'error',
        error_message: crawlErr instanceof Error ? crawlErr.message : 'Erro ao iniciar crawl',
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);

      return new Response(JSON.stringify({ success: false, error: 'Falha ao iniciar o crawl', jobId }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
  } catch (error) {
    console.error('Error in scrape-competitor-prices:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
