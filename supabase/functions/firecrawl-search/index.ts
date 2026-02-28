import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { query, country, industry, limit } = await req.json();

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

    // Verify user from JWT
    const token = authHeader?.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    console.log('Searching:', searchQuery, 'limit:', limit);

    // Call Firecrawl Search API
    const fcResponse = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: limit || 25,
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

    // Save the search record
    const { data: searchRecord, error: searchError } = await supabase
      .from('searches')
      .insert({
        user_id: user.id,
        search_term: query,
        country: country || null,
        industry: industry || null,
        result_limit: limit || 25,
        results_count: fcData.data?.length || 0,
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

    // Process results and create companies
    const companies = [];
    const results = fcData.data || [];

    for (const result of results) {
      let domain = null;
      try {
        domain = new URL(result.url).hostname.replace('www.', '');
      } catch {}

      const title = result.title || result.metadata?.title || domain || 'Unknown';

      // Upsert company by domain - skip if already exists
      let companyId: string | null = null;
      if (domain) {
        const { data: existing } = await supabase
          .from('companies')
          .select('id')
          .eq('user_id', user.id)
          .eq('domain', domain)
          .maybeSingle();

        if (existing) {
          companyId = existing.id;
          // Fetch full data for response
          const { data: existingCompany } = await supabase
            .from('companies')
            .select('*')
            .eq('id', companyId)
            .single();
          if (existingCompany) companies.push(existingCompany);
        }
      }

      if (!companyId) {
        // Store root domain URL, not deep page URLs
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
          // Could be a unique constraint violation on domain
          if (domain && companyError.code === '23505') {
            const { data: existing } = await supabase
              .from('companies')
              .select('*')
              .eq('user_id', user.id)
              .eq('domain', domain)
              .single();
            if (existing) {
              companyId = existing.id;
              companies.push(existing);
            }
          } else {
            console.error('Error creating company:', companyError);
          }
          if (!companyId) continue;
        } else {
          companyId = newCompany.id;
          companies.push(newCompany);
        }
      }

      // Link search to company
      await supabase
        .from('search_results')
        .insert({
          search_id: searchRecord.id,
          company_id: companyId,
        });
    }

    // Update search results count
    await supabase
      .from('searches')
      .update({ results_count: companies.length })
      .eq('id', searchRecord.id);

    console.log(`Search complete: ${companies.length} companies found`);

    return new Response(
      JSON.stringify({
        success: true,
        search_id: searchRecord.id,
        companies,
        total: companies.length,
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
