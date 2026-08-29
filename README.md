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

| Service | Stack | Purpose |
|---------|-------|---------|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui | Interactive dashboards, charts, and real-time UI |
| **Backend** | Node.js, Express 5, Prisma, PostgreSQL, Redis | REST API, auth, market data, background jobs |
| **AI Service** | Python 3.11, FastAPI, TensorFlow, scikit-learn | ML-powered time-series stock forecasting (GRU) |

The backend follows a **modular monolith** pattern — a single deployable process composed from independent business modules with enforced boundary rules. See [backend/ARCHITECTURE.md](backend/ARCHITECTURE.md) for details.

## Features

- **Authentication** — JWT sessions, magic-link login, Google OAuth
- **Real-Time Market Data** — Live quotes via Finnhub WebSocket, historical data from Polygon.io, Twelve Data, FMP, and Yahoo Finance
- **AI Forecasting** — GRU-based time-series predictions with evaluation metrics (MSE, RMSE, MAE), exportable as CSV or PDF reports
- **Dashboard** — Portfolio summary, market overview, and activity feeds
- **Decision Support** — Per-stock buy/sell/hold recommendations with confidence scores, risk levels, and exposure analysis
- **Watchlist** — Track symbols with AI-suggested entry, take-profit, and stop-loss levels; configure 12 alert types (price, percentage, earnings, analyst changes, SEC filings, etc.)
- **News Aggregation** — Multi-source articles with sentiment analysis, category classification, read tracking, and bookmarks
- **Notifications** — In-app alerts and email delivery (Nodemailer / Resend / SendGrid)
- **Role-Based Access Control** — Admin, Portfolio Manager, and Analyst roles with screen-level CRUD permissions
- **Search** — Symbol and company lookup

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

Create a `.env` file (see `.env.example`) with the required variables:

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
ACCESS_TOKEN_SECRET=...
REFRESH_TOKEN_SECRET=...
PORT=3000
FRONTEND_URL=http://localhost:5173
ML_INTERNAL_URL=http://localhost:8000
FINNHUB_API_KEY=...
FMP_API_KEY=...
TWELVE_DATA_API_KEY=...
POLYGON_API_KEY=...
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
GOOGLE_CLIENT_ID=...
```

Then set up the database and seed RBAC data:

```bash
npm run db:sync
npm run rbac:seed
npm run dev
```

### 3. Frontend

```bash
cd frontend
npm install
```

Create a `.env` file:

```env
API_URL=http://localhost:3000
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
GITHUB_TOKEN=your_app_env```

```bash
uvicorn app.main:app --host localhost --port 8000 --reload
```

## Scripts

| Service | Command | Description |
|---------|---------|-------------|
| Backend | `npm run dev` | Start with hot reload (nodemon) |
| Backend | `npm run build` | Compile TypeScript for production |
| Backend | `npm start` | Run production build |
| Frontend | `npm run dev` | Start Vite dev server |
| Frontend | `npm run build` | Production build |
| Frontend | `npm run preview` | Preview production build |
| AI Service | `uvicorn app.main:app --reload` | Start dev server |

## Deployment

| Service | Target | Config |
|---------|--------|--------|
| Frontend | **Vercel** | `frontend/vercel.json` — SPA rewrites for client-side routing |
| AI Service | **Railway** | `ai-service/railway.toml` — nixpacks builder, Python 3.11 |
| Backend | Any Node.js host | Standard `npm run build && npm start` |

## Documentation

- [Architecture Overview](backend/ARCHITECTURE.md)

## License

Private — all rights reserved.
