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
  let str = String(value).trim();
  str = str.replace(/[R$\s]/g, "");
  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");
  const isCommaDecimal = lastComma > lastDot;
  if (isCommaDecimal) {
    str = str.replace(/\./g, "");
    str = str.replace(",", ".");
  } else {
    str = str.replace(/,/g, "");
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function extractProductsFromHtml(html: string, sourceUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  
  // JSON-LD structured data
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

  // Extract additional product data from common HTML patterns
  // Pattern: data-product-id, data-sku, data-ean attributes  
  const productCardPattern = /data-product[_-]?id=["']([^"']+)["'][^>]*>[\s\S]*?(?:data-ean=["']([^"']+)["'])?/gi;
  let cardMatch;
  while ((cardMatch = productCardPattern.exec(html)) !== null) {
    // Just enrich existing products with barcode if found
    const ean = cardMatch[2];
    if (ean && ean.length >= 8) {
      for (const p of products) {
        if (!p.barcode) p.barcode = ean;
      }
    }
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
    
    // Check for original/crossed price (promotion)
    let originalPrice: number | null = null;
    let isPromotion = false;
    
    // Look for "de R$ XX,XX por R$ YY,YY" pattern
    const promoMatch = line.match(/(?:de|antes|era)\s*R\$\s*([\d.,]+)/i);
    if (promoMatch) {
      const origPrice = parseLocalizedNumber(promoMatch[1]);
      if (origPrice > price) {
        originalPrice = origPrice;
        isPromotion = true;
      }
    }
    
    // Also check surrounding lines for promo indicators
    const contextLines = lines.slice(Math.max(0, i - 3), i + 3).join(' ');
    if (!isPromotion && /promoção|oferta|desconto|\d+%\s*off/i.test(contextLines)) {
      isPromotion = true;
      // Look for a second price in context
      const allPrices = contextLines.match(/R\$\s*([\d.,]+)/g);
      if (allPrices && allPrices.length >= 2) {
        const prices = allPrices.map(p => parseLocalizedNumber(p.replace(/R\$\s*/, '')))
          .filter(p => p > 0 && p < 10000)
          .sort((a, b) => b - a);
        if (prices.length >= 2 && prices[0] > price) {
          originalPrice = prices[0];
        }
      }
    }
    
    // Look backwards for product name
    let productName = '';
    for (let j = Math.max(0, i - 5); j < i; j++) {
      const prevLine = lines[j].trim();
      if (prevLine && prevLine.length > 3 && !prevLine.startsWith('![') && !prevLine.startsWith('http')) {
        productName = prevLine
          .replace(/\(https?:\/\/[^)]+\)/g, '')
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
          .replace(/[#*_\[\]]/g, '')
          .trim();
      }
    }
    
    const junkPatterns = /^\d+%\s*(OFF|off|desconto)|^Compartilhar|^Adicionar|^Ver mais|^Comprar|^Voltar|^Menu|^Carrinho|^Buscar|^Home|^Login|^Cadastr/i;
    if (!productName || productName.length <= 5 || productName.length >= 200 || junkPatterns.test(productName)) continue;
    
    // Extract barcode (EAN-13 pattern)
    const barcodeMatch = contextLines.match(/\b(\d{13})\b/) || contextLines.match(/(?:ean|barcode|cod\.?\s*barras?)[:\s]*(\d{8,14})/i);
    
    // Extract brand
    const brandMatch = productName.match(/\b(Camil|Kicaldo|Coca-Cola|Brahma|Dove|Ypê|Sadia|Italac|União|Liza|Del Valle|Neve|Seara|Qboa|Gallo|Vitarella|Nestlé|Omo|Comfort|Colgate|Palmolive|Nescafé|Nescau|Leite Moça|Maizena|Tang|Hellmanns|Knorr|Kibon|Vigor|Danone|Parmalat|Piracanjuba|Aurora|Perdigão|Friboi|Minerva|Marfrig|Tio João|Prato Fino|Kero Coco|Guaraná Antarctica|Skol|Heineken|Ambev|Bunge|Cargill|BRF|JBS|Bauducco|Renata|Adria|Barilla|Isabela|Parati|São Braz|Fortaleza|Três Corações|Melitta|Pilão|Café Bom Dia|Ypê|Limpol|Brilhante|Ariel|Vanish|Veja|Mr Músculo|Pinho Sol)\b/i);
    
    // Extract unit/weight
    const unitMatch = productName.match(/(\d+\s*(?:kg|g|mg|ml|l|L|lt|un|und|pct|cx|caixa|lata|garrafa|pet|fardo|pack|rolos?|folhas?|sachê|envelope)s?)\b/i);
    
    // Extract category from URL or context
    let category = null;
    const catFromUrl = sourceUrl.match(/(?:departamento|categoria|c)\/([^/?]+)/i);
    if (catFromUrl) {
      category = decodeURIComponent(catFromUrl[1]).replace(/-/g, ' ');
      category = category.charAt(0).toUpperCase() + category.slice(1);
    }
    
    // SKU from context
    const skuMatch = contextLines.match(/(?:cod|código|sku|ref)[.:\s]*(\w{4,20})/i);
    
    const exists = products.some(p =>
      p.name.toLowerCase() === productName.toLowerCase() ||
      (p.price === price && p.name.substring(0, 10) === productName.substring(0, 10))
    );
    
    if (!exists) {
      products.push({
        name: productName,
        price,
        originalPrice,
        isPromotion,
        category,
        brand: brandMatch ? brandMatch[1] : null,
        unit: unitMatch ? unitMatch[1] : null,
        barcode: barcodeMatch ? barcodeMatch[1] : null,
        sku: skuMatch ? skuMatch[1] : null,
        imageUrl: null,
        sourceUrl,
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

    const pageLimit = Math.min(maxPages || 200, 500);

    // Step 1: Use Firecrawl MAP to discover ALL URLs
    console.log('Step 1: Mapping ALL site URLs:', formattedUrl);
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        limit: 5000,
        includeSubdomains: false,
      }),
    });

    const mapData = await mapResponse.json();
    if (!mapResponse.ok) {
      console.error('Firecrawl map error:', mapData);
      return new Response(
        JSON.stringify({ success: false, error: mapData.error || `Erro ao mapear site (${mapResponse.status})` }),
        { status: mapResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const allLinks: string[] = mapData.links || [];
    console.log(`Map found ${allLinks.length} URLs total`);

    // Categorize URLs: listing/category pages first (many products each), then individual product pages
    const productPatterns = ['/produto/', '/product/', '/p/', '/item/', '/prod/'];
    const listingPatterns = ['/departamento/', '/categoria/', '/c/', '/department/', '/category/', '/busca/', '/search/', '/ofertas/', '/promocoes/', '/promocao/'];
    
    const listingLinks: string[] = [];
    const productLinks: string[] = [];
    const otherLinks: string[] = [];
    
    for (const link of allLinks) {
      const lower = link.toLowerCase();
      // Skip non-content pages
      if (/\/(login|cadastro|carrinho|checkout|minha-conta|politica|termos|faq|contato|sobre|quem-somos)\b/i.test(lower)) continue;
      if (/\.(jpg|png|gif|svg|css|js|pdf|ico)$/i.test(lower)) continue;
      
      if (listingPatterns.some(p => lower.includes(p))) {
        listingLinks.push(link);
      } else if (productPatterns.some(p => lower.includes(p))) {
        productLinks.push(link);
      } else if (link !== formattedUrl && link !== formattedUrl + '/') {
        otherLinks.push(link);
      }
    }

    // Prioritize: listing pages first (more products per page), then product pages, then other pages
    let urlsToScrape = [...listingLinks, ...productLinks];
    
    // If few URLs found, include other pages too
    if (urlsToScrape.length < 20) {
      urlsToScrape = [...urlsToScrape, ...otherLinks];
    }
    
    // Always include the homepage
    if (!urlsToScrape.includes(formattedUrl)) {
      urlsToScrape.unshift(formattedUrl);
    }
    
    urlsToScrape = urlsToScrape.slice(0, pageLimit);
    
    console.log(`Selected ${urlsToScrape.length} URLs to scrape (${listingLinks.length} listings, ${productLinks.length} products, ${otherLinks.length} other)`);

    // Step 2: Scrape in parallel batches
    let allProducts: ScrapedProduct[] = [];
    let pagesScraped = 0;
    const batchSize = 10;

    for (let i = 0; i < urlsToScrape.length; i += batchSize) {
      const batch = urlsToScrape.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (pageUrl) => {
        try {
          const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: pageUrl,
              formats: ['markdown', 'html'],
              waitFor: 3000,
              onlyMainContent: false,
            }),
          });

          const scrapeData = await scrapeResponse.json();
          if (!scrapeResponse.ok) {
            console.warn(`Failed to scrape ${pageUrl}: ${scrapeResponse.status}`);
            return [];
          }

          const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
          const html = scrapeData.data?.html || scrapeData.html || '';

          let products: ScrapedProduct[] = [];
          
          if (html) {
            products = extractProductsFromHtml(html, pageUrl);
          }
          
          if (products.length < 2 && markdown) {
            const mdProducts = extractProductsFromMarkdown(markdown, pageUrl);
            for (const mp of mdProducts) {
              if (!products.some(p => p.name.toLowerCase() === mp.name.toLowerCase())) {
                products.push(mp);
              }
            }
          }

          pagesScraped++;
          console.log(`Page ${pagesScraped}/${urlsToScrape.length}: ${pageUrl} → ${products.length} products`);
          return products;
        } catch (e) {
          console.warn(`Error scraping ${pageUrl}:`, e);
          return [];
        }
      });

      const batchResults = await Promise.all(batchPromises);
      for (const products of batchResults) {
        for (const p of products) {
          // Deduplicate by name (case insensitive)
          const existing = allProducts.find(e => e.name.toLowerCase() === p.name.toLowerCase());
          if (!existing) {
            allProducts.push(p);
          } else {
            // Enrich existing product with any new data
            if (!existing.barcode && p.barcode) existing.barcode = p.barcode;
            if (!existing.sku && p.sku) existing.sku = p.sku;
            if (!existing.brand && p.brand) existing.brand = p.brand;
            if (!existing.category && p.category) existing.category = p.category;
            if (!existing.imageUrl && p.imageUrl) existing.imageUrl = p.imageUrl;
            if (!existing.originalPrice && p.originalPrice) {
              existing.originalPrice = p.originalPrice;
              existing.isPromotion = true;
            }
          }
        }
      }

      console.log(`After batch: ${allProducts.length} unique products total`);
    }

    // Sort products by category then name
    allProducts.sort((a, b) => {
      const catA = a.category || 'zzz';
      const catB = b.category || 'zzz';
      if (catA !== catB) return catA.localeCompare(catB);
      return a.name.localeCompare(b.name);
    });

    console.log(`Final: ${allProducts.length} unique products from ${pagesScraped} pages`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          products: allProducts,
          totalFound: allProducts.length,
          pagesScraped,
          totalUrlsFound: allLinks.length,
          scrapedUrl: formattedUrl,
          scrapedAt: new Date().toISOString(),
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
