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
        
        if (productName && productName.length > 2 && productName.length < 200) {
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
    const { url, searchTerm, maxPages } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl não está configurado. Conecte o Firecrawl nas configurações.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    // If there's a search term, try to navigate to search page
    const searchUrl = searchTerm 
      ? `${formattedUrl}/${encodeURIComponent(searchTerm)}?_q=${encodeURIComponent(searchTerm)}&map=ft`
      : formattedUrl;

    console.log('Scraping competitor URL:', searchUrl);

    // Use Firecrawl to scrape the page with JS rendering
    const scrapeResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchUrl,
        formats: ['markdown', 'html'],
        waitFor: 8000, // Wait for JS to render
        onlyMainContent: false,
      }),
    });

    const scrapeData = await scrapeResponse.json();

    if (!scrapeResponse.ok) {
      console.error('Firecrawl scrape error:', scrapeData);
      return new Response(
        JSON.stringify({ success: false, error: scrapeData.error || `Erro ao acessar o site (${scrapeResponse.status})` }),
        { status: scrapeResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
    const html = scrapeData.data?.html || scrapeData.html || '';
    
    console.log(`Received markdown: ${markdown.length} chars, html: ${html.length} chars`);

    // Extract products from both formats
    let products: ScrapedProduct[] = [];
    
    // Try HTML first (more structured)
    if (html) {
      products = extractProductsFromHtml(html, formattedUrl);
      console.log(`Extracted ${products.length} products from HTML`);
    }
    
    // If HTML extraction didn't find enough, try markdown
    if (products.length < 3 && markdown) {
      const markdownProducts = extractProductsFromMarkdown(markdown, formattedUrl);
      console.log(`Extracted ${markdownProducts.length} products from markdown`);
      
      // Merge, avoiding duplicates
      for (const mp of markdownProducts) {
        const exists = products.some(p => 
          p.name.toLowerCase() === mp.name.toLowerCase()
        );
        if (!exists) {
          products.push(mp);
        }
      }
    }

    console.log(`Total products extracted: ${products.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          products,
          totalFound: products.length,
          scrapedUrl: searchUrl,
          scrapedAt: new Date().toISOString(),
          markdownLength: markdown.length,
          htmlLength: html.length,
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
