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
    const { company_id } = await req.json();

    if (!company_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'company_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', company_id)
      .eq('user_id', user.id)
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({ success: false, error: 'Company not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!firecrawlKey || !lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 1: Find LinkedIn company page if not already set
    let linkedinUrl = company.linkedin_url;
    if (!linkedinUrl && company.domain) {
      console.log(`Searching LinkedIn for ${company.name}...`);
      try {
        const searchResp = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `site:linkedin.com/company "${company.name}" OR "${company.domain}"`,
            limit: 3,
          }),
        });
        const searchData = await searchResp.json();
        if (searchResp.ok && searchData.success && searchData.data?.length > 0) {
          const match = searchData.data.find((r: any) =>
            r.url?.includes('linkedin.com/company/')
          );
          if (match) {
            linkedinUrl = match.url.split('?')[0];
            await supabase.from('companies').update({ linkedin_url: linkedinUrl }).eq('id', company_id);
            console.log(`Found LinkedIn: ${linkedinUrl}`);
          }
        }
      } catch (e) {
        console.log('LinkedIn search failed:', e);
      }
    }

    // Step 2: Scrape company pages for people info
    let baseUrl = (company.website || '').replace(/\/+$/, '');
    if (baseUrl && !baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;

    const peoplePaths = ['/about', '/team', '/leadership', '/about-us', '/our-team', '/management'];
    const urlsToScrape = baseUrl ? [baseUrl, ...peoplePaths.map(p => `${baseUrl}${p}`)] : [];

    let allContent = '';
    const scrapedPages: string[] = [];

    for (const pageUrl of urlsToScrape) {
      try {
        const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: pageUrl, formats: ['markdown'], onlyMainContent: true }),
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          const md = data.data?.markdown || data.markdown || '';
          if (md.length > 0) {
            allContent += `\n\n--- PAGE: ${pageUrl} ---\n${md.slice(0, 4000)}`;
            scrapedPages.push(pageUrl);
          }
        }
      } catch (e) {
        console.log(`Failed to scrape ${pageUrl}:`, e);
      }
      await new Promise(r => setTimeout(r, 300));
    }

    // Step 3: Also search for key people via Firecrawl search
    if (company.name) {
      try {
        const peopleSearch = await fetch('https://api.firecrawl.dev/v1/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: `"${company.name}" CEO OR founder OR "managing director" OR "sales director" OR "business development" site:linkedin.com/in/`,
            limit: 5,
          }),
        });
        const psData = await peopleSearch.json();
        if (peopleSearch.ok && psData.success && psData.data?.length > 0) {
          allContent += '\n\n--- LINKEDIN PEOPLE SEARCH RESULTS ---\n';
          for (const r of psData.data) {
            allContent += `Title: ${r.title || ''}\nURL: ${r.url || ''}\nDescription: ${r.description || ''}\n\n`;
          }
        }
      } catch (e) {
        console.log('People search failed:', e);
      }
    }

    if (allContent.length === 0) {
      return new Response(
        JSON.stringify({ success: true, people_found: 0, message: 'No content to extract people from' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const truncated = allContent.slice(0, 15000);
    console.log(`Extracting people from ${scrapedPages.length} pages for ${company.name}...`);

    // Step 4: AI extraction
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          {
            role: 'system',
            content: `You are a B2B people extraction specialist. Extract key people from website and LinkedIn search results.
Focus on these roles: CEO, Founder, Managing Director, VP/Director of Sales, Business Development, Marketing.
For each person found, return:
- full_name: their full name
- title: their job title
- linkedin_url: their LinkedIn profile URL if available, otherwise null
- confidence_score: 0-1 how confident you are this person works at this company

Return ONLY valid JSON array. Example: [{"full_name":"John Smith","title":"CEO","linkedin_url":"https://linkedin.com/in/johnsmith","confidence_score":0.9}]
If no people found, return empty array: []
Do NOT invent people. Only extract those clearly mentioned in the content.`,
          },
          {
            role: 'user',
            content: `Extract key people from this company (${company.name}, ${company.domain || ''}):\n\n${truncated}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error('AI error:', aiData);
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limited, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: 'AI extraction failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let people: Array<{ full_name: string; title: string; linkedin_url: string | null; confidence_score: number }> = [];
    try {
      const content = aiData.choices[0].message.content;
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      people = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse AI people response:', aiData.choices?.[0]?.message?.content);
      return new Response(
        JSON.stringify({ success: true, people_found: 0, message: 'Could not parse extraction results' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!Array.isArray(people) || people.length === 0) {
      return new Response(
        JSON.stringify({ success: true, people_found: 0, message: 'No people found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Deduplicate by name
    const seen = new Set<string>();
    const uniquePeople = people.filter(p => {
      if (!p.full_name) return false;
      const key = p.full_name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Check for existing people to avoid duplicates
    const { data: existing } = await supabase
      .from('people')
      .select('full_name')
      .eq('company_id', company_id);

    const existingNames = new Set((existing ?? []).map(p => p.full_name.toLowerCase().trim()));
    const newPeople = uniquePeople.filter(p => !existingNames.has(p.full_name.toLowerCase().trim()));

    if (newPeople.length > 0) {
      const rows = newPeople.map(p => ({
        user_id: user.id,
        company_id,
        full_name: p.full_name.trim(),
        title: p.title || null,
        linkedin_url: p.linkedin_url || null,
        confidence_score: p.confidence_score || null,
        source_url: linkedinUrl || company.website || null,
      }));

      const { error: insertError } = await supabase.from('people').insert(rows);
      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save people' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Found ${newPeople.length} new people for ${company.name}`);

    return new Response(
      JSON.stringify({
        success: true,
        people_found: newPeople.length,
        linkedin_url: linkedinUrl || null,
        pages_scraped: scrapedPages.length,
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
