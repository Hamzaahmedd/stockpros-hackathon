-- STAGED, NOT APPLIED. Row-level security for the shared workspace tables.
-- Do not move this into prisma/migrations until it has passed the isolation
-- checks in docs/row-level-security.md against a disposable database.
--
-- Contract with the application (src/shared/infrastructure/tenant-context.ts):
-- every transaction sets app.current_team_id (transaction-local). An unset
-- team is '' and NULLIF turns it into NULL, which matches no rows.

BEGIN;

-- Roles. Set the password out of band (never commit it).
--   app_user   : what the API connects as. Subject to RLS, no BYPASSRLS.
--   app_admin  : staff panel, webhooks, renewal and email jobs. Bypasses RLS.
-- Migrations keep running as the table owner / superuser.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user LOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin LOGIN BYPASSRLS;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON shared_watchlists, shared_screeners, shared_research_notes
  TO app_user, app_admin;

-- FORCE makes the policies apply to the table owner as well; without it the
-- owner silently bypasses RLS.
ALTER TABLE shared_watchlists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_watchlists      FORCE  ROW LEVEL SECURITY;
ALTER TABLE shared_screeners       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_screeners       FORCE  ROW LEVEL SECURITY;
ALTER TABLE shared_research_notes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_research_notes  FORCE  ROW LEVEL SECURITY;

CREATE POLICY team_isolation ON shared_watchlists
  USING      (team_id = NULLIF(current_setting('app.current_team_id', true), '')::uuid)
  WITH CHECK (team_id = NULLIF(current_setting('app.current_team_id', true), '')::uuid);

CREATE POLICY team_isolation ON shared_screeners
  USING      (team_id = NULLIF(current_setting('app.current_team_id', true), '')::uuid)
  WITH CHECK (team_id = NULLIF(current_setting('app.current_team_id', true), '')::uuid);

CREATE POLICY team_isolation ON shared_research_notes
  USING      (team_id = NULLIF(current_setting('app.current_team_id', true), '')::uuid)
  WITH CHECK (team_id = NULLIF(current_setting('app.current_team_id', true), '')::uuid);

COMMIT;
