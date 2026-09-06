# StockPros — Refined Project Description

> **AI-powered stock forecasting, portfolio analytics, and decision-support platform.**

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Feature Sections](#feature-sections)
   - [1. Authentication & Identity](#1--authentication--identity)
   - [2. Dashboard](#2--dashboard)
   - [3. Real-Time Market Data](#3--real-time-market-data)
   - [4. AI Forecasting](#4--ai-forecasting)
   - [5. Decision Support](#5--decision-support)
   - [6. Watchlist & Alerts](#6--watchlist--alerts)
   - [7. News Aggregation](#7--news-aggregation)
   - [8. Notifications](#8--notifications)
   - [9. Role-Based Access Control (RBAC)](#9--role-based-access-control-rbac)
   - [10. Search](#10--search)
4. [Technical Highlights](#technical-highlights)
5. [Data Flow Summary](#data-flow-summary)
6. [Tech Stack](#tech-stack)
7. [Deployment Targets](#deployment-targets)

---

## Overview

**StockPros** is a full-stack, AI-powered stock market intelligence platform built for serious investors and portfolio managers. It combines real-time market data, machine learning forecasting, rule-based decision support, and intelligent alerting into a single unified product — designed to help users not just track stocks, but make smarter, data-driven investment decisions.

The platform was built as a hackathon project with production-grade engineering standards: modular monolith backend, strict TypeScript across every layer, zero magic strings, Zod request validation, and enforced module boundary rules verified at CI time.

---

## System Architecture

StockPros is a **monorepo** with three independently deployable services:

| Service        | Stack                                                          | Role                                               |
| -------------- | -------------------------------------------------------------- | -------------------------------------------------- |
| **Frontend**   | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui            | Interactive dashboards, charts, real-time UI       |
| **Backend**    | Node.js, Express 5, Prisma, PostgreSQL, Redis                  | REST API, auth, market data, background jobs       |
| **AI Service** | Python 3.11, FastAPI, TensorFlow/Keras, ONNX, scikit-learn     | GRU-based ML stock price forecasting               |

The backend follows a **modular monolith** pattern — one deployable process composed of **10 isolated domain modules**:

```
auth · access-control · forecast · market · search
decision-support · watchlist · notifications · news · dashboard
```

Cross-module imports are enforced by `scripts/check-module-boundaries.cjs` — each module's `index.ts` is its only public API surface. Violations are rejected at build time.

### High-Level Data Flow

```
Browser  ←──REST & WebSocket──→  Backend (Express 5)  ──→  AI Service (FastAPI)
                                        │
                          ┌─────────────┼─────────────┐
                       PostgreSQL     Redis         External APIs
                      (Prisma ORM)  (BullMQ +     (Finnhub, Polygon,
                                     Cache)        FMP, Yahoo, Tiingo)
```

---

## Feature Sections

---

### 1. 🔐 Authentication & Identity

Secure, multi-method identity layer protecting every API route.

- **JWT Sessions** — short-lived access tokens + rotating refresh tokens, both stored in secure `HttpOnly` cookies. Token IDs (JTI) are tracked to support active session invalidation.
- **Magic-Link Login** — passwordless email login via a one-time signed token. The link is generated on the backend, queued through BullMQ, and delivered via the email worker.
- **Google OAuth 2.0** — social sign-in with automatic account provisioning and profile mapping.
- **Token Refresh** — seamless background token rotation without user interaction.
- **Onboarding Flow** — new users complete an onboarding step before gaining full platform access.
- **Auth Middleware** — every protected route verifies the access token, resolves `userId` and `roleId`, and attaches them to the request context.

---

### 2. 📊 Dashboard

A personalized, intelligence-first landing page that assembles real-time insights from multiple backend modules in a single API response.

#### Smart Briefing
- Time-aware greeting (morning / afternoon / evening) calibrated to Pakistan Standard Time.
- Summary of the latest decision support run: number of buy, hold, and trim signals, positions at risk, and a headline sentence.
- Portfolio alert block: overexposed sectors, active stop-loss breaches, and open entry zones.

#### Portfolio Health Score
- Composite score **0–100** broken into five weighted dimensions:
  - **Diversification** — penalty for sector concentration above the overexposure threshold.
  - **Risk-Reward** — ratio of profitable positions vs. underwater positions.
  - **Volatility** — derived from historical price swings across holdings.
  - **Alert Health** — proportion of watchlist items with at least one active alert configured.
  - **Watchlist Discipline** — proportion of watchlist items with defined entry and stop-loss targets.
- Final band: `Excellent` / `Good` / `Fair` / `Poor`.

#### Portfolio Summary Panel
- Total market value, total unrealized PnL (absolute + %), today's gain/loss (absolute + %).
- Best performer and worst performer of the day (symbol + change %).

#### Smart Triggers
- Auto-surfaced, prioritized action items pulled from watchlist and portfolio state:
  - `STOP_LOSS_BREACHED` — position price fell below stop-loss.
  - `ENTRY_ZONE` — watchlist symbol price entered the target entry range.
  - `EARNINGS_APPROACHING` — upcoming earnings date detected.
  - `DIVIDEND_APPROACHING` — upcoming dividend date.
  - `ANALYST_RATING_CHANGE` — upgrade or downgrade event.
  - `AI_SIGNAL_CHANGED` — the AI decision for a holding has flipped.
  - `PCT_CHANGE_UP` / `PCT_CHANGE_DOWN` — significant intraday price moves.
- Each trigger carries an **urgency level** (`HIGH` / `MEDIUM` / `LOW`), a human-readable message, context details, and a recommended action.

#### Sector Heatmap
- Per-sector performance across three windows: **1-day**, **5-day**, **1-month**.
- User's exposure % in each sector and a qualitative **sector signal**:
  - `OVEREXPOSED` · `BLIND_SPOT` · `WELL_POSITIONED` · `UNDERPERFORMING` · `NEUTRAL` · `NO_EXPOSURE`
- Cached in Redis with a configurable TTL to avoid re-fetching on every dashboard load.

#### Impact News
- Recent articles filtered to the user's holdings and watchlist symbols.
- Each article carries an impact type: `POSITIVE_HOLDING` / `NEGATIVE_HOLDING` / `POSITIVE_WATCHLIST` / `NEGATIVE_WATCHLIST`.
- Shows headline, sentiment, related symbol, shares held (if applicable), source, and publish time.

#### Trending Stocks
- Ranked list of the most-active market symbols enriched with logo, price, change %, open/high/low/previous close, and a **sparkline** of intraday price movement.

---

### 3. 📈 Real-Time Market Data

Multi-source, multi-tier market data pipeline powering live prices, historical charts, and company metadata.

- **Live Price Streaming** — Finnhub WebSocket connection maintained server-side. Trade ticks are fanned out via Socket.IO to authenticated browser clients subscribed to symbol rooms. Zero client-side polling required.
- **REST Quote Fallback** — Yahoo Finance REST for on-demand quote lookups when WebSocket data is unavailable.
- **Historical OHLCV Data** — candlestick data sourced from Polygon.io, Twelve Data, and FMP for charting and technical indicator computation.
- **Company Profiles & Logos** — fetched from Finnhub's `/stock/profile2` endpoint, cached in a multi-tier system (in-memory map + Redis TTL) to minimize API calls.
- **Ranked Most-Active Stocks** — FMP `/most-actives` endpoint, enriched with logos and sparklines, returned as the `trendingStocks` block on the dashboard.
- **Technical Indicators** — ATR, EMA, swing highs/lows, and resistance levels computed server-side using the `technicalindicators` library.

---

### 4. 🤖 AI Forecasting

A dedicated Python microservice hosts a **GRU (Gated Recurrent Unit) neural network** for time-series stock price prediction.

#### Model & Inference
- GRU model trained on historical OHLCV data sourced from the **Tiingo API**.
- Returns **three scenario tracks** per day in the forecast horizon: `bull`, `base`, and `bear` price predictions.
- Provides a **target range summary**: bull target, base target, bear target, ATR, and a confidence rating (`HIGH` / `MEDIUM` / `LOW`).

#### Caching & Async Training
- Predictions are **cached in Redis**. If a model is currently training or warming up, the API responds with HTTP `202 Accepted` and an `estimated_ready_at` timestamp so the client can poll gracefully.
- Repeated requests for the same symbol within the cache TTL return the cached result instantly.

#### Security & Integration
- The backend acts as a **secure AI proxy** — the frontend never calls the AI service directly; all requests are forwarded and authorized by the backend.

#### Reporting & Export
- Forecast results are **exportable as PDF reports** — generated server-side using a dedicated PDF generator with branding, chart tables, and metric summaries.
- Results are also exportable as **CSV files** for further analysis in external tools.
- Evaluation metrics reported alongside predictions: **MSE**, **RMSE**, **MAE**.

---

### 5. 🧠 Decision Support

A rules-based, multi-signal engine that produces actionable, per-position recommendations backed by live prices, historical volatility, and portfolio context.

#### Per-Symbol Analysis
Each symbol in the user's portfolio receives:
- **Market Decision** — `BUY` / `SELL` / `HOLD` based on technical and momentum signals.
- **Portfolio Decision** — `ADD` / `TRIM` / `EXIT` / `HOLD` based on portfolio weight and sector exposure context.
- **Confidence Score** — 0.0–1.0 floating point.
- **Risk Level** — `LOW` / `MEDIUM` / `HIGH`.
- **Reasoning** — a human-readable summary sentence + a bullet list of supporting signal details.

#### Exposure Analysis
- Position weight as a **% of total portfolio value**.
- **Sector exposure %** across all holdings in the same sector.
- **Overexposure flag** when exposure exceeds the configured threshold.

#### Action Guidance
- **Position strategy flags**: `add`, `hold`, `trim`, `exit`.
- Recommended **hold duration**.
- **Take-profit zone** and **stop-loss zone** string descriptors.
- **"Watch for"** — a list of forward-looking catalysts or risk events to monitor.

#### Radar Cards
Compact, structured trade setup cards for quick scanning:
- Entry range (low / high), bull target, stop-loss, ATR, time horizon, confidence label, and risk flags.

#### Position Sizer
Given capital and risk tolerance input:
- Recommended share count, risk per share, total risk $, potential gain $, risk/reward ratio, and % of capital consumed.

#### Portfolio Risk Metrics
- **Weighted portfolio beta** — market sensitivity of the full portfolio.
- **Portfolio Sharpe ratio** — risk-adjusted return measure.
- **Per-symbol breakdown** — beta, Sharpe, and annualized volatility for each holding.
- **Sector concentration table** — each sector's weight as a % of total portfolio value.

#### PDF Report
A full portfolio health report exportable as a branded PDF, containing the portfolio summary, per-position decisions, risk metrics, exposure tables, and action guidance blocks.

---

### 6. 👁️ Watchlist & Alerts

A sophisticated symbol-tracking system combining AI-computed price levels with a real-time, multi-type alert engine.

#### Watchlist Items
- Add any symbol with optional manual **target entry price**, **stop-loss level**, and freeform **notes**.
- Live price, intraday change %, and **price-since-added** delta displayed per item.
- **Entry Zone Flag** — live boolean indicating the current price is within the target entry range.
- **Stop-Loss Breach Flag** — live boolean indicating the price has fallen below the stop-loss.
- Company **logo** fetched and cached automatically.

#### AI-Suggested Price Levels
For each watchlist symbol, the server computes AI-suggested zones using technical indicators:
- **Entry price** — derived from EMA, ATR, and swing low analysis.
- **Take-profit** — derived from resistance levels and ATR multiples.
- **Stop-loss** — derived from ATR-based risk management.
- **Confidence** — `LOW` / `MEDIUM` / `HIGH` with a human-readable **basis** explanation.
- Zones are cached and re-computed on price drift > 2%.

#### Portfolio Fit
When viewing a watchlist item, the platform computes the **portfolio fit** impact:
- Current sector exposure % if the position is NOT added.
- Projected sector exposure % if the position IS added.
- **Overexposure warning** if the projected exposure exceeds the threshold.
- A descriptive message summarizing the fit assessment.

#### 12 Alert Types
Alerts can be configured for any watchlist symbol across twelve trigger types:

| Alert Type            | Description                                    |
| --------------------- | ---------------------------------------------- |
| `PRICE_ABOVE`         | Price exceeds a defined threshold              |
| `PRICE_BELOW`         | Price drops below a defined threshold          |
| `PERCENT_CHANGE_UP`   | Intraday gain exceeds a % threshold            |
| `PERCENT_CHANGE_DOWN` | Intraday loss exceeds a % threshold            |
| `EARNINGS_DATE`       | Upcoming earnings report date                  |
| `ANALYST_UPGRADE`     | Analyst rating upgraded                        |
| `ANALYST_DOWNGRADE`   | Analyst rating downgraded                      |
| `SEC_FILING`          | New SEC filing detected                        |
| `DIVIDEND_DATE`       | Upcoming dividend record/ex-date               |
| `VOLUME_SPIKE`        | Unusual trading volume detected                |
| `RSI_OVERBOUGHT`      | RSI crosses above the overbought threshold     |
| `RSI_OVERSOLD`        | RSI crosses below the oversold threshold       |

#### Real-Time Alert Evaluation
- Finnhub live trade ticks are evaluated **in-process** by the `AlertEvaluator`.
- When an alert fires, two actions happen simultaneously:
  1. A **Socket.IO event** is emitted to the user's private room for instant browser notification.
  2. An **email job** is enqueued in BullMQ for async delivery.

---

### 7. 📰 News Aggregation

A fully automated news pipeline that ingests, enriches, persists, and personalizes financial news for each user.

#### Automated Ingestion
- A **BullMQ cron job** runs every 15 minutes, pulling articles from **Polygon.io**.
- Articles are deduplicated by URL before insertion into PostgreSQL.

#### AI Enrichment
- Raw article text is passed through a **Groq LLM enricher** to generate structured, bullet-point summaries stored alongside the original content.

#### Classification & Metadata
- **Sentiment tagging** — `BULLISH` / `BEARISH` / `NEUTRAL` with a numeric sentiment score per article.
- **Category classification** — earnings, macro, sector, company announcement, etc.
- **Related symbols** — tickers mentioned in or associated with the article.
- **Sector mapping** — each article is mapped to relevant market sectors.

#### User-Context Enrichment
When fetching news, every article is annotated with:
- `inPortfolio` — whether the user holds any related symbol.
- `inWatchlist` — whether any related symbol is on the user's watchlist.

#### Reading & Bookmarks
- **Read tracking** — articles marked as read are persisted per user; the feed respects read state.
- **Save / Unsave** — users can bookmark articles for later review.

#### News Views
- **Feed view** — paginated, cursor-based news feed with filtering options.
- **Summary view** — partitions recent news into three lanes: *portfolio news*, *watchlist news*, and *market headlines*, plus a total unread count badge.

---

### 8. 🔔 Notifications

A dual-channel (in-app + email) notification system with granular user preference controls.

#### In-App Notifications
- Persisted to the database with `read` / `unread` state.
- **Cursor-based pagination** for efficient infinite-scroll loading.
- **Unread count** endpoint for badge display in the navigation bar.
- **Preview endpoint** — returns a compact preview of the latest unread notifications.

#### Email Notifications
- Delivered asynchronously via **BullMQ workers** using Nodemailer / Resend / SendGrid.
- Typed email job payloads with `to`, `symbol`, `alertType`, `title`, and `body` fields.
- Auth-specific email jobs (magic-link delivery) use a separate typed payload with `loginLink` and `expiryMinutes`.

#### User Preferences (Three Independent Toggles)

| Preference                     | Controls                                                     |
| ------------------------------ | ------------------------------------------------------------ |
| `inAppAlertsEnabled`           | Whether alert events emit Socket.IO notifications in-browser |
| `emailVolatilityAlertsEnabled` | Whether triggered price/volatility alerts send email         |
| `dailyDigestEnabled`           | Whether the user receives the weekday pre-market digest      |

#### Market Interests
- Users select sectors and topics they care about; this seeds their personalized news feed and notification relevance scoring.

#### Pre-Market Daily Digest
- A dedicated **digest service** runs on weekday mornings and composes a briefing email summarizing portfolio state, market conditions, and key watchlist alerts for opted-in users.

---

### 9. 🔑 Role-Based Access Control (RBAC)

A fully managed, admin-operated permission system with screen-level CRUD granularity.

#### Roles
Three system roles seeded at startup:
- **Admin** — full platform management, user role assignment.
- **Portfolio Manager** — portfolio and watchlist read/write access.
- **Analyst** — market data, news, and forecasting access.

#### Permissions
- Permissions are defined per **resource/screen** with three independent CRUD flags: `canRead`, `canWrite`, `canDelete`.
- Role-permission mappings are stored in the database and enforced at the middleware layer on every protected route.

#### Role Management (Admin Operations)
- **Grant role** — assign one or more roles to a user, recording the `grantedBy` admin.
- **Revoke role** — remove a role assignment, recording the `revokedByUserId`.
- Full **audit trail** maintained in the database for all assignment/revocation events.

#### Admin Panel
Authorized admins can:
- View all users with their current roles.
- Assign or revoke roles for individual users.
- Create new roles with a name and description.
- Assign permissions (resource + actions) to roles.

---

### 10. 🔍 Search

- Symbol and company name lookup across all supported tickers.
- Returns matching ticker symbols with metadata (company name, exchange, type) for quick navigation.
- Used as the universal entry point for the Forecast, Decision Support, and Watchlist modules.

---

## Technical Highlights

| Concern                | Solution                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| **Real-time prices**   | Finnhub WebSocket → in-process PriceCache → Socket.IO rooms → browser                     |
| **Background jobs**    | BullMQ on Redis — email delivery, alert evaluation, news ingestion cron (every 15 min)     |
| **Multi-tier caching** | In-memory LRU + Redis TTL for quotes, logos, sector heatmaps, AI forecasts                 |
| **Type safety**        | Strict TypeScript (frontend + backend); Pydantic (AI service); Zod for all request schemas |
| **Module boundaries**  | `scripts/check-module-boundaries.cjs` enforces no direct cross-module imports at CI time   |
| **API documentation**  | Auto-generated Swagger/OpenAPI via `tsoa`, gated behind `NODE_ENV !== production`          |
| **Structured logging** | Pino logger with PII redaction — no raw tokens, passwords, or PII in logs                  |
| **Code formatting**    | Prettier enforced across all three services                                                |
| **Error handling**     | Typed error classes (`NotFoundError`, `ValidationError`, etc.) with consistent JSON shape  |
| **Static analysis**    | ESLint + `tsc --noEmit` run in CI; SonarQube quality gate configured                      |

---

## Data Flow Summary

| Flow               | Path                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------ |
| **Live Prices**    | Finnhub WSS → FinnhubService → PriceCache → Socket.IO → Browser                           |
| **REST Quotes**    | Browser → Backend → Yahoo Finance REST → Response                                          |
| **Alert Firing**   | Finnhub trade tick → AlertEvaluator → Socket.IO room + BullMQ email queue                  |
| **AI Forecast**    | Browser → Backend `/api/forecast` → FastAPI GRU model → Redis-cached prediction           |
| **News Ingest**    | NewsCron (every 15 min) → Polygon.io → Groq enrichment → PostgreSQL                       |
| **Auth**           | Browser → `/api/auth` → JWT cookies / Google OAuth 2.0                                    |
| **Email**          | Alert / Auth / Digest event → BullMQ → EmailWorker → SMTP / Resend / SendGrid             |
| **Dashboard Load** | Browser → `/api/dashboard` → parallel fetch (portfolio, watchlist, news, market, AI run)  |

---

## Tech Stack

### Frontend
```
React 18 · TypeScript · Vite · Tailwind CSS · shadcn/ui (Radix UI)
TanStack React Query · Zustand · Recharts · Chart.js
Socket.IO Client · React Hook Form + Zod · Lucide Icons · jsPDF
```

### Backend
```
Express 5 · TypeScript · Prisma ORM · PostgreSQL · Redis (ioredis)
Socket.IO · BullMQ · JWT + bcrypt · Helmet · Zod
Nodemailer / Resend / SendGrid · Yahoo Finance 2 · TechnicalIndicators
```

### AI Service
```
FastAPI · Python 3.11 · TensorFlow / Keras · scikit-learn
ONNX Runtime · pandas · NumPy · Pydantic · Redis · Supabase
```

---

## Deployment Targets

| Service        | Target           | Config                                                        |
| -------------- | ---------------- | ------------------------------------------------------------- |
| **Frontend**   | Vercel           | `frontend/vercel.json` — SPA rewrites for client-side routing |
| **AI Service** | Railway          | `ai-service/railway.toml` — nixpacks builder, Python 3.11     |
| **Backend**    | Any Node.js host | `npm run build && npm start`                                  |

---

*Private — all rights reserved. © StockPros Hackathon Team.*
