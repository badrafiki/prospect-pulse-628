import { supabase } from '@/integrations/supabase/client';

type SearchParams = {
  query: string;
  country?: string;
  industry?: string;
  limit?: number;
  skip_ai_filter?: boolean;
};

type SearchResponse = {
  success: boolean;
  error?: string;
  search_id?: string;
  companies?: any[];
  total?: number;
  filtered?: { blocklist: number; ai: number; raw: number };
};

export const firecrawlApi = {
  async search(params: SearchParams): Promise<SearchResponse> {
    const { data, error } = await supabase.functions.invoke('firecrawl-search', {
      body: params,
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return data;
  },
};
