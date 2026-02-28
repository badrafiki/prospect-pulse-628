import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EMAIL_PAGES = ['/contact', '/about', '/team', '/legal', '/privacy', '/impressum', '/pages/contact', '/pages/about', '/contact-us', '/about-us', '/contactus', '/contactus.html', '/pages/contact-us'];
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MAILTO_REGEX = /mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const JUNK_EMAIL_PATTERNS = [
  /^frame-/i,           // frame-xxx@mhtml.blink
  /@mhtml\.blink$/i,
  /@sentry/i,
  /@example\./i,
  /@test\./i,
  /\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i,  // file extensions mistaken as TLDs
  /^[a-f0-9]{20,}@/i,  // long hex hashes
  /noreply@/i,
  /no-reply@/i,
];
const MAX_PAGES_TO_SCRAPE = 10;
const CONCURRENT_SCRAPES = 3;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_id, fast_mode = false } = await req.json();

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
    if (!lovableKey && !fast_mode) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Mode: ${fast_mode ? 'FAST (regex only)' : 'FULL (regex + AI)'}`);

    // Build URLs to crawl
    let baseUrl = company.website.replace(/\/+$/, '');
    if (!baseUrl.startsWith('http')) baseUrl = `https://${baseUrl}`;

    // Step 1: Use Firecrawl Map API to discover contact-related pages
    let discoveredUrls: string[] = [];
    try {
      console.log(`Mapping ${baseUrl} to discover contact pages...`);
      const mapResp = await fetch('https://api.firecrawl.dev/v1/map', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: baseUrl,
          search: 'contact about team email',
          limit: 50,
          includeSubdomains: false,
        }),
      });
      const mapData = await mapResp.json();
      if (mapResp.ok && mapData.success && Array.isArray(mapData.links)) {
        const contactPatterns = /contact|about|team|people|staff|legal|privacy|impressum|email|support/i;
        discoveredUrls = mapData.links.filter((u: string) => contactPatterns.test(u));
        console.log(`Map discovered ${discoveredUrls.length} relevant pages from ${mapData.links.length} total`);
      }
    } catch (e) {
      console.log('Map API failed, falling back to hardcoded paths:', e);
    }

    // Step 2: Merge hardcoded paths with discovered URLs, deduplicate and prioritize contact-like URLs before cap
    const hardcodedUrls = EMAIL_PAGES.map(p => `${baseUrl}${p}`);
    const allUrls = new Set([baseUrl, ...hardcodedUrls, ...discoveredUrls]);

    const prioritizeUrl = (url: string) => {
      if (/contactus\.html/i.test(url)) return 0;
      if (/contact|email|support/i.test(url)) return 1;
      if (/about|team|staff|people/i.test(url)) return 2;
      return 3;
    };

    const urlsToScrape = Array.from(allUrls)
      .sort((a, b) => prioritizeUrl(a) - prioritizeUrl(b) || a.length - b.length)
      .slice(0, MAX_PAGES_TO_SCRAPE);

    console.log(`Scraping ${urlsToScrape.length} pages (capped at ${MAX_PAGES_TO_SCRAPE}) for ${company.name}`);
    console.log(`Selected URLs: ${urlsToScrape.join(', ')}`);

    // Scrape pages in parallel batches for speed
    let allContent = '';
    const scrapedPages: string[] = [];
    const regexExtractedEmails: Array<{ email_address: string; context: string; source_url: string }> = [];

    const scrapePage = async (pageUrl: string) => {
      try {
        const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: pageUrl,
            formats: ['markdown', 'html'],
            onlyMainContent: false,
          }),
        });
        const data = await resp.json();
        if (resp.ok && data.success) {
          const md = data.data?.markdown || data.markdown || '';
          const html = data.data?.html || data.html || '';
          const extractableText = `${md}\n${html}`;
          if (extractableText.length > 0) {
            // Priority 1: Extract from mailto: links (most reliable)
            const mailtoEmails: string[] = [];
            let match;
            const mailtoRe = new RegExp(MAILTO_REGEX.source, 'gi');
            while ((match = mailtoRe.exec(html)) !== null) {
              mailtoEmails.push(match[1].toLowerCase());
            }
            // Priority 2: General regex on full text
            const regexEmails = (extractableText.match(EMAIL_REGEX) ?? []).map(e => e.toLowerCase());
            // Merge, dedupe, filter junk
            const allFound = Array.from(new Set([...mailtoEmails, ...regexEmails]))
              .filter(e => !JUNK_EMAIL_PATTERNS.some(p => p.test(e)));
            console.log(`Page ${pageUrl}: found ${mailtoEmails.length} mailto + ${regexEmails.length} regex → ${allFound.length} clean`);
            return { url: pageUrl, content: md.slice(0, 4000), foundEmails: allFound };
          }
        }
      } catch (e) {
        console.log(`Failed to scrape ${pageUrl}:`, e);
      }
      return null;
    };

    // Process in batches of CONCURRENT_SCRAPES
    for (let i = 0; i < urlsToScrape.length; i += CONCURRENT_SCRAPES) {
      const batch = urlsToScrape.slice(i, i + CONCURRENT_SCRAPES);
      const results = await Promise.all(batch.map(scrapePage));
      for (const r of results) {
        if (r) {
          allContent += `\n\n--- PAGE: ${r.url} ---\n${r.content}`;
          scrapedPages.push(r.url);
          for (const email of r.foundEmails) {
            regexExtractedEmails.push({
              email_address: email,
              context: 'General',
              source_url: r.url,
            });
          }
        }
      }
    }

    if (allContent.length === 0) {
      return new Response(
        JSON.stringify({ success: true, emails_found: 0, message: 'No content could be scraped' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let aiEmails: Array<{ email_address: string; context: string; source_url: string }> = [];

    if (!fast_mode) {
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
        // Fall through to regex-only results on any AI failure (402, 429, etc.)
        console.log(`AI extraction failed (${aiResponse.status}), using regex results only`);
      } else {
        try {
          const content = aiData.choices[0].message.content;
          const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) aiEmails = parsed;
        } catch {
          console.error('Failed to parse AI email response:', aiData.choices?.[0]?.message?.content);
        }
      }
    } else {
      console.log(`Fast mode: skipping AI, using ${regexExtractedEmails.length} regex-extracted emails`);
    }

    const mergedEmails = [...aiEmails, ...regexExtractedEmails];

    if (mergedEmails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, emails_found: 0, message: 'No emails found on website' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format and deduplicate
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const seen = new Set<string>();
    const validEmails = mergedEmails.filter(e => {
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
