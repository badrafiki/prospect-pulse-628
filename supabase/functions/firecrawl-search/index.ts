import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ── Layer 1: Domain blocklist ──────────────────────────────────────────
const BLOCKED_TLDS = ['.gov', '.mil', '.edu'];
const BLOCKED_DOMAINS = [
  // Social / platforms
  'facebook.com', 'twitter.com', 'x.com', 'instagram.com', 'tiktok.com',
  'linkedin.com', 'reddit.com', 'pinterest.com', 'youtube.com',
  // News / media
  'nytimes.com', 'washingtonpost.com', 'cnn.com', 'foxnews.com', 'bbc.com',
  'bbc.co.uk', 'reuters.com', 'apnews.com', 'usatoday.com', 'nbcnews.com',
  'abcnews.go.com', 'cbsnews.com', 'theguardian.com', 'forbes.com',
  'bloomberg.com', 'cnbc.com', 'huffpost.com', 'buzzfeed.com',
  'nypost.com', 'dailymail.co.uk', 'news.yahoo.com',
  // Directories / aggregators / wikis
  'wikipedia.org', 'yelp.com', 'yellowpages.com', 'bbb.org',
  'glassdoor.com', 'indeed.com', 'craigslist.org', 'tripadvisor.com',
  'mapquest.com', 'google.com', 'amazon.com', 'ebay.com',
  // Reference / Q&A
  'quora.com', 'stackoverflow.com', 'medium.com', 'substack.com',
];

function isDomainBlocked(domain: string): boolean {
  if (!domain) return false;
  const lower = domain.toLowerCase();
  if (BLOCKED_TLDS.some(tld => lower.endsWith(tld))) return true;
  if (BLOCKED_DOMAINS.some(bd => lower === bd || lower.endsWith('.' + bd))) return true;
  return false;
}

// ── Layer 2: AI relevance check via Gemini ─────────────────────────────
async function assessRelevance(
  candidates: { url: string; title: string; description?: string }[],
  searchQuery: string,
  lovableApiKey: string,
): Promise<Map<string, boolean>> {
  const relevanceMap = new Map<string, boolean>();
  if (candidates.length === 0) return relevanceMap;

  const listing = candidates
    .map((c, i) => `${i + 1}. URL: ${c.url}\n   Title: ${c.title}\n   Desc: ${c.description || 'N/A'}`)
    .join('\n');

  const prompt = `You are a B2B lead qualification assistant. The user searched for: "${searchQuery}"

They want to find actual COMPANIES / BUSINESSES that offer products or services related to that search. 

For each result below, respond with ONLY a JSON array of booleans — true if the result looks like an actual relevant business/company website, false if it's a news article, directory listing, government page, social media profile, job board, wiki page, forum, or otherwise NOT a direct company website.

Results:
${listing}

Respond with ONLY a JSON array like [true, false, true, ...] — no explanation.`;

  try {
    const response = await fetch('https://api.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      console.error('AI relevance check failed:', response.status);
      // If AI fails, let everything through
      candidates.forEach(c => relevanceMap.set(c.url, true));
      return relevanceMap;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || '';
    
    // Extract JSON array from response
    const match = content.match(/\[[\s\S]*?\]/);
    if (match) {
      const booleans: boolean[] = JSON.parse(match[0]);
      candidates.forEach((c, i) => {
        relevanceMap.set(c.url, booleans[i] ?? true);
      });
    } else {
      console.error('Could not parse AI response:', content);
      candidates.forEach(c => relevanceMap.set(c.url, true));
    }
  } catch (err) {
    console.error('AI relevance error:', err);
    candidates.forEach(c => relevanceMap.set(c.url, true));
  }

  return relevanceMap;
}

// ── Main handler ───────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, country, industry, limit, skip_ai_filter } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Search query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get auth user
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Quota check ──
    const { data: subData } = await supabase
      .from('subscriptions')
      .select('plan_id, plans(search_limit, email_discovery_limit, result_limit, can_use_mailchimp, can_use_ai_extraction, can_use_directory_import)')
      .eq('user_id', user.id)
      .single();

    const plan = (subData?.plans as any) ?? {
      search_limit: 5, email_discovery_limit: 0, result_limit: 10,
      can_use_ai_extraction: false, can_use_directory_import: false,
    };

    const { data: usageData } = await supabase.rpc('get_current_usage', { p_user_id: user.id });

    if (plan.search_limit !== -1 && (usageData?.searches_used ?? 0) >= plan.search_limit) {
      return new Response(
        JSON.stringify({ success: false, error: 'quota_exceeded', message: 'You have reached your monthly search limit.', upgrade_required: true }),
        { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build search query with filters
    let searchQuery = query;
    if (country) searchQuery += ` ${country}`;
    if (industry) searchQuery += ` ${industry}`;

    // Request extra results to compensate for filtering
    const requestedLimit = limit || 25;
    const fetchLimit = Math.min(requestedLimit * 2, 50);

    console.log('Searching:', searchQuery, 'limit:', requestedLimit, 'fetching:', fetchLimit);

    const fcResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: fetchLimit,
        scrapeOptions: { formats: ['markdown'] },
      }),
    });

    const fcData = await fcResponse.json();

    if (!fcResponse.ok) {
      console.error('Firecrawl error:', fcData);
      return new Response(
        JSON.stringify({ success: false, error: fcData.error || 'Search failed' }),
        { status: fcResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawResults = fcData.data || [];

    // ── Layer 1: Domain blocklist filter ────────────────────────────────
    const afterBlocklist = rawResults.filter((r: any) => {
      try {
        const domain = new URL(r.url).hostname.replace('www.', '');
        if (isDomainBlocked(domain)) {
          console.log(`Blocked domain: ${domain}`);
          return false;
        }
      } catch {}
      return true;
    });

    console.log(`Blocklist: ${rawResults.length} → ${afterBlocklist.length} results`);

    // ── Layer 2: AI relevance check ────────────────────────────────────
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    let filteredResults = afterBlocklist;
    let aiFiltered = 0;

    if (lovableApiKey && afterBlocklist.length > 0 && !skip_ai_filter) {
      const candidates = afterBlocklist.map((r: any) => ({
        url: r.url,
        title: r.title || r.metadata?.title || '',
        description: r.description || r.metadata?.description || '',
      }));

      const relevanceMap = await assessRelevance(candidates, query, lovableApiKey);

      filteredResults = afterBlocklist.filter((r: any) => {
        const isRelevant = relevanceMap.get(r.url) ?? true;
        if (!isRelevant) {
          console.log(`AI filtered out: ${r.url}`);
          aiFiltered++;
        }
        return isRelevant;
      });

      console.log(`AI filter: ${afterBlocklist.length} → ${filteredResults.length} results (removed ${aiFiltered})`);
    }

    // Save the search record
    const { data: searchRecord, error: searchError } = await supabase
      .from('searches')
      .insert({
        user_id: user.id,
        search_term: query,
        country: country || null,
        industry: industry || null,
        result_limit: requestedLimit,
        results_count: filteredResults.length,
      })
      .select()
      .single();

    if (searchError) {
      console.error('Error saving search:', searchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save search' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process filtered results and create companies
    const companies = [];

    for (const result of filteredResults) {
      let domain = null;
      try {
        domain = new URL(result.url).hostname.replace('www.', '');
      } catch {}

      const title = result.title || result.metadata?.title || domain || 'Unknown';

      // Skip if already exists (including archived/deleted — never re-add)
      if (domain) {
        const { data: existing } = await supabase
          .from('companies')
          .select('id')
          .eq('user_id', user.id)
          .eq('domain', domain)
          .maybeSingle();

        if (existing) {
          console.log(`Skipping existing company: ${domain}`);
          await supabase
            .from('search_results')
            .insert({ search_id: searchRecord.id, company_id: existing.id });
          continue;
        }
      }

      // Store root domain URL
      let rootUrl = result.url;
      try {
        const parsed = new URL(result.url);
        rootUrl = `${parsed.protocol}//${parsed.host}`;
      } catch {}

      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert({
          user_id: user.id,
          name: title,
          website: rootUrl,
          domain,
          source_search_term: query,
          processing_status: 'Pending',
          status: 'New',
        })
        .select()
        .single();

      if (companyError) {
        if (domain && companyError.code === '23505') {
          console.log(`Skipping duplicate domain on insert: ${domain}`);
        } else {
          console.error('Error creating company:', companyError);
        }
        continue;
      }

      companies.push(newCompany);

      await supabase
        .from('search_results')
        .insert({
          search_id: searchRecord.id,
          company_id: newCompany.id,
        });

      // Stop once we have enough
      if (companies.length >= requestedLimit) break;
    }

    // Update search results count
    await supabase
      .from('searches')
      .update({ results_count: companies.length })
      .eq('id', searchRecord.id);

    const blocklistFiltered = rawResults.length - afterBlocklist.length;
    console.log(`Search complete: ${companies.length} companies (blocked: ${blocklistFiltered}, AI removed: ${aiFiltered}, from ${rawResults.length} raw)`);

    return new Response(
      JSON.stringify({
        success: true,
        search_id: searchRecord.id,
        companies,
        total: companies.length,
        filtered: { blocklist: blocklistFiltered, ai: aiFiltered, raw: rawResults.length },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
