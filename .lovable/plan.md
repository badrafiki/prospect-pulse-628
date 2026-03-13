

## Problem

You have 1000 companies and 388 emails, but the Export page (and other pages) are silently capped at **1000 rows** by the default Supabase query limit. Since you have exactly 1000 companies, any that would be row 1001+ are silently dropped. The same risk applies to emails as the count grows.

Additionally, the Export page defaults `hideContacted` to `true`, which filters out all companies with status "Contacted" -- many of your companies have this status.

## Plan

### 1. Fix the 1000-row query cap across all pages

Add a paginated fetch helper that loops with `.range()` calls to fetch all rows. Apply it to these queries:

- **ExportPage.tsx** -- companies, emails, people queries
- **CompaniesPage.tsx** -- companies, emails, people queries  
- **PeoplePage.tsx** -- people, companies, emails queries
- **Dashboard.tsx** -- already uses `count: "exact", head: true`, so no issue here

The helper will look like:

```typescript
async function fetchAll(query) {
  const PAGE = 1000;
  let all = [], from = 0;
  while (true) {
    const { data } = await query.range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}
```

Since Supabase's `.range()` requires calling the builder fresh each time, I'll restructure each fetch to loop until all rows are retrieved.

### 2. Change `hideContacted` default to `false`

On the Export page, change the initial state of `hideContacted` from `true` to `false` so all non-archived companies are shown by default. Users can still toggle it on.

### Files changed
- `src/pages/ExportPage.tsx` -- paginated fetch + default change
- `src/pages/CompaniesPage.tsx` -- paginated fetch
- `src/pages/PeoplePage.tsx` -- paginated fetch
- `src/lib/supabaseHelpers.ts` (new) -- shared `fetchAllRows` utility

