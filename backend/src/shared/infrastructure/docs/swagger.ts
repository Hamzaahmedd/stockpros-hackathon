import config from '@/config'
import type { Application, Request, Response } from 'express'
import swaggerUi from 'swagger-ui-express'

/**
 * Complete OpenAPI 3.0.3 specification for the StockPros Backend REST API.
 * Covering all 10 refactored business modules, security schemes, and data models.
 */
export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'StockPros Platform API',
    version: '1.0.0',
    description: `
# StockPros REST API Documentation

AI-powered stock forecasting, portfolio analytics, and decision-support platform backend.

### Features:
- **Authentication**: JWT sessions, Magic Link, Google OAuth 2.0.
- **Role-Based Access Control (RBAC)**: Fine-grained screen and resource permissions.
- **Market Data & Search**: Real-time quotes, ranked top US stocks, symbol search.
- **AI Forecasting & Decision Support**: GRU time-series predictions and multi-factor buy/sell/hold decisions.
- **Watchlist & Alerts**: Target price baselines, conversion to portfolio positions, multi-condition alerts.
- **News & Sentiment**: Polygon market news, sentiment scoring, bookmarks, and read tracking.
- **Notifications**: Real-time in-app alerts and email notifications.
`,
    contact: {
      name: 'StockPros Platform Engineering',
      url: 'https://stockpros-platform.vercel.app',
    },
    license: {
      name: 'Private & Proprietary',
    },
  },
  servers: [
    {
      url: `http://localhost:${config.server.port}`,
      description: 'Local Development Server',
    },
    {
      url: config.server.frontendUrl.replace(':5173', `:${config.server.port}`),
      description: 'Configured Origin Server',
    },
  ],
  tags: [
    { name: 'Authentication', description: 'User login, OAuth, magic links, session refresh, and onboarding' },
    { name: 'Access Control (RBAC)', description: 'Role definitions, screen permissions, and user role assignments' },
    { name: 'Dashboard', description: 'Aggregated metrics, user portfolio summary, and market overview' },
    { name: 'Decision Support', description: 'AI trade recommendations, portfolio uploads, and risk analysis' },
    { name: 'AI Forecast', description: 'GRU machine learning stock predictions and time-series projections' },
    { name: 'Market Data', description: 'Top ranked stocks and real-time equity market data' },
    { name: 'News', description: 'Financial news feed, sentiment analysis, search, and bookmarks' },
    { name: 'Notifications', description: 'User notifications, unread counts, and batch actions' },
    { name: 'Search', description: 'Symbol lookup and company autocomplete' },
    { name: 'Watchlist', description: 'Tracked symbols, AI baseline calculation, alerts, and position conversion' },
    { name: 'System', description: 'Platform health and operational readiness' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Standard JSON Web Token (JWT) provided in Authorization header: \`Bearer <token>\`',
      },
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'refresh_token',
        description: 'HTTP-only session refresh cookie',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Operation completed successfully' },
          data: { type: 'object' },
        },
      },
      ApiErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          message: { type: 'string', example: 'Invalid credentials or expired session' },
          errors: {
            type: 'array',
            items: { type: 'object', properties: { field: { type: 'string' }, message: { type: 'string' } } },
          },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'usr_01j7xyz987' },
          email: { type: 'string', format: 'email', example: 'trader@example.com' },
          displayName: { type: 'string', example: 'Alex Morgan' },
          avatarUrl: { type: 'string', nullable: true, example: 'https://example.com/avatar.jpg' },
          country: { type: 'string', nullable: true, example: 'US' },
          tradingExperience: { type: 'string', nullable: true, example: 'INTERMEDIATE' },
          riskTolerance: { type: 'string', nullable: true, example: 'MODERATE' },
          isProfileComplete: { type: 'boolean', example: true },
          roles: {
            type: 'array',
            items: { type: 'string' },
            example: ['ANALYST', 'PORTFOLIO_MANAGER'],
          },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      MagicLinkRequest: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email', example: 'investor@stockpros.com' },
        },
      },
      VerifyMagicLinkRequest: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', example: 'd7a46f2c81e94a81b305e54d8b67...' },
        },
      },
      GoogleLoginRequest: {
        type: 'object',
        required: ['credential'],
        properties: {
          credential: { type: 'string', description: 'Google ID token credential string' },
        },
      },
      OnboardingRequest: {
        type: 'object',
        properties: {
          onboardingToken: { type: 'string', description: 'Token provided during magic link / signup verification' },
          displayName: { type: 'string', example: 'Jordan Belfort' },
          email: { type: 'string', format: 'email', example: 'jordan@example.com' },
          country: { type: 'string', example: 'US' },
          tradingExperience: { type: 'string', enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'], example: 'ADVANCED' },
          preferredSectors: { type: 'array', items: { type: 'string' }, example: ['Technology', 'Healthcare'] },
          riskTolerance: { type: 'string', enum: ['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'], example: 'AGGRESSIVE' },
        },
      },
      AuthResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          message: { type: 'string', example: 'Login successful' },
          accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          user: { $ref: '#/components/schemas/UserProfile' },
        },
      },
      Role: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'role_01j7abc' },
          name: { type: 'string', example: 'PORTFOLIO_MANAGER' },
          description: { type: 'string', example: 'Can manage portfolios and execute trades' },
          isSystem: { type: 'boolean', example: false },
        },
      },
      Permission: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'perm_01j7xyz' },
          resource: { type: 'string', example: 'PORTFOLIO' },
          action: { type: 'string', example: 'CREATE' },
        },
      },
      DashboardData: {
        type: 'object',
        properties: {
          portfolioSummary: {
            type: 'object',
            properties: {
              totalValue: { type: 'number', example: 125430.50 },
              totalGainLoss: { type: 'number', example: 8430.25 },
              totalGainLossPercentage: { type: 'number', example: 7.21 },
              activePositionsCount: { type: 'number', example: 8 },
            },
          },
          marketOverview: {
            type: 'object',
            properties: {
              sp500: { type: 'number', example: 5820.45 },
              nasdaq: { type: 'number', example: 18450.10 },
              dow: { type: 'number', example: 42100.80 },
            },
          },
          recentNotifications: {
            type: 'array',
            items: { $ref: '#/components/schemas/Notification' },
          },
        },
      },
      DecisionResponse: {
        type: 'object',
        properties: {
          symbol: { type: 'string', example: 'NVDA' },
          recommendation: { type: 'string', enum: ['BUY', 'HOLD', 'SELL'], example: 'BUY' },
          confidenceScore: { type: 'number', example: 88.5 },
          riskLevel: { type: 'string', enum: ['LOW', 'MODERATE', 'HIGH'], example: 'MODERATE' },
          targetPrice: { type: 'number', example: 155.00 },
          stopLossPrice: { type: 'number', example: 120.00 },
          drivers: {
            type: 'array',
            items: { type: 'string' },
            example: ['Strong quarterly earnings growth', 'Bullish GRU 7-day price momentum', 'High institutional volume'],
          },
        },
      },
      ForecastData: {
        type: 'object',
        properties: {
          symbol: { type: 'string', example: 'AAPL' },
          period: { type: 'string', enum: ['1d', '1w'], example: '1w' },
          currentPrice: { type: 'number', example: 228.50 },
          historicalData: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', example: '2026-08-28' },
                price: { type: 'number', example: 226.40 },
              },
            },
          },
          predictions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                date: { type: 'string', example: '2026-09-04' },
                price: { type: 'number', example: 234.80 },
              },
            },
          },
          metrics: {
            type: 'object',
            properties: {
              rmse: { type: 'number', example: 1.42 },
              mae: { type: 'number', example: 0.98 },
            },
          },
        },
      },
      TopStock: {
        type: 'object',
        properties: {
          symbol: { type: 'string', example: 'MSFT' },
          companyName: { type: 'string', example: 'Microsoft Corporation' },
          price: { type: 'number', example: 425.20 },
          change: { type: 'number', example: 3.45 },
          changePercent: { type: 'number', example: 0.82 },
          volume: { type: 'number', example: 21500000 },
          marketCap: { type: 'number', example: 3150000000000 },
          logoUrl: { type: 'string', example: 'https://logo.clearbit.com/microsoft.com' },
        },
      },
      NewsArticle: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'news_01j8xyz' },
          title: { type: 'string', example: 'Tech Sector Rallies on Strong AI Demand' },
          summary: { type: 'string', example: 'Major tech stocks posted strong gains today as cloud earnings surpassed expectations.' },
          source: { type: 'string', example: 'Bloomberg' },
          url: { type: 'string', format: 'uri', example: 'https://bloomberg.com/news/articles/tech-rally' },
          imageUrl: { type: 'string', nullable: true, example: 'https://images.example.com/tech-news.jpg' },
          category: { type: 'string', example: 'TECHNOLOGY' },
          sentiment: { type: 'string', enum: ['BULLISH', 'BEARISH', 'NEUTRAL'], example: 'BULLISH' },
          sentimentScore: { type: 'number', example: 0.78 },
          tickers: { type: 'array', items: { type: 'string' }, example: ['AAPL', 'MSFT', 'NVDA'] },
          isRead: { type: 'boolean', example: false },
          isSaved: { type: 'boolean', example: true },
          publishedAt: { type: 'string', format: 'date-time' },
        },
      },
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'notif_01j7abc' },
          title: { type: 'string', example: 'Price Alert Triggered: TSLA' },
          message: { type: 'string', example: 'TSLA has crossed above your target price of $240.00' },
          type: { type: 'string', enum: ['ALERT', 'SYSTEM', 'NEWS', 'TRADE'], example: 'ALERT' },
          isRead: { type: 'boolean', example: false },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      WatchlistItem: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'wl_01j7890' },
          symbol: { type: 'string', example: 'TSLA' },
          currentPrice: { type: 'number', example: 242.10 },
          changePercent: { type: 'number', example: 2.15 },
          notes: { type: 'string', nullable: true, example: 'Watching for breakout above $250' },
          targetBuyPrice: { type: 'number', nullable: true, example: 220.00 },
          targetSellPrice: { type: 'number', nullable: true, example: 260.00 },
          stopLoss: { type: 'number', nullable: true, example: 210.00 },
          aiBuyZone: {
            type: 'object',
            properties: {
              lower: { type: 'number', example: 215.00 },
              upper: { type: 'number', example: 225.00 },
            },
          },
          alertsCount: { type: 'number', example: 2 },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      Alert: {
        type: 'object',
        properties: {
          id: { type: 'string', example: 'alt_01j7654' },
          symbol: { type: 'string', example: 'NVDA' },
          alertType: { type: 'string', enum: ['PRICE_ABOVE', 'PRICE_BELOW', 'PERCENT_CHANGE', 'VOLUME_SPIKE'], example: 'PRICE_ABOVE' },
          threshold: { type: 'number', example: 150.00 },
          condition: { type: 'string', example: 'GREATER_THAN' },
          isActive: { type: 'boolean', example: true },
          isTriggered: { type: 'boolean', example: false },
        },
      },
    },
  },
  paths: {
    // ─── SYSTEM & HEALTH ─────────────────────────────────────────────────────────
    '/health': {
      get: {
        tags: ['System'],
        summary: 'Platform health and readiness check',
        description: 'Lightweight, public health check for infrastructure monitors, uptime trackers, and load balancers. Performs a non-blocking database query.',
        responses: {
          200: {
            description: 'System is healthy and database is connected',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'ok' },
                    timestamp: { type: 'string', format: 'date-time', example: '2026-08-29T18:55:00.000Z' },
                  },
                },
              },
            },
          },
          503: {
            description: 'Service unavailable - database connectivity failure',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'unhealthy' },
                    timestamp: { type: 'string', format: 'date-time', example: '2026-08-29T18:55:00.000Z' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── AUTH MODULE ─────────────────────────────────────────────────────────────
    '/api/v1/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current authenticated user profile',
        description: 'Fetches profile details, assigned roles, and onboarding status for the authenticated user.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'User details fetched successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'My details fetched successfully' },
                    user: { $ref: '#/components/schemas/UserProfile' },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized - invalid or missing bearer token', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiErrorResponse' } } } },
        },
      },
    },
    '/api/v1/auth/magic-link': {
      post: {
        tags: ['Authentication'],
        summary: 'Request passwordless magic link email',
        description: 'Sends a one-time login link to the given email address. Rate-limited to 5 requests per 15 minutes.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MagicLinkRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Magic link sent if account eligible',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } },
          },
          429: { description: 'Rate limit exceeded' },
        },
      },
    },
    '/api/v1/auth/verify-magic-link': {
      post: {
        tags: ['Authentication'],
        summary: 'Verify magic link token',
        description: 'Verifies the cryptographic token received via email and establishes user session cookies/tokens.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VerifyMagicLinkRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Login successful or onboarding required',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          400: { description: 'Invalid or expired magic link token' },
        },
      },
    },
    '/api/v1/auth/google': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate with Google OAuth 2.0',
        description: 'Validates Google ID credential token, retrieves user profile, and logs in or creates user.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/GoogleLoginRequest' },
            },
          },
        },
        responses: {
          200: {
            description: 'Google authentication successful',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } },
          },
          401: { description: 'Invalid Google credential token' },
        },
      },
    },
    '/api/v1/auth/onboarding': {
      post: {
        tags: ['Authentication'],
        summary: 'Complete onboarding profile setup',
        description: 'Finalizes user preferences, trading experience, risk tolerance, and completes account registration.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/OnboardingRequest' },
            },
          },
        },
        responses: {
          200: { description: 'Profile updated successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          201: { description: 'Account created successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
        },
      },
    },
    '/api/v1/auth/refresh-token': {
      post: {
        tags: ['Authentication'],
        summary: 'Refresh access token',
        description: 'Issues a new short-lived access token using the HTTP-only refresh token cookie.',
        security: [{ cookieAuth: [] }],
        responses: {
          200: {
            description: 'Access token refreshed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Access token refreshed successfully' },
                    accessToken: { type: 'string' },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized - invalid or missing refresh token' },
        },
      },
    },
    '/api/v1/auth/logout': {
      post: {
        tags: ['Authentication'],
        summary: 'Logout and terminate active session',
        description: 'Revokes the active refresh token and clears session cookies.',
        security: [{ cookieAuth: [] }],
        responses: {
          200: { description: 'Logged out successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },

    // ─── ACCESS CONTROL / RBAC MODULE ────────────────────────────────────────────
    '/api/v1/rbac/user-screens': {
      get: {
        tags: ['Access Control (RBAC)'],
        summary: 'Get authorized screen-level permissions for user',
        description: 'Returns permissions mapped across all resources and screens for the authenticated user.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Screen permissions retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/rbac/users': {
      get: {
        tags: ['Access Control (RBAC)'],
        summary: 'List all users with roles (Admin / Manager)',
        description: 'Paginated user management list with search filters.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Users retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/rbac/roles': {
      get: {
        tags: ['Access Control (RBAC)'],
        summary: 'List all system and custom roles',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Roles retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
      post: {
        tags: ['Access Control (RBAC)'],
        summary: 'Create a new role definition',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: {
                  name: { type: 'string', example: 'SENIOR_ANALYST' },
                  description: { type: 'string', example: 'Advanced market analysis and portfolio reports' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Role added successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/rbac/roles/{roleId}': {
      delete: {
        tags: ['Access Control (RBAC)'],
        summary: 'Revoke / delete a role',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'roleId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Role revoked successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/rbac/assign-role': {
      post: {
        tags: ['Access Control (RBAC)'],
        summary: 'Assign roles to a user',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userId', 'roleIds'],
                properties: {
                  userId: { type: 'string' },
                  roleIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Role assigned successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/rbac/permissions': {
      get: {
        tags: ['Access Control (RBAC)'],
        summary: 'List all system permissions',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Permissions retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/rbac/assign-permissions': {
      post: {
        tags: ['Access Control (RBAC)'],
        summary: 'Assign permissions to a role',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['roleId', 'permissions'],
                properties: {
                  roleId: { type: 'string' },
                  permissions: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Permissions assigned successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/rbac/revoke-permissions': {
      delete: {
        tags: ['Access Control (RBAC)'],
        summary: 'Revoke permissions from a role',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['roleId', 'permissions'],
                properties: {
                  roleId: { type: 'string' },
                  permissions: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Permissions revoked successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/rbac/resources': {
      get: {
        tags: ['Access Control (RBAC)'],
        summary: 'List all RBAC resources',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Resources retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/rbac/resource-mappings': {
      post: {
        tags: ['Access Control (RBAC)'],
        summary: 'Assign actions to resources',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['resources'],
                properties: {
                  resources: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Actions assigned successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },

    // ─── DASHBOARD MODULE ────────────────────────────────────────────────────────
    '/api/v1/dashboard': {
      get: {
        tags: ['Dashboard'],
        summary: 'Get consolidated user dashboard metrics',
        description: 'Aggregates portfolio valuation, market trends, top market movers, and recent alerts for the authenticated user.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Dashboard data retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Dashboard data retrieved successfully' },
                    data: { $ref: '#/components/schemas/DashboardData' },
                  },
                },
              },
            },
          },
          401: { description: 'Unauthorized' },
        },
      },
    },

    // ─── DECISION SUPPORT MODULE ─────────────────────────────────────────────────
    '/api/v1/decision-support/market/decision/{symbol}': {
      get: {
        tags: ['Decision Support'],
        summary: 'Get AI trade recommendation for a symbol',
        description: 'Generates real-time buy/hold/sell signal, confidence score, risk evaluation, and key analytical drivers for an individual stock.',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'symbol', in: 'path', required: true, schema: { type: 'string' }, example: 'AAPL' }],
        responses: {
          200: {
            description: 'Trade decision retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Trade decision retrieved successfully.' },
                    data: { $ref: '#/components/schemas/DecisionResponse' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/v1/decision-support/upload-portfolio': {
      post: {
        tags: ['Decision Support'],
        summary: 'Upload trader portfolio file (CSV or XLSX)',
        description: 'Parses uploaded spreadsheet and extracts holdings, quantities, and cost basis.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['portfolio'],
                properties: {
                  portfolio: {
                    type: 'string',
                    format: 'binary',
                    description: 'CSV or XLSX file containing columns: Symbol, Shares, CostBasis',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Portfolio uploaded and parsed successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/decision-support/portfolio/decision': {
      post: {
        tags: ['Decision Support'],
        summary: 'Generate AI trade decisions for an entire portfolio',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['portfolioId', 'decisionMode'],
                properties: {
                  portfolioId: { type: 'string', example: 'port_01j7xyz' },
                  decisionMode: { type: 'string', enum: ['STANDARD', 'AGGRESSIVE', 'CONSERVATIVE'], example: 'STANDARD' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Portfolio trade decisions generated successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/decision-support/portfolio/latest': {
      get: {
        tags: ['Decision Support'],
        summary: 'Get latest uploaded portfolio overview and holdings',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Latest portfolio retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },

    // ─── FORECAST MODULE ─────────────────────────────────────────────────────────
    '/api/v1/forecast': {
      get: {
        tags: ['AI Forecast'],
        summary: 'Get ML stock price predictions',
        description: 'Runs GRU time-series forecasting model to produce future price trajectories and historical accuracy baselines.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'symbol', in: 'query', required: true, schema: { type: 'string' }, example: 'NVDA' },
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['1d', '1w'], default: '1w' }, example: '1w' },
        ],
        responses: {
          200: {
            description: 'Stock forecast retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Stock forecast data retrieved successfully.' },
                    data: { $ref: '#/components/schemas/ForecastData' },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── MARKET DATA MODULE ──────────────────────────────────────────────────────
    '/api/v1/market/top-stocks': {
      get: {
        tags: ['Market Data'],
        summary: 'Get top ranked US stocks with live market data',
        description: 'Returns top US equities with live price quotes, daily gain/loss percentages, and trading volumes.',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Top US stocks retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Top US stocks retrieved successfully.' },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/TopStock' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ─── NEWS MODULE ─────────────────────────────────────────────────────────────
    '/api/v1/news/feed': {
      get: {
        tags: ['News'],
        summary: 'Get paginated news feed with sentiment analysis',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'category', in: 'query', schema: { type: 'string' } },
          { name: 'sentiment', in: 'query', schema: { type: 'string', enum: ['BULLISH', 'BEARISH', 'NEUTRAL'] } },
        ],
        responses: {
          200: { description: 'News feed retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/news/search': {
      get: {
        tags: ['News'],
        summary: 'Search news articles by keyword',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: {
          200: { description: 'Search results returned successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/news/summary': {
      get: {
        tags: ['News'],
        summary: 'Get market news sentiment overview and breakdown',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'News summary retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/news/saved': {
      get: {
        tags: ['News'],
        summary: 'Get user saved/bookmarked news articles',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Saved news retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/news/symbol/{symbol}': {
      get: {
        tags: ['News'],
        summary: 'Get news articles for a specific stock symbol',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'symbol', in: 'path', required: true, schema: { type: 'string' }, example: 'AAPL' },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
        ],
        responses: {
          200: { description: 'Symbol news retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/news/read-all': {
      patch: {
        tags: ['News'],
        summary: 'Mark all news articles as read',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'All articles marked as read', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/news/read-multiple': {
      patch: {
        tags: ['News'],
        summary: 'Mark multiple articles as read',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['articleIds'],
                properties: {
                  articleIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Articles marked as read', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/news/{id}/read': {
      patch: {
        tags: ['News'],
        summary: 'Mark a single article as read',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Article marked as read', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/news/{id}/save': {
      post: {
        tags: ['News'],
        summary: 'Save / bookmark an article',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Article saved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
      delete: {
        tags: ['News'],
        summary: 'Remove an article from saved bookmarks',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Article removed from saved', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },

    // ─── NOTIFICATIONS MODULE ────────────────────────────────────────────────────
    '/api/v1/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Get paginated notifications list',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean', default: false } },
        ],
        responses: {
          200: { description: 'Notifications retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/notifications/summary': {
      get: {
        tags: ['Notifications'],
        summary: 'Get notification unread count and recent list',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'Notification summary retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark all notifications as read',
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: 'All notifications marked as read', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/notifications/read-multiple': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark multiple notifications as read',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['notificationIds'],
                properties: {
                  notificationIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Notifications marked as read', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark a single notification as read',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Notification marked as read', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/notifications/{id}': {
      delete: {
        tags: ['Notifications'],
        summary: 'Delete a notification',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Notification deleted successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },

    // ─── SEARCH MODULE ───────────────────────────────────────────────────────────
    '/api/v1/search/symbol-lookup': {
      get: {
        tags: ['Search'],
        summary: 'Lookup stock symbols and company names',
        description: 'Fast autocomplete search for US equities and indices.',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' }, example: 'AAPL' },
          { name: 'exchange', in: 'query', schema: { type: 'string', default: 'US' } },
        ],
        responses: {
          200: { description: 'Symbol lookup results', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },

    // ─── WATCHLIST MODULE ────────────────────────────────────────────────────────
    '/api/v1/watchlist': {
      get: {
        tags: ['Watchlist'],
        summary: 'Get user watchlist with AI baseline zones',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Watchlist retrieved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    message: { type: 'string', example: 'Watchlist retrieved successfully' },
                    data: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/WatchlistItem' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Watchlist'],
        summary: 'Add stock symbol to watchlist',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['symbol'],
                properties: {
                  symbol: { type: 'string', example: 'AMD' },
                  notes: { type: 'string', example: 'Earnings next week' },
                  targetBuyPrice: { type: 'number', example: 140.00 },
                  targetSellPrice: { type: 'number', example: 175.00 },
                  stopLoss: { type: 'number', example: 130.00 },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Symbol added to watchlist', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/watchlist/{symbol}': {
      patch: {
        tags: ['Watchlist'],
        summary: 'Update watchlist item targets and notes',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'symbol', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  notes: { type: 'string' },
                  targetBuyPrice: { type: 'number' },
                  targetSellPrice: { type: 'number' },
                  stopLoss: { type: 'number' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Watchlist item updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
      delete: {
        tags: ['Watchlist'],
        summary: 'Remove symbol from watchlist',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'symbol', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Symbol removed from watchlist', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/watchlist/{symbol}/convert-to-position': {
      post: {
        tags: ['Watchlist'],
        summary: 'Convert watchlist ticker into active portfolio position',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'symbol', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['shares', 'buyPrice'],
                properties: {
                  shares: { type: 'number', example: 50 },
                  buyPrice: { type: 'number', example: 145.20 },
                  buyDate: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Converted to portfolio position', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/watchlist/{symbol}/alerts': {
      get: {
        tags: ['Watchlist'],
        summary: 'Get alerts for a stock symbol',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'symbol', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Alerts retrieved successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
      post: {
        tags: ['Watchlist'],
        summary: 'Create price / technical indicator alert',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'symbol', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['alertType'],
                properties: {
                  alertType: { type: 'string', enum: ['PRICE_ABOVE', 'PRICE_BELOW', 'PERCENT_CHANGE', 'VOLUME_SPIKE'], example: 'PRICE_ABOVE' },
                  threshold: { type: 'number', example: 160.00 },
                  condition: { type: 'string', example: 'GREATER_THAN' },
                },
              },
            },
          },
        },
        responses: {
          201: { description: 'Alert created successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
    '/api/v1/watchlist/{symbol}/alerts/{id}': {
      patch: {
        tags: ['Watchlist'],
        summary: 'Update alert settings',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'symbol', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  threshold: { type: 'number' },
                  isActive: { type: 'boolean' },
                },
              },
            },
          },
        },
        responses: {
          200: { description: 'Alert updated successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
      delete: {
        tags: ['Watchlist'],
        summary: 'Delete an alert',
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'symbol', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Alert deleted successfully', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiResponse' } } } },
        },
      },
    },
  },
}

/**
 * Custom CSS to give Swagger UI a polished, modern developer experience.
 */
const customSwaggerCss = `
  .swagger-ui .topbar {
    background-color: #0f172a;
    border-bottom: 1px solid #1e293b;
    padding: 10px 0;
  }
  .swagger-ui .topbar a {
    display: flex;
    align-items: center;
  }
  .swagger-ui .topbar .topbar-wrapper img {
    content: url('https://weyddqoxrfdtgmbcnzew.supabase.co/storage/v1/object/public/public-assets/stockpros-logo.png');
    height: 38px;
    width: auto;
  }
  .swagger-ui .info {
    margin: 25px 0;
  }
  .swagger-ui .info .title {
    color: #0f172a;
    font-weight: 700;
  }
  .swagger-ui .scheme-container {
    background: #f8fafc;
    border-radius: 8px;
    padding: 15px;
    box-shadow: none;
    border: 1px solid #e2e8f0;
    margin-bottom: 20px;
  }
  .swagger-ui .opblock {
    border-radius: 6px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
`

/**
 * Mounts Swagger UI and OpenAPI JSON endpoints on the Express application.
 */
export const setupSwaggerDocs = (app: Application): void => {
  const docPaths = ['/docs', '/api-docs']

  // Handle CSP headers specifically for Swagger UI routes so scripts/styles load smoothly alongside Helmet.
  app.use(docPaths, (_req: Request, res: Response, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' https: data:;",
    )
    next()
  })

  // Serve raw OpenAPI JSON specification
  const sendSpec = (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json')
    res.status(200).send(swaggerSpec)
  }

  app.get('/docs.json', sendSpec)
  app.get('/api-docs.json', sendSpec)
  app.get('/docs/json', sendSpec)

  const uiOptions = {
    customCss: customSwaggerCss,
    customSiteTitle: 'StockPros API Documentation',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
      filter: true,
      tagsSorter: 'alpha',
    },
  }

  // Mount Swagger UI on /docs and /api-docs
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, uiOptions))
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, uiOptions))
}
