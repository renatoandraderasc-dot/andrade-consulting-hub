import { supabase } from '@/integrations/supabase/client';

export interface ScrapedProduct {
  name: string;
  price: number;
  category: string | null;
  brand: string | null;
  unit: string | null;
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
      body: { url, maxPages: maxPages || 50 },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },
};
