import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MAILTO_REGEX = /mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const PHONE_REGEX = /(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;

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

const cleanEmail = (email: string): string | null => {
  const lower = email.toLowerCase().trim();
  if (JUNK_EMAIL_PATTERNS.some(p => p.test(lower))) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) return null;
  return lower;
};

const isCompanyWebsite = (url: string, directoryDomain: string): boolean => {
  const domain = extractDomain(url);
  if (!domain) return false;
  if (DIRECTORY_DOMAINS.has(domain)) return false;
  if (domain === directoryDomain || domain.endsWith(`.${directoryDomain}`)) return false;
  // Skip common non-company URLs
  if (/\.(gov|edu|mil)$/i.test(domain)) return false;
  return true;
};

/**
 * Parse a single page's markdown + HTML to extract one or more company listings.
 * This is purely regex/text-based — no AI needed since directories have structured data.
 */
const extractCompaniesFromPage = (
  markdown: string,
  html: string,
  sourceUrl: string,
  directoryDomain: string
): any[] => {
  const fullText = `${markdown}\n${html}`;

  // Extract all emails (mailto first, then regex)
  const mailtoEmails: string[] = [];
  let m;
  const mailtoRe = new RegExp(MAILTO_REGEX.source, 'gi');
  while ((m = mailtoRe.exec(html)) !== null) {
    const clean = cleanEmail(m[1]);
    if (clean) mailtoEmails.push(clean);
  }
  const regexEmails = (fullText.match(EMAIL_REGEX) || [])
    .map(e => cleanEmail(e))
    .filter(Boolean) as string[];
  const allEmails = Array.from(new Set([...mailtoEmails, ...regexEmails]));

  // Extract phones
  const phones = Array.from(new Set(fullText.match(PHONE_REGEX) || []));

  // Extract external website URLs (company's own site, not the directory)
  const urlMatches = fullText.match(/https?:\/\/[^\s"'<>)\]]+/gi) || [];
  const companyWebsites = Array.from(new Set(
    urlMatches.filter(u => isCompanyWebsite(u, directoryDomain))
  ));

  // Try to extract company name from the page
  // Strategy 1: Look for h1/h2 in markdown (usually "# Company Name")
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  const h2Match = markdown.match(/^##\s+(.+)$/m);

  // Strategy 2: Look for <h1> in HTML
  const htmlH1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);

  // Strategy 3: Use the page title from the URL slug
  const urlSlug = sourceUrl.split('/').pop()?.replace(/-/g, ' ').replace(/\.\w+$/, '') || '';

  let companyName = h1Match?.[1]?.trim() || htmlH1Match?.[1]?.trim() || h2Match?.[1]?.trim() || '';

  // Clean up name — remove "| Directory Name" suffixes
  companyName = companyName.replace(/\s*[|–—-]\s*(machinist|directory|shop finder).*$/i, '').trim();

  if (!companyName && urlSlug.length > 3) {
    // Title-case the slug
    companyName = urlSlug.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  if (!companyName) return [];

  // Extract location — look for common patterns like "City, ST" or "City, State"
  const locationPatterns = [
    /(?:Location|Address|Located)[:\s]*([^,\n]+,\s*[A-Z]{2}(?:\s+\d{5})?)/i,
    /(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2}\b)(?:\s+\d{5})?/,
  ];
  let city = '', state = '', address = '';
  for (const pat of locationPatterns) {
    const locMatch = markdown.match(pat) || html.match(pat);
    if (locMatch) {
      const parts = locMatch[1].split(',').map(s => s.trim());
      if (parts.length >= 2) {
        city = parts[0];
        state = parts[1].replace(/\s+\d{5}.*/, '').trim();
      }
      address = locMatch[0].trim();
      break;
    }
  }

  // Extract capabilities/certifications/industries from markdown
  // Look for list items under headers like "Capabilities", "Services", "Certifications", "Industries"
  const capabilities: string[] = [];
  const capSections = markdown.match(/(?:capabilities|services|specialties|certifications|industries served|materials)[:\s]*\n((?:\s*[-•*]\s*.+\n?)+)/gi);
  if (capSections) {
    for (const section of capSections) {
      const items = section.match(/[-•*]\s*(.+)/g);
      if (items) {
        for (const item of items) {
          const cleaned = item.replace(/^[-•*]\s*/, '').trim();
          if (cleaned.length > 1 && cleaned.length < 100) {
            capabilities.push(cleaned);
          }
        }
      }
    }
  }

  // Also try comma-separated lists after capability headers
  const commaCapMatch = markdown.match(/(?:capabilities|services|specialties|certifications|industries)[:\s]*([^\n]+)/gi);
  if (commaCapMatch && capabilities.length === 0) {
    for (const match of commaCapMatch) {
      const afterColon = match.split(/[:\s]+/).slice(1).join(' ');
      const items = afterColon.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 100);
      capabilities.push(...items);
    }
  }

  return [{
    name: companyName,
    city,
    state,
    country: 'US',
    phone: phones[0] || null,
    email: allEmails[0] || null,
    website: companyWebsites[0] || null,
    capabilities: capabilities.length > 0 ? capabilities : null,
    address: address || null,
    _extra_emails: allEmails.slice(1),
  }];
};

/**
 * Some directory pages (like shop-finder index) list MULTIPLE companies.
 * Try to split the markdown into sections per company.
 */
const extractMultipleFromListingPage = (
  markdown: string,
  html: string,
  sourceUrl: string,
  directoryDomain: string
): any[] => {
  // If the page has multiple h2/h3 headings, each might be a company
  const sections = markdown.split(/^(?=#{2,3}\s+)/m).filter(s => s.trim().length > 50);

  if (sections.length > 1) {
    const companies: any[] = [];
    for (const section of sections) {
      const extracted = extractCompaniesFromPage(section, '', sourceUrl, directoryDomain);
      companies.push(...extracted);
    }
    return companies;
  }

  // Otherwise treat the whole page as a single company detail page
  return extractCompaniesFromPage(markdown, html, sourceUrl, directoryDomain);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, max_pages = 100, include_path = '' } = await req.json();

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

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }

    const directoryDomain = extractDomain(formattedUrl) || '';
    const cappedPages = Math.min(Math.max(max_pages, 10), 500);

    console.log(`Starting directory crawl (no AI): ${formattedUrl}, max_pages: ${cappedPages}, include_path: ${include_path}`);

    // Step 1: Crawl directory pages — get both markdown and HTML
    const crawlBody: any = {
      url: formattedUrl,
      limit: cappedPages,
      scrapeOptions: {
        formats: ['markdown', 'html'],
        onlyMainContent: false,
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
        JSON.stringify({ success: true, companies_imported: 0, emails_found: 0, phones_found: 0, pages_crawled: 0, message: 'No pages found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 3: Extract companies from each page using pure regex/text parsing
    const allExtracted: any[] = [];

    for (const page of pages) {
      const md = page.markdown || '';
      const html = page.html || '';
      const sourceUrl = page.metadata?.sourceURL || '';

      const companies = extractMultipleFromListingPage(md, html, sourceUrl, directoryDomain);
      for (const c of companies) {
        if (c.name) {
          allExtracted.push(c);
        }
      }
    }

    console.log(`Regex extraction complete: ${allExtracted.length} companies from ${pages.length} pages`);

    // Step 4: Import into database
    let companiesImported = 0;
    let emailsFound = 0;
    let phonesFound = 0;
    let duplicatesSkipped = 0;

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
      if (!company.name) continue;

      const domain = company.website ? extractDomain(company.website) : null;

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
        console.error(`Failed to insert ${company.name}:`, insertError.message);
        continue;
      }

      companiesImported++;
      if (domain) existingDomains.add(domain.toLowerCase());
      existingNames.add(company.name.toLowerCase());

      // Insert primary email
      if (company.email) {
        const { error: emailError } = await supabase
          .from('emails')
          .insert({
            email_address: company.email,
            company_id: newCompany.id,
            user_id: user.id,
            context: 'General',
            source_url: formattedUrl,
            validated: true,
          });
        if (!emailError) emailsFound++;
      }

      // Insert any additional emails found on the same page
      if (company._extra_emails?.length > 0) {
        for (const extra of company._extra_emails) {
          const { error: extraErr } = await supabase
            .from('emails')
            .insert({
              email_address: extra,
              company_id: newCompany.id,
              user_id: user.id,
              context: 'General',
              source_url: formattedUrl,
              validated: true,
            });
          if (!extraErr) emailsFound++;
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
