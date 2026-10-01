<p align="center">
  <img src="frontend/public/stockpros-logo.png" alt="StockPros" width="220" />
</p>

<h1 align="center">StockPros</h1>

<p align="center">
  AI-powered stock forecasting, portfolio analytics, and decision-support platform.
</p>

---

## Architecture

StockPros is a monorepo with three services:

| Service        | Stack                                               | Purpose                                          |
| -------------- | --------------------------------------------------- | ------------------------------------------------ |
| **Frontend**   | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui | Interactive dashboards, charts, and real-time UI |
| **Backend**    | Node.js, Express 5, Prisma, PostgreSQL, Redis       | REST API, auth, market data, background jobs     |
| **AI Service** | Python 3.11, FastAPI, TensorFlow, scikit-learn      | ML-powered time-series stock forecasting (GRU)   |

The backend follows a **modular monolith** pattern — a single deployable process composed from independent business modules with enforced boundary rules. See [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) for details.

### System Architecture

```mermaid
flowchart LR
    %% Styling
    classDef client fill:#1e3a5f,stroke:#3b82f6,stroke-width:2px,color:#e2e8f0;
    classDef backend fill:#1a2e1a,stroke:#22c55e,stroke-width:2px,color:#e2e8f0;
    classDef ai fill:#2d1b4e,stroke:#a855f7,stroke-width:2px,color:#e2e8f0;
    classDef storage fill:#3b1f00,stroke:#f97316,stroke-width:2px,color:#e2e8f0;
    classDef external fill:#1f1f1f,stroke:#64748b,stroke-width:2px,color:#cbd5e1;

    %% Components
    FE["Frontend (React + Vite)<br/>• Tailored Dashboards<br/>• Real-time Tickers"]:::client

    subgraph CoreBackend["Core Backend (Node.js / Express 5)"]
        BE["API & Business Logic<br/>(11 Domain Modules)"]:::backend
        WS["Socket.IO Server<br/>(Real-time Push)"]:::backend
        WRK["BullMQ Workers<br/>(Cron & Async Tasks)"]:::backend
    end

    AI["AI Service (FastAPI)<br/>• GRU Neural Network<br/>• Stock Price Predictions"]:::ai

    subgraph Data["Persistence & Cache"]
        DB[("PostgreSQL<br/>Users, Portfolios, News")]:::storage
        REDIS[("Redis<br/>Cache & Job Queue")]:::storage
    end

    subgraph ThirdParty["External Services"]
        EXT["Market Data Feeds<br/>(Finnhub, Polygon, FMP)"]:::external
        EMAIL["Email (Resend)"]:::external
    end

    %% Connections
    FE <-->|REST & WSS| CoreBackend
    CoreBackend -->|Inference Req| AI
    CoreBackend --> DB
    CoreBackend <--> REDIS
    CoreBackend <--> EXT
    WRK --> EMAIL
    AI <--> REDIS
```

<details>
<summary><b>Click to view Deep-Dive Architectural Diagram & Details</b></summary>

<br/>

<p align="center">
  <img src="docs/architecture.svg" alt="StockPros Detailed System Architecture Diagram" width="100%" />
</p>
<p align="center">
  <sub><i>Tip: Click <a href="docs/architecture.svg" target="_blank">here for interactive full-res vector SVG</a> or view the <a href="docs/architecture.png" target="_blank">4K PNG</a></i></sub>
</p>

#### Key Architectural Patterns

- **Modular Monolith**: Node.js backend separated into domain modules with enforced boundary checks (`npm run architecture:check`): modules talk only through each other's `index.ts`/`public.ts`, and the `shared/` layer may not import any module (module collaborators, e.g. the Socket.io server's market feed and alert evaluator, are injected from `src/index.ts`).
- **Event-Driven & Decoupled Workers**: BullMQ queues handle email notifications and asynchronous alert tasks.
- **Session-Bound Access Tokens**: every access token carries the id of its session (`sid`), and the auth middleware (and the Socket.io handshake) validate that session on each request, so logout, breach response and staff "invalidate sessions" take effect on the very next call instead of when the token expires. Tokens minted before this change are still honoured for one access-token lifetime (see `resolveLegacyUser` in `backend/src/modules/auth/middleware.ts`, to be deleted afterwards).
- **Real-Time Streaming**: Finnhub WebSocket trades streamed via Socket.io directly to connected clients.
- **Shared Runtime State**: rate limiters use Redis whenever it is connected (chosen per request, falling back to memory), and the emergency market halt is synced across instances through Redis (`shared/infrastructure/emergency-sync.ts`).
- **AI Proxy Pattern**: Python FastAPI service isolates heavy GRU ML inference and caching behind the backend.
- **Multi-Tier Caching**: In-memory and Redis TTL caching for stock quotes, logos, and ML forecasts.

</details>

### Data Flow Summary

| Flow             | Path                                                                      |
| ---------------- | ------------------------------------------------------------------------- |
| **Live Prices**  | Finnhub WSS → FinnhubService → PriceCache → Socket.io → Browser           |
| **REST Quotes**  | Browser → Backend → Yahoo Finance REST → Response                         |
| **Alert Firing** | Finnhub trade tick → AlertEvaluator → Socket.io room + Email queue        |
| **AI Forecast**  | Browser → Backend `/api/forecast` → FastAPI GRU model → cached prediction |
| **News Ingest**  | NewsCron (\*/15 min) → Polygon.io → PostgreSQL                            |
| **Auth**         | Browser → `/api/auth` → JWT cookies / Google OAuth 2.0                    |
| **Email**        | Alert/Auth event → BullMQ → EmailWorker → SMTP / Resend                   |

## Features

- **Authentication** — JWT sessions, magic-link login, Google OAuth, optional WhatsApp OTP phone verification for Pakistani (+92) numbers via SendPK
- **Real-Time Market Data** — Live quotes via Finnhub WebSocket, historical data from Polygon.io, Twelve Data, FMP, and Yahoo Finance
- **AI Forecasting** — GRU-based time-series predictions with evaluation metrics (MSE, RMSE, MAE), exportable as CSV or PDF reports
- **Dashboard** — Portfolio summary, market overview, and activity feeds
- **Decision Support** — Per-stock buy/sell/hold recommendations with confidence scores, risk levels, and exposure analysis
- **Watchlist** — Track symbols with AI-suggested entry, take-profit, and stop-loss levels; configure 12 alert types (price, percentage, earnings, analyst changes, SEC filings, etc.)
- **News Aggregation** — Multi-source articles with sentiment analysis, category classification, read tracking, and bookmarks
- **Notifications** — Persisted market-interest and delivery preferences; users can independently control in-app alerts, email volatility alerts, and the weekday pre-market digest
- **Role-Based Access Control** — Admin, Portfolio Manager, and Analyst roles with screen-level CRUD permissions
- **Search** — Symbol and company lookup
- **Free/Pro Plan Tiers** *(off by default, see below)* — self-serve `/plans` page and `POST /api/v1/auth/plan`; Free is capped on AI forecasts (1/day), decision support (watchlist symbols only), watchlist size (10 symbols), portfolios (1), and real-time quotes (15-min delayed); Pro is unlimited on watchlist size, portfolios and real-time quotes, and includes 300 AI signals (forecasts + market decisions) per billing cycle, after which each extra signal is paid from prepaid credits (see the Team/credits bullet below). Gating runs in parallel to RBAC, toggled per-environment by `config.features.pricingTiersEnabled` (`backend/src/config/{development,production,test}.ts`) — off, the app behaves exactly as RBAC-only; on, tier checks replace RBAC checks for these customer-facing routes only (admin/RBAC-management endpoints are unaffected either way)
- **Safepay Payments & Subscription Renewal** *(off by default, see below)* — Pro tier (Rs 5,999/mo) checkout via Safepay's hosted page (JazzCash, Easypaisa, and cards), confirmed asynchronously via a signed webhook (`POST /api/v1/payments/safepay/webhook`, `x-sfpy-signature` HMAC-SHA512). Toggled independently of pricing tiers by `config.features.enablePaymentProcessor` — off ("Bypass Mode"), upgrading to Pro calls `POST /api/v1/auth/plan` directly with no payment step; on ("Payment Mode"), upgrading redirects to Safepay checkout and the plan only changes once the webhook confirms payment. Each PRO checkout (card or wallet) opens a 30-day billing cycle tracked on a `Subscription` row (`GET/POST /api/v1/payments/subscription*`): card subscriptions default to auto-renew on (toggleable); wallet subscriptions (JazzCash/Easypaisa) are always a manual 30-day pass, since neither wallet supports recurring charges. A daily job (`config.features.enableSubscriptionCron`) emails a renewal reminder 3 days before the period ends, then — if unrenewed — moves the subscription into a 2-day grace period before downgrading back to Free. CARD checkout uses Safepay's Plan-based recurring-subscription product (a pre-created merchant-dashboard "Pro Monthly" Plan, `SAFEPAY_PRO_PLAN_ID`): the customer authorizes once and Safepay itself bills the card each cycle, notifying the app via `payment.succeeded`/`payment.failed` webhooks that extend the period or move the subscription into grace, respectively; toggling auto-renew off/on pauses/resumes the Safepay subscription accordingly. **This recurring-card integration is built against Safepay's published SDKs but has not been verified against their live API** — endpoint paths and webhook field names are best-effort (see doc comments in `backend/src/modules/payments/client.ts`); it is fully exercised and deterministic in mock mode (`config.safepay.mockProvider`) but should be confirmed against Safepay's sandbox before relying on it in production.
- **Team Workspaces, Seats & Prepaid Credits** *(same two flags as above)* — a `TEAM` tier (Rs 7,499/seat/month, 2–150 seats; no Enterprise tier) under `/api/v1/teams` (`backend/src/modules/teams/`): create a workspace (`POST /teams`), add seats mid-term (`POST /teams/seats/add`), invite/accept/remove members, claim and DNS-TXT-verify a company domain (a verified domain with `restrictOrgCreation` blocks employees from creating a second workspace and points them to their org admin), workspace-wide AI `orgInstructions` (returned as `orgContext` on forecast and market-decision/radar responses — these endpoints have no LLM system prompt to inject into), workspace/personal preferences (personal overlays workspace defaults), per-member credit caps, shared watchlists/screeners/research notes, `GET /teams/search`, and `GET /teams/analytics`. `POST /payments/create-checkout` accepts `plan: PRO | TEAM | TOPUP` (TEAM takes `seatCount` + `teamName`; TOPUP takes `packId` `PACK_500|PACK_1000|PACK_2500`); every price is derived server-side in integer paisa. In Payment Mode the team (or added seats / credits) is applied inside one DB transaction together with the PENDING→COMPLETED webhook transition, so duplicate Safepay deliveries return 200 without double-crediting; in Bypass Mode `POST /teams` and `/teams/seats/add` apply instantly. **Metering** (only when `pricingTiersEnabled`): FREE keeps its daily quotas; PRO gets 300 AI signals and each TEAM seat 375 (1.25×) per billing cycle (the subscription's `currentPeriodStart`, else the UTC calendar month), counted from `usage_events` for AI forecasts and market decision/radar calls. The quota check and the write (usage event, or spend-cap check + credit deduction + ledger row) run in one transaction under a per-user Postgres advisory lock, so a burst of parallel requests at the boundary cannot overshoot the quota, a member's spend cap, or the balance. Beyond that, the action is paid from prepaid credits (Rs 50/signal) — the user's balance for PRO, the shared team pool for members (subject to the member's `monthlyCreditLimitPaisa`) — with every movement in the append-only `credit_ledger`, else the API answers `403` with `errorCode: OVERAGE_REQUIRED` and `details.canTopUp`. `payment_transactions` and `credit_ledger` carry no foreign keys so the audit trail survives user/team deletion. Invite rows hold the invitee's email, so they are personal data: a daily job (`team-invite-cleanup`, 07:30, alongside the subscription job under `config.features.enableSubscriptionCron`) deletes invites past their expiry, and deleting an account removes any invites addressed to that email; logs record counts only, never addresses. **Logging & PII:** email addresses and phone numbers do not appear in log lines — the mail workers log job / subscription / invite / team ids (the magic-link job has no user id, so only its job id), and the logger scrubs any address or E.164 number that still ends up in a message or field (including provider errors such as "550 <user@x.com> rejected"); the dev-only "inbox" printout (subject and body, so a magic link can be copied locally) is limited to `NODE_ENV=development` and never shows the recipient. Email job payloads read back from Redis are validated with zod (http(s)-only links, known roles/variants) instead of being cast, and a malformed job fails permanently without retries. Team subscriptions are **manual-renewal** (`POST /payments/subscription/renew?scope=TEAM`): Safepay's recurring Plan is fixed-price and cannot bill per-seat, so `auto-renew` with `scope: TEAM` only records a flag; the daily job sends the owner a reminder, then a 2-day grace period, after which the workspace is cancelled and members return to PRO (if they hold a live personal subscription) or FREE. TEAM members are flagged `X-Queue-Priority: HIGH` during the NYSE open/close spike windows (first and last 30 minutes of the session, ET; `backend/src/shared/utils/market-hours.ts` knows the NYSE holiday calendar — New Year's, MLK, Presidents', Good Friday, Memorial, Juneteenth, Independence, Labor, Thanksgiving and Christmas, with weekend-observed shifts — and the 13:00 early closes, so weekends, holidays and closed hours are never flagged). Compute-heavy routes (`GET /forecast`, `GET /decision-support/market/decision/:symbol`, `GET /decision-support/market/radar`) sit behind an in-memory priority limiter (`backend/src/shared/middlewares/priority-queue.ts`, no extra dependency): a flagged Team request is admitted ahead of standard traffic (tier 1 vs 10, FIFO within a tier). It runs after quota/credit checks, so rejected requests never hold a slot, and only the server-set team context counts — a client-sent `X-Queue-Priority` header is ignored. Under a surge, a request that waits longer than `maxWaitMs` or arrives when `maxQueueDepth` are already waiting is shed with `503`. Limits are per process and set in `backend/src/config/{development,production,test}.ts` (`priorityQueue.concurrency` / `maxQueueDepth` / `maxWaitMs`). Forecast and decision support dispatch no BullMQ jobs, so there is no job priority to set. All market-hours maths goes through `Intl.DateTimeFormat` with the explicit `America/New_York` zone (never host-local hours), so EDT/EST changes do not shift the 09:30 open or 16:00 close and results do not depend on the server's TZ. **Ops kill-switch:** `EMERGENCY_MARKET_CLOSED=true` (`config.market.emergencyClosed`, listed in `backend/.env.example`) makes `isNyseMarketOpen()` and `isMarketSpikeWindow()` return `false` regardless of the calendar, for unscheduled exchange halts; it only seeds the initial state at boot (accepts only true/false/1/0; a typo fails startup instead of silently meaning "open"). The live state is an in-memory switch — `isEmergencyClosed()` / `setEmergencyClosed(boolean)` in `market-hours.ts` — so it can be flipped at runtime without a restart (every change is logged; an admin endpoint can call it). It lives in the process's memory, which is right for the app's single-instance deployment (running several instances would need the change broadcast to each). The queue sheds a request after `priorityQueue.maxWaitMs` = 20 s; the frontend HTTP client applies a 40 s timeout to `GET /forecast`, `/market/decision/:symbol` and `/market/radar` (`frontend/src/shared/api/timeouts.ts`), i.e. the queue wait plus 20 s of compute headroom — change the two together. Every unexpired invite reserves a seat: `POST /teams/invites` counts active members + unexpired pending invites against `seatCapacity` under a team-row lock (accepting an invite takes the same lock), so simultaneous admins cannot issue more live links than free seats. `POST /teams/invites` also queues an invite email (`team-invite` job on the existing email queue, with the queue's retries/backoff) and still returns the link plus `emailQueued`; `GET /teams/members` lists members (emails and credit limits are admin-only). **Frontend:** team members see the workspace's AI instructions as a "Workspace guidance" banner on Forecast, Market Analysis and Opportunity Radar; the workspace page also has Search (shared assets + members' saved AI decisions), Preferences (personal overrides and, for admins, workspace defaults; choosing the default option clears the override) and, for admins, a Credits tab with the pool's history; Settings has display preferences for everyone and a Credits tab (your own history, `GET /payments/credits/ledger`) for Pro/Team. **Quota meter:** `GET /api/v1/payments/me/usage` returns the caller's signals used / included for the current cycle (same window and counting as enforcement), the credit pool that pays beyond it (own balance for Pro, shared pool for team members) with whether they may top it up, and any personal spend cap; the UI shows it with a Top up credits button on Settings → Credits, Manage Subscription and the workspace Overview. It is hidden for FREE users (daily quotas apply) and while pricing tiers are not enforced, and the Top up button is disabled with an explanation when online payments are off (there is no checkout to send them to). Only the theme is applied by the UI today — chart layout and indicators are stored for charts that support them. The Plans page shows the Team tier with a 2–150 seat selector; `/teams` (alias `/settings/team`) is the workspace panel (overview + seat gauge, add seats, credits/renewal, org instructions, analytics, members and credit limits, invites, domain DNS verification, shared watchlists/screeners/notes) and appears in the sidebar as "Workspace" for `plan === 'TEAM'`; `/teams/invite?token=…` accepts an emailed invite; any `403 OVERAGE_REQUIRED` with `canTopUp` opens a credit top-up dialog app-wide (members without top-up rights get a toast asking an admin). **Known gaps:** the priority limiter and the emergency flag are in-memory, which suits the single-instance deployment (they would need a shared store if the app were ever scaled out); the invite link works when opened signed out: `/teams/invite?token=…` (alias `/teams/invites/accept`) parks the token in `sessionStorage` (`pending_invite_token`, with a 24h `localStorage` fallback because a magic link opens in a new tab), and once the user has finished signing in the app accepts it automatically and opens `/teams`; an invite that fails is attempted once and cleared. No new environment variables or secrets were introduced; the webhook keeps its verified HMAC-SHA512 scheme.
- **Internal Staff Ops Panel** *(tier-based workflow only — `pricingTiersEnabled: true`)* — a back-office under `/api/v1/admin` (`backend/src/modules/admin/`) and `/admin` in the UI. While the flag is off every admin route answers `403 FORBIDDEN_FEATURE_DISABLED` and the UI route redirects away. Access is by `User.platformRole` (read from the DB on every request): `SUPPORT_AGENT` (read-only search, webhook/usage/queue inspection, audit log), `PLATFORM_ADMIN` (credit adjustments in whole paisa via `amountPaisa`, domain force-verify, subscription extensions, seat-capacity overrides beyond 150 which also clear any scheduled seat reduction, force-remove member, webhook retry) and `SUPER_ADMIN` (everything, plus plan overrides, session invalidation and the in-memory emergency market halt). Every write needs a `reason` (min 10 chars) plus an optional support-ticket reference (`ticketRef`, e.g. `SUP-1234`; mandatory when `config.admin.requireTicketRef` is on, which production enables, and format-checked whenever supplied) and appends one immutable `admin_audit_logs` row in the same transaction; customer email and name are masked in search results by default (`config.admin.maskCustomerPii`; provider webhook payloads are scrubbed too) and a staff member must request `POST /users/:id/reveal` with a reason and ticket to see them (audited as `CUSTOMER_DATA_REVEALED`; the UI hides them again after a minute); `GET /users/:id/timeline` gives support a newest-first history of one customer from transactional records only (payments, credit movements, sign-ins, workspace changes, staff actions: no product analytics, which live in PostHog); searches that return customer data (users, teams, webhooks, credit ledger) append a `CUSTOMER_DATA_VIEWED` row listing the returned ids (never the search text) and fail closed if that row cannot be written. There is deliberately no product-usage analytics view: that is PostHog's job, and the panel keeps only billing usage (`GET /billing/credit-ledger`) and queue health. In production every write (and every reveal) also needs a recent step-up check: the staff member requests a 6-digit code by email (`POST /admin/step-up/request`), verifies it (`/admin/step-up/verify`; 5 attempts, 5-minute expiry), and then has `config.admin.stepUpWindowMinutes` (default 15) to act, a window that slides with each successful write; otherwise the API answers `403 STEP_UP_REQUIRED` and the panel prompts and retries automatically. Staff sessions also have an absolute lifetime (`config.admin.sessionMaxAgeHours`, 12 in production, not extended by refresh): past it the session is revoked and the API answers `401 STAFF_SESSION_EXPIRED`, which sends the panel back to sign-in. Admin routes are rate limited (120 requests/min per IP, 20 writes/min per staff member) and log identifiers only to Pino. Deleting a staff account resets its `platformRole` to `USER` and clears the IP addresses on its audit rows (the rows themselves are kept, keyed by user id). Downgrading a TEAM user via plan override removes them from their workspace, or is refused with 409 if they own it (transfer ownership first). Staff are created only with `npm run admin:grant -- <email> <ROLE>`. Caveat: the market halt is per-process memory, and webhook diagnostics read `PaymentTransaction` (webhooks rejected for a bad signature are never stored).
- **Team administration (modelled on Claude Team)** — roles are `OWNER` (exactly one, `Team.ownerId` — the primary owner), `ADMIN` and `MEMBER`. Every check goes through one permission table in `backend/src/shared/infrastructure/team-access.ts` (`can(role, TeamPermission.…)`; admins manage members, credits, billing and settings, only the owner changes roles, transfers ownership, deletes or exports), so Enterprise custom roles can later become data instead of code. Endpoints under `/api/v1/teams`: `PATCH /members/:userId/role` (ADMIN ↔ MEMBER, owner only), `POST /ownership/transfer` (target must be a seated, active member — a pending invite is refused — and the old owner stays on as admin), `POST /leave` (the owner must transfer first; admins can no longer remove themselves through `DELETE /members/:userId`), `GET /invites`, `DELETE /invites/:id`, `POST /invites/:id/resend`, `PATCH /` (rename), `DELETE /` (owner only, body `{ confirmName }` must equal the workspace name: the workspace is cancelled, auto-renew off, shared assets/invites/domains purged, **every `TeamMember` row deleted** so members can join another workspace, remaining credit forfeited; payments, the credit ledger and the audit log are kept — `Team.ownerId` is therefore not unique, and only an ACTIVE owned workspace blocks creating a new one; a renewal payment that lands after deletion is recorded but never revives the workspace), `GET /export` (owner-only JSON download: settings, members, domains, assets, paid transactions without gateway payloads, audit log; each section capped at 5,000 rows). **Billing admin:** `PATCH /teams/billing-contact` sets where renewal reminders and receipts go (falls back to the owner); `POST`/`DELETE /teams/seats/reduce` schedules a smaller seat count for the next renewal — nothing is refunded mid-term, renewal bills `max(scheduled, members + pending invites)` and the billed count becomes the capacity, and while a reduction is scheduled invites and invite acceptance are limited to the smaller count (`effectiveSeatCapacity`), so it cannot be outgrown before it lands; `GET /payments/team/transactions` and `GET /payments/team/transactions/:id/receipt` (owner/admin, always registered) list paid transactions and show a receipt with a reference such as `SP-2030-456789AB` (derived from the random tail of the transaction id) — the gateway payload and token are never returned; a receipt email (`payment-receipt` job on the existing email queue) goes to the billing contact after each completed team payment. **Audit log:** every admin action (invites, acceptances, removals, role changes, ownership transfers, setting/domain/credit-limit/billing changes, seat changes, workspace rename/delete/export, subscription expiry) is written to the append-only `team_audit_logs` table inside the same transaction as the action, carrying IDs and enum values only (no names, emails or instruction text), and is readable via `GET /teams/audit-log` (owner/admin, cursor-paginated, `action` filter; a cursor from another workspace is refused). **Tenant isolation tests:** `backend/src/modules/teams/__tests__/tenant-isolation.test.ts` (and its payments counterpart) run every team route as a user of workspace B against workspace A's data in an in-memory database that really applies each query's `where` (`backend/src/__tests__/fake-tenant-db.ts`); a guard fails the suite when a route is added without an isolation case. They prove the queries carry the right `teamId` filters — not that Postgres enforces isolation: no database is involved and Postgres row-level security is a planned follow-up. The Workspace page gains Billing (billing contact, scheduled seat reduction, receipts), Activity (audit log) and Settings (rename, transfer ownership, export, delete) tabs, role changes, pending-invite management and "Leave workspace". A lapsed (non-active) workspace keeps its member rows so a renewal can restore them, but that never traps anyone: accepting an invite or creating a workspace first releases the user's seat in a lapsed one (`releaseLapsedMembership`), and a renewal then restores only the members still attached. Schema changes are additive except `Team.ownerId` losing its unique constraint (apply with `npm run db:sync`).

## Tech Stack

<details>
<summary><strong>Frontend</strong></summary>

React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui (Radix UI) · TanStack React Query · Zustand · Recharts · Chart.js · Socket.io Client · React Hook Form + Zod · Lucide Icons · jsPDF

</details>

<details>
<summary><strong>Backend</strong></summary>

Express 5 · TypeScript · Prisma ORM · PostgreSQL · Redis (ioredis) · Socket.io · BullMQ · JWT + bcrypt · Helmet · Nodemailer / Resend / SendGrid · Zod · Yahoo Finance 2 · TechnicalIndicators

</details>

<details>
<summary><strong>AI Service</strong></summary>

FastAPI · Python 3.11 · TensorFlow / Keras · scikit-learn · ONNX Runtime · pandas · NumPy · Pydantic · Redis · Supabase

</details>

## Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **Python** 3.11
- **PostgreSQL** database
- **Redis** instance

### 1. Clone the repository

```bash
git clone https://github.com/Stock-App-Platform/StockPros_Hackathon.git
cd StockPros_Hackathon
```

### 2. Backend

```bash
cd backend
npm install
```

Create a `.env` file (see `backend/.env.example`) with the required variables:

```env
NODE_ENV=development
DATABASE_URL=postgresql://user:password@host:port/database_name?sslmode=require
REDIS_URL=redis://:password@host:port/db
ACCESS_TOKEN_SECRET=your_secure_secret_key
REFRESH_TOKEN_SECRET=your_secure_secret_key
GOOGLE_CLIENT_ID=your_google_oauth_client_id.apps.googleusercontent.com
CORS_ORIGINS=your_cors_origins
SMTP_USER=your_email@example.com
SMTP_PASS=email_password
FINNHUB_API_KEY=your_finnhub_api_key
FMP_API_KEY=your_fmp_api_key
TWELVE_DATA_API_KEY=your_twelve_data_api_key
POLYGON_API_KEY=your_polygon_api_key
RESEND_API_KEY=your_resend_api_key
GROQ_API_KEY=your_groq_api_key
AXIOM_TOKEN=your_axiom_token
POSTHOG_API_KEY=your_posthog_project_api_key
SENDPK_API_KEY=your_sendpk_api_key
SENDPK_TEMPLATE_ID=your_sendpk_template_id
SAFEPAY_API_KEY=your_safepay_api_key
SAFEPAY_SECRET_KEY=your_safepay_secret_key
SAFEPAY_WEBHOOK_SECRET=your_safepay_webhook_secret
```

Then push the schema to your database, generate the Prisma client, and start the dev server:

```bash
npm run db:sync
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create a `.env` file (see `frontend/.env.example`):

```env
VITE_API_URL=http://localhost:3000
VITE_HEALTH_CHECK_URL=http://localhost:3000/health
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
VITE_POSTHOG_KEY=your_posthog_project_api_key
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

```bash
npm run dev
```

### 4. AI Service

```bash
cd ai-service
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
```

Create a `.env` file:

```env
REDIS_URL=your_app_env
SUPABASE_URL=your_app_env
SUPABASE_KEY=your_app_env
TIINGO_API_KEY=your_app_env
APP_ENV=your_app_env
GITHUB_TOKEN=your_app_env
```

```bash
uvicorn app.main:app --host localhost --port 8000 --reload
```

Standalone maintenance scripts live in `ai-service/tools/`:

```bash
# Train a GRU model, convert to ONNX and upload to Supabase
python tools/train_script.py --symbol AAPL

# Manually convert an existing Keras model to ONNX
python tools/convert.py <input_model_path> <output_model_path>
```

## Scripts

| Service    | Command                         | Description                                              |
| ---------- | -------------------------------- | --------------------------------------------------------- |
| Backend    | `npm run dev`                    | Start with hot reload (nodemon)                            |
| Backend    | `npm run build`                  | Compile TypeScript for production                          |
| Backend    | `npm start`                      | Run production build                                       |
| Backend    | `npm test`                       | Run the Jest test suite                                    |
| Backend    | `npm run test:finnhub`           | Run the Finnhub live-streaming integration test in isolation |
| Backend    | `npm run typecheck`              | Type-check without emitting (`tsc --noEmit`)                |
| Backend    | `npm run lint`                   | Check formatting with Prettier                              |
| Backend    | `npm run architecture:check`     | Enforce module-boundary rules (`scripts/check-module-boundaries.cjs`) |
| Backend    | `npm run tsoa:spec`              | Regenerate `src/docs/generated/swagger.json` from the TSOA spec files |
| Backend    | `npm run admin:grant -- <email> <ROLE>` | Grant/revoke an internal staff `PlatformRole` (`USER`, `SUPPORT_AGENT`, `PLATFORM_ADMIN`, `SUPER_ADMIN`) |
| Backend    | `npm run rbac:seed`              | Seed default roles/permissions                              |
| Backend    | `npm run db:sync`                | Push the Prisma schema to the database and regenerate the client (throwaway/dev databases; see below for migrations) |
| Backend    | `npm run db:migrate:dev -- --name <change>` | Create and apply a reviewed SQL migration (prepared, not yet adopted; see `backend/docs/migrations.md`) |
| Backend    | `npm run db:migrate:deploy`      | Apply committed migrations in order (staging/production once adopted) |
| Backend    | `npm run db:migrate:status` / `db:migrate:check` | Show applied migrations / fail if the schema drifted from the migration history |
| Frontend   | `npm run dev`                     | Start Vite dev server                                       |
| Frontend   | `npm run build`                   | Production build                                            |
| Frontend   | `npm run preview`                 | Preview production build                                    |
| Frontend   | `npm run typecheck`               | Type-check without emitting                                 |
| Frontend   | `npm run lint`                    | Run ESLint (`any` is an error in `modules/admin` and `src/test`, a warning elsewhere) |
| Frontend   | `npm test`                        | Run Vitest unit/component tests (`npm run test:watch` to watch) |
| Frontend   | `npm run test:e2e`                | Run Playwright e2e specs (network mocked) |
| AI Service | `uvicorn app.main:app --reload`  | Start dev server                                             |
| AI Service | `python tools/train_script.py`   | Train a GRU model, convert to ONNX, upload to Supabase       |
| AI Service | `python tools/convert.py`        | Convert an existing Keras model to ONNX                      |

## Troubleshooting

- Verify all required environment variables are set (see the `.env` blocks above and each service's `.env.example`)
- Confirm Node.js, npm, and Python versions match the Prerequisites above
- Reinstall dependencies (`npm install` / `pip install -r requirements.txt`) if you see missing-module errors
- Confirm PostgreSQL and Redis are reachable at the URLs in your `.env` before starting the backend

## External Documentation

- [![Redis Docs](https://img.shields.io/badge/Stock%20app%20Redis%20Docs-Click%20Here-blue?style=for-the-badge)](https://docs.google.com/document/d/1IZPj7N5SekGWNFgJS-Vvx-aaZ41pE-WQCbRhi02nZuE/edit?usp=sharing) — Redis installation & setup on Windows (MSI installer method)

## License

Private — all rights reserved.