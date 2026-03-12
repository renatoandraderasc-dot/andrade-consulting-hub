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
    scrapedUrl: string;
    scrapedAt: string;
    markdownLength: number;
    htmlLength: number;
  };
}

export const firecrawlApi = {
  async scrapeCompetitorPrices(url: string, searchTerm?: string): Promise<ScrapeResult> {
    const { data, error } = await supabase.functions.invoke('scrape-competitor-prices', {
      body: { url, searchTerm },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },
};
