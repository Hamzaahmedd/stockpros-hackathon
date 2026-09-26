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

- **Modular Monolith**: Node.js backend separated into 11 domain modules with enforced boundary checks.
- **Event-Driven & Decoupled Workers**: BullMQ queues handle email notifications and asynchronous alert tasks.
- **Real-Time Streaming**: Finnhub WebSocket trades streamed via Socket.io directly to connected clients.
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
- **Free/Pro Plan Tiers** *(off by default, see below)* — self-serve `/plans` page and `POST /api/v1/auth/plan`; Free is capped on AI forecasts (1/day), decision support (watchlist symbols only), watchlist size (10 symbols), portfolios (1), and real-time quotes (15-min delayed); Pro is unlimited on all of these. Gating runs in parallel to RBAC, toggled per-environment by `config.features.pricingTiersEnabled` (`backend/src/config/{development,production,test}.ts`) — off, the app behaves exactly as RBAC-only; on, tier checks replace RBAC checks for these customer-facing routes only (admin/RBAC-management endpoints are unaffected either way)
- **Safepay Payments** *(off by default, see below)* — Pro tier (Rs 5,999/mo) checkout via Safepay's hosted page (JazzCash, Easypaisa, and cards), confirmed asynchronously via a signed webhook (`POST /api/v1/payments/safepay/webhook`, `x-sfpy-signature` HMAC-SHA512). Toggled independently of pricing tiers by `config.features.enablePaymentProcessor` — off ("Bypass Mode"), upgrading to Pro calls `POST /api/v1/auth/plan` directly with no payment step; on ("Payment Mode"), upgrading redirects to Safepay checkout and the plan only changes once the webhook confirms payment

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
| Backend    | `npm run rbac:seed`              | Seed default roles/permissions                              |
| Backend    | `npm run db:sync`                | Push the Prisma schema to the database and regenerate the client |
| Frontend   | `npm run dev`                     | Start Vite dev server                                       |
| Frontend   | `npm run build`                   | Production build                                            |
| Frontend   | `npm run preview`                 | Preview production build                                    |
| Frontend   | `npm run typecheck`               | Type-check without emitting                                 |
| Frontend   | `npm run lint`                    | Run ESLint                                                   |
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