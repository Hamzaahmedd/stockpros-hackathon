/* tslint:disable */
/* eslint-disable */
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import type { TsoaRoute } from '@tsoa/runtime';
import {  fetchMiddlewares, ExpressTemplateService } from '@tsoa/runtime';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { WatchlistController } from './../modules/watchlist/watchlistController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { SearchController } from './../modules/search/searchController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { NotificationController } from './../modules/notifications/notificationController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { NewsController } from './../modules/news/newsController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { MarketController } from './../modules/market/marketController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { ForecastController } from './../modules/forecast/forecastController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DecisionSupportController } from './../modules/decision-support/decisionSupportController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { DashboardController } from './../modules/dashboard/dashboardController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AuthController } from './../modules/auth/authController';
// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
import { AccessControlController } from './../modules/access-control/accessControlController';
import { expressAuthentication } from './../shared/infrastructure/authentication';
// @ts-ignore - no great way to install types from subpackage
import type { Request as ExRequest, Response as ExResponse, RequestHandler, Router } from 'express';
const multer = require('multer');


const expressAuthenticationRecasted = expressAuthentication as (req: ExRequest, securityName: string, scopes?: string[], res?: ExResponse) => Promise<any>;


// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

const models: TsoaRoute.Models = {
    "PortfolioFit": {
        "dataType": "refObject",
        "properties": {
            "currentSectorExposure": {"dataType":"string","required":true},
            "projectedSectorExposure": {"dataType":"string","required":true},
            "sector": {"dataType":"string","required":true},
            "overexposureWarning": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WatchlistItemResponse": {
        "dataType": "refObject",
        "properties": {
            "symbol": {"dataType":"string","required":true},
            "currentPrice": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "changePercent": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "priceSinceAdded": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "targetEntryPrice": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "stopLoss": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "notes": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "entryZone": {"dataType":"union","subSchemas":[{"dataType":"boolean"},{"dataType":"enum","enums":[null]}],"required":true},
            "stopLossBreached": {"dataType":"union","subSchemas":[{"dataType":"boolean"},{"dataType":"enum","enums":[null]}],"required":true},
            "aiSuggested": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"computedAt":{"dataType":"string","required":true},"basis":{"dataType":"string","required":true},"confidence":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["LOW"]},{"dataType":"enum","enums":["MEDIUM"]},{"dataType":"enum","enums":["HIGH"]}],"required":true},"stopLoss":{"dataType":"double","required":true},"takeProfit":{"dataType":"double","required":true},"entry":{"dataType":"double","required":true}}},{"dataType":"enum","enums":[null]}],"required":true},
            "portfolioFit": {"dataType":"union","subSchemas":[{"ref":"PortfolioFit"},{"dataType":"enum","enums":[null]}],"required":true},
            "addedAt": {"dataType":"datetime","required":true},
            "logo": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "alerts": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"isActive":{"dataType":"boolean","required":true},"threshold":{"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},"type":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WatchlistDataResponse_WatchlistItemResponse-Array_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"WatchlistItemResponse"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WatchlistDataResponse_WatchlistItemResponse_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"WatchlistItemResponse"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AddToWatchlistBody": {
        "dataType": "refObject",
        "properties": {
            "symbol": {"dataType":"string","required":true},
            "targetEntryPrice": {"dataType":"double"},
            "stopLoss": {"dataType":"double"},
            "notes": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateWatchlistBody": {
        "dataType": "refObject",
        "properties": {
            "targetEntryPrice": {"dataType":"double"},
            "stopLoss": {"dataType":"double"},
            "notes": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WatchlistDataResponse_void_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"void"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "WatchlistDataResponse_any_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"any"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ConvertToPositionBody": {
        "dataType": "refObject",
        "properties": {
            "entryPrice": {"dataType":"double"},
            "quantity": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "_36_Enums.AlertType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["PRICE_ABOVE"]},{"dataType":"enum","enums":["PRICE_BELOW"]},{"dataType":"enum","enums":["PCT_CHANGE_UP"]},{"dataType":"enum","enums":["PCT_CHANGE_DOWN"]},{"dataType":"enum","enums":["ENTRY_ZONE"]},{"dataType":"enum","enums":["STOP_LOSS_BREACHED"]},{"dataType":"enum","enums":["EARNINGS_APPROACHING"]},{"dataType":"enum","enums":["DIVIDEND_APPROACHING"]},{"dataType":"enum","enums":["ANALYST_RATING_CHANGE"]},{"dataType":"enum","enums":["NEWS_PUBLISHED"]},{"dataType":"enum","enums":["SEC_FILING"]},{"dataType":"enum","enums":["AI_SIGNAL_CHANGED"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AlertType": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.AlertType","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateAlertBody": {
        "dataType": "refObject",
        "properties": {
            "type": {"ref":"AlertType","required":true},
            "threshold": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "UpdateAlertBody": {
        "dataType": "refObject",
        "properties": {
            "threshold": {"dataType":"double"},
            "isActive": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SymbolSearchResult": {
        "dataType": "refObject",
        "properties": {
            "symbol": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
            "type": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SymbolLookupResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"SymbolSearchResult"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NotificationItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "title": {"dataType":"string","required":true},
            "body": {"dataType":"string","required":true},
            "read": {"dataType":"boolean","required":true},
            "createdAt": {"dataType":"datetime","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetNotificationsEnvelopeResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"NotificationItem"},"required":true},
            "nextCursor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "hasMore": {"dataType":"boolean","required":true},
            "total": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NotificationSummary": {
        "dataType": "refObject",
        "properties": {
            "unreadCount": {"dataType":"double","required":true},
            "preview": {"dataType":"array","array":{"dataType":"refObject","ref":"NotificationItem"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NotificationDataResponse_NotificationSummary_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"NotificationSummary","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NotificationsBatchUpdateResult": {
        "dataType": "refObject",
        "properties": {
            "updated": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NotificationDataResponse_NotificationsBatchUpdateResult_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"NotificationsBatchUpdateResult","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MarkMultipleNotificationsReadBody": {
        "dataType": "refObject",
        "properties": {
            "notificationIds": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NotificationDataResponse_NotificationItem_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"NotificationItem","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SimpleNotificationMessageResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "_36_Enums.NewsCategory": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["EARNINGS"]},{"dataType":"enum","enums":["ANALYST"]},{"dataType":"enum","enums":["FILING"]},{"dataType":"enum","enums":["MERGER"]},{"dataType":"enum","enums":["MACRO"]},{"dataType":"enum","enums":["SECTOR"]},{"dataType":"enum","enums":["GENERAL"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NewsCategory": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.NewsCategory","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "_36_Enums.NewsSentiment": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["BULLISH"]},{"dataType":"enum","enums":["BEARISH"]},{"dataType":"enum","enums":["NEUTRAL"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NewsSentiment": {
        "dataType": "refAlias",
        "type": {"ref":"_36_Enums.NewsSentiment","validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NewsArticleResponse": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "headline": {"dataType":"string","required":true},
            "summaryBullets": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "source": {"dataType":"string","required":true},
            "url": {"dataType":"string","required":true},
            "imageUrl": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "publishedAt": {"dataType":"datetime","required":true},
            "category": {"ref":"NewsCategory","required":true},
            "sentiment": {"dataType":"union","subSchemas":[{"ref":"NewsSentiment"},{"dataType":"enum","enums":[null]}],"required":true},
            "sentimentScore": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "relatedSymbols": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "sector": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "userContext": {"dataType":"nestedObjectLiteral","nestedProperties":{"inWatchlist":{"dataType":"boolean","required":true},"inPortfolio":{"dataType":"boolean","required":true}},"required":true},
            "isRead": {"dataType":"boolean","required":true},
            "isSaved": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NewsFeedEnvelopeResponse": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"NewsArticleResponse"},"required":true},
            "nextCursor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "hasMore": {"dataType":"boolean","required":true},
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PaginatedNews": {
        "dataType": "refObject",
        "properties": {
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"NewsArticleResponse"},"required":true},
            "nextCursor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "hasMore": {"dataType":"boolean","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NewsDataResponse_PaginatedNews_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"PaginatedNews","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NewsSummaryResponse": {
        "dataType": "refObject",
        "properties": {
            "portfolioNews": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"isRead":{"dataType":"boolean","required":true},"publishedAt":{"dataType":"datetime","required":true},"sentiment":{"dataType":"union","subSchemas":[{"ref":"NewsSentiment"},{"dataType":"enum","enums":[null]}],"required":true},"symbol":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"headline":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}},"required":true},
            "watchlistNews": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"isRead":{"dataType":"boolean","required":true},"publishedAt":{"dataType":"datetime","required":true},"sentiment":{"dataType":"union","subSchemas":[{"ref":"NewsSentiment"},{"dataType":"enum","enums":[null]}],"required":true},"symbol":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"headline":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}},"required":true},
            "marketHeadlines": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"isRead":{"dataType":"boolean","required":true},"publishedAt":{"dataType":"datetime","required":true},"sentiment":{"dataType":"union","subSchemas":[{"ref":"NewsSentiment"},{"dataType":"enum","enums":[null]}],"required":true},"symbol":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"headline":{"dataType":"string","required":true},"id":{"dataType":"string","required":true}}},"required":true},
            "unreadCount": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NewsDataResponse_NewsSummaryResponse_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"NewsSummaryResponse","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MarkReadResult": {
        "dataType": "refObject",
        "properties": {
            "updated": {"dataType":"double","required":true},
            "data": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"isRead":{"dataType":"boolean","required":true},"id":{"dataType":"string","required":true}}}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NewsDataResponse_MarkReadResult_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"MarkReadResult","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MarkMultipleReadBody": {
        "dataType": "refObject",
        "properties": {
            "articleIds": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ArticleActionState": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "isRead": {"dataType":"boolean"},
            "isSaved": {"dataType":"boolean"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "NewsDataResponse_ArticleActionState_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"ArticleActionState","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SimpleNewsMessageResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RankedStockRow": {
        "dataType": "refObject",
        "properties": {
            "rank": {"dataType":"double","required":true},
            "symbol": {"dataType":"string","required":true},
            "companyName": {"dataType":"string","required":true},
            "logoUrl": {"dataType":"string","required":true},
            "price": {"dataType":"double","required":true},
            "change": {"dataType":"double","required":true},
            "changePercent": {"dataType":"double","required":true},
            "previousClose": {"dataType":"double","required":true},
            "high": {"dataType":"double","required":true},
            "low": {"dataType":"double","required":true},
            "open": {"dataType":"double","required":true},
            "timestamp": {"dataType":"double","required":true},
            "sparkline": {"dataType":"array","array":{"dataType":"double"}},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetTopStocksResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"array","array":{"dataType":"refObject","ref":"RankedStockRow"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "Prediction": {
        "dataType": "refObject",
        "properties": {
            "date": {"dataType":"string","required":true},
            "bull": {"dataType":"double","required":true},
            "base": {"dataType":"double","required":true},
            "bear": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HistoricalPoint": {
        "dataType": "refObject",
        "properties": {
            "date": {"dataType":"string","required":true},
            "close": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ForecastResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"nestedObjectLiteral","nestedProperties":{"estimated_ready_at":{"dataType":"double"},"status":{"dataType":"string"},"targetRange":{"dataType":"nestedObjectLiteral","nestedProperties":{"confidence":{"dataType":"union","subSchemas":[{"dataType":"enum","enums":["HIGH"]},{"dataType":"enum","enums":["MEDIUM"]},{"dataType":"enum","enums":["LOW"]}],"required":true},"atr":{"dataType":"double","required":true},"bear":{"dataType":"double","required":true},"base":{"dataType":"double","required":true},"bull":{"dataType":"double","required":true}}},"units":{"dataType":"string","required":true},"historicalData":{"dataType":"array","array":{"dataType":"refObject","ref":"HistoricalPoint"},"required":true},"predictions":{"dataType":"array","array":{"dataType":"refObject","ref":"Prediction"},"required":true},"period":{"dataType":"string","required":true},"symbol":{"dataType":"string","required":true}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DecisionResponse_any_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"any","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PortfolioDecisionRequestBody": {
        "dataType": "refObject",
        "properties": {
            "portfolioId": {"dataType":"string","required":true},
            "decisionMode": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["OVERVIEW"]},{"dataType":"enum","enums":["DETAILED"]}],"required":true},
            "symbol": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DashboardBriefing": {
        "dataType": "refObject",
        "properties": {
            "greeting": {"dataType":"string","required":true},
            "generatedAt": {"dataType":"string","required":true},
            "decisionSupport": {"dataType":"nestedObjectLiteral","nestedProperties":{"headline":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"summary":{"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"lastRunAt":{"dataType":"datetime","required":true},"positionsAtRisk":{"dataType":"double","required":true},"trimSignals":{"dataType":"double","required":true},"holdSignals":{"dataType":"double","required":true},"buySignals":{"dataType":"double","required":true}}},{"dataType":"enum","enums":[null]}],"required":true},"reason":{"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},"available":{"dataType":"boolean","required":true}},"required":true},
            "portfolioAlert": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"headline":{"dataType":"string","required":true},"entryZonesActive":{"dataType":"double","required":true},"stopLossBreaches":{"dataType":"double","required":true},"overexposedSectors":{"dataType":"array","array":{"dataType":"string"},"required":true}}},{"dataType":"enum","enums":[null]}],"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HealthScoreBreakdown": {
        "dataType": "refObject",
        "properties": {
            "diversification": {"dataType":"double","required":true},
            "riskReward": {"dataType":"double","required":true},
            "volatility": {"dataType":"double","required":true},
            "alertHealth": {"dataType":"double","required":true},
            "watchlistDiscipline": {"dataType":"double","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "HealthScore": {
        "dataType": "refObject",
        "properties": {
            "score": {"dataType":"double","required":true},
            "band": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["Excellent"]},{"dataType":"enum","enums":["Good"]},{"dataType":"enum","enums":["Fair"]},{"dataType":"enum","enums":["Poor"]}],"required":true},
            "label": {"dataType":"string","required":true},
            "breakdown": {"ref":"HealthScoreBreakdown","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DashboardPortfolio": {
        "dataType": "refObject",
        "properties": {
            "available": {"dataType":"boolean","required":true},
            "reason": {"dataType":"string"},
            "totalValue": {"dataType":"double"},
            "totalUnrealizedPnL": {"dataType":"double"},
            "totalUnrealizedPnLPct": {"dataType":"double"},
            "todayGainLoss": {"dataType":"double"},
            "todayGainLossPct": {"dataType":"double"},
            "bestPerformer": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"changePercent":{"dataType":"double","required":true},"symbol":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}]},
            "worstPerformer": {"dataType":"union","subSchemas":[{"dataType":"nestedObjectLiteral","nestedProperties":{"changePercent":{"dataType":"double","required":true},"symbol":{"dataType":"string","required":true}}},{"dataType":"enum","enums":[null]}]},
            "healthScore": {"ref":"HealthScore"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ImpactType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["NEGATIVE_HOLDING"]},{"dataType":"enum","enums":["POSITIVE_HOLDING"]},{"dataType":"enum","enums":["NEGATIVE_WATCHLIST"]},{"dataType":"enum","enums":["POSITIVE_WATCHLIST"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "ImpactNewsItem": {
        "dataType": "refObject",
        "properties": {
            "id": {"dataType":"string","required":true},
            "headline": {"dataType":"string","required":true},
            "sentiment": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["BULLISH"]},{"dataType":"enum","enums":["BEARISH"]},{"dataType":"enum","enums":["NEUTRAL"]}],"required":true},
            "symbol": {"dataType":"string","required":true},
            "impact": {"ref":"ImpactType","required":true},
            "sharesHeld": {"dataType":"union","subSchemas":[{"dataType":"double"},{"dataType":"enum","enums":[null]}],"required":true},
            "publishedAt": {"dataType":"datetime","required":true},
            "source": {"dataType":"string","required":true},
            "url": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SmartTriggerType": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["STOP_LOSS_BREACHED"]},{"dataType":"enum","enums":["EARNINGS_APPROACHING"]},{"dataType":"enum","enums":["ENTRY_ZONE"]},{"dataType":"enum","enums":["DIVIDEND_APPROACHING"]},{"dataType":"enum","enums":["ANALYST_RATING_CHANGE"]},{"dataType":"enum","enums":["AI_SIGNAL_CHANGED"]},{"dataType":"enum","enums":["PCT_CHANGE_UP"]},{"dataType":"enum","enums":["PCT_CHANGE_DOWN"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "TriggerUrgency": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["HIGH"]},{"dataType":"enum","enums":["MEDIUM"]},{"dataType":"enum","enums":["LOW"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SmartTrigger": {
        "dataType": "refObject",
        "properties": {
            "type": {"ref":"SmartTriggerType","required":true},
            "symbol": {"dataType":"string","required":true},
            "urgency": {"ref":"TriggerUrgency","required":true},
            "message": {"dataType":"string","required":true},
            "context": {"dataType":"string","required":true},
            "action": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SectorSignal": {
        "dataType": "refAlias",
        "type": {"dataType":"union","subSchemas":[{"dataType":"enum","enums":["OVEREXPOSED"]},{"dataType":"enum","enums":["BLIND_SPOT"]},{"dataType":"enum","enums":["WELL_POSITIONED"]},{"dataType":"enum","enums":["UNDERPERFORMING"]},{"dataType":"enum","enums":["NEUTRAL"]},{"dataType":"enum","enums":["NO_EXPOSURE"]}],"validators":{}},
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "SectorHeatmapItem": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "performance": {"dataType":"nestedObjectLiteral","nestedProperties":{"1m":{"dataType":"double","required":true},"5d":{"dataType":"double","required":true},"1d":{"dataType":"double","required":true}},"required":true},
            "userExposurePct": {"dataType":"double","required":true},
            "userSymbols": {"dataType":"array","array":{"dataType":"string"},"required":true},
            "signal": {"ref":"SectorSignal","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "DashboardResponse": {
        "dataType": "refObject",
        "properties": {
            "briefing": {"ref":"DashboardBriefing","required":true},
            "portfolio": {"ref":"DashboardPortfolio","required":true},
            "impactNews": {"dataType":"nestedObjectLiteral","nestedProperties":{"totalCount":{"dataType":"double","required":true},"items":{"dataType":"array","array":{"dataType":"refObject","ref":"ImpactNewsItem"},"required":true}},"required":true},
            "smartTriggers": {"dataType":"nestedObjectLiteral","nestedProperties":{"totalCount":{"dataType":"double","required":true},"items":{"dataType":"array","array":{"dataType":"refObject","ref":"SmartTrigger"},"required":true}},"required":true},
            "sectorHeatmap": {"dataType":"nestedObjectLiteral","nestedProperties":{"sectors":{"dataType":"array","array":{"dataType":"refObject","ref":"SectorHeatmapItem"},"required":true},"cachedAt":{"dataType":"string","required":true}},"required":true},
            "trendingStocks": {"dataType":"array","array":{"dataType":"refObject","ref":"RankedStockRow"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GetDashboardApiResponse": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"ref":"DashboardResponse","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "MeProfile": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "email": {"dataType":"string","required":true},
            "displayName": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}],"required":true},
            "userRoles": {"dataType":"array","array":{"dataType":"nestedObjectLiteral","nestedProperties":{"role":{"dataType":"nestedObjectLiteral","nestedProperties":{"name":{"dataType":"string","required":true}},"required":true}}},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthApiResponse_MeProfile_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "user": {"ref":"MeProfile"},
            "accessToken": {"dataType":"string"},
            "requiresOnboarding": {"dataType":"boolean"},
            "onboardingToken": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthApiResponse_void_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "user": {"dataType":"void"},
            "accessToken": {"dataType":"string"},
            "requiresOnboarding": {"dataType":"boolean"},
            "onboardingToken": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RequestMagicLinkBody": {
        "dataType": "refObject",
        "properties": {
            "email": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AuthApiResponse_any_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "user": {"dataType":"any"},
            "accessToken": {"dataType":"string"},
            "requiresOnboarding": {"dataType":"boolean"},
            "onboardingToken": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "VerifyMagicLinkBody": {
        "dataType": "refObject",
        "properties": {
            "token": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CompleteOnboardingBody": {
        "dataType": "refObject",
        "properties": {
            "onboardingToken": {"dataType":"string"},
            "displayName": {"dataType":"string"},
            "email": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "GoogleLoginBody": {
        "dataType": "refObject",
        "properties": {
            "credential": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "RefreshTokenBody": {
        "dataType": "refObject",
        "properties": {
            "refresh_token": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "LogoutBody": {
        "dataType": "refObject",
        "properties": {
            "refresh_token": {"dataType":"string"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AccessControlResponse_any_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"any"},
            "nextCursor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "hasMore": {"dataType":"boolean"},
            "total": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "CreateRoleBody": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "description": {"dataType":"string","required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AccessControlResponse_void_": {
        "dataType": "refObject",
        "properties": {
            "success": {"dataType":"boolean","required":true},
            "message": {"dataType":"string","required":true},
            "data": {"dataType":"void"},
            "nextCursor": {"dataType":"union","subSchemas":[{"dataType":"string"},{"dataType":"enum","enums":[null]}]},
            "hasMore": {"dataType":"boolean"},
            "total": {"dataType":"double"},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AssignRoleBody": {
        "dataType": "refObject",
        "properties": {
            "userId": {"dataType":"string","required":true},
            "roleIds": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "PermissionInput": {
        "dataType": "refObject",
        "properties": {
            "resourceName": {"dataType":"string","required":true},
            "actions": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AssignPermissionsBody": {
        "dataType": "refObject",
        "properties": {
            "roleId": {"dataType":"string","required":true},
            "permissions": {"dataType":"array","array":{"dataType":"refObject","ref":"PermissionInput"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AssignActionsResourceItem": {
        "dataType": "refObject",
        "properties": {
            "name": {"dataType":"string","required":true},
            "actions": {"dataType":"array","array":{"dataType":"string"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
    "AssignActionsBody": {
        "dataType": "refObject",
        "properties": {
            "resources": {"dataType":"array","array":{"dataType":"refObject","ref":"AssignActionsResourceItem"},"required":true},
        },
        "additionalProperties": false,
    },
    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
};
const templateService = new ExpressTemplateService(models, {"noImplicitAdditionalProperties":"throw-on-extras","bodyCoercion":true});

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa




export function RegisterRoutes(app: Router,opts?:{multer?:ReturnType<typeof multer>}) {

    // ###########################################################################################################
    //  NOTE: If you do not see routes for all of your controllers in this file, then you might not have informed tsoa of where to look
    //      Please look into the "controllerPathGlobs" config option described in the readme: https://github.com/lukeautry/tsoa
    // ###########################################################################################################

    const upload = opts?.multer ||  multer({"limits":{"fileSize":8388608}});

    
        const argsWatchlistController_getWatchlist: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.get('/api/v1/watchlist',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController)),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController.prototype.getWatchlist)),

            async function WatchlistController_getWatchlist(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWatchlistController_getWatchlist, request, response });

                const controller = new WatchlistController();

              await templateService.apiHandler({
                methodName: 'getWatchlist',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWatchlistController_addToWatchlist: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"AddToWatchlistBody"},
        };
        app.post('/api/v1/watchlist',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController)),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController.prototype.addToWatchlist)),

            async function WatchlistController_addToWatchlist(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWatchlistController_addToWatchlist, request, response });

                const controller = new WatchlistController();

              await templateService.apiHandler({
                methodName: 'addToWatchlist',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWatchlistController_updateWatchlistEntry: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                symbol: {"in":"path","name":"symbol","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateWatchlistBody"},
        };
        app.patch('/api/v1/watchlist/:symbol',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController)),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController.prototype.updateWatchlistEntry)),

            async function WatchlistController_updateWatchlistEntry(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWatchlistController_updateWatchlistEntry, request, response });

                const controller = new WatchlistController();

              await templateService.apiHandler({
                methodName: 'updateWatchlistEntry',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWatchlistController_removeFromWatchlist: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                symbol: {"in":"path","name":"symbol","required":true,"dataType":"string"},
        };
        app.delete('/api/v1/watchlist/:symbol',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController)),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController.prototype.removeFromWatchlist)),

            async function WatchlistController_removeFromWatchlist(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWatchlistController_removeFromWatchlist, request, response });

                const controller = new WatchlistController();

              await templateService.apiHandler({
                methodName: 'removeFromWatchlist',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWatchlistController_convertToPosition: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                symbol: {"in":"path","name":"symbol","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"ConvertToPositionBody"},
        };
        app.post('/api/v1/watchlist/:symbol/convert-to-position',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController)),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController.prototype.convertToPosition)),

            async function WatchlistController_convertToPosition(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWatchlistController_convertToPosition, request, response });

                const controller = new WatchlistController();

              await templateService.apiHandler({
                methodName: 'convertToPosition',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWatchlistController_getAlerts: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                symbol: {"in":"path","name":"symbol","required":true,"dataType":"string"},
        };
        app.get('/api/v1/watchlist/:symbol/alerts',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController)),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController.prototype.getAlerts)),

            async function WatchlistController_getAlerts(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWatchlistController_getAlerts, request, response });

                const controller = new WatchlistController();

              await templateService.apiHandler({
                methodName: 'getAlerts',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWatchlistController_createAlert: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                symbol: {"in":"path","name":"symbol","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"CreateAlertBody"},
        };
        app.post('/api/v1/watchlist/:symbol/alerts',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController)),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController.prototype.createAlert)),

            async function WatchlistController_createAlert(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWatchlistController_createAlert, request, response });

                const controller = new WatchlistController();

              await templateService.apiHandler({
                methodName: 'createAlert',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWatchlistController_updateAlert: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                symbol: {"in":"path","name":"symbol","required":true,"dataType":"string"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
                body: {"in":"body","name":"body","required":true,"ref":"UpdateAlertBody"},
        };
        app.patch('/api/v1/watchlist/:symbol/alerts/:id',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController)),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController.prototype.updateAlert)),

            async function WatchlistController_updateAlert(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWatchlistController_updateAlert, request, response });

                const controller = new WatchlistController();

              await templateService.apiHandler({
                methodName: 'updateAlert',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsWatchlistController_deleteAlert: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                symbol: {"in":"path","name":"symbol","required":true,"dataType":"string"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.delete('/api/v1/watchlist/:symbol/alerts/:id',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController)),
            ...(fetchMiddlewares<RequestHandler>(WatchlistController.prototype.deleteAlert)),

            async function WatchlistController_deleteAlert(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsWatchlistController_deleteAlert, request, response });

                const controller = new WatchlistController();

              await templateService.apiHandler({
                methodName: 'deleteAlert',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsSearchController_symbolLookup: Record<string, TsoaRoute.ParameterSchema> = {
                q: {"in":"query","name":"q","required":true,"dataType":"string"},
                exchange: {"in":"query","name":"exchange","dataType":"string"},
        };
        app.get('/api/v1/search/symbol-lookup',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(SearchController)),
            ...(fetchMiddlewares<RequestHandler>(SearchController.prototype.symbolLookup)),

            async function SearchController_symbolLookup(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsSearchController_symbolLookup, request, response });

                const controller = new SearchController();

              await templateService.apiHandler({
                methodName: 'symbolLookup',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationController_getNotifications: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/notifications',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationController.prototype.getNotifications)),

            async function NotificationController_getNotifications(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationController_getNotifications, request, response });

                const controller = new NotificationController();

              await templateService.apiHandler({
                methodName: 'getNotifications',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationController_getNotificationSummary: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.get('/api/v1/notifications/summary',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationController.prototype.getNotificationSummary)),

            async function NotificationController_getNotificationSummary(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationController_getNotificationSummary, request, response });

                const controller = new NotificationController();

              await templateService.apiHandler({
                methodName: 'getNotificationSummary',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationController_markAllAsRead: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.patch('/api/v1/notifications/read-all',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationController.prototype.markAllAsRead)),

            async function NotificationController_markAllAsRead(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationController_markAllAsRead, request, response });

                const controller = new NotificationController();

              await templateService.apiHandler({
                methodName: 'markAllAsRead',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationController_markMultipleAsRead: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"MarkMultipleNotificationsReadBody"},
        };
        app.patch('/api/v1/notifications/read-multiple',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationController.prototype.markMultipleAsRead)),

            async function NotificationController_markMultipleAsRead(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationController_markMultipleAsRead, request, response });

                const controller = new NotificationController();

              await templateService.apiHandler({
                methodName: 'markMultipleAsRead',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationController_markAsRead: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.patch('/api/v1/notifications/:id/read',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationController.prototype.markAsRead)),

            async function NotificationController_markAsRead(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationController_markAsRead, request, response });

                const controller = new NotificationController();

              await templateService.apiHandler({
                methodName: 'markAsRead',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNotificationController_deleteNotification: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.delete('/api/v1/notifications/:id',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NotificationController)),
            ...(fetchMiddlewares<RequestHandler>(NotificationController.prototype.deleteNotification)),

            async function NotificationController_deleteNotification(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNotificationController_deleteNotification, request, response });

                const controller = new NotificationController();

              await templateService.apiHandler({
                methodName: 'deleteNotification',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNewsController_getNewsFeed: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
                category: {"in":"query","name":"category","ref":"NewsCategory"},
                symbol: {"in":"query","name":"symbol","dataType":"string"},
                filter: {"default":"all","in":"query","name":"filter","dataType":"union","subSchemas":[{"dataType":"enum","enums":["portfolio"]},{"dataType":"enum","enums":["watchlist"]},{"dataType":"enum","enums":["all"]}]},
        };
        app.get('/api/v1/news/feed',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NewsController)),
            ...(fetchMiddlewares<RequestHandler>(NewsController.prototype.getNewsFeed)),

            async function NewsController_getNewsFeed(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNewsController_getNewsFeed, request, response });

                const controller = new NewsController();

              await templateService.apiHandler({
                methodName: 'getNewsFeed',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNewsController_searchNews: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                q: {"in":"query","name":"q","dataType":"string"},
                symbol: {"in":"query","name":"symbol","dataType":"string"},
                category: {"in":"query","name":"category","ref":"NewsCategory"},
                from: {"in":"query","name":"from","dataType":"string"},
                to: {"in":"query","name":"to","dataType":"string"},
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/news/search',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NewsController)),
            ...(fetchMiddlewares<RequestHandler>(NewsController.prototype.searchNews)),

            async function NewsController_searchNews(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNewsController_searchNews, request, response });

                const controller = new NewsController();

              await templateService.apiHandler({
                methodName: 'searchNews',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNewsController_getNewsSummary: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.get('/api/v1/news/summary',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NewsController)),
            ...(fetchMiddlewares<RequestHandler>(NewsController.prototype.getNewsSummary)),

            async function NewsController_getNewsSummary(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNewsController_getNewsSummary, request, response });

                const controller = new NewsController();

              await templateService.apiHandler({
                methodName: 'getNewsSummary',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNewsController_getSavedNews: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/news/saved',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NewsController)),
            ...(fetchMiddlewares<RequestHandler>(NewsController.prototype.getSavedNews)),

            async function NewsController_getSavedNews(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNewsController_getSavedNews, request, response });

                const controller = new NewsController();

              await templateService.apiHandler({
                methodName: 'getSavedNews',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNewsController_getNewsBySymbol: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                symbol: {"in":"path","name":"symbol","required":true,"dataType":"string"},
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/news/symbol/:symbol',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NewsController)),
            ...(fetchMiddlewares<RequestHandler>(NewsController.prototype.getNewsBySymbol)),

            async function NewsController_getNewsBySymbol(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNewsController_getNewsBySymbol, request, response });

                const controller = new NewsController();

              await templateService.apiHandler({
                methodName: 'getNewsBySymbol',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNewsController_markAllAsRead: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.patch('/api/v1/news/read-all',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NewsController)),
            ...(fetchMiddlewares<RequestHandler>(NewsController.prototype.markAllAsRead)),

            async function NewsController_markAllAsRead(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNewsController_markAllAsRead, request, response });

                const controller = new NewsController();

              await templateService.apiHandler({
                methodName: 'markAllAsRead',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNewsController_markMultipleAsRead: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"MarkMultipleReadBody"},
        };
        app.patch('/api/v1/news/read-multiple',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NewsController)),
            ...(fetchMiddlewares<RequestHandler>(NewsController.prototype.markMultipleAsRead)),

            async function NewsController_markMultipleAsRead(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNewsController_markMultipleAsRead, request, response });

                const controller = new NewsController();

              await templateService.apiHandler({
                methodName: 'markMultipleAsRead',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNewsController_markAsRead: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.patch('/api/v1/news/:id/read',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NewsController)),
            ...(fetchMiddlewares<RequestHandler>(NewsController.prototype.markAsRead)),

            async function NewsController_markAsRead(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNewsController_markAsRead, request, response });

                const controller = new NewsController();

              await templateService.apiHandler({
                methodName: 'markAsRead',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNewsController_saveArticle: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.post('/api/v1/news/:id/save',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NewsController)),
            ...(fetchMiddlewares<RequestHandler>(NewsController.prototype.saveArticle)),

            async function NewsController_saveArticle(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNewsController_saveArticle, request, response });

                const controller = new NewsController();

              await templateService.apiHandler({
                methodName: 'saveArticle',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsNewsController_unsaveArticle: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                id: {"in":"path","name":"id","required":true,"dataType":"string"},
        };
        app.delete('/api/v1/news/:id/save',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(NewsController)),
            ...(fetchMiddlewares<RequestHandler>(NewsController.prototype.unsaveArticle)),

            async function NewsController_unsaveArticle(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsNewsController_unsaveArticle, request, response });

                const controller = new NewsController();

              await templateService.apiHandler({
                methodName: 'unsaveArticle',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsMarketController_getTopStocks: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/v1/market/top-stocks',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(MarketController)),
            ...(fetchMiddlewares<RequestHandler>(MarketController.prototype.getTopStocks)),

            async function MarketController_getTopStocks(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsMarketController_getTopStocks, request, response });

                const controller = new MarketController();

              await templateService.apiHandler({
                methodName: 'getTopStocks',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsForecastController_getStockForecast: Record<string, TsoaRoute.ParameterSchema> = {
                symbol: {"in":"query","name":"symbol","required":true,"dataType":"string"},
                period: {"in":"query","name":"period","required":true,"dataType":"union","subSchemas":[{"dataType":"enum","enums":["1d"]},{"dataType":"enum","enums":["1w"]}]},
        };
        app.get('/api/v1/forecast',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(ForecastController)),
            ...(fetchMiddlewares<RequestHandler>(ForecastController.prototype.getStockForecast)),

            async function ForecastController_getStockForecast(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsForecastController_getStockForecast, request, response });

                const controller = new ForecastController();

              await templateService.apiHandler({
                methodName: 'getStockForecast',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDecisionSupportController_getMarketBasedTradeDecision: Record<string, TsoaRoute.ParameterSchema> = {
                symbol: {"in":"path","name":"symbol","required":true,"dataType":"string"},
        };
        app.get('/api/v1/decision-support/market/decision/:symbol',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(DecisionSupportController)),
            ...(fetchMiddlewares<RequestHandler>(DecisionSupportController.prototype.getMarketBasedTradeDecision)),

            async function DecisionSupportController_getMarketBasedTradeDecision(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDecisionSupportController_getMarketBasedTradeDecision, request, response });

                const controller = new DecisionSupportController();

              await templateService.apiHandler({
                methodName: 'getMarketBasedTradeDecision',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDecisionSupportController_uploadTraderPortfolio: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                file: {"in":"formData","name":"portfolio","dataType":"file"},
        };
        app.post('/api/v1/decision-support/upload-portfolio',
            authenticateMiddleware([{"bearerAuth":["PORTFOLIO:CREATE"]}]),
            upload.fields([
                {
                    name: "portfolio",
                    maxCount: 1
                }
            ]),
            ...(fetchMiddlewares<RequestHandler>(DecisionSupportController)),
            ...(fetchMiddlewares<RequestHandler>(DecisionSupportController.prototype.uploadTraderPortfolio)),

            async function DecisionSupportController_uploadTraderPortfolio(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDecisionSupportController_uploadTraderPortfolio, request, response });

                const controller = new DecisionSupportController();

              await templateService.apiHandler({
                methodName: 'uploadTraderPortfolio',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDecisionSupportController_getPortfolioBasedTradeDecision: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"PortfolioDecisionRequestBody"},
        };
        app.post('/api/v1/decision-support/portfolio/decision',
            authenticateMiddleware([{"bearerAuth":["PORTFOLIO:CREATE"]}]),
            ...(fetchMiddlewares<RequestHandler>(DecisionSupportController)),
            ...(fetchMiddlewares<RequestHandler>(DecisionSupportController.prototype.getPortfolioBasedTradeDecision)),

            async function DecisionSupportController_getPortfolioBasedTradeDecision(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDecisionSupportController_getPortfolioBasedTradeDecision, request, response });

                const controller = new DecisionSupportController();

              await templateService.apiHandler({
                methodName: 'getPortfolioBasedTradeDecision',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDecisionSupportController_getLatestPortfolio: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.get('/api/v1/decision-support/portfolio/latest',
            authenticateMiddleware([{"bearerAuth":["PORTFOLIO:READ"]}]),
            ...(fetchMiddlewares<RequestHandler>(DecisionSupportController)),
            ...(fetchMiddlewares<RequestHandler>(DecisionSupportController.prototype.getLatestPortfolio)),

            async function DecisionSupportController_getLatestPortfolio(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDecisionSupportController_getLatestPortfolio, request, response });

                const controller = new DecisionSupportController();

              await templateService.apiHandler({
                methodName: 'getLatestPortfolio',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsDashboardController_getDashboardData: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.get('/api/v1/dashboard',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(DashboardController)),
            ...(fetchMiddlewares<RequestHandler>(DashboardController.prototype.getDashboardData)),

            async function DashboardController_getDashboardData(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsDashboardController_getDashboardData, request, response });

                const controller = new DashboardController();

              await templateService.apiHandler({
                methodName: 'getDashboardData',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_getMyInfo: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.get('/api/v1/auth/me',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.getMyInfo)),

            async function AuthController_getMyInfo(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_getMyInfo, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'getMyInfo',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_requestMagicLink: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"RequestMagicLinkBody"},
        };
        app.post('/api/v1/auth/magic-link',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.requestMagicLink)),

            async function AuthController_requestMagicLink(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_requestMagicLink, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'requestMagicLink',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_verifyMagicLinkToken: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"VerifyMagicLinkBody"},
        };
        app.post('/api/v1/auth/verify-magic-link',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.verifyMagicLinkToken)),

            async function AuthController_verifyMagicLinkToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_verifyMagicLinkToken, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'verifyMagicLinkToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_completeOnboarding: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"CompleteOnboardingBody"},
        };
        app.post('/api/v1/auth/onboarding',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.completeOnboarding)),

            async function AuthController_completeOnboarding(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_completeOnboarding, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'completeOnboarding',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_googleLogin: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"GoogleLoginBody"},
        };
        app.post('/api/v1/auth/google',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.googleLogin)),

            async function AuthController_googleLogin(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_googleLogin, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'googleLogin',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_refreshToken: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","ref":"RefreshTokenBody"},
        };
        app.post('/api/v1/auth/refresh-token',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.refreshToken)),

            async function AuthController_refreshToken(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_refreshToken, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'refreshToken',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAuthController_logout: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","ref":"LogoutBody"},
        };
        app.post('/api/v1/auth/logout',
            ...(fetchMiddlewares<RequestHandler>(AuthController)),
            ...(fetchMiddlewares<RequestHandler>(AuthController.prototype.logout)),

            async function AuthController_logout(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAuthController_logout, request, response });

                const controller = new AuthController();

              await templateService.apiHandler({
                methodName: 'logout',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_getUserScreenPermissions: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
        };
        app.get('/api/v1/rbac/user-screens',
            authenticateMiddleware([{"bearerAuth":[]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.getUserScreenPermissions)),

            async function AccessControlController_getUserScreenPermissions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_getUserScreenPermissions, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'getUserScreenPermissions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_getAllUsers: Record<string, TsoaRoute.ParameterSchema> = {
                cursor: {"in":"query","name":"cursor","dataType":"string"},
                limit: {"in":"query","name":"limit","dataType":"double"},
        };
        app.get('/api/v1/rbac/users',
            authenticateMiddleware([{"bearerAuth":["ROLE:READ"]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.getAllUsers)),

            async function AccessControlController_getAllUsers(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_getAllUsers, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'getAllUsers',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_getAllRoles: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/v1/rbac/roles',
            authenticateMiddleware([{"bearerAuth":["ROLE:READ"]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.getAllRoles)),

            async function AccessControlController_getAllRoles(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_getAllRoles, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'getAllRoles',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_addRole: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"CreateRoleBody"},
        };
        app.post('/api/v1/rbac/roles',
            authenticateMiddleware([{"bearerAuth":["ROLE:CREATE"]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.addRole)),

            async function AccessControlController_addRole(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_addRole, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'addRole',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_revokeRole: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                roleId: {"in":"path","name":"roleId","required":true,"dataType":"string"},
                userId: {"in":"query","name":"userId","required":true,"dataType":"string"},
        };
        app.delete('/api/v1/rbac/roles/:roleId',
            authenticateMiddleware([{"bearerAuth":["ROLE:DELETE"]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.revokeRole)),

            async function AccessControlController_revokeRole(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_revokeRole, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'revokeRole',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_assignRole: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"AssignRoleBody"},
        };
        app.post('/api/v1/rbac/assign-role',
            authenticateMiddleware([{"bearerAuth":["ROLE:CREATE"]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.assignRole)),

            async function AccessControlController_assignRole(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_assignRole, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'assignRole',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_getAllPermissions: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/v1/rbac/permissions',
            authenticateMiddleware([{"bearerAuth":["ROLE:READ"]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.getAllPermissions)),

            async function AccessControlController_getAllPermissions(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_getAllPermissions, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'getAllPermissions',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_assignPermissionsToRole: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"AssignPermissionsBody"},
        };
        app.post('/api/v1/rbac/assign-permissions',
            authenticateMiddleware([{"bearerAuth":["ROLE:CREATE"]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.assignPermissionsToRole)),

            async function AccessControlController_assignPermissionsToRole(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_assignPermissionsToRole, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'assignPermissionsToRole',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_revokePermissionsFromRole: Record<string, TsoaRoute.ParameterSchema> = {
                req: {"in":"request","name":"req","required":true,"dataType":"object"},
                body: {"in":"body","name":"body","required":true,"ref":"AssignPermissionsBody"},
        };
        app.delete('/api/v1/rbac/revoke-permissions',
            authenticateMiddleware([{"bearerAuth":["ROLE:DELETE"]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.revokePermissionsFromRole)),

            async function AccessControlController_revokePermissionsFromRole(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_revokePermissionsFromRole, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'revokePermissionsFromRole',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_getAllResources: Record<string, TsoaRoute.ParameterSchema> = {
        };
        app.get('/api/v1/rbac/resources',
            authenticateMiddleware([{"bearerAuth":["ROLE:READ"]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.getAllResources)),

            async function AccessControlController_getAllResources(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_getAllResources, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'getAllResources',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 200,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        const argsAccessControlController_assignActionsToResources: Record<string, TsoaRoute.ParameterSchema> = {
                body: {"in":"body","name":"body","required":true,"ref":"AssignActionsBody"},
        };
        app.post('/api/v1/rbac/resource-mappings',
            authenticateMiddleware([{"bearerAuth":["ROLE:CREATE"]}]),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController)),
            ...(fetchMiddlewares<RequestHandler>(AccessControlController.prototype.assignActionsToResources)),

            async function AccessControlController_assignActionsToResources(request: ExRequest, response: ExResponse, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            let validatedArgs: any[] = [];
            try {
                validatedArgs = templateService.getValidatedArgs({ args: argsAccessControlController_assignActionsToResources, request, response });

                const controller = new AccessControlController();

              await templateService.apiHandler({
                methodName: 'assignActionsToResources',
                controller,
                response,
                next,
                validatedArgs,
                successStatus: 201,
              });
            } catch (err) {
                return next(err);
            }
        });
        // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa


    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

    function authenticateMiddleware(security: TsoaRoute.Security[] = []) {
        return async function runAuthenticationMiddleware(request: any, response: any, next: any) {

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            // keep track of failed auth attempts so we can hand back the most
            // recent one.  This behavior was previously existing so preserving it
            // here
            const failedAttempts: any[] = [];
            const pushAndRethrow = (error: any) => {
                failedAttempts.push(error);
                throw error;
            };

            const secMethodOrPromises: Promise<any>[] = [];
            for (const secMethod of security) {
                if (Object.keys(secMethod).length > 1) {
                    const secMethodAndPromises: Promise<any>[] = [];

                    for (const name in secMethod) {
                        secMethodAndPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }

                    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

                    secMethodOrPromises.push(Promise.all(secMethodAndPromises)
                        .then(users => { return users[0]; }));
                } else {
                    for (const name in secMethod) {
                        secMethodOrPromises.push(
                            expressAuthenticationRecasted(request, name, secMethod[name], response)
                                .catch(pushAndRethrow)
                        );
                    }
                }
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa

            try {
                request['user'] = await Promise.any(secMethodOrPromises);

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }

                next();
            }
            catch(err) {
                // Show most recent error as response
                const error = failedAttempts.pop();
                error.status = error.status || 401;

                // Response was sent in middleware, abort
                if (response.writableEnded) {
                    return;
                }
                next(error);
            }

            // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
        }
    }

    // WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
}

// WARNING: This file was auto-generated with tsoa. Please do not modify it. Re-run tsoa to re-generate this file: https://github.com/lukeautry/tsoa
