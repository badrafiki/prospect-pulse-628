import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
const URL_REGEX = /https?:\/\/[^\s"'<>)\]]+/gi;

const JUNK_EMAIL_PATTERNS = [
  /^frame-/i, /@mhtml\.blink$/i, /@sentry/i, /@example\./i, /@test\./i,
  /\.(png|jpg|jpeg|gif|svg|webp|css|js)$/i, /^[a-f0-9]{20,}@/i,
  /noreply@/i, /no-reply@/i, /^webmaster@/i, /^postmaster@/i, /^hostmaster@/i,
  /^abuse@/i, /^admin@/i, /^root@/i, /^mailer-daemon@/i,
  /^spam@/i, /^security@/i,
];

const DIRECTORY_DOMAINS = new Set([
  'machinist.com', 'thomasnet.com', 'mfg.com', 'yelp.com', 'yellowpages.com',
  'bbb.org', 'google.com', 'facebook.com', 'twitter.com', 'linkedin.com',
  'instagram.com', 'youtube.com', 'tiktok.com', 'pinterest.com',
]);

const extractDomain = (url: string): string | null => {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

const isCompanyWebsite = (url: string, directoryDomain: string): boolean => {
  const domain = extractDomain(url);
  if (!domain) return false;
  if (DIRECTORY_DOMAINS.has(domain)) return false;
  if (domain === directoryDomain || domain.endsWith(`.${directoryDomain}`)) return false;
  return true;
};

const cleanEmail = (email: string): string | null => {
  const lower = email.toLowerCase().trim();
  if (JUNK_EMAIL_PATTERNS.some(p => p.test(lower))) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return null;
  return lower;
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

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const directoryDomain = extractDomain(formattedUrl) || '';
    const cappedPages = Math.min(Math.max(max_pages, 10), 500);

    console.log(`Starting directory crawl: ${formattedUrl}, max_pages: ${cappedPages}, include_path: ${include_path}`);

    // Step 1: Crawl directory — get BOTH markdown AND html to capture all contact info
    const crawlBody: any = {
      url: formattedUrl,
      limit: cappedPages,
      scrapeOptions: {
        formats: ['markdown', 'html'],
        onlyMainContent: false, // Need full page to get sidebar/footer contact info
        waitFor: 2000,
      },
    };

    if (include_path) {
      crawlBody.includePaths = [include_path];
    }
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
    const maxPollTime = 5 * 60 * 1000;
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

    // Step 3: For each page, do regex extraction first, then send to AI for structured parsing
    // This gives us a hybrid approach — regex catches emails/phones/URLs the AI might miss
    const BATCH_SIZE = 5;
    const allExtracted: any[] = [];

    for (let i = 0; i < pages.length; i += BATCH_SIZE) {
      const batch = pages.slice(i, i + BATCH_SIZE);

      // Pre-extract contact data via regex from both markdown and HTML
      const regexData = batch.map((p: any) => {
        const md = p.markdown || '';
        const html = p.html || '';
        const fullText = `${md}\n${html}`;
        const sourceUrl = p.metadata?.sourceURL || '';

        const emails = Array.from(new Set(
          (fullText.match(EMAIL_REGEX) || [])
            .map((e: string) => cleanEmail(e))
            .filter(Boolean) as string[]
        ));

        const phones = Array.from(new Set(fullText.match(PHONE_REGEX) || []));

        const urls = Array.from(new Set(
          (fullText.match(URL_REGEX) || [])
            .filter((u: string) => isCompanyWebsite(u, directoryDomain))
        ));

        return { sourceUrl, emails, phones, websites: urls };
      });

      // Build AI prompt with richer content (include HTML for structured data)
      const batchContent = batch.map((p: any, idx: number) => {
        const md = p.markdown || '';
        const sourceUrl = p.metadata?.sourceURL || '';
        const rd = regexData[idx];
        const hints = [];
        if (rd.emails.length) hints.push(`Emails found on page: ${rd.emails.join(', ')}`);
        if (rd.phones.length) hints.push(`Phones found on page: ${rd.phones.join(', ')}`);
        if (rd.websites.length) hints.push(`Possible company websites: ${rd.websites.slice(0, 5).join(', ')}`);
        const hintsBlock = hints.length ? `\n[EXTRACTED HINTS: ${hints.join(' | ')}]` : '';
        return `--- PAGE ${i + idx + 1}: ${sourceUrl} ---${hintsBlock}\n${md.slice(0, 4000)}`;
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
Each page may contain one or MULTIPLE company listings. Extract ALL of them.

For each distinct company/business found, extract ALL available fields:
- name: company name (REQUIRED)
- city: city
- state: state abbreviation (e.g. "TX", "CA")
- country: country (default "US")
- phone: phone number — use the EXTRACTED HINTS if provided
- email: email address — use the EXTRACTED HINTS if provided, pick the most relevant business email
- website: the company's OWN website URL (NOT the directory page URL) — use the EXTRACTED HINTS if provided
- capabilities: array of services/capabilities/specialties
- address: full street address if available

IMPORTANT:
- Many directory pages list MULTIPLE companies per page. Extract ALL of them.
- The EXTRACTED HINTS contain regex-detected emails, phones, and websites from the page. Use these to fill in contact fields.
- The website should be the company's own domain, NOT the directory URL.
- Do NOT skip companies just because some fields are missing — extract what's available.

Return ONLY a valid JSON array. Example:
[{"name":"Acme Machine Shop","city":"Dallas","state":"TX","country":"US","phone":"(555) 123-4567","email":"info@acme.com","website":"https://acme.com","capabilities":["CNC Milling","Turning"],"address":"123 Main St"}]

If a page contains no company listings (e.g. privacy policy, homepage nav), return empty array: []`,
              },
              {
                role: 'user',
                content: `Extract ALL companies from these directory pages:\n\n${batchContent}`,
              },
            ],
            temperature: 0.1,
          }),
        });

        if (!aiResponse.ok) {
          console.error(`AI batch ${i / BATCH_SIZE + 1} failed: ${aiResponse.status}`);
          // Fallback: create basic entries from regex data alone
          for (const rd of regexData) {
            if (rd.emails.length > 0 || rd.websites.length > 0) {
              allExtracted.push({
                name: `Unknown (${rd.sourceUrl.split('/').pop()})`,
                email: rd.emails[0] || null,
                phone: rd.phones[0] || null,
                website: rd.websites[0] || null,
                _fallback: true,
              });
            }
          }
          continue;
        }

        const aiData = await aiResponse.json();
        let content = aiData.choices?.[0]?.message?.content || '';
        content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

        try {
          const extracted = JSON.parse(content);
          if (Array.isArray(extracted)) {
            // Enrich AI results with regex data — fill in missing emails/phones/websites
            const enriched = extracted.map((company: any, idx: number) => {
              // Try to match company to a page's regex data by checking if any regex email/website appears related
              if (!company.email) {
                // Find first unused regex email from any page in this batch
                for (const rd of regexData) {
                  if (rd.emails.length > 0) {
                    company.email = rd.emails[0];
                    break;
                  }
                }
              }
              if (!company.phone) {
                for (const rd of regexData) {
                  if (rd.phones.length > 0) {
                    company.phone = rd.phones[0];
                    break;
                  }
                }
              }
              if (!company.website) {
                for (const rd of regexData) {
                  if (rd.websites.length > 0) {
                    company.website = rd.websites[0];
                    break;
                  }
                }
              }
              return company;
            });
            allExtracted.push(...enriched);
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
    let phonesFound = 0;

    const { data: existingCompanies } = await supabase
      .from('companies')
      .select('domain, name')
      .eq('user_id', user.id);

    const existingDomains = new Set(
      (existingCompanies || []).map((c: any) => c.domain?.toLowerCase()).filter(Boolean)
    );
    const existingNames = new Set(
      (existingCompanies || []).map((c: any) => c.name?.toLowerCase()).filter(Boolean)
    );

    for (const company of allExtracted) {
      if (!company.name || company._fallback) continue;

      const domain = company.website ? extractDomain(company.website) : null;

      // Skip duplicates by domain OR name
      if (domain && existingDomains.has(domain.toLowerCase())) {
        duplicatesSkipped++;
        continue;
      }
      if (existingNames.has(company.name.toLowerCase())) {
        duplicatesSkipped++;
        continue;
      }

      const locations: string[] = [];
      if (company.address) {
        locations.push(company.address);
      } else if (company.city && company.state) {
        locations.push(`${company.city}, ${company.state}`);
      } else if (company.city) {
        locations.push(company.city);
      } else if (company.state) {
        locations.push(company.state);
      }

      // Build notes with phone number
      const notes = company.phone ? `Phone: ${company.phone}` : null;
      if (company.phone) phonesFound++;

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
          notes: notes,
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
      existingNames.add(company.name.toLowerCase());

      // Insert email if found
      if (company.email) {
        const email = cleanEmail(company.email);
        if (email) {
          const { error: emailError } = await supabase
            .from('emails')
            .insert({
              email_address: email,
              company_id: newCompany.id,
              user_id: user.id,
              context: 'General',
              source_url: formattedUrl,
              validated: true,
            });
          if (!emailError) emailsFound++;
        }
      }
    }

    console.log(`Import complete: ${companiesImported} companies, ${emailsFound} emails, ${phonesFound} phones, ${duplicatesSkipped} duplicates skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        pages_crawled: pages.length,
        companies_extracted: allExtracted.length,
        companies_imported: companiesImported,
        emails_found: emailsFound,
        phones_found: phonesFound,
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
