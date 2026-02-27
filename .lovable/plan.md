
# Lead Discovery & Outreach CRM Platform

## Phase 1: Foundation
- **Enable Lovable Cloud** with database, auth, and edge functions
- **Set up authentication** with email/password login and user profiles
- **Connect Firecrawl** for web search and crawling capabilities
- **Enable Lovable AI** for company analysis and summarization

## Phase 2: Database Schema
- **Companies table**: name, website, domain, summary, products/services, industries (tags), locations, confidence score, status (New/Shortlisted/Contacted/Not a fit), source search term, notes
- **Emails table**: linked to company, email address, source URL, context (Sales/Support/General), validated flag
- **People table**: linked to company, full name, title, LinkedIn URL, source URL, confidence score, notes, status
- **Searches table**: search term, filters used, timestamp, results count
- **Search Results table**: links searches to companies

## Phase 3: Company Discovery (Search)
- Search form with primary term, country/region filter, industry focus, result limit (25/50/100)
- Edge function using **Firecrawl Search API** to find company websites
- Results displayed in a sortable, filterable table with status indicators
- Async processing with live status updates (Pending → Processing → Completed → Error)

## Phase 4: Website Analysis & AI Summaries
- Edge function using **Firecrawl Scrape** to crawl company websites (configurable page limit)
- Edge function using **Lovable AI** to generate: 2-4 sentence summary, product/service bullets, industry tags, location extraction, confidence score
- Inline editing of summaries, notes, and tags
- Status tracking per company with visual indicators

## Phase 5: Shortlisting & Bulk Actions
- Checkbox selection for individual and bulk company selection
- "Add to Shortlist" action
- Bulk action toolbar: Find Emails, Find LinkedIn, Add to CRM, Export
- Filter by status, tags, industry

## Phase 6: Email Discovery
- Edge function using **Firecrawl Scrape** to crawl /contact, /about, /team, /legal, /footer pages
- Edge function using **Lovable AI** to extract and categorize email addresses from crawled content
- Email syntax validation and deduplication
- Display emails with source page and context label

## Phase 7: LinkedIn & People Discovery
- Edge function using **Firecrawl Search** with `site:linkedin.com/company` queries to find company LinkedIn pages
- Edge function using **Firecrawl Scrape** on company team/leadership pages
- Edge function using **Lovable AI** to extract people names, titles, and LinkedIn profiles
- Configurable target roles (CEO, Sales Director, etc.)
- Confidence scoring and source attribution

## Phase 8: CRM Views
- **Companies view**: filterable table with all company data, inline status changes, tag management
- **People view**: linked to companies, filterable by role/company/status
- **Saved views**: user can save filter combinations (e.g. "High-fit manufacturing leads")
- **Detail pages**: full company profile with linked emails, people, notes, and activity

## Phase 9: Export
- CSV export with field selection
- Mailchimp-ready format (Email, Company Name, Website, Tags, Notes)
- People export (Name, Title, Company, LinkedIn, Tags)
- Export options: selected only, unique emails only, companies with ≥1 email

## Phase 10: Settings & Compliance
- User settings page: search limits, crawl depth, max pages per domain, excluded URL patterns, role priorities, confidence thresholds
- Compliance disclaimer banner in UI
- Source links shown for all extracted data
- Manual override/edit capability on all fields
