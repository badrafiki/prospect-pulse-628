

## Plan: Company Detail Page + Export Page

### 1. Create Company Detail Page (`src/pages/CompanyDetailPage.tsx`)

New route `/companies/:id` that displays a full company profile:

- **Header section**: Company name, domain, website link, LinkedIn link, status selector, confidence score
- **Summary & metadata**: Summary text, industries badges, locations, products/services
- **Notes section**: Editable textarea that saves to `companies.notes` column
- **Emails tab/section**: List all linked emails with context badges and source URLs
- **People tab/section**: List all linked people with titles, LinkedIn links, confidence scores
- **Activity timeline**: Show created_at timestamps for the company, its emails, and people discoveries sorted chronologically

Navigation: Click company name in CompaniesPage table to link to `/companies/:id`. Back button to return.

### 2. Add Route in `src/App.tsx`

Add `/companies/:id` route pointing to `CompanyDetailPage`, wrapped in `ProtectedRoute`.

### 3. Update CompaniesPage Company Name to Link

Make the company name in the table a `<Link>` to `/companies/:id`.

### 4. Build Export Page (`src/pages/ExportPage.tsx`)

Replace the placeholder with functional CSV export:

- Fetch all non-archived companies with their emails
- Generate Mailchimp-compatible CSV with columns: `Email Address`, `Company Name`, `Website`, `Tags` (industries joined), `Notes`
- One row per email address (companies with multiple emails get multiple rows)
- Filter controls: status filter, "has emails only" toggle
- Download button that triggers browser CSV download
- Preview table showing what will be exported

### Technical Details

- No database changes needed -- all data already exists
- Company detail page uses `useParams()` to get company ID, fetches company + emails + people via three parallel Supabase queries
- Notes update uses `supabase.from("companies").update({ notes })` with debounce or save button
- CSV generation uses client-side `Blob` + `URL.createObjectURL` for download
- Activity timeline merges and sorts `created_at` from company, emails, and people records

