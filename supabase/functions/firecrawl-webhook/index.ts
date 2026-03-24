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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('Firecrawl webhook received:', JSON.stringify(body).slice(0, 500));

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const crawlId = body.id || body.crawl_id;
    const crawlStatus = body.status;
    const crawlData = body.data || [];
    const completed = body.completed || 0;
    const total = body.total || 1;

    if (!crawlId) {
      console.error('No crawl ID in webhook payload');
      return new Response(JSON.stringify({ success: false, error: 'No crawl ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find the job by firecrawl_crawl_id
    const { data: job, error: jobError } = await supabaseAdmin
      .from('scrape_jobs')
      .select('*')
      .eq('firecrawl_crawl_id', crawlId)
      .single();

    if (jobError || !job) {
      console.error('Job not found for crawl ID:', crawlId, jobError);
      return new Response(JSON.stringify({ success: false, error: 'Job not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Webhook for job ${job.id}: status=${crawlStatus}, completed=${completed}/${total}, pages=${crawlData.length}`);

    if (crawlStatus === 'completed') {
      // Extract products from all crawled pages
      const allProducts: ScrapedProduct[] = [];
      const seenNames = new Set<string>();

      for (const page of crawlData) {
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

      console.log(`Webhook extraction complete: ${allProducts.length} products from ${crawlData.length} pages`);

      await supabaseAdmin.from('scrape_jobs').update({
        status: 'done',
        progress_pct: 100,
        pages_crawled: completed,
        total_urls_found: total,
        products_found: allProducts.length,
        products_json: allProducts,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);

    } else if (crawlStatus === 'failed' || crawlStatus === 'cancelled') {
      await supabaseAdmin.from('scrape_jobs').update({
        status: 'error',
        error_message: `Crawl ${crawlStatus}`,
        progress_pct: Math.round((completed / total) * 100),
        pages_crawled: completed,
        total_urls_found: total,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);

    } else {
      // In progress update
      await supabaseAdmin.from('scrape_jobs').update({
        status: 'crawling',
        progress_pct: Math.min(95, Math.round((completed / total) * 100)),
        pages_crawled: completed,
        total_urls_found: total,
        updated_at: new Date().toISOString(),
      }).eq('id', job.id);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
