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
  async?: boolean;
  jobId?: string;
  message?: string;
  data?: {
    products: ScrapedProduct[];
    totalFound: number;
    pagesScraped: number;
    totalUrlsFound: number;
    scrapedUrl: string;
    scrapedAt: string;
  };
}

export interface ScrapeJobStatus {
  id: string;
  status: 'pending' | 'crawling' | 'extracting' | 'done' | 'error';
  progress_pct: number;
  total_urls_found: number;
  pages_crawled: number;
  products_found: number;
  error_message?: string;
  products?: ScrapedProduct[];
}

export interface CheckJobResult {
  success: boolean;
  error?: string;
  job?: ScrapeJobStatus;
}

export const firecrawlApi = {
  async scrapeCompetitorPrices(url: string, maxPages?: number, competitorName?: string): Promise<ScrapeResult> {
    const { data, error } = await supabase.functions.invoke('scrape-competitor-prices', {
      body: { action: 'start', url, maxPages: maxPages || 5000, competitorName },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },

  async checkScrapeJob(jobId: string): Promise<CheckJobResult> {
    const { data, error } = await supabase.functions.invoke('scrape-competitor-prices', {
      body: { action: 'check', jobId },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },
};
