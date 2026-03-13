import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const JUNK_EMAIL_PATTERNS = [
  /^frame-/i, /@mhtml\.blink$/i, /@sentry/i, /@example\./i, /@test\./i,
  /\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i, /^[a-f0-9]{20,}@/i,
  /noreply@/i, /no-reply@/i, /^webmaster@/i, /^postmaster@/i, /^hostmaster@/i,
  /^abuse@/i, /^admin@/i, /^root@/i, /^mailer-daemon@/i,
  /^investor/i, /^ir@/i, /^recruit/i, /^careers@/i, /^jobs@/i, /^hiring@/i,
  /^talent@/i, /^hr@/i, /^humanresources@/i, /^human\.resources@/i,
  /^licensing@/i, /^license@/i, /^corporate@/i, /^legal@/i, /^compliance@/i,
  /^privacy@/i, /^dmca@/i, /^copyright@/i, /^media@/i, /^press@/i,
  /^pr@/i, /^editor@/i, /^newsroom@/i, /^donations@/i, /^donate@/i,
  /^foundation@/i, /^spam@/i, /^security@/i,
];

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

const extractDomain = (url: string): string | null => {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, max_pages = 100, include_path = '', user_id } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Auth
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

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    if (!lovableKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const cappedPages = Math.min(Math.max(max_pages, 10), 500);

    console.log(`Starting directory crawl: ${formattedUrl}, max_pages: ${cappedPages}, include_path: ${include_path}`);

    // Step 1: Use Firecrawl crawl API to crawl the directory
    const crawlBody: any = {
      url: formattedUrl,
      limit: cappedPages,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    };

    if (include_path) {
      crawlBody.includePaths = [include_path];
    }

    // Exclude common non-content pages
    crawlBody.excludePaths = ['/privacy', '/terms', '/login', '/signup', '/cart', '/checkout', '/pricing', '/blog'];

    const crawlResp = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(crawlBody),
    });

    const crawlData = await crawlResp.json();

    if (!crawlResp.ok || !crawlData.success) {
      console.error('Crawl start failed:', crawlData);
      return new Response(
        JSON.stringify({ success: false, error: crawlData.error || 'Failed to start crawl' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const crawlId = crawlData.id;
    console.log(`Crawl started with ID: ${crawlId}`);

    // Step 2: Poll for crawl completion
    let crawlResult: any = null;
    const maxPollTime = 5 * 60 * 1000; // 5 minutes max
    const pollInterval = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollTime) {
      await new Promise(r => setTimeout(r, pollInterval));

      const statusResp = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlId}`, {
        headers: { 'Authorization': `Bearer ${firecrawlKey}` },
      });
      const statusData = await statusResp.json();

      console.log(`Crawl status: ${statusData.status}, completed: ${statusData.completed}/${statusData.total}`);

      if (statusData.status === 'completed') {
        crawlResult = statusData;
        break;
      } else if (statusData.status === 'failed' || statusData.status === 'cancelled') {
        return new Response(
          JSON.stringify({ success: false, error: `Crawl ${statusData.status}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    if (!crawlResult) {
      return new Response(
        JSON.stringify({ success: false, error: 'Crawl timed out after 5 minutes' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const pages = crawlResult.data || [];
    console.log(`Crawl complete. ${pages.length} pages returned.`);

    if (pages.length === 0) {
      return new Response(
        JSON.stringify({ success: true, companies_imported: 0, emails_found: 0, pages_crawled: 0, message: 'No pages found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Process pages in batches through AI to extract structured data
    const BATCH_SIZE = 5;
    const allExtracted: any[] = [];

    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batch = pages.slice(i, i + BATCH_SIZE);
      const batchContent = batch.map((p: any, idx: number) => {
        const md = p.markdown || '';
        const sourceUrl = p.metadata?.sourceURL || '';
        return `--- PAGE ${i + idx + 1}: ${sourceUrl} ---\n${md.slice(0, 3000)}`;
      }).join('\n\n');

      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${lovableKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: `You extract structured company/business data from directory listing pages.
For each distinct company/business found on these pages, extract:
- name: company name (required)
- city: city (if available)
- state: state abbreviation (if available)
- country: country (default "US" if not specified)
- phone: phone number (if available)
- email: primary email address (if available)
- website: company website URL (if available, NOT the directory page URL)
- capabilities: array of services/capabilities (if available)

Return ONLY a valid JSON array. Example:
[{"name":"Acme Machine Shop","city":"Dallas","state":"TX","country":"US","phone":"555-123-4567","email":"info@acme.com","website":"https://acme.com","capabilities":["CNC Milling","Turning"]}]

If a page is NOT a company detail page (e.g. it's a listing/index page, privacy policy, etc.), skip it entirely.
If no companies found, return empty array: []
Do NOT invent data. Only extract what's on the page.`,
              },
              {
                role: 'user',
                content: `Extract company data from these directory pages:\n\n${batchContent}`,
              },
            ],
            temperature: 0.1,
          }),
        });

        if (!aiResponse.ok) {
          console.error(`AI batch ${i / BATCH_SIZE + 1} failed with status ${aiResponse.status}`);
          continue;
        }

        const aiData = await aiResponse.json();
        let content = aiData.choices?.[0]?.message?.content || '';
        
        // Clean markdown code blocks
        content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        try {
          const extracted = JSON.parse(content);
          if (Array.isArray(extracted)) {
            allExtracted.push(...extracted);
            console.log(`Batch ${i / BATCH_SIZE + 1}: extracted ${extracted.length} companies`);
          }
        } catch (parseErr) {
          console.error(`Failed to parse AI response for batch ${i / BATCH_SIZE + 1}:`, content.slice(0, 200));
        }
      } catch (err) {
        console.error(`AI batch ${i / BATCH_SIZE + 1} error:`, err);
      }
    }

    console.log(`Total extracted: ${allExtracted.length} companies`);

    // Step 4: Import companies and emails into database
    let companiesImported = 0;
    let emailsFound = 0;
    let duplicatesSkipped = 0;

    // Get existing domains for this user to avoid duplicates
    const { data: existingCompanies } = await supabase
      .from('companies')
      .select('domain')
      .eq('user_id', user.id)
      .not('domain', 'is', null);

    const existingDomains = new Set(
      (existingCompanies || []).map((c: any) => c.domain?.toLowerCase()).filter(Boolean)
    );

    for (const company of allExtracted) {
      if (!company.name) continue;

      const domain = company.website ? extractDomain(company.website) : null;

      // Skip duplicates by domain
      if (domain && existingDomains.has(domain.toLowerCase())) {
        duplicatesSkipped++;
        continue;
      }

      // Build location string
      const locations: string[] = [];
      if (company.city && company.state) {
        locations.push(`${company.city}, ${company.state}`);
      } else if (company.city) {
        locations.push(company.city);
      } else if (company.state) {
        locations.push(company.state);
      }

      // Insert company
      const { data: newCompany, error: insertError } = await supabase
        .from('companies')
        .insert({
          name: company.name,
          user_id: user.id,
          website: company.website || null,
          domain: domain,
          locations: locations.length > 0 ? locations : null,
          industries: company.capabilities || null,
          processing_status: 'Completed',
          status: 'New',
          source_search_term: `Directory import: ${formattedUrl}`,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error(`Failed to insert company ${company.name}:`, insertError.message);
        continue;
      }

      companiesImported++;
      if (domain) existingDomains.add(domain.toLowerCase());

      // Insert email if found
      if (company.email) {
        const email = company.email.toLowerCase();
        const isJunk = JUNK_EMAIL_PATTERNS.some(p => p.test(email));

        if (!isJunk) {
          const { error: emailError } = await supabase
            .from('emails')
            .insert({
              email_address: email,
              company_id: newCompany.id,
              user_id: user.id,
              context: 'General',
              source_url: company.website || formattedUrl,
            });

          if (!emailError) {
            emailsFound++;
          }
        }
      }

      // Also extract any emails from raw page content via regex (from pages that mentioned this company)
      // Already handled by AI extraction above
    }

    console.log(`Import complete: ${companiesImported} companies, ${emailsFound} emails, ${duplicatesSkipped} duplicates skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        pages_crawled: pages.length,
        companies_extracted: allExtracted.length,
        companies_imported: companiesImported,
        emails_found: emailsFound,
        duplicates_skipped: duplicatesSkipped,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Directory scrape error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
