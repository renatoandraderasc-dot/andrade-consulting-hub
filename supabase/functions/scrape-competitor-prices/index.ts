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
  // Check VTEX
  try {
    const resp = await fetch(`${baseUrl}/api/catalog_system/pub/products/search/?_from=0&_to=0`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    });
    if (resp.ok) {
      const text = await resp.text();
      if (text.startsWith('[')) return 'vtex';
    }
  } catch (_) {}

  // Check VIPCommerce
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

// ========== VIPCOMMERCE STRATEGY ==========
async function tryVipCommerceApi(baseUrl: string): Promise<ScrapedProduct[]> {
  const products: ScrapedProduct[] = [];
  const seenNames = new Set<string>();
  const domain = baseUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*/, '');

  try {
    // Step 1: Get org/filial info
    const filialResp = await fetch(`https://services.vipcommerce.com.br/organizacoes/filiais/dominio/${domain}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (!filialResp.ok) return products;
    const filialData = await filialResp.json();
    if (!filialData.success) return products;

    const orgId = filialData.data.organizacao.id;
    const filialId = filialData.data.id;
    const orgLabel = filialData.data.organizacao.label;
    console.log(`VIPCommerce: org=${orgId}, filial=${filialId}, label=${orgLabel}`);

    // Step 2: Get anonymous store token
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'OrganizationId': String(orgId),
      'DomainKey': domain,
      'Origin': baseUrl,
      'Referer': `${baseUrl}/`,
    };

    // Try getting token - the app uses specific store credentials
    // We'll try common patterns and also try without auth
    let token = '';
    
    // Try login with label as username
    const loginPatterns = [
      { username: orgLabel, key: orgLabel },
      { username: domain, key: domain },
      { username: `${orgLabel}-loja`, key: `${orgLabel}-loja` },
      { username: 'loja', key: orgLabel },
    ];
    
    for (const creds of loginPatterns) {
      try {
        const loginResp = await fetch(`https://services.vipcommerce.com.br/api-admin/v1/org/${orgId}/auth/loja/login`, {
          method: 'POST',
          headers,
          body: JSON.stringify(creds),
        });
        if (loginResp.ok) {
          const loginData = await loginResp.json();
          if (loginData.success && loginData.data?.token) {
            token = loginData.data.token;
            console.log(`VIPCommerce: got token with pattern ${creds.username}`);
            break;
          }
        }
      } catch (_) {}
    }

    // Step 3: Get distribution centers
    const authHeaders = { ...headers };
    if (token) authHeaders['Authorization'] = `Bearer ${token}`;

    let cdId = 1;
    try {
      const cdResp = await fetch(
        `https://services.vipcommerce.com.br/api-admin/v1/org/${orgId}/loja/centros_distribuicao`,
        { headers: authHeaders }
      );
      if (cdResp.ok) {
        const cdData = await cdResp.json();
        if (cdData.success && cdData.data?.[0]?.id) {
          cdId = cdData.data[0].id;
        }
      }
    } catch (_) {}

    // Step 4: Get category tree
    const categoryIds: { id: number; name: string }[] = [];
    try {
      const catResp = await fetch(
        `https://services.vipcommerce.com.br/api-admin/v1/org/${orgId}/filial/${filialId}/centro_distribuicao/${cdId}/classificacoes-mercadologicas/arvore`,
        { headers: authHeaders }
      );
      if (catResp.ok) {
        const catData = await catResp.json();
        if (catData.success) {
          function extractCats(cats: any[], parentName = '') {
            for (const cat of cats) {
              const name = parentName ? `${parentName} > ${cat.descricao}` : cat.descricao;
              if (cat.classificacao_mercadologica_id) {
                categoryIds.push({ id: cat.classificacao_mercadologica_id, name });
              }
              if (cat.children?.length) extractCats(cat.children, name);
            }
          }
          extractCats(catData.data || []);
        }
      }
    } catch (_) {}
    console.log(`VIPCommerce: found ${categoryIds.length} categories`);

    // Step 5: Get products per category
    for (const cat of categoryIds) {
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 100) {
        try {
          const prodResp = await fetch(
            `https://services.vipcommerce.com.br/api-admin/v1/org/${orgId}/filial/${filialId}/centro_distribuicao/${cdId}/produto?classificacao_mercadologica_id=${cat.id}&page=${page}&limit=50&disponivel=true`,
            { headers: authHeaders }
          );
          if (!prodResp.ok) { hasMore = false; break; }
          const prodData = await prodResp.json();
          if (!prodData.success || !prodData.data?.length) { hasMore = false; break; }

          for (const item of prodData.data) {
            const name = item.descricao || item.nome || '';
            if (!name || seenNames.has(name.toLowerCase())) continue;
            seenNames.add(name.toLowerCase());

            const price = item.preco || item.preco_venda || 0;
            const originalPrice = item.preco_antigo || item.preco_lista || null;
            if (price <= 0) continue;

            products.push({
              name,
              price,
              originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
              isPromotion: !!(originalPrice && originalPrice > price),
              category: cat.name,
              brand: item.marca?.descricao || item.marca || null,
              unit: item.unidade || item.embalagem || null,
              barcode: item.ean || item.codigo_barras || null,
              sku: item.produto_id?.toString() || item.id?.toString() || null,
              imageUrl: item.imagem || item.imagem_url || null,
              sourceUrl: `${baseUrl}/produto/${item.produto_id || item.id}/${(name || '').toLowerCase().replace(/\s+/g, '-')}`,
            });
          }

          hasMore = prodData.data.length >= 50;
          page++;
        } catch (_) { hasMore = false; }
      }
    }

    // Step 6: Also try search-based extraction (vowel search trick)
    if (products.length < 500) {
      const searchTerms = ['a', 'e', 'i', 'o', 'u', 'arroz', 'leite', 'cafe', 'oleo', 'acucar', 'feijao', 'cerveja', 'refrigerante', 'sabonete', 'detergente', 'papel', 'carne', 'frango', 'queijo', 'presunto'];
      for (const term of searchTerms) {
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 50) {
          try {
            const searchResp = await fetch(
              `https://services.vipcommerce.com.br/api-admin/v1/org/${orgId}/filial/${filialId}/centro_distribuicao/${cdId}/busca?termo=${encodeURIComponent(term)}&page=${page}&limit=50`,
              { headers: authHeaders }
            );
            if (!searchResp.ok) { hasMore = false; break; }
            const searchData = await searchResp.json();
            const items = searchData.data?.produtos || searchData.data || [];
            if (!Array.isArray(items) || items.length === 0) { hasMore = false; break; }

            for (const item of items) {
              const name = item.descricao || item.nome || '';
              if (!name || seenNames.has(name.toLowerCase())) continue;
              seenNames.add(name.toLowerCase());

              const price = item.preco || item.preco_venda || 0;
              const originalPrice = item.preco_antigo || null;
              if (price <= 0) continue;

              products.push({
                name, price,
                originalPrice: originalPrice && originalPrice > price ? originalPrice : null,
                isPromotion: !!(originalPrice && originalPrice > price),
                category: item.departamento || item.classificacao || null,
                brand: item.marca?.descricao || item.marca || null,
                unit: item.unidade || null,
                barcode: item.ean || null,
                sku: item.produto_id?.toString() || null,
                imageUrl: item.imagem || null,
                sourceUrl: `${baseUrl}/produto/${item.produto_id || item.id}/${(name || '').toLowerCase().replace(/\s+/g, '-')}`,
              });
            }
            hasMore = items.length >= 50;
            page++;
          } catch (_) { hasMore = false; }
        }
        console.log(`VIPCommerce search "${term}": ${products.length} total products`);
      }
    }

    console.log(`VIPCommerce total: ${products.length} products`);
  } catch (e) {
    console.warn('VIPCommerce API error:', e);
  }

  return products;
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

// ========== FIRECRAWL STRATEGIES ==========
async function tryFirecrawlFullScrape(baseUrl: string, apiKey: string, maxPages: number, existing: Set<string>): Promise<{ products: ScrapedProduct[], pagesScraped: number }> {
  const products: ScrapedProduct[] = [];
  const seenNames = new Set(existing);
  let pagesScraped = 0;

  // Step 1: Map site URLs
  const productUrls: string[] = [];
  
  // Try sitemap
  for (const path of ['/sitemap.xml', '/sitemap_products.xml', '/sitemap/products.xml']) {
    try {
      const resp = await fetch(`${baseUrl}${path}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!resp.ok) continue;
      const text = await resp.text();
      const urlMatches = text.match(/<loc>([^<]+)<\/loc>/gi) || [];
      for (const m of urlMatches) {
        const url = m.replace(/<\/?loc>/gi, '').trim();
        if (/\/produto\/|\/p\/|\/product\//i.test(url)) productUrls.push(url);
        if (/sitemap.*\.xml/i.test(url)) {
          try {
            const subResp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (subResp.ok) {
              const subText = await subResp.text();
              const subUrls = subText.match(/<loc>([^<]+)<\/loc>/gi) || [];
              for (const sm of subUrls) {
                const subUrl = sm.replace(/<\/?loc>/gi, '').trim();
                if (/\/produto\/|\/p\/|\/product\//i.test(subUrl)) productUrls.push(subUrl);
              }
            }
          } catch (_) {}
        }
      }
      if (productUrls.length > 0) break;
    } catch (_) {}
  }

  // Firecrawl Map
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
        if (/\/produto\/|\/p\/|\/product\/|\/item\//i.test(link) && !productUrls.includes(link)) {
          productUrls.push(link);
        }
      }
    }
  } catch (_) {}

  // Step 2: Also scrape category/listing pages with Firecrawl (rendered JS)
  const listingUrls: string[] = [baseUrl];
  const departmentPatterns = ['/departamentos/', '/departamento/', '/categoria/', '/c/', '/ofertas/', '/promocoes/'];
  try {
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl, limit: 5000, includeSubdomains: false }),
    });
    if (mapResponse.ok) {
      const mapData = await mapResponse.json();
      for (const link of (mapData.links || [])) {
        if (departmentPatterns.some(p => link.toLowerCase().includes(p)) && !listingUrls.includes(link)) {
          listingUrls.push(link);
        }
      }
    }
  } catch (_) {}

  console.log(`Firecrawl: ${productUrls.length} product URLs, ${listingUrls.length} listing URLs`);

  // Step 3: Scrape listing pages first (each can have many products)
  for (const url of listingUrls.slice(0, 50)) {
    const pageProducts = await scrapePageWithFirecrawl(url, apiKey);
    pagesScraped++;
    for (const p of pageProducts) {
      if (!seenNames.has(p.name.toLowerCase())) {
        seenNames.add(p.name.toLowerCase());
        products.push(p);
      }
    }
  }
  console.log(`After listing pages: ${products.length} products`);

  // Step 4: Scrape individual product pages
  const uniqueUrls = [...new Set(productUrls)].slice(0, maxPages);
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
      body: JSON.stringify({ url, formats: ['markdown', 'html'], waitFor: 5000, onlyMainContent: false }),
    });
    if (!response.ok) return [];
    const data = await response.json();
    const html = data.data?.html || data.html || '';
    const markdown = data.data?.markdown || data.markdown || '';
    let products = extractProductsFromHtml(html, url);
    if (products.length < 2 && markdown) {
      const mdProducts = extractProductsFromMarkdown(markdown, url);
      for (const mp of mdProducts) {
        if (!products.some(p => p.name.toLowerCase() === mp.name.toLowerCase())) products.push(mp);
      }
    }
    return products;
  } catch (_) { return []; }
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
              name: val.productName, price: sellingPrice,
              originalPrice: isPromo ? listPrice : null, isPromotion: isPromo,
              category: val.categoryTree?.map((c: any) => c.name).join(' > ') || null,
              brand: val.brand || null, unit: null, barcode: val.items?.[0]?.ean || null,
              sku: val.items?.[0]?.itemId || null, imageUrl: val.items?.[0]?.images?.[0]?.imageUrl || null, sourceUrl,
            });
          }
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

    const { url, maxPages } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ success: false, error: 'URL é obrigatória' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: 'Firecrawl não está configurado.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) formattedUrl = `https://${formattedUrl}`;
    formattedUrl = formattedUrl.replace(/\/+$/, '');

    const pageLimit = Math.min(maxPages || 500, 1000);
    let allProducts: ScrapedProduct[] = [];
    let pagesScraped = 0;
    const seenNames = new Set<string>();
    const strategies: string[] = [];

    // ===== DETECT PLATFORM =====
    console.log('Detecting platform...');
    const platform = await detectPlatform(formattedUrl);
    console.log(`Platform detected: ${platform}`);

    if (platform === 'vipcommerce') {
      // ===== VIPCOMMERCE STRATEGY =====
      console.log('Using VIPCommerce strategy...');
      const vcProducts = await tryVipCommerceApi(formattedUrl);
      if (vcProducts.length > 0) {
        strategies.push(`VIPCommerce API: ${vcProducts.length}`);
        for (const p of vcProducts) {
          seenNames.add(p.name.toLowerCase());
          allProducts.push(p);
        }
      }
    } else if (platform === 'vtex') {
      // ===== VTEX STRATEGIES =====
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
    }

    // ===== FIRECRAWL FALLBACK (always try if we have fewer than 200 products) =====
    if (allProducts.length < 200) {
      console.log('Firecrawl full scrape...');
      const { products: fcProducts, pagesScraped: fcPages } = await tryFirecrawlFullScrape(formattedUrl, apiKey, pageLimit, seenNames);
      pagesScraped = fcPages;
      if (fcProducts.length > 0) {
        strategies.push(`Firecrawl: +${fcProducts.length}`);
        for (const p of fcProducts) { seenNames.add(p.name.toLowerCase()); allProducts.push(p); }
      }
    }

    allProducts.sort((a, b) => {
      const catA = a.category || 'zzz';
      const catB = b.category || 'zzz';
      if (catA !== catB) return catA.localeCompare(catB);
      return a.name.localeCompare(b.name);
    });

    console.log(`FINAL: ${allProducts.length} unique products | Platform: ${platform} | Strategies: ${strategies.join(' | ')}`);

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
          platform,
          strategies,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping competitor:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
