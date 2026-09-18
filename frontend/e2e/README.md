# E2E Smoke Tests

Two frontend-only Playwright smoke tests, deliberately scoped to need **no backend
process and no database** in CI:

- `login.spec.ts` — `/login` renders the magic-link form with no console errors.
- `not-found.spec.ts` — an unknown route renders the `NotFound` page and its
  "Back to Login" link works.

## Why no backend/auth in these tests

Login here is passwordless (magic-link email or Google OAuth). Magic-link tokens
are stored hashed-only in the database, so there's no way to fetch a usable
token directly, and there's no existing test-only auth bypass. A real
authenticated E2E test (e.g. "dashboard loads after login") would require
building a new test-only backend shortcut to mint a session, plus running
Postgres and Redis in CI — a deliberate scope decision to skip for now.

`e2e/mocks.ts`'s `mockLoggedOut` stubs `POST /auth/refresh-token` — the one
call `useAuth`'s mount-time `fetchMe()` makes when there's no stored access
token — with a 200 response containing no `accessToken`. That's a genuine
"not logged in" response, not an error, so `fetchMe` resolves straight to
`setUser(null)` without ever calling `/auth/me` or `/rbac/user-screens`, and
without the browser logging a "Failed to load resource" console error the
way a real (or mocked 401) failure against an absent backend would — this is
also why `login.spec.ts` can safely assert on zero console errors.

## Running locally

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

`playwright.config.ts`'s `webServer` builds the app and serves it via
`vite preview` on port 4173 — tests run against the real production build.
