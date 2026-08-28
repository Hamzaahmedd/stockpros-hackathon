# Stock App Backend

## Architecture

This service is a modular monolith: one deployable process composed from independently named business modules. The module registry lives in `src/modules`, HTTP composition in `src/app.ts`, and infrastructure/process lifecycle in `src/index.ts`.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for module boundaries and dependency rules.

## Table of Contents

- [Project Overview](#project-overview)
- [Technologies Used](#technologies-used)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Running the Application](#running-the-application)
- [Redis Installation & Setup on Windows (MSI Installer Method)](#redis-installation--setup-on-windows-msi-installer-method)
- [API Documentation](#api-documentation)
- [Database and ERD Documentation](#database-and-erd-documentation)
- [Tests Documentation](#tests-documentation)

---

## Project Overview

Backend API for the Stock Prediction Platform, built with Node.js (Express). Handles authentication, data aggregation, API integration, and serves ML forecasts to the frontend.

## Technologies Used

- Express.js
- Prisma ORM
- TypeScript
- PostgreSQL
- JWT Authentication

## Prerequisites

- Node.js (v16+ recommended)
- PostgreSQL database

## Installation

1. Clone the repository

```bash
git clone https://github.com/Stock-App-Platform/stock-backend.git
```

3. Install dependencies

```bash
npm install
```

3. Configure environment variables
   Create a `.env` file with the following variables:

```
DATABASE_URL=postgresql://myuser:securepassword@db.example.com:5432/mydb?sslmode=require
REDIS_URL=redis://:password@host:port/db
ACCESS_TOKEN_SECRET=your_secure_secret_key
ACCESS_TOKEN_EXPIRY=100h
REFRESH_TOKEN_SECRET=your_secure_secret_key
REFRESH_TOKEN_EXPIRY=30d
SALT_ROUNDS=10
PORT=your_port
CORS_ORIGINS=http://localhost:8081,https://my-app.com
ML_INTERNAL_URL=http://localhost:your_port
FINNHUB_API_KEY=your_finnhub_api_key
FINNHUB_QUOTE_TTL=your_finnhub_quote_ttl
ALPHAVANTAGE_API_KEY=your_ALPHAVANTAGE_API_KEY
SMTP_HOST=smtp.example.com
SMTP_PORT=smtp_port
SMTP_USER=your_email@example.com
SMTP_PASS=email_password
OTP_TTL=your_otp_ttl
FMP_API_KEY=your_fmp_api_key
TWELVE_DATA_API_KEY=your_twelve_data_api_key
POLYGON_API_KEY=your_polygon_api_key
NODE_ENV=development
```

4. Database Setup

```bash
npx prisma generate
```

## Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm run build
npm start
```

## Redis Installation & Setup on Windows (MSI Installer Method)

You can find the Redis documentation here:

[![Redis Docs](https://img.shields.io/badge/Stock%20app%20Redis%20Docs-Click%20Here-blue?style=for-the-badge)](https://docs.google.com/document/d/1IZPj7N5SekGWNFgJS-Vvx-aaZ41pE-WQCbRhi02nZuE/edit?usp=sharing)

## API Documentation

You can find the API documentation here:

[![API Docs](https://img.shields.io/badge/Stock%20app%20API%20Docs-Click%20Here-blue?style=for-the-badge)](https://documenter.getpostman.com/view/48086882/2sB3WjxiMH)

## Database and ERD Documentation

You can find the database and ERD documentation here:

[![DB Docs](https://img.shields.io/badge/Stock%20app%20DB%20Docs-Click%20Here-blue?style=for-the-badge)](https://dbdocs.io/hamzahmed303/Stock-App)

## Tests Documentation

You can find the Tests documentation here:

[![Tests Docs](https://img.shields.io/badge/Stock%20app%20Tests%20Docs-Click%20Here-blue?style=for-the-badge)](https://docs.google.com/document/d/1HkD4J1kKJ4aJm2rR-TUTt2EUw1uAufLYQUw_usj92Vs/edit?usp=sharing)
