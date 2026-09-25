# Dev database (Neon)

The `dev` Neon branch never contains real production data — it's populated
entirely from synthetic fixtures. This keeps real user data (names, emails,
portfolio holdings) out of a lower-security environment, and means `dev`
never needs to be kept in sync with `prod` at all.

## One-time setup

1. In Neon's console, create a `dev` branch. It doesn't need to be a child
   of `prod` — nothing is ever reset or copied from `prod` into `dev`.
2. Point this repo's `DATABASE_URL` (in `backend/.env`, or your deploy
   environment's config) at the `dev` branch's connection string.
3. From `backend/`, run:
   ```
   npm run db:sync
   npm run rbac:seed
   npm run seed:dev-fixtures
   ```

## Re-running fixtures

`npm run seed:dev-fixtures` is safe to re-run any time — after a schema
change, after `db:sync`, or just to reset the fixture data back to its
known state. It's idempotent: existing fixture rows are upserted or
(for the one model with no unique constraint to upsert against) replaced
wholesale, never duplicated.

## What gets seeded

- 3 fixture users, one per existing role (`ANALYST` / `PORTFOLIO_MANAGER` /
  `ADMIN`), logging in via the normal magic-link flow:
  - `dev-fixture-analyst@stockpros.dev`
  - `dev-fixture-portfolio-manager@stockpros.dev`
  - `dev-fixture-admin@stockpros.dev`
- A watchlist (AAPL/MSFT/TSLA/NVDA) for the analyst and portfolio-manager
  fixture users.
- A portfolio with a few positions for the portfolio-manager fixture user.

Not seeded: `NewsArticle`/`Notification` data — those come from the app's
real news-ingestion job. A fresh `dev` branch will show an empty news feed
until that job runs against it.

## Logging in locally without real email delivery

Auth is passwordless (magic link). If SMTP/Resend isn't configured, the
backend logs the magic link to the console instead of emailing it — check
the server logs after requesting a login link for a fixture email above.
