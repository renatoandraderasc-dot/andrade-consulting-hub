const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ScrapedProduct {
  name: string;
  price: number;
  category: string | null;
  brand: string | null;
  unit: string | null;
  imageUrl: string | null;
  sourceUrl: string;
}

function parseLocalizedNumber(value: string): number {
  if (!value || value === "") return 0;
  let str = String(value).trim();
  // Remove currency symbols and spaces
  str = str.replace(/[R$\s]/g, "");
  // Auto-detect format
  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");
  const isCommaDecimal = lastComma > lastDot;
  if (isCommaDecimal) {
    str = str.replace(/\./g, ""); // Remove thousand separators
    str = str.replace(",", "."); // Convert decimal separator
  } else {
    str = str.replace(/,/g, ""); // Remove thousand separators
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : parsed;
}

function extractProductsFromMarkdown(markdown: string, sourceUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  
  // Pattern 1: Look for price patterns like "R$ XX,XX" or "R$XX.XX"
  const pricePattern = /R\$\s*[\d.,]+/g;
  const lines = markdown.split('\n');
  
  let currentProduct: Partial<ScrapedProduct> | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Check if line has a price
    const priceMatch = line.match(/R\$\s*([\d.,]+)/);
    
    if (priceMatch) {
      const price = parseLocalizedNumber(priceMatch[1]);
      if (price > 0 && price < 10000) { // sanity check
        // Look backwards for product name (usually 1-3 lines before price)
        let productName = '';
        for (let j = Math.max(0, i - 5); j < i; j++) {
          const prevLine = lines[j].trim();
          // Skip empty lines, image links, and very short lines
          if (prevLine && prevLine.length > 3 && !prevLine.startsWith('![') && !prevLine.startsWith('http')) {
            // Remove markdown formatting and URLs in parentheses
            productName = prevLine
              .replace(/\(https?:\/\/[^)]+\)/g, '') // Remove (url) patterns
              .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
              .replace(/[#*_\[\]]/g, '')
              .trim();
          }
        }
        
        if (productName && productName.length > 5 && productName.length < 200 && !/^\d+%\s*(OFF|off|desconto)/i.test(productName)) {
          // Try to extract brand from product name
          const brandMatch = productName.match(/\b(Camil|Kicaldo|Coca-Cola|Brahma|Dove|Ypê|Sadia|Italac|União|Liza|Del Valle|Neve|Seara|Qboa|Gallo|Vitarella|Nestlé|Omo|Comfort|Colgate|Palmolive|Nescafé|Nescau|Leite Moça|Maizena|Tang|Hellmanns|Knorr|Kibon|Vigor|Danone|Parmalat|Piracanjuba|Aurora|Perdigão|Friboi|Minerva|Marfrig)\b/i);
          
          // Try to extract unit/weight
          const unitMatch = productName.match(/(\d+\s*(?:kg|g|ml|l|L|un|und|pct|cx|caixa|lata|garrafa|pet|fardo|pack|rolos?))\b/i);
          
          // Avoid duplicates
          const exists = products.some(p => 
            p.name.toLowerCase() === productName.toLowerCase() || 
            (p.price === price && p.name.substring(0, 10) === productName.substring(0, 10))
          );
          
          if (!exists) {
            products.push({
              name: productName,
              price,
              category: null,
              brand: brandMatch ? brandMatch[1] : null,
              unit: unitMatch ? unitMatch[1] : null,
              imageUrl: null,
              sourceUrl,
            });
          }
        }
      }
    }
  }
  
  return products;
}

function extractProductsFromHtml(html: string, sourceUrl: string): ScrapedProduct[] {
  const products: ScrapedProduct[] = [];
  
  // VTEX pattern: look for product shelf items with structured data
  // Pattern for JSON-LD structured data
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
  let jsonLdMatch;
  
  while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      if (data['@type'] === 'Product' || (Array.isArray(data) && data[0]?.['@type'] === 'Product')) {
        const items = Array.isArray(data) ? data : [data];
        for (const item of items) {
          if (item['@type'] === 'Product' && item.name) {
            const price = item.offers?.price || item.offers?.lowPrice || 
                         item.offers?.[0]?.price || 0;
            if (price > 0) {
              products.push({
                name: item.name,
                price: typeof price === 'string' ? parseLocalizedNumber(price) : price,
                category: item.category || null,
                brand: item.brand?.name || item.brand || null,
                unit: null,
                imageUrl: item.image?.[0] || item.image || null,
                sourceUrl,
              });
            }
          }
        }
      }
      // ItemList with products
      if (data['@type'] === 'ItemList' && data.itemListElement) {
        for (const element of data.itemListElement) {
          const item = element.item || element;
          if (item.name && item.offers) {
            const price = item.offers.price || item.offers.lowPrice || 0;
            if (price > 0) {
              products.push({
                name: item.name,
                price: typeof price === 'string' ? parseLocalizedNumber(price) : price,
                category: item.category || null,
                brand: item.brand?.name || null,
                unit: null,
                imageUrl: item.image?.[0] || item.image || null,
                sourceUrl,
              });
            }
          }
        }
      }
    } catch (e) {
      // Ignore invalid JSON-LD
    }
  }
  
  // VTEX-specific: look for __STATE__ or product data in scripts
  const vtexStatePattern = /window\.__STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/;
  const stateMatch = html.match(vtexStatePattern);
  if (stateMatch) {
    try {
      const state = JSON.parse(stateMatch[1]);
      for (const key of Object.keys(state)) {
        const val = state[key];
        if (val?.productName && val?.priceRange) {
          const price = val.priceRange?.sellingPrice?.lowPrice || 
                       val.priceRange?.listPrice?.lowPrice || 0;
          if (price > 0) {
            products.push({
              name: val.productName,
              price,
              category: val.categoryTree?.[0]?.name || null,
              brand: val.brand || null,
              unit: null,
              imageUrl: val.items?.[0]?.images?.[0]?.imageUrl || null,
              sourceUrl,
            });
          }
        }
      }
    } catch (e) {
      // Ignore parse errors
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

    const pageLimit = Math.min(maxPages || 50, 100);

    // Step 1: Use Firecrawl MAP to discover all product URLs on the site
    console.log('Step 1: Mapping site URLs:', formattedUrl);
    const mapResponse = await fetch('https://api.firecrawl.dev/v1/map', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        search: 'produto',
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

    // Filter for product/category pages (common patterns for e-commerce)
    const productPatterns = ['/produto/', '/product/', '/p/', '/departamento/', '/categoria/', '/c/'];
    const categoryLinks = allLinks.filter(link => 
      productPatterns.some(pattern => link.toLowerCase().includes(pattern))
    );

    // Also include category/department listing pages that contain multiple products
    const listingLinks = allLinks.filter(link => {
      const lower = link.toLowerCase();
      return (lower.includes('/departamento/') || lower.includes('/categoria/') || lower.includes('/c/')) 
        && !categoryLinks.includes(link);
    });

    // Combine: prefer category listing pages (have many products each), then individual product pages
    let urlsToScrape = [...new Set([...listingLinks, ...categoryLinks])];
    
    // If no product-specific URLs found, fall back to main pages
    if (urlsToScrape.length === 0) {
      urlsToScrape = allLinks.slice(0, pageLimit);
    } else {
      urlsToScrape = urlsToScrape.slice(0, pageLimit);
    }

    console.log(`Selected ${urlsToScrape.length} URLs to scrape (${listingLinks.length} listings, ${categoryLinks.length} product pages)`);

    // Step 2: Scrape each URL for products
    let allProducts: ScrapedProduct[] = [];
    let pagesScraped = 0;

    // Scrape in batches of 5 for efficiency
    const batchSize = 5;
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
              waitFor: 5000,
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
          // Deduplicate by name
          if (!allProducts.some(existing => existing.name.toLowerCase() === p.name.toLowerCase())) {
            allProducts.push(p);
          }
        }
      }

      console.log(`After batch: ${allProducts.length} unique products total`);
    }

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
