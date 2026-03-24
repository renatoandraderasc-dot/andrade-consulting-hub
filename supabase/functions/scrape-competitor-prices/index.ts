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

// ========== STRATEGY 1: VTEX Search API — paginate up to 10,000 SKUs ==========
async function tryVtexApi(baseUrl: string): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  const seenNames = new Set<string>();
  const batchSize = 50;
  const maxProducts = 10000; // VTEX allows large catalogues
  let consecutiveEmpty = 0;

  for (let from = 0; from < maxProducts; from += batchSize) {
    const to = from + batchSize - 1;
    const apiUrl = `${baseUrl}/api/catalog_system/pub/products/search/?_from=${from}&_to=${to}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
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
        const categoryPath = categories[0] || item.categoryName || null;

        products.push({
          name,
          price,
          originalPrice: isPromo ? listPrice : null,
          isPromotion: isPromo,
          category: categoryPath ? String(categoryPath).replace(/^\//,'').replace(/\/$/,'') : null,
          brand: item.brand || null,
          unit: sku?.measurementUnit || sku?.unitMultiplier ? `${sku.unitMultiplier || 1} ${sku.measurementUnit || 'un'}` : null,
          barcode: sku?.ean || null,
          sku: sku?.itemId || item.productId || null,
          imageUrl: sku?.images?.[0]?.imageUrl || null,
          sourceUrl: item.link || `${baseUrl}/produto/${item.productId}`,
        });
      }

      console.log(`VTEX API ${from}-${to}: ${data.length} items, ${products.length} total unique`);
      if (data.length < batchSize) break;
    } catch (e) {
      console.warn(`VTEX API error at offset ${from}:`, e);
      consecutiveEmpty++;
      if (consecutiveEmpty >= 3) break;
    }
  }

  return products;
}

// ========== STRATEGY 2: VTEX Category Tree + Search (deep, per-category) ==========
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
    console.log(`Found ${categoryIds.length} categories via VTEX tree`);

    for (const cat of categoryIds) {
      for (let from = 0; from < 2500; from += 50) {
        try {
          const resp = await fetch(
            `${baseUrl}/api/catalog_system/pub/products/search/?fq=C:/${cat.id}/&_from=${from}&_to=${from + 49}`,
            { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
          );

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
            products.push({
              name,
              price,
              originalPrice: isPromo ? listPrice : null,
              isPromotion: isPromo,
              category: cat.name,
              brand: item.brand || null,
              unit: sku?.measurementUnit || null,
              barcode: sku?.ean || null,
              sku: sku?.itemId || item.productId || null,
              imageUrl: sku?.images?.[0]?.imageUrl || null,
              sourceUrl: item.link || `${baseUrl}/produto/${item.productId}`,
            });
          }

          if (data.length < 50) break;
        } catch (_e) { break; }
      }
    }
    console.log(`Category search found ${products.length} NEW products`);
  } catch (e) {
    console.warn('VTEX category tree error:', e);
  }

  return products;
}

// ========== STRATEGY 3: VTEX Brand Search ==========
async function tryVtexBrandSearch(baseUrl: string, existing: Set<string>): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  const seenNames = new Set(existing);

  try {
    const brandResp = await fetch(`${baseUrl}/api/catalog_system/pub/brand/list`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (!brandResp.ok) return products;

    const brands = await brandResp.json();
    const activeBrands = Array.isArray(brands) ? brands.filter((b: any) => b.isActive).slice(0, 200) : [];
    console.log(`Found ${activeBrands.length} active brands`);

    for (const brand of activeBrands) {
      for (let from = 0; from < 500; from += 50) {
        try {
          const resp = await fetch(
            `${baseUrl}/api/catalog_system/pub/products/search/?fq=B:${brand.id}&_from=${from}&_to=${from + 49}`,
            { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
          );
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
            const categories = Object.values(item.categories || {}) as string[];
            products.push({
              name,
              price,
              originalPrice: isPromo ? listPrice : null,
              isPromotion: isPromo,
              category: categories[0] ? String(categories[0]).replace(/^\//,'').replace(/\/$/,'') : null,
              brand: item.brand || brand.name || null,
              unit: sku?.measurementUnit || null,
              barcode: sku?.ean || null,
              sku: sku?.itemId || item.productId || null,
              imageUrl: sku?.images?.[0]?.imageUrl || null,
              sourceUrl: item.link || `${baseUrl}/produto/${item.productId}`,
            });
          }
          if (data.length < 50) break;
        } catch (_e) { break; }
      }
    }
    console.log(`Brand search found ${products.length} NEW products`);
  } catch (e) {
    console.warn('VTEX brand search error:', e);
  }

  return products;
}

// ========== STRATEGY 4: VTEX Intelligent Search API ==========
async function tryVtexIntelligentSearch(baseUrl: string, existing: Set<string>): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  const seenNames = new Set(existing);

  // VTEX Intelligent Search uses a different API path
  const searchTerms = ['a', 'e', 'i', 'o', 'u', '1', '2', '3', '4', '5'];

  for (const term of searchTerms) {
    for (let page = 0; page < 50; page++) {
      try {
        const resp = await fetch(
          `${baseUrl}/api/io/_v/api/intelligent-search/product_search/${term}?page=${page + 1}&count=50&locale=pt-BR`,
          { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
        );
        if (!resp.ok) break;
        const data = await resp.json();
        const items = data.products || [];
        if (items.length === 0) break;

        for (const item of items) {
          const name = item.productName || item.name || '';
          if (!name || seenNames.has(name.toLowerCase())) continue;
          seenNames.add(name.toLowerCase());

          const sku = item.items?.[0];
          const seller = sku?.sellers?.[0];
          const price = seller?.commertialOffer?.Price || item.priceRange?.sellingPrice?.lowPrice || 0;
          const listPrice = seller?.commertialOffer?.ListPrice || item.priceRange?.listPrice?.lowPrice || 0;
          if (price <= 0) continue;

          const isPromo = listPrice > price;
          products.push({
            name,
            price,
            originalPrice: isPromo ? listPrice : null,
            isPromotion: isPromo,
            category: item.categories?.[0] || item.categoryTree?.[0]?.name || null,
            brand: item.brand || null,
            unit: sku?.measurementUnit || null,
            barcode: sku?.ean || null,
            sku: sku?.itemId || item.productId || null,
            imageUrl: sku?.images?.[0]?.imageUrl || null,
            sourceUrl: item.link || `${baseUrl}/${item.linkText}/p`,
          });
        }
        if (items.length < 50) break;
      } catch (_e) { break; }
    }
  }
  console.log(`Intelligent Search found ${products.length} NEW products`);
  return products;
}

// ========== STRATEGY 5: Sitemap + Firecrawl (fallback for non-VTEX) ==========
async function trySitemapDiscovery(baseUrl: string, apiKey: string, maxPages: number, existing: Set<string>): Promise<{ products: ScrapedProduct[], pagesScraped: number }> {
  const products: ScrapedProduct[] = [];
  const seenNames = new Set(existing);
  let pagesScraped = 0;
  const productUrls: string[] = [];

  const sitemapUrls = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_products.xml`,
    `${baseUrl}/sitemap/products.xml`,
    `${baseUrl}/sitemap-products.xml`,
  ];

  for (const sitemapUrl of sitemapUrls) {
    try {
      const resp = await fetch(sitemapUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!resp.ok) continue;
      const text = await resp.text();

      const urlMatches = text.match(/<loc>([^<]+)<\/loc>/gi) || [];
      for (const m of urlMatches) {
        const url = m.replace(/<\/?loc>/gi, '').trim();
        if (/\/produto\/|\/p\/|\/product\//i.test(url)) {
          productUrls.push(url);
        }
        if (/sitemap.*\.xml/i.test(url) && !sitemapUrls.includes(url)) {
          try {
            const subResp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (subResp.ok) {
              const subText = await subResp.text();
              const subUrls = subText.match(/<loc>([^<]+)<\/loc>/gi) || [];
              for (const sm of subUrls) {
                const subUrl = sm.replace(/<\/?loc>/gi, '').trim();
                if (/\/produto\/|\/p\/|\/product\//i.test(subUrl)) {
                  productUrls.push(subUrl);
                }
              }
            }
          } catch (_e) { /* ignore */ }
        }
      }

      if (productUrls.length > 0) {
        console.log(`Sitemap ${sitemapUrl}: found ${productUrls.length} product URLs`);
        break;
      }
    } catch (_e) { continue; }
  }

  // Also use Firecrawl Map
  try {
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl, limit: 5000, includeSubdomains: false }),
    });
    if (mapResponse.ok) {
      const mapData = await mapResponse.json();
      const mapLinks: string[] = mapData.links || [];
      console.log(`Firecrawl Map found ${mapLinks.length} URLs`);
      for (const link of mapLinks) {
        if (/\/produto\/|\/p\/|\/product\/|\/item\//i.test(link)) {
          if (!productUrls.includes(link)) productUrls.push(link);
        }
      }
    }
  } catch (e) {
    console.warn('Firecrawl map error:', e);
  }

  const uniqueUrls = [...new Set(productUrls)].slice(0, maxPages);
  console.log(`Total unique product URLs to scrape: ${uniqueUrls.length}`);

  if (uniqueUrls.length === 0) {
    const fallbackUrls = [baseUrl];
    const listingPatterns = ['/departamento/', '/categoria/', '/c/', '/ofertas/', '/promocoes/'];
    try {
      const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: baseUrl, limit: 5000, includeSubdomains: false }),
      });
      if (mapResponse.ok) {
        const mapData = await mapResponse.json();
        for (const link of (mapData.links || [])) {
          if (listingPatterns.some(p => link.toLowerCase().includes(p))) {
            fallbackUrls.push(link);
          }
        }
      }
    } catch (_e) { /* ignore */ }

    for (const url of fallbackUrls.slice(0, 50)) {
      const pageProducts = await scrapePageWithFirecrawl(url, apiKey);
      pagesScraped++;
      for (const p of pageProducts) {
        if (!seenNames.has(p.name.toLowerCase())) {
          seenNames.add(p.name.toLowerCase());
          products.push(p);
        }
      }
    }
    return { products, pagesScraped };
  }

  // Scrape in parallel batches
  const batchSize = 10;
  for (let i = 0; i < uniqueUrls.length; i += batchSize) {
    const batch = uniqueUrls.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(url => scrapePageWithFirecrawl(url, apiKey)));

    for (const pageProducts of results) {
      pagesScraped++;
      for (const p of pageProducts) {
        if (!seenNames.has(p.name.toLowerCase())) {
          seenNames.add(p.name.toLowerCase());
          products.push(p);
        }
      }
    }
    console.log(`Scraped batch ${Math.floor(i/batchSize)+1}: ${products.length} total products`);
  }

  return { products, pagesScraped };
}

async function scrapePageWithFirecrawl(url: string, apiKey: string): Promise<ScrapedProduct[]> {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown', 'html'], waitFor: 3000, onlyMainContent: false }),
    });

    if (!response.ok) return [];
    const data = await response.json();

    const html = data.data?.html || data.html || '';
    const markdown = data.data?.markdown || data.markdown || '';

    let products = extractProductsFromHtml(html, url);
    if (products.length < 2 && markdown) {
      const mdProducts = extractProductsFromMarkdown(markdown, url);
      for (const mp of mdProducts) {
        if (!products.some(p => p.name.toLowerCase() === mp.name.toLowerCase())) {
          products.push(mp);
        }
      }
    }
    return products;
  } catch (_e) {
    return [];
  }
}

function extractProductsFromHtml(html: string, sourceUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];

  // JSON-LD
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
            name: item.name,
            price: parsedPrice,
            originalPrice: parsedOriginal && parsedOriginal > parsedPrice ? parsedOriginal : null,
            isPromotion: !!(parsedOriginal && parsedOriginal > parsedPrice),
            category: item.category || null,
            brand: item.brand?.name || item.brand || null,
            unit: null,
            barcode: item.gtin13 || item.gtin || item.sku || null,
            sku: item.sku || item.productID || offers.sku || null,
            imageUrl: Array.isArray(item.image) ? item.image[0] : item.image || null,
            sourceUrl,
          });
        }
      }
    } catch (_e) { /* ignore */ }
  }

  // VTEX __STATE__
  const vtexStatePattern = /window\.__STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/;
  const stateMatch = html.match(vtexStatePattern);
  if (stateMatch) {
    try {
      const state = JSON.parse(stateMatch[1]);
      for (const key of Object.keys(state)) {
        const val = state[key];
        if (val?.productName && val?.priceRange) {
          const sellingPrice = val.priceRange?.sellingPrice?.lowPrice || 0;
          const listPrice = val.priceRange?.listPrice?.lowPrice || 0;
          if (sellingPrice > 0) {
            const isPromo = listPrice > sellingPrice;
            products.push({
              name: val.productName,
              price: sellingPrice,
              originalPrice: isPromo ? listPrice : null,
              isPromotion: isPromo,
              category: val.categoryTree?.map((c: any) => c.name).join(' > ') || null,
              brand: val.brand || null,
              unit: null,
              barcode: val.items?.[0]?.ean || null,
              sku: val.items?.[0]?.itemId || val.productId || null,
              imageUrl: val.items?.[0]?.images?.[0]?.imageUrl || null,
              sourceUrl,
            });
          }
        }
      }
    } catch (_e) { /* ignore */ }
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
        const prices = allPrices.map(p => parseLocalizedNumber(p.replace(/R\$\s*/, '')))
          .filter(p => p > 0 && p < 10000).sort((a, b) => b - a);
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

    const barcodeMatch = contextLines.match(/\b(\d{13})\b/) || contextLines.match(/(?:ean|barcode|cod\.?\s*barras?)[:\s]*(\d{8,14})/i);
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
    // --- Auth check ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const supabaseAuth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    // --- End auth check ---

    const { url, maxPages } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl não está configurado.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }
    formattedUrl = formattedUrl.replace(/\/+$/, '');

    const pageLimit = Math.min(maxPages || 500, 1000);
    let allProducts: ScrapedProduct[] = [];
    let pagesScraped = 0;
    const seenNames = new Set<string>();
    const strategies: string[] = [];

    // ===== STRATEGY 1: VTEX Search API (up to 10,000) =====
    console.log('Strategy 1: VTEX Search API...');
    const vtexProducts = await tryVtexApi(formattedUrl);
    if (vtexProducts.length > 0) {
      strategies.push(`VTEX API: ${vtexProducts.length}`);
      for (const p of vtexProducts) {
        seenNames.add(p.name.toLowerCase());
        allProducts.push(p);
      }
    }

    // ===== STRATEGY 2: VTEX Category Tree (always try to find more) =====
    console.log('Strategy 2: VTEX Category Tree Search...');
    const catProducts = await tryVtexCategorySearch(formattedUrl, seenNames);
    if (catProducts.length > 0) {
      strategies.push(`Categories: +${catProducts.length}`);
      for (const p of catProducts) {
        seenNames.add(p.name.toLowerCase());
        allProducts.push(p);
      }
    }

    // ===== STRATEGY 3: VTEX Brand Search (always try) =====
    console.log('Strategy 3: VTEX Brand Search...');
    const brandProducts = await tryVtexBrandSearch(formattedUrl, seenNames);
    if (brandProducts.length > 0) {
      strategies.push(`Brands: +${brandProducts.length}`);
      for (const p of brandProducts) {
        seenNames.add(p.name.toLowerCase());
        allProducts.push(p);
      }
    }

    // ===== STRATEGY 4: VTEX Intelligent Search =====
    if (allProducts.length < 2000) {
      console.log('Strategy 4: VTEX Intelligent Search...');
      const isProducts = await tryVtexIntelligentSearch(formattedUrl, seenNames);
      if (isProducts.length > 0) {
        strategies.push(`IntelligentSearch: +${isProducts.length}`);
        for (const p of isProducts) {
          seenNames.add(p.name.toLowerCase());
          allProducts.push(p);
        }
      }
    }

    // ===== STRATEGY 5: Sitemap + Firecrawl (for non-VTEX or supplement) =====
    if (allProducts.length < 200) {
      console.log('Strategy 5: Sitemap + Firecrawl...');
      const { products: scrapedProducts, pagesScraped: scraped } = await trySitemapDiscovery(formattedUrl, apiKey, pageLimit, seenNames);
      pagesScraped = scraped;
      if (scrapedProducts.length > 0) {
        strategies.push(`Sitemap/Firecrawl: +${scrapedProducts.length}`);
        for (const p of scrapedProducts) {
          seenNames.add(p.name.toLowerCase());
          allProducts.push(p);
        }
      }
    }

    // Sort by category then name
    allProducts.sort((a, b) => {
      const catA = a.category || 'zzz';
      const catB = b.category || 'zzz';
      if (catA !== catB) return catA.localeCompare(catB);
      return a.name.localeCompare(b.name);
    });

    console.log(`FINAL: ${allProducts.length} unique products | Strategies: ${strategies.join(' | ')}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          products: allProducts,
          totalFound: allProducts.length,
          pagesScraped: pagesScraped || allProducts.length,
          totalUrlsFound: allProducts.length,
          scrapedUrl: formattedUrl,
          scrapedAt: new Date().toISOString(),
          strategies: strategies,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping competitor:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
