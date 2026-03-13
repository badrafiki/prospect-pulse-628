

# Plan: Directory Scraper Feature

## What the Site Has

Each shop listing on machinist.com has structured data:
- Company name, city, state
- Phone number, email address, website URL
- Capabilities, industries, certifications, materials

The shop finder page lists shops with links to individual detail pages like `/machine-shops/shop-name-city-st`. Each detail page contains contact info (address, phone, email, website).

## Approach

Build a "Directory Import" feature — a new page where you paste a directory URL (like the machinist.com shop finder), and the system:

1. **Crawls the directory** using Firecrawl's crawl API to fetch all pages
2. **Extracts structured data** using AI (Gemini) to parse company name, location, phone, email, website from each page's markdown
3. **Imports companies** into your database with contacts/emails attached
4. **Shows progress** as it processes batches

### New Edge Function: `scrape-directory`

- Accepts: `{ url, max_pages, filters? }`
- Uses Firecrawl crawl API with `includePaths: ["/machine-shops/"]` to only crawl detail pages (not pricing, privacy, etc.)
- For each crawled page, sends the markdown to Gemini to extract structured fields: `{ name, city, state, country, phone, email, website, capabilities[] }`
- Creates companies and emails in the database, skipping duplicates by domain
- Returns summary: total pages crawled, companies imported, emails found

### New Page: `src/pages/DirectoryImportPage.tsx`

- URL input field for the directory URL
- Settings: max pages to crawl (default 100, max 500), URL path filter
- Start button that invokes the edge function
- Progress display showing pages processed and companies imported
- Results summary with count of new companies and emails

### Routing & Navigation

- Add `/import` route in `App.tsx`
- Add "Directory Import" nav link in `AppLayout.tsx` sidebar

### Files to Create
- `supabase/functions/scrape-directory/index.ts` — edge function
- `src/pages/DirectoryImportPage.tsx` — UI page

### Files to Modify
- `src/App.tsx` — add route
- `src/components/AppLayout.tsx` — add nav link
- `supabase/config.toml` — register function

### Key Technical Details

- Firecrawl crawl API is async — it returns a job ID. We'll use the sync approach by polling the crawl status endpoint until complete.
- AI extraction uses `google/gemini-2.5-flash` via the Lovable API to parse each page's markdown into structured JSON.
- Duplicate prevention: checks `companies.domain` before inserting.
- The edge function processes everything server-side and returns final results, so the client just shows a loading state and then results.

