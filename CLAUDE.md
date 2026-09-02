# Repository Guidelines for AI Agents

## Tech Stack & Architecture
- **Backend:** Node.js, Express, TypeScript, Prisma (PostgreSQL / Supabase)
- **Logging & Observability:** Pino logger + @axiomhq/pino transport
- **Environment:** Node.js (production on Render free tier, development local)

## Build, Test & Lint Commands
- **Install:** `npm install`
- **Build:** `npm run build` (compiles TS to `dist/`)
- **Dev Server:** `npm run dev`
- **Type Check:** `npx tsc --noEmit`
- **Lint Check:** `npm run lint`

## Strict Coding & Security Rules
1. **Runtime Asset Checks:** Before loading runtime assets (like `swagger.json`), ALWAYS use `fs.existsSync` checks to prevent `MODULE_NOT_FOUND` crashes in production.
2. **Environment Feature Gating:** Gate developer-only endpoints (e.g., Swagger UI) behind `config.features` flags or strict `process.env.NODE_ENV !== 'production'` guards.
3. **PII & Secret Redaction:** NEVER log raw passwords, access tokens, `Authorization` headers, or API keys. Configure Pino's `redact` options or strip headers before logging.
4. **Audit Log Retention:** When deleting user accounts, purge personal identity data (PII) from primary databases, but retain immutable system/audit logs in Axiom (`user_id` only).
5. **No Code Blocking:** Avoid introducing heavy background collectors or blocking sync code that starves memory on constrained free tiers.

## Definition of Done
A task is complete ONLY when:
- `npx tsc --noEmit` passes without errors.
- New/modified features preserve existing error handling and redaction strategies.