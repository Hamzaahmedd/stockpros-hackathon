-- Undo 001_shared_workspace_tables.sql (roles are left in place).
BEGIN;
DROP POLICY IF EXISTS team_isolation ON shared_watchlists;
DROP POLICY IF EXISTS team_isolation ON shared_screeners;
DROP POLICY IF EXISTS team_isolation ON shared_research_notes;
ALTER TABLE shared_watchlists     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE shared_watchlists     DISABLE ROW LEVEL SECURITY;
ALTER TABLE shared_screeners      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE shared_screeners      DISABLE ROW LEVEL SECURITY;
ALTER TABLE shared_research_notes NO FORCE ROW LEVEL SECURITY;
ALTER TABLE shared_research_notes DISABLE ROW LEVEL SECURITY;
COMMIT;
