import { supabase } from '@/integrations/supabase/client';

export interface ScrapedProduct {
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

export interface ScrapeResult {
  success: boolean;
  error?: string;
  data?: {
    products: ScrapedProduct[];
    totalFound: number;
    pagesScraped: number;
    totalUrlsFound: number;
    scrapedUrl: string;
    scrapedAt: string;
  };
}

export const firecrawlApi = {
  async scrapeCompetitorPrices(url: string, maxPages?: number): Promise<ScrapeResult> {
    const { data, error } = await supabase.functions.invoke('scrape-competitor-prices', {
      body: { url, maxPages: maxPages || 200 },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },
};
