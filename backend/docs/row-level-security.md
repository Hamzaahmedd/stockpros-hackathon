# Row-level security (staged, not applied)

Team workspaces are the tenants. Application code already filters every team
query by `teamId` (and `modules/teams/__tests__/tenant-isolation.test.ts`
proves it against an in-memory database). Row-level security (RLS) is the
database-enforced safety net behind that: if a query ever forgets its filter,
Postgres still refuses to return another workspace's rows.

Nothing here is active. `DATABASE_URL` is intentionally unset, so the SQL has
never been run. Treat it as unverified until step 3 below passes.

## What exists

| Piece | Where |
| --- | --- |
| Tenant-scoping helper (`applyTenantContext`, `runInTenantTransaction`) | `src/shared/infrastructure/tenant-context.ts` |
| Policies + roles for `shared_watchlists`, `shared_screeners`, `shared_research_notes` | `prisma/rls/001_shared_workspace_tables.sql` (rollback alongside) |

The helper sets `app.current_user_id` and `app.current_team_id` with
`set_config(..., true)`, which is transaction-local and therefore safe on a
pooled connection (including PgBouncer transaction mode). It is not yet called
by any service: with no policies, calling it would only add round trips.

## Turning it on (needs a disposable Postgres, e.g. local Docker)

1. `npm run db:sync` against the disposable database, then run
   `prisma/rls/001_shared_workspace_tables.sql` as the owner/superuser and set
   passwords for `app_user` and `app_admin`.
2. Move `modules/teams/workspace-service.ts` shared-asset queries onto
   `runInTenantTransaction(prisma, { userId, teamId }, tx => ...)`. Connect the
   API as `app_user`; connect the staff panel, Safepay webhooks, renewal and
   email jobs as `app_admin` (they cross tenants by design). Role URLs are
   secrets and belong in `.env`.
3. Integration checks as `app_user` (these are the only tests that prove RLS):
   - team A context reads zero of team B's rows;
   - an INSERT with team B's `team_id` under team A context fails;
   - an UPDATE/DELETE of a team B row affects 0 rows;
   - no context set returns 0 rows (and does not error);
   - the same queries as the table owner are also filtered (`FORCE` works).
4. Only then copy the SQL into a Prisma migration (see `docs/migrations.md`;
   migrations are not adopted yet) and extend to the remaining team tables.

## Known limits

- Queries on the plain `prisma` client carry no tenant. Once policies are on,
  every access to a protected table must go through the helper.
- `team_invites` is deliberately excluded: an invitee has no team yet and is
  looked up by token.
- `payment_transactions` / `credit_ledger` (readable by `user_id` or
  `team_id`) and the `user_id`-scoped personal tables need their own policies.
