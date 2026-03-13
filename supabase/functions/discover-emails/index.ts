import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const EMAIL_PAGES = ['/contact', '/about', '/team', '/legal', '/privacy', '/impressum', '/pages/contact', '/pages/about', '/contact-us', '/about-us', '/contactus', '/contactus.html', '/pages/contact-us'];
const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MAILTO_REGEX = /mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
// Matches spaced-out anti-scrape patterns like "sales @ ecmfl.com", "info [at] company [dot] com", "user (at) domain (dot) org"
const SPACED_EMAIL_REGEX = /([A-Z0-9._%+-]+)\s*[\[@\(]\s*(?:at)?\s*[\]@\)]\s*([A-Z0-9.-]+)\s*[\[\(]?\s*(?:dot|\.)?\s*[\]\)]?\s*\.?\s*([A-Z]{2,})/gi;
const SPACED_AT_REGEX = /([A-Z0-9._%+-]+)\s+@\s+([A-Z0-9.-]+\.[A-Z]{2,})/gi;
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
  /^webmaster@/i,
  /^postmaster@/i,
  /^hostmaster@/i,
  /^abuse@/i,
  /^admin@/i,
  /^root@/i,
  /^mailer-daemon@/i,
  /^investor/i,
  /^ir@/i,              // investor relations
  /^recruit/i,
  /^careers@/i,
  /^jobs@/i,
  /^hiring@/i,
  /^talent@/i,
  /^hr@/i,
  /^humanresources@/i,
  /^human\.resources@/i,
  /^licensing@/i,
  /^license@/i,
  /^corporate@/i,
  /^legal@/i,
  /^compliance@/i,
  /^privacy@/i,
  /^dmca@/i,
  /^copyright@/i,
  /^media@/i,
  /^press@/i,
  /^pr@/i,
  /^editor@/i,
  /^newsroom@/i,
  /^donations@/i,
  /^donate@/i,
  /^foundation@/i,
  /^spam@/i,
  /^security@/i,
];
const MAX_PAGES_TO_SCRAPE = 10;
const CONCURRENT_SCRAPES = 3;
const SITEMAP_CANDIDATE_PATHS = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml'];
const MAX_SITEMAPS_TO_SCAN = 8;
const MAX_SITEMAP_URLS = 2000;
const CONTACT_URL_HINTS = /contact|about|team|people|staff|legal|privacy|impressum|email|support|help|customer-service/i;

const normalizeWebsiteUrl = (website: string) => {
  let normalized = website.trim().replace(/\/+$/, '');
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = `https://${normalized}`;
  }
  // Strip path to get root domain — company websites are often stored as deep URLs
  try {
    const url = new URL(normalized);
    return `${url.protocol}//${url.host}`;
  } catch {
    return normalized;
  }
};

const parseSitemapLocs = (xml: string) => {
  return Array.from(xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi))
    .map((m) => m[1].trim().replace(/&amp;/g, '&'))
    .filter(Boolean);
};

const discoverSitemapsFromRobots = async (baseUrl: string) => {
  try {
    const robotsResp = await fetch(`${baseUrl}/robots.txt`);
    if (!robotsResp.ok) return [] as string[];
    const robotsText = await robotsResp.text();
    return Array.from(
      robotsText.matchAll(/^\s*Sitemap:\s*(https?:\/\/\S+)\s*$/gim),
      (m) => m[1].trim()
    );
  } catch {
    return [] as string[];
  }
};

const discoverUrlsFromSitemaps = async (baseUrl: string, maxSitemaps: number) => {
  const discoveredUrls = new Set<string>();
  const sitemapQueue = new Set<string>(SITEMAP_CANDIDATE_PATHS.map((p) => `${baseUrl}${p}`));

  const robotSitemaps = await discoverSitemapsFromRobots(baseUrl);
  robotSitemaps.forEach((url) => sitemapQueue.add(url));

  const visitedSitemaps = new Set<string>();

  for (const sitemapUrl of Array.from(sitemapQueue)) {
    if (visitedSitemaps.size >= maxSitemaps) break;
    if (visitedSitemaps.has(sitemapUrl)) continue;

    visitedSitemaps.add(sitemapUrl);

    try {
      const sitemapResp = await fetch(sitemapUrl, {
        headers: { Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' },
      });
      if (!sitemapResp.ok) continue;

      const xml = await sitemapResp.text();
      const locs = parseSitemapLocs(xml);

      if (/<sitemapindex[\s>]/i.test(xml)) {
        for (const nestedSitemap of locs) {
          if (!visitedSitemaps.has(nestedSitemap)) {
            sitemapQueue.add(nestedSitemap);
          }
        }
        continue;
      }

      for (const loc of locs) {
        discoveredUrls.add(loc);
        if (discoveredUrls.size >= MAX_SITEMAP_URLS) break;
      }
    } catch (e) {
      console.log(`Failed to read sitemap ${sitemapUrl}:`, e);
    }
  }

  const urls = Array.from(discoveredUrls);
  const prioritized = urls.filter((url) => CONTACT_URL_HINTS.test(url));
  const fallback = urls.filter((url) => !CONTACT_URL_HINTS.test(url)).slice(0, 100);
  return { urls: [...prioritized, ...fallback], sitemapsFound: visitedSitemaps.size };
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { company_id, fast_mode = false, crawler_settings = {} } = await req.json();
    const maxPages = Math.min(Math.max(crawler_settings.max_pages || MAX_PAGES_TO_SCRAPE, 1), 30);
    const sitemapDepth = Math.min(Math.max(crawler_settings.sitemap_depth || MAX_SITEMAPS_TO_SCAN, 1), 20);
    const includePaths: string[] = (crawler_settings.include_paths || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const excludePaths: string[] = (crawler_settings.exclude_paths || '').split(',').map((s: string) => s.trim()).filter(Boolean);

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
    const baseUrl = normalizeWebsiteUrl(company.website);

    // Step 1: Sitemap-first discovery (including robots.txt sitemap pointers)
    let sitemapUrls: string[] = [];
    let sitemapsFound = 0;
    try {
      console.log(`Discovering sitemap URLs for ${baseUrl} (depth ${sitemapDepth})...`);
      const result = await discoverUrlsFromSitemaps(baseUrl, sitemapDepth);
      sitemapUrls = result.urls;
      sitemapsFound = result.sitemapsFound;
      console.log(`Sitemap discovered ${sitemapUrls.length} candidate URLs from ${sitemapsFound} sitemaps`);
    } catch (e) {
      console.log('Sitemap discovery failed, falling back to map + hardcoded paths:', e);
    }

    // Step 2: Use Firecrawl Map API to augment URL discovery
    let mapDiscoveredUrls: string[] = [];
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
          search: 'contact about team email support legal privacy',
          limit: 60,
          includeSubdomains: false,
        }),
      });
      const mapData = await mapResp.json();
      if (mapResp.ok && mapData.success && Array.isArray(mapData.links)) {
        mapDiscoveredUrls = mapData.links.filter((u: string) => CONTACT_URL_HINTS.test(u));
        console.log(`Map discovered ${mapDiscoveredUrls.length} relevant pages from ${mapData.links.length} total`);
      }
    } catch (e) {
      console.log('Map API failed, continuing with sitemap + hardcoded paths:', e);
    }

    // Step 3: Merge sources, dedupe, apply include/exclude filters, then prioritize
    const hardcodedUrls = EMAIL_PAGES.map((p) => `${baseUrl}${p}`);
    const allUrls = new Set([baseUrl, ...sitemapUrls, ...mapDiscoveredUrls, ...hardcodedUrls]);
    const sitemapSet = new Set(sitemapUrls);

    // Apply include/exclude path filters
    let filteredUrls = Array.from(allUrls);
    if (includePaths.length > 0) {
      filteredUrls = filteredUrls.filter((u) => includePaths.some((p) => u.toLowerCase().includes(p.toLowerCase())));
    }
    if (excludePaths.length > 0) {
      filteredUrls = filteredUrls.filter((u) => !excludePaths.some((p) => u.toLowerCase().includes(p.toLowerCase())));
    }

    const prioritizeUrl = (url: string) => {
      if (url === baseUrl) return -1; // Homepage ALWAYS first — many single-page sites put contact in footer
      if (sitemapSet.has(url) && /contactus\.html/i.test(url)) return 0;
      if (sitemapSet.has(url) && /contact|email|support/i.test(url)) return 1;
      if (sitemapSet.has(url) && /about|team|staff|people|legal|privacy/i.test(url)) return 2;
      if (/contactus\.html/i.test(url)) return 3;
      if (/contact|email|support/i.test(url)) return 4;
      if (/about|team|staff|people|legal|privacy/i.test(url)) return 5;
      return 6;
    };

    // Filter out already-crawled URLs
    const { data: alreadyCrawled } = await supabase
      .from('crawled_urls')
      .select('url')
      .eq('user_id', user.id)
      .in('url', filteredUrls.slice(0, 200));

    const crawledSet = new Set((alreadyCrawled || []).map((r: any) => r.url));
    const uncrawledUrls = filteredUrls.filter((u) => !crawledSet.has(u));
    // Always keep homepage even if crawled before (contact info can change)
    if (!uncrawledUrls.includes(baseUrl) && filteredUrls.includes(baseUrl)) {
      uncrawledUrls.unshift(baseUrl);
    }

    const urlsToScrape = uncrawledUrls
      .sort((a, b) => prioritizeUrl(a) - prioritizeUrl(b) || a.length - b.length)
      .slice(0, maxPages);

    console.log(`[v2] ${filteredUrls.length} candidates, ${crawledSet.size} already crawled, scraping ${urlsToScrape.length} new pages for ${company.name}`);

    // Scrape pages in parallel batches for speed
    let allContent = '';
    const scrapedPages: string[] = [];
    const regexExtractedEmails: Array<{ email_address: string; context: string; source_url: string }> = [];
    let totalMailtoCount = 0;
    let totalRegexCount = 0;

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
            waitFor: 2000, // Wait for JS-heavy sites (Wix, Squarespace, etc.)
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
            // Priority 3: Spaced-out anti-scrape patterns ("sales @ ecmfl.com", "info [at] domain [dot] com")
            const spacedEmails: string[] = [];
            let spacedMatch;
            const spacedAtRe = new RegExp(SPACED_AT_REGEX.source, 'gi');
            while ((spacedMatch = spacedAtRe.exec(extractableText)) !== null) {
              spacedEmails.push(`${spacedMatch[1]}@${spacedMatch[2]}`.toLowerCase());
            }
            const spacedFullRe = new RegExp(SPACED_EMAIL_REGEX.source, 'gi');
            while ((spacedMatch = spacedFullRe.exec(extractableText)) !== null) {
              spacedEmails.push(`${spacedMatch[1]}@${spacedMatch[2]}.${spacedMatch[3]}`.toLowerCase());
            }
            if (spacedEmails.length > 0) console.log(`Page ${pageUrl}: found ${spacedEmails.length} spaced-out emails`);
            // Merge, dedupe, filter junk
            const allFound = Array.from(new Set([...mailtoEmails, ...regexEmails, ...spacedEmails]))
              .filter(e => !JUNK_EMAIL_PATTERNS.some(p => p.test(e)));
            console.log(`Page ${pageUrl}: found ${mailtoEmails.length} mailto + ${regexEmails.length} regex + ${spacedEmails.length} spaced → ${allFound.length} clean`);
            return { url: pageUrl, content: md.slice(0, 4000), foundEmails: allFound, mailtoCount: mailtoEmails.length, regexCount: regexEmails.length };
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
          totalMailtoCount += r.mailtoCount;
          totalRegexCount += r.regexCount;
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

    const buildDiagnostics = (emailsFound: number, aiCount: number) => ({
      sitemaps_found: sitemapsFound,
      sitemap_urls_discovered: sitemapUrls.length,
      map_urls_discovered: mapDiscoveredUrls.length,
      pages_scraped: scrapedPages.length,
      urls_scraped: scrapedPages,
      mailto_count: totalMailtoCount,
      regex_count: totalRegexCount,
      ai_count: aiCount,
      emails_found: emailsFound,
      mode: fast_mode ? 'Fast (regex only)' : 'Full (regex + AI)',
    });

    if (allContent.length === 0) {
      return new Response(
        JSON.stringify({ success: true, emails_found: 0, message: 'No content could be scraped', diagnostics: buildDiagnostics(0, 0) }),
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
        JSON.stringify({ success: true, emails_found: 0, message: 'No emails found on website', diagnostics: buildDiagnostics(0, aiEmails.length) }),
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
        diagnostics: buildDiagnostics(newEmails.length, aiEmails.length),
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
