

## Workflow Issues Identified

1. **Companies page**: No indicator for people count per company — after "Find People", there's no visible result
2. **Companies page**: No delete functionality — can't remove companies, and orphaned emails/people would remain
3. **People page**: Completely disconnected — no link back to company, no way to delete, static data load
4. **Export page**: No context — doesn't explain where data comes from, no people export, no link to source companies
5. **Dashboard**: Static snapshot — no link between stats and actionable views
6. **No cascade deletes**: Deleting a company leaves orphaned emails and people in the database
7. **No real-time refresh**: Navigating between tabs shows stale data

## Plan

### 1. Add cascade delete via database migration
- Add `ON DELETE CASCADE` foreign key constraints from `emails.company_id` and `people.company_id` to `companies.id`, so deleting a company automatically removes its emails and people

### 2. Add delete company functionality to CompaniesPage
- Add a "Delete" bulk action button in the action bar
- Confirmation dialog before deleting
- After delete, selected companies + their emails/people are removed (cascade handles DB side)

### 3. Add people count column to CompaniesPage
- Fetch people counts alongside emails on page load
- Show a `Users` badge (like the email badge) showing how many people were found per company
- Expand row to show people list alongside emails

### 4. Improve PeoplePage connectivity
- Make company name a clickable link to `/companies/:id`
- Add delete capability for individual people
- Show email addresses associated with each person's company inline

### 5. Improve ExportPage clarity and connectivity
- Add explanatory text about what's being exported and where data comes from
- Include people data in export (columns: Person Name, Title, LinkedIn)
- Make company names link to `/companies/:id`
- Add a "has emails" / "has people" toggle filter

### 6. Add delete individual company on CompanyDetailPage
- Add a delete button with confirmation
- Navigates back to `/companies` after deletion

### 7. Refresh data on navigation
- Add a `key` or refetch trigger so that navigating back to Companies/People/Export tabs always loads fresh data (use `useLocation` or a simple refetch on mount pattern)

### Technical Details

**Database migration SQL:**
```sql
-- Add foreign keys with cascade delete
ALTER TABLE emails
  ADD CONSTRAINT emails_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE people
  ADD CONSTRAINT people_company_id_fkey
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
```

**Files to modify:**
- `supabase/migrations/` — new migration for cascade FKs
- `src/pages/CompaniesPage.tsx` — add People column, delete action, expand people in row
- `src/pages/PeoplePage.tsx` — add company links, delete button
- `src/pages/ExportPage.tsx` — add context text, people export option, company links
- `src/pages/CompanyDetailPage.tsx` — add delete button
- All data pages get refetch-on-mount to ensure fresh data

