
-- Drop existing foreign keys (they may exist without cascade)
ALTER TABLE emails DROP CONSTRAINT IF EXISTS emails_company_id_fkey;
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_company_id_fkey;
ALTER TABLE search_results DROP CONSTRAINT IF EXISTS search_results_company_id_fkey;

-- Re-add with ON DELETE CASCADE
ALTER TABLE emails ADD CONSTRAINT emails_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE people ADD CONSTRAINT people_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE search_results ADD CONSTRAINT search_results_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
