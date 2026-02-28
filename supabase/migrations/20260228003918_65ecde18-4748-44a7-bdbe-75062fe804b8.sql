
-- Delete duplicate companies, keeping the oldest one per (user_id, domain) where domain is not null
DELETE FROM companies
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, domain) id
  FROM companies
  WHERE domain IS NOT NULL
  ORDER BY user_id, domain, created_at ASC
)
AND domain IS NOT NULL
AND id NOT IN (
  SELECT DISTINCT ON (user_id, domain) id
  FROM companies
  WHERE domain IS NOT NULL
  ORDER BY user_id, domain, created_at ASC
);

-- Add unique constraint to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS companies_user_domain_unique ON companies (user_id, domain) WHERE domain IS NOT NULL;
