import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EMAIL_PAGES = ['/contact', '/about', '/team', '/legal', '/privacy', '/impressum'];

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

    // Get company
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

    if (!company.website) {
      return new Response(
        JSON.stringify({ success: false, error: 'Company has no website' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    // Build URLs to crawl
    let baseUrl = company.website.replace(/\/+$/, '');
    if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;

    const urlsToScrape = [baseUrl, ...EMAIL_PAGES.map(p => `${baseUrl}${p}`)];
    console.log(`Scraping ${urlsToScrape.length} pages for ${company.name}`);

    // Scrape all pages, collecting content
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
          body: JSON.stringify({
            url: pageUrl,
            formats: ['markdown'],
            onlyMainContent: true,
          }),
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
      // Small delay between requests
      await new Promise(r => setTimeout(r, 300));
    }

    if (allContent.length === 0) {
      return new Response(
        JSON.stringify({ success: true, emails_found: 0, message: 'No content could be scraped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Truncate to fit context window
    const truncated = allContent.slice(0, 15000);

    console.log(`Extracting emails from ${scrapedPages.length} pages using AI...`);

    // Use AI to extract emails
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
            content: `You are an email extraction specialist. Extract all email addresses from the provided website content.
For each email found, determine:
- email_address: the email address
- context: one of "Sales", "Support", "Careers", "General", "Legal", "Management"
- source_url: which page URL it was found on (from the PAGE markers)

Return ONLY valid JSON array. Example: [{"email_address":"info@example.com","context":"General","source_url":"https://example.com/contact"}]
If no emails found, return empty array: []
Do NOT invent or guess emails. Only extract emails that appear in the text.`,
          },
          {
            role: 'user',
            content: `Extract all email addresses from this company's website content (${company.name}):\n\n${truncated}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error('AI error:', aiData);
      if (aiResponse.status === 429) {
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

    let emails: Array<{ email_address: string; context: string; source_url: string }> = [];
    try {
      const content = aiData.choices[0].message.content;
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      emails = JSON.parse(cleaned);
    } catch {
      console.error('Failed to parse AI email response:', aiData.choices?.[0]?.message?.content);
      return new Response(
        JSON.stringify({ success: true, emails_found: 0, message: 'Could not parse extraction results' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!Array.isArray(emails) || emails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, emails_found: 0, message: 'No emails found on website' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format and deduplicate
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seen = new Set<string>();
    const validEmails = emails.filter(e => {
      if (!e.email_address || !emailRegex.test(e.email_address)) return false;
      const lower = e.email_address.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    // Check for existing emails to avoid duplicates
    const { data: existing } = await supabase
      .from('emails')
      .select('email_address')
      .eq('company_id', company_id);

    const existingSet = new Set((existing ?? []).map(e => e.email_address.toLowerCase()));
    const newEmails = validEmails.filter(e => !existingSet.has(e.email_address.toLowerCase()));

    if (newEmails.length > 0) {
      const rows = newEmails.map(e => ({
        user_id: user.id,
        company_id,
        email_address: e.email_address.toLowerCase(),
        context: e.context || 'General',
        source_url: e.source_url || null,
        validated: true,
      }));

      const { error: insertError } = await supabase.from('emails').insert(rows);
      if (insertError) {
        console.error('Insert error:', insertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save emails' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log(`Found ${newEmails.length} new emails for ${company.name}`);

    return new Response(
      JSON.stringify({
        success: true,
        emails_found: newEmails.length,
        total_on_file: existingSet.size + newEmails.length,
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
