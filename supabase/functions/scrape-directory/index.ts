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

// ─── Extract company data from a DETAIL page ───
const extractFromDetailPage = (html: string, markdown: string, sourceUrl: string, directoryDomain: string): any | null => {
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
  name = name.replace(/\s*[|–—-]\s*(machinist|directory|shop finder).*$/i, '').trim();
  if (!name || name === 'Shop Finder') return null;

  // Address
  let address = '';
  const addrMatch = html.match(/unified-field--address[\s\S]*?<div class="field__item">\s*([\s\S]*?)\s*<\/div>/i);
  if (addrMatch) {
    address = addrMatch[1].replace(/<[^>]+>/g, '').trim();
    address = decodeHtmlEntities(address);
  }
  if (!address) {
    const mdAddr = markdown.match(/\[([^\]]*(?:Rd|St|Ave|Blvd|Dr|Ln|Ct|Way|Hwy|Pkwy|Cir|Pl)[^\]]*)\]\(https:\/\/www\.google\.com\/maps/i);
    if (mdAddr) address = mdAddr[1].trim();
  }

  // Phone
  let phone = '';
  const phoneMatch = html.match(/unified-field--phone[\s\S]*?<div class="field__item">\s*([\s\S]*?)\s*<\/div>/i);
  if (phoneMatch) {
    phone = phoneMatch[1].replace(/<[^>]+>/g, '').trim();
  }
  if (!phone) {
    const telMatch = html.match(/href="tel:([^"]+)"/i);
    if (telMatch) phone = telMatch[1].trim();
  }
  if (!phone) {
    const mdPhones = markdown.match(PHONE_REGEX);
    if (mdPhones) phone = mdPhones[0];
  }

  // Email
  let email = '';
  const emailFieldMatch = html.match(/unified-field--email[\s\S]*?<div class="field__item">\s*([\s\S]*?)\s*<\/div>/i);
  if (emailFieldMatch) {
    const mailtoMatch = emailFieldMatch[1].match(/mailto:([^"]+)"/i);
    if (mailtoMatch) {
      email = cleanEmail(mailtoMatch[1]) || '';
    } else {
      const emailText = emailFieldMatch[1].replace(/<[^>]+>/g, '').trim();
      email = cleanEmail(emailText) || '';
    }
  }
  if (!email) {
    const mailtoFallback = html.match(/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
    if (mailtoFallback) email = cleanEmail(mailtoFallback[1]) || '';
  }
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

  // Website
  let website = '';
  const websiteMatch = html.match(/unified-field--website[\s\S]*?<div class="field__item">\s*([\s\S]*?)\s*<\/div>/i);
  if (websiteMatch) {
    const hrefMatch = websiteMatch[1].match(/href="([^"]+)"/i);
    if (hrefMatch) website = hrefMatch[1].trim();
    if (!website) website = websiteMatch[1].replace(/<[^>]+>/g, '').trim();
  }
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

  // Capabilities
  const capabilities: string[] = [];
  const capSections = html.match(/field--name-field-capabilities[\s\S]*?<\/div>\s*<\/div>/gi) || [];
  for (const section of capSections) {
    const items = section.match(/<div class="field__item">([^<]+)<\/div>/gi) || [];
    for (const item of items) {
      const text = item.replace(/<[^>]+>/g, '').trim();
      if (text.length > 1 && text.length < 100) capabilities.push(decodeHtmlEntities(text));
    }
  }
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

  // Location parsing
  let city = '', state = '', country = 'US';
  if (address) {
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

  // Extra emails
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
    name, address: address || null, city, state, country,
    phone: phone || null, email: email || null, website: website || null,
    capabilities: capabilities.length > 0 ? capabilities : null,
    _extra_emails: [...new Set(extraEmails)],
  };
};

// ─── Extract detail URLs from a listing page ───
const extractDetailUrlsFromPage = (html: string, markdown: string, sourceUrl: string, directoryDomain: string): string[] => {
  const found = new Set<string>();
  const normalizeUrl = (href: string): string | null => {
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return null;
    try { return new URL(href, sourceUrl).toString(); } catch { return null; }
  };

  const htmlHrefRegex = /<a[^>]*href="([^"]+)"[^>]*>/gi;
  let match;
  while ((match = htmlHrefRegex.exec(html)) !== null) {
    const normalized = normalizeUrl(match[1]);
    if (!normalized) continue;
    const domain = extractDomain(normalized);
    if (domain !== directoryDomain) continue;
    if (/\/machine-shops\//i.test(normalized) && !/\/machine-shops-in\//i.test(normalized)) {
      found.add(normalized.split('#')[0]);
    }
  }

  const mdLinkRegex = /\[[^\]]+\]\((https?:\/\/[^)]+)\)/gi;
  while ((match = mdLinkRegex.exec(markdown)) !== null) {
    const normalized = normalizeUrl(match[1]);
    if (!normalized) continue;
    const domain = extractDomain(normalized);
    if (domain !== directoryDomain) continue;
    if (/\/machine-shops\//i.test(normalized) && !/\/machine-shops-in\//i.test(normalized)) {
      found.add(normalized.split('#')[0]);
    }
  }

  return Array.from(found);
};

// ─── Detect total page count from a listing page ───
const detectPagination = (html: string, markdown: string, baseUrl: string): number => {
  // Look for pagination links like ?page=N — find the highest N
  const pageMatches = [...(html + markdown).matchAll(/[?&]page=(\d+)/gi)];
  let maxPage = 0;
  for (const m of pageMatches) {
    const n = parseInt(m[1]);
    if (n > maxPage) maxPage = n;
  }
  // Also check for "last" pagination link text
  const lastMatch = html.match(/href="[^"]*[?&]page=(\d+)[^"]*"[^>]*>\s*(?:Last|last|»|>>)/i);
  if (lastMatch) {
    const n = parseInt(lastMatch[1]);
    if (n > maxPage) maxPage = n;
  }
  return maxPage;
};

// ─── Scrape a single URL via Firecrawl ───
const scrapePage = async (url: string, firecrawlKey: string): Promise<{ html: string; markdown: string } | null> => {
  try {
    const resp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown', 'html'],
        onlyMainContent: false,
        waitFor: 2000,
      }),
    });

    if (!resp.ok) {
      console.error(`Scrape failed for ${url} (${resp.status})`);
      return null;
    }
    const data = await resp.json();
    if (data.success === false) {
      console.error(`Scrape failed for ${url}: ${data.error}`);
      return null;
    }
    return {
      html: data?.data?.html || data?.html || '',
      markdown: data?.data?.markdown || data?.markdown || '',
    };
  } catch (err) {
    console.error(`Scrape exception for ${url}:`, err);
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, max_pages = 50, include_path = '' } = await req.json();

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
    const cappedPages = Math.min(Math.max(max_pages, 10), 50);

    console.log(`=== SEQUENTIAL DIRECTORY IMPORT ===`);
    console.log(`URL: ${formattedUrl}, max_pages: ${cappedPages}`);

    // ─── STEP 1: Scrape the first page to detect pagination ───
    console.log(`Step 1: Scraping first page to detect pagination...`);
    const firstPage = await scrapePage(formattedUrl, firecrawlKey);
    if (!firstPage) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to scrape the directory page' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const maxPageNum = detectPagination(firstPage.html, firstPage.markdown, formattedUrl);
    console.log(`Detected pagination: ${maxPageNum + 1} total pages (page=0 to page=${maxPageNum})`);

    // ─── STEP 2: Build sequential list of listing page URLs ───
    const parsedBase = new URL(formattedUrl);
    const listingUrls: string[] = [];

    if (maxPageNum > 0) {
      // Paginated directory — generate page=0, page=1, ... page=N
      for (let p = 0; p <= maxPageNum; p++) {
        const pageUrl = new URL(parsedBase.toString());
        pageUrl.searchParams.set('page', String(p));
        listingUrls.push(pageUrl.toString());
      }
    } else {
      // Single page or unknown pagination
      listingUrls.push(formattedUrl);
    }

    console.log(`Total listing pages to process: ${listingUrls.length}`);

    // ─── STEP 3: Check which listing pages we've already crawled ───
    const { data: alreadyCrawledListings } = await supabase
      .from('crawled_urls')
      .select('url')
      .eq('user_id', user.id)
      .eq('source', 'directory-import')
      .in('url', listingUrls.slice(0, 200));
    const crawledListingSet = new Set((alreadyCrawledListings || []).map((r: any) => r.url));

    const uncrawledListings = listingUrls.filter(u => !crawledListingSet.has(u));
    console.log(`${crawledListingSet.size} listing pages already crawled, ${uncrawledListings.length} new to process`);

    // Cap the number of listing pages we scrape this run
    const listingsToScrape = uncrawledListings.slice(0, cappedPages);

    // ─── STEP 4: Scrape listing pages sequentially (page 0, 1, 2...) ───
    const allDetailUrls = new Set<string>();
    const listingPageUrls: string[] = [];
    let listingPagesScraped = 0;

    // Use the already-scraped first page if it's in our list
    const firstPageUrl = listingUrls[0];
    if (listingsToScrape.includes(firstPageUrl)) {
      listingPagesScraped++;
      listingPageUrls.push(firstPageUrl);
      const detailUrls = extractDetailUrlsFromPage(firstPage.html, firstPage.markdown, firstPageUrl, directoryDomain);
      for (const u of detailUrls) allDetailUrls.add(u);
      console.log(`Page 0: found ${detailUrls.length} detail URLs`);
    }

    // Scrape remaining listing pages in order
    for (const listingUrl of listingsToScrape) {
      if (listingUrl === firstPageUrl) continue; // Already processed above

      const pageNum = new URL(listingUrl).searchParams.get('page') || '?';
      console.log(`Scraping listing page ${pageNum}: ${listingUrl}`);

      const pageData = await scrapePage(listingUrl, firecrawlKey);
      listingPagesScraped++;
      listingPageUrls.push(listingUrl);

      if (!pageData) {
        console.log(`  → Failed to scrape, skipping`);
        continue;
      }

      const detailUrls = extractDetailUrlsFromPage(pageData.html, pageData.markdown, listingUrl, directoryDomain);
      for (const u of detailUrls) allDetailUrls.add(u);
      console.log(`  → Found ${detailUrls.length} detail URLs (total unique: ${allDetailUrls.size})`);
    }

    console.log(`Total unique detail URLs discovered: ${allDetailUrls.size}`);

    // ─── STEP 5: Filter out already-crawled detail URLs ───
    const detailUrlArray = Array.from(allDetailUrls).sort((a, b) => a.localeCompare(b));
    const { data: alreadyCrawledDetails } = await supabase
      .from('crawled_urls')
      .select('url')
      .eq('user_id', user.id)
      .eq('source', 'directory-import')
      .in('url', detailUrlArray.slice(0, 200));
    const crawledDetailSet = new Set((alreadyCrawledDetails || []).map((r: any) => r.url));

    const uncrawledDetails = detailUrlArray.filter(u => !crawledDetailSet.has(u));
    console.log(`${crawledDetailSet.size} detail pages already crawled, ${uncrawledDetails.length} new to scrape`);

    // Cap detail pages to stay within edge function time limits
    // Each scrape takes ~3-4s, so ~12-15 detail pages per run is safe
    const detailBudget = Math.max(5, cappedPages - listingPagesScraped);
    const detailsToScrape = uncrawledDetails.slice(0, detailBudget);
    console.log(`Will scrape ${detailsToScrape.length} detail pages (budget: ${detailBudget})`);

    // ─── STEP 6: Scrape detail pages and extract company data ───
    const allExtracted: any[] = [];
    const detailPageUrls: string[] = [];
    let detailScrapeSuccesses = 0;
    let detailScrapeFailures = 0;

    for (const detailUrl of detailsToScrape) {
      console.log(`Scraping detail: ${detailUrl}`);
      const pageData = await scrapePage(detailUrl, firecrawlKey);

      if (!pageData || (!pageData.html && !pageData.markdown)) {
        detailScrapeFailures++;
        detailPageUrls.push(detailUrl); // Still record it so we don't retry
        continue;
      }

      const company = extractFromDetailPage(pageData.html, pageData.markdown, detailUrl, directoryDomain);
      detailPageUrls.push(detailUrl);

      if (company && company.name) {
        company._source_url = detailUrl;
        allExtracted.push(company);
        detailScrapeSuccesses++;
      } else {
        detailScrapeFailures++;
      }
    }

    console.log(`Extraction complete: ${detailScrapeSuccesses} successes, ${detailScrapeFailures} failures from ${detailsToScrape.length} pages`);

    // ─── STEP 7: Deduplicate by name ───
    const companyMap = new Map<string, any>();
    for (const c of allExtracted) {
      const key = c.name.toLowerCase();
      const existing = companyMap.get(key);
      if (!existing) {
        companyMap.set(key, c);
      } else {
        const existingScore = (existing.email ? 1 : 0) + (existing.phone ? 1 : 0) + (existing.website ? 1 : 0);
        const newScore = (c.email ? 1 : 0) + (c.phone ? 1 : 0) + (c.website ? 1 : 0);
        if (newScore > existingScore) {
          companyMap.set(key, { ...existing, ...c });
        } else {
          if (!existing.email && c.email) existing.email = c.email;
          if (!existing.phone && c.phone) existing.phone = c.phone;
          if (!existing.website && c.website) existing.website = c.website;
          if (!existing.address && c.address) existing.address = c.address;
        }
      }
    }

    const dedupedCompanies = Array.from(companyMap.values());
    console.log(`After dedup: ${dedupedCompanies.length} unique companies`);

    // ─── STEP 8: Import into database ───
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

    for (const company of dedupedCompanies) {
      if (!company.name) continue;

      // Only import companies that have at least a website, email, or phone
      if (!company.website && !company.email && !company.phone) {
        duplicatesSkipped++;
        continue;
      }

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

    // ─── STEP 9: Log all scraped URLs to crawled_urls ───
    const allScrapedUrls = [...new Set([...listingPageUrls, ...detailPageUrls])];
    if (allScrapedUrls.length > 0) {
      const crawlRows = allScrapedUrls.map((u) => ({
        user_id: user.id,
        url: u,
        source: 'directory-import',
      }));
      await supabase.from('crawled_urls').upsert(crawlRows, { onConflict: 'user_id,url', ignoreDuplicates: true });
    }

    console.log(`=== IMPORT COMPLETE ===`);
    console.log(`${listingPagesScraped} listing pages → ${allDetailUrls.size} detail URLs → ${detailsToScrape.length} scraped → ${companiesImported} imported`);

    const totalDetailAttempts = detailScrapeSuccesses + detailScrapeFailures;
    const extractionRate = totalDetailAttempts > 0 ? Math.round((detailScrapeSuccesses / totalDetailAttempts) * 100) : 0;

    return new Response(
      JSON.stringify({
        success: true,
        pages_crawled: listingPagesScraped + detailsToScrape.length,
        companies_extracted: dedupedCompanies.length,
        companies_imported: companiesImported,
        emails_found: emailsFound,
        phones_found: phonesFound,
        duplicates_skipped: duplicatesSkipped,
        diagnostics: {
          listing_pages_crawled: listingPagesScraped,
          listing_page_urls: listingPageUrls,
          detail_urls_discovered: allDetailUrls.size,
          detail_pages_scraped: detailsToScrape.length,
          detail_pages_extra_scraped: 0,
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
