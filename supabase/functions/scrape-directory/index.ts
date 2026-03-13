import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
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

const decodeHtmlEntities = (str: string): string => {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/");
};

/**
 * Extract company data from a DETAIL page (e.g. /machine-shops/company-name-city-st).
 * These pages have structured HTML with specific CSS classes for each field.
 */
const extractFromDetailPage = (html: string, markdown: string, sourceUrl: string, directoryDomain: string): any | null => {
  // --- Company name from <h1> ---
  const h1Match = html.match(/<h1[^>]*class="page-title"[^>]*>([\s\S]*?)<\/h1>/i)
    || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let name = '';
  if (h1Match) {
    name = h1Match[1].replace(/<[^>]+>/g, '').trim();
    name = decodeHtmlEntities(name);
  }
  if (!name) {
    const mdH1 = markdown.match(/^#\s+(.+)$/m);
    if (mdH1) name = mdH1[1].trim();
  }
  // Clean directory suffixes
  name = name.replace(/\s*[|–—-]\s*(machinist|directory|shop finder).*$/i, '').trim();
  if (!name || name === 'Shop Finder') return null;

  // --- Address from unified-field--address ---
  let address = '';
  const addrMatch = html.match(/unified-field--address[\s\S]*?<div class="field__item">\s*([\s\S]*?)\s*<\/div>/i);
  if (addrMatch) {
    address = addrMatch[1].replace(/<[^>]+>/g, '').trim();
    address = decodeHtmlEntities(address);
  }
  // Fallback: markdown pattern like [address](google maps link)
  if (!address) {
    const mdAddr = markdown.match(/\[([^\]]*(?:Rd|St|Ave|Blvd|Dr|Ln|Ct|Way|Hwy|Pkwy|Cir|Pl)[^\]]*)\]\(https:\/\/www\.google\.com\/maps/i);
    if (mdAddr) address = mdAddr[1].trim();
  }

  // --- Phone from unified-field--phone ---
  let phone = '';
  const phoneMatch = html.match(/unified-field--phone[\s\S]*?<div class="field__item">\s*([\s\S]*?)\s*<\/div>/i);
  if (phoneMatch) {
    phone = phoneMatch[1].replace(/<[^>]+>/g, '').trim();
  }
  // Fallback: tel: link
  if (!phone) {
    const telMatch = html.match(/href="tel:([^"]+)"/i);
    if (telMatch) phone = telMatch[1].trim();
  }
  // Fallback: regex on markdown
  if (!phone) {
    const mdPhones = markdown.match(PHONE_REGEX);
    if (mdPhones) phone = mdPhones[0];
  }

  // --- Email from unified-field--email ---
  let email = '';
  const emailFieldMatch = html.match(/unified-field--email[\s\S]*?<div class="field__item">\s*([\s\S]*?)\s*<\/div>/i);
  if (emailFieldMatch) {
    const mailtoMatch = emailFieldMatch[1].match(/mailto:([^"]+)"/i);
    if (mailtoMatch) {
      email = cleanEmail(mailtoMatch[1]) || '';
    } else {
      // Try to extract email text
      const emailText = emailFieldMatch[1].replace(/<[^>]+>/g, '').trim();
      email = cleanEmail(emailText) || '';
    }
  }
  // Fallback: mailto in full html
  if (!email) {
    const mailtoFallback = html.match(/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
    if (mailtoFallback) email = cleanEmail(mailtoFallback[1]) || '';
  }
  // Fallback: regex on full text
  if (!email) {
    const allEmails = (markdown + '\n' + html).match(EMAIL_REGEX) || [];
    for (const e of allEmails) {
      const domain = extractDomain(`http://${e.split('@')[1]}`);
      if (domain && !DIRECTORY_DOMAINS.has(domain)) {
        const cleaned = cleanEmail(e);
        if (cleaned) { email = cleaned; break; }
      }
    }
  }

  // --- Website from unified-field--website ---
  let website = '';
  const websiteMatch = html.match(/unified-field--website[\s\S]*?<div class="field__item">\s*([\s\S]*?)\s*<\/div>/i);
  if (websiteMatch) {
    const hrefMatch = websiteMatch[1].match(/href="([^"]+)"/i);
    if (hrefMatch) website = hrefMatch[1].trim();
    if (!website) website = websiteMatch[1].replace(/<[^>]+>/g, '').trim();
  }
  // Fallback: look for external links in markdown
  if (!website) {
    const mdLinks = markdown.match(/\[https?:\/\/[^\]]+\]\((https?:\/\/[^)]+)\)/g) || [];
    for (const link of mdLinks) {
      const urlMatch = link.match(/\((https?:\/\/[^)]+)\)/);
      if (urlMatch) {
        const domain = extractDomain(urlMatch[1]);
        if (domain && !DIRECTORY_DOMAINS.has(domain) && domain !== directoryDomain) {
          website = urlMatch[1];
          break;
        }
      }
    }
  }

  // --- Capabilities/Industries/Certifications ---
  const capabilities: string[] = [];
  // Look for capability tags in HTML
  const capSections = html.match(/field--name-field-capabilities[\s\S]*?<\/div>\s*<\/div>/gi) || [];
  for (const section of capSections) {
    const items = section.match(/<div class="field__item">([^<]+)<\/div>/gi) || [];
    for (const item of items) {
      const text = item.replace(/<[^>]+>/g, '').trim();
      if (text.length > 1 && text.length < 100) capabilities.push(decodeHtmlEntities(text));
    }
  }
  // Also try markdown list patterns
  if (capabilities.length === 0) {
    const capMatch = markdown.match(/(?:capabilities|services|specialties|certifications|industries served|materials)[:\s]*\n((?:\s*[-•*]\s*.+\n?)+)/gi);
    if (capMatch) {
      for (const section of capMatch) {
        const items = section.match(/[-•*]\s*(.+)/g) || [];
        for (const item of items) {
          const cleaned = item.replace(/^[-•*]\s*/, '').trim();
          if (cleaned.length > 1 && cleaned.length < 100) capabilities.push(cleaned);
        }
      }
    }
  }

  // Parse location components from address
  let city = '', state = '', country = 'US';
  if (address) {
    // Pattern: "Street, City, ST ZIP, Country"
    const parts = address.split(',').map(s => s.trim());
    if (parts.length >= 3) {
      city = parts[parts.length - 3] || '';
      const stateZip = parts[parts.length - 2] || '';
      state = stateZip.replace(/\s+\d{5}(-\d{4})?/, '').trim();
      const lastPart = parts[parts.length - 1] || '';
      if (lastPart.toLowerCase().includes('united states')) country = 'US';
      else if (lastPart.toLowerCase().includes('canada')) country = 'CA';
      else country = lastPart;
    } else if (parts.length === 2) {
      city = parts[0];
      state = parts[1].replace(/\s+\d{5}(-\d{4})?/, '').trim();
    }
  }

  // Additional emails from the page
  const extraEmails: string[] = [];
  const allPageEmails = (markdown + '\n' + html).match(EMAIL_REGEX) || [];
  for (const e of allPageEmails) {
    const cleaned = cleanEmail(e);
    if (cleaned && cleaned !== email) {
      const domain = extractDomain(`http://${cleaned.split('@')[1]}`);
      if (domain && !DIRECTORY_DOMAINS.has(domain)) {
        extraEmails.push(cleaned);
      }
    }
  }

  console.log(`  → Extracted: ${name} | ${address} | ${phone} | ${email} | ${website}`);

  return {
    name,
    address: address || null,
    city,
    state,
    country,
    phone: phone || null,
    email: email || null,
    website: website || null,
    capabilities: capabilities.length > 0 ? capabilities : null,
    _extra_emails: [...new Set(extraEmails)],
  };
};

/**
 * Extract companies from a LISTING/INDEX page (e.g. /shop-finder).
 * These pages list many companies with links but minimal detail.
 * We extract name + location from the list items.
 */
const extractFromListingPage = (html: string, markdown: string, directoryDomain: string): any[] => {
  const companies: any[] = [];

  // Pattern 1: HTML list items like on machinist.com shop-finder
  // <li>...<a href="/machine-shops/...">Company Name</a> (City, ST, Country)...</li>
  const listItemRegex = /<li[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([^<]+)<\/a>\s*\(([^)]+)\)/gi;
  let match;
  while ((match = listItemRegex.exec(html)) !== null) {
    const name = decodeHtmlEntities(match[2].trim());
    const locationStr = match[3].trim();
    const parts = locationStr.split(',').map(s => s.trim());

    let city = '', state = '', country = 'US';
    if (parts.length >= 3) {
      city = parts[0];
      state = parts[1];
      country = parts[2];
    } else if (parts.length === 2) {
      city = parts[0];
      state = parts[1];
    }

    if (name && name !== 'Privacy Policy' && name !== 'Terms of Service' && name !== 'Pricing') {
      companies.push({
        name,
        city,
        state,
        country,
        address: locationStr,
        phone: null,
        email: null,
        website: null,
        capabilities: null,
        _extra_emails: [],
      });
    }
  }

  // Pattern 2: Markdown list links
  // - [Company Name](url) (City, ST, Country)
  if (companies.length === 0) {
    const mdListRegex = /^-\s+\[([^\]]+)\]\([^)]+\)\s*\(([^)]+)\)/gm;
    while ((match = mdListRegex.exec(markdown)) !== null) {
      const name = match[1].trim();
      const locationStr = match[2].trim();
      const parts = locationStr.split(',').map(s => s.trim());

      let city = '', state = '', country = 'US';
      if (parts.length >= 3) {
        city = parts[0]; state = parts[1]; country = parts[2];
      } else if (parts.length === 2) {
        city = parts[0]; state = parts[1];
      }

      if (name && name !== 'Privacy Policy') {
        companies.push({
          name, city, state, country,
          address: locationStr,
          phone: null, email: null, website: null,
          capabilities: null, _extra_emails: [],
        });
      }
    }
  }

  return companies;
};

/**
 * Determine if a page is a detail page (single company) or a listing page (many companies).
 */
const isDetailPage = (html: string, sourceUrl: string): boolean => {
  // machinist.com detail pages have unified-field classes
  if (html.includes('unified-field--address') || html.includes('unified-field--phone') || html.includes('unified-field--email')) {
    return true;
  }
  // Generic: if there's a Contact & Location section
  if (html.includes('Contact &amp; Location') || html.includes('Contact & Location')) {
    return true;
  }
  // Generic: single company pages often have tel: links
  const telCount = (html.match(/href="tel:/gi) || []).length;
  const mailtoCount = (html.match(/href="mailto:/gi) || []).length;
  if (telCount >= 1 && mailtoCount >= 1) return true;

  return false;
};

const normalizeUrl = (href: string, baseUrl: string): string | null => {
  if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return null;
  }
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
};

const extractDetailUrlsFromPage = (html: string, markdown: string, sourceUrl: string, directoryDomain: string): string[] => {
  const found = new Set<string>();

  const htmlHrefRegex = /<a[^>]*href="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = htmlHrefRegex.exec(html)) !== null) {
    const normalized = normalizeUrl(match[1], sourceUrl);
    if (!normalized) continue;
    const domain = extractDomain(normalized);
    if (domain !== directoryDomain) continue;
    if (/\/machine-shops\//i.test(normalized) && !/\/machine-shops-in\//i.test(normalized)) {
      found.add(normalized.split('#')[0]);
    }
  }

  const mdLinkRegex = /\[[^\]]+\]\((https?:\/\/[^)]+)\)/gi;
  while ((match = mdLinkRegex.exec(markdown)) !== null) {
    const normalized = normalizeUrl(match[1], sourceUrl);
    if (!normalized) continue;
    const domain = extractDomain(normalized);
    if (domain !== directoryDomain) continue;
    if (/\/machine-shops\//i.test(normalized) && !/\/machine-shops-in\//i.test(normalized)) {
      found.add(normalized.split('#')[0]);
    }
  }

  return Array.from(found);
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

    // For known directory index pages (like machinist.com/shop-finder),
    // force crawling company detail URLs rather than re-importing listing pages.
    let effectiveIncludePath = include_path?.trim() || '';
    if (!effectiveIncludePath) {
      try {
        const parsed = new URL(formattedUrl);
        if (parsed.hostname.replace(/^www\./, '') === 'machinist.com' && parsed.pathname.includes('/shop-finder')) {
          effectiveIncludePath = '/machine-shops/';
        }
      } catch {
        // no-op
      }
    }

    console.log(`Starting directory crawl (detail-first): ${formattedUrl}, max_pages: ${cappedPages}, include_path: ${effectiveIncludePath || '(none)'}`);

    // Step 1: Crawl directory — request both HTML and markdown
    const crawlBody: any = {
      url: formattedUrl,
      limit: cappedPages,
      scrapeOptions: {
        formats: ['markdown', 'html'],
        onlyMainContent: false,
        waitFor: 2000,
      },
    };

    const shouldApplyIncludePathToCrawler = Boolean(effectiveIncludePath) && !formattedUrl.includes('/shop-finder');
    if (shouldApplyIncludePathToCrawler) {
      crawlBody.includePaths = [effectiveIncludePath];
    }
    crawlBody.excludePaths = ['/privacy', '/terms', '/login', '/signup', '/cart', '/checkout', '/pricing', '/blog', '/claim-shop'];

    const crawlResp = await fetch('https://api.firecrawl.dev/v1/crawl', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(crawlBody),
    });

    if (!crawlResp.ok) {
      const errText = await crawlResp.text();
      console.error(`Crawl start failed (${crawlResp.status}):`, errText.slice(0, 300));
      let errorMsg = `Crawl request failed with status ${crawlResp.status}`;
      try { errorMsg = JSON.parse(errText).error || errorMsg; } catch {}
      return new Response(
        JSON.stringify({ success: false, error: errorMsg }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    const crawlData = await crawlResp.json();
    if (!crawlData.success) {
      console.error('Crawl start failed:', crawlData);
      return new Response(
        JSON.stringify({ success: false, error: crawlData.error || 'Failed to start crawl' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const crawlId = crawlData.id;
    console.log(`Crawl started with ID: ${crawlId}`);

    // Step 2: Poll for completion
    let crawlResult: any = null;
    const maxPollTime = 5 * 60 * 1000;
    const pollInterval = 5000;
    const startTime = Date.now();

    while (Date.now() - startTime < maxPollTime) {
      await new Promise(r => setTimeout(r, pollInterval));
      const statusResp = await fetch(`https://api.firecrawl.dev/v1/crawl/${crawlId}`, {
        headers: { 'Authorization': `Bearer ${firecrawlKey}` },
      });
      if (!statusResp.ok) {
        const text = await statusResp.text();
        console.error(`Poll returned ${statusResp.status}: ${text.slice(0, 200)}`);
        if (statusResp.status >= 500) continue; // Retry on server errors
        return new Response(
          JSON.stringify({ success: false, error: `Crawl poll failed: ${statusResp.status}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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

    // Step 3: Discover detail URLs from listing pages, then scrape those detail pages directly
    const allExtracted: any[] = [];
    let detailPagesFound = 0;
    let listingPagesFound = 0;
    let detailPagesSscraped = 0;
    let detailScrapeSuccesses = 0;
    let detailScrapeFailures = 0;
    const listingPageUrls: string[] = [];
    const detailPageUrls: string[] = [];

    const detailUrlSet = new Set<string>();

    for (const page of pages) {
      const md = page.markdown || '';
      const html = page.html || '';
      const sourceUrl = page.metadata?.sourceURL || formattedUrl;

      // Collect links to detail pages from listing/index pages
      const discovered = extractDetailUrlsFromPage(html, md, sourceUrl, directoryDomain);
      for (const u of discovered) {
        if (!effectiveIncludePath || u.includes(effectiveIncludePath)) {
          detailUrlSet.add(u);
        }
      }

      // If crawler already returned detail pages, use them immediately
      if (isDetailPage(html, sourceUrl)) {
        detailPagesFound++;
        detailPageUrls.push(sourceUrl);
        const company = extractFromDetailPage(html, md, sourceUrl, directoryDomain);
        if (company && company.name) {
          company._source_url = sourceUrl;
          allExtracted.push(company);
          detailScrapeSuccesses++;
        } else {
          detailScrapeFailures++;
        }
      } else {
        listingPagesFound++;
        listingPageUrls.push(sourceUrl);
      }
    }

    const detailUrls = Array.from(detailUrlSet).slice(0, cappedPages);
    console.log(`Discovered ${detailUrls.length} detail URLs from listing pages`);

    // Filter out already-crawled detail URLs
    const { data: alreadyCrawled } = await supabase
      .from('crawled_urls')
      .select('url')
      .eq('user_id', user.id)
      .in('url', detailUrls.slice(0, 200));

    const crawledSet = new Set((alreadyCrawled || []).map((r: any) => r.url));

    // If crawl returned mostly listing pages, scrape discovered detail URLs directly
    if (detailUrls.length > 0) {
      const existingDetailSources = new Set(
        allExtracted.map((c: any) => c._source_url).filter(Boolean)
      );
      const uncrawledDetailUrls = detailUrls.filter((u) => !existingDetailSources.has(u) && !crawledSet.has(u));
      console.log(`${detailUrls.length} detail URLs, ${crawledSet.size} already crawled, scraping ${uncrawledDetailUrls.length} new`);

      for (const detailUrl of uncrawledDetailUrls) {
        detailPagesSscraped++;

        try {
          const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: detailUrl,
              formats: ['markdown', 'html'],
              onlyMainContent: false,
              waitFor: 2000,
            }),
          });

          const scrapeData = await scrapeResp.json();
          if (!scrapeResp.ok || scrapeData.success === false) {
            console.error(`Detail scrape failed for ${detailUrl}:`, scrapeData?.error || scrapeResp.status);
            detailScrapeFailures++;
            continue;
          }

          const md = scrapeData?.data?.markdown || scrapeData?.markdown || '';
          const html = scrapeData?.data?.html || scrapeData?.html || '';

          if (!html && !md) { detailScrapeFailures++; continue; }

          const company = extractFromDetailPage(html, md, detailUrl, directoryDomain);
          if (company && company.name) {
            company._source_url = detailUrl;
            allExtracted.push(company);
            detailPagesFound++;
            detailPageUrls.push(detailUrl);
            detailScrapeSuccesses++;
          } else {
            detailScrapeFailures++;
          }
        } catch (err) {
          console.error(`Detail scrape exception for ${detailUrl}:`, err);
          detailScrapeFailures++;
        }
      }
    }

    // Fallback: if still no detail results, at least import listing-level records
    if (allExtracted.length === 0) {
      for (const page of pages) {
        const md = page.markdown || '';
        const html = page.html || '';
        const sourceUrl = page.metadata?.sourceURL || formattedUrl;
        const listed = extractFromListingPage(html, md, directoryDomain);
        for (const c of listed) {
          if (c.name) {
            c._source_url = sourceUrl;
            allExtracted.push(c);
          }
        }
      }
    }

    console.log(`Extraction: ${detailPagesFound} detail pages, ${listingPagesFound} listing pages, ${allExtracted.length} total companies`);

    // Deduplicate by name (prefer entries with more data — email/phone)
    const companyMap = new Map<string, any>();
    for (const c of allExtracted) {
      const key = c.name.toLowerCase();
      const existing = companyMap.get(key);
      if (!existing) {
        companyMap.set(key, c);
      } else {
        // Merge: prefer whichever has more contact info
        const existingScore = (existing.email ? 1 : 0) + (existing.phone ? 1 : 0) + (existing.website ? 1 : 0);
        const newScore = (c.email ? 1 : 0) + (c.phone ? 1 : 0) + (c.website ? 1 : 0);
        if (newScore > existingScore) {
          companyMap.set(key, { ...existing, ...c });
        } else {
          // Fill in blanks from the new entry
          if (!existing.email && c.email) existing.email = c.email;
          if (!existing.phone && c.phone) existing.phone = c.phone;
          if (!existing.website && c.website) existing.website = c.website;
          if (!existing.address && c.address) existing.address = c.address;
        }
      }
    }

    const dedupedCompanies = Array.from(companyMap.values());
    console.log(`After dedup: ${dedupedCompanies.length} unique companies`);

    // Step 4: Import into database
    let companiesImported = 0;
    let emailsFound = 0;
    let phonesFound = 0;
    let duplicatesSkipped = 0;

    // Fetch ALL existing companies (including archived/deleted) to prevent re-adding
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

    for (const company of dedupedCompanies) {
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
      }

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
          phone: company.phone || null,
          address: company.address || null,
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
            source_url: company._source_url || formattedUrl,
            validated: true,
          });
        if (!emailError) emailsFound++;
      }

      // Insert extra emails
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

    // Log all scraped detail page URLs to crawled_urls
    const allScrapedUrls = [...new Set([...detailPageUrls, ...listingPageUrls])];
    if (allScrapedUrls.length > 0) {
      const crawlRows = allScrapedUrls.map((u) => ({
        user_id: user.id,
        url: u,
        source: 'directory-import',
      }));
      await supabase.from('crawled_urls').upsert(crawlRows, { onConflict: 'user_id,url', ignoreDuplicates: true });
    }

    console.log(`Import complete: ${companiesImported} companies, ${emailsFound} emails, ${phonesFound} phones, ${duplicatesSkipped} duplicates skipped`);

    const totalDetailAttempts = detailScrapeSuccesses + detailScrapeFailures;
    const extractionRate = totalDetailAttempts > 0 ? Math.round((detailScrapeSuccesses / totalDetailAttempts) * 100) : 0;

    return new Response(
      JSON.stringify({
        success: true,
        pages_crawled: pages.length,
        companies_extracted: dedupedCompanies.length,
        companies_imported: companiesImported,
        emails_found: emailsFound,
        phones_found: phonesFound,
        duplicates_skipped: duplicatesSkipped,
        diagnostics: {
          listing_pages_crawled: listingPagesFound,
          listing_page_urls: listingPageUrls,
          detail_urls_discovered: detailUrls.length,
          detail_pages_scraped: detailPagesFound,
          detail_pages_extra_scraped: detailPagesSscraped,
          extraction_successes: detailScrapeSuccesses,
          extraction_failures: detailScrapeFailures,
          extraction_rate_pct: extractionRate,
          detail_page_urls: detailPageUrls.slice(0, 50),
        },
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
