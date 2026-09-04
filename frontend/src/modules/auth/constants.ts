import React from "react";
import {
  ArrowRight,
  Bell,
  Cpu,
  FileText,
  Landmark,
  Mail,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import type { MarketInterest, NotificationPreferences } from "@/modules/notifications/types";
import type {
  NotificationPreferenceToggle,
  SuggestedSymbol,
} from "./types";

export const SUGGESTED_SYMBOLS: SuggestedSymbol[] = [
  {
    symbol: "NVDA",
    name: "NVIDIA Corp.",
    sector: "Semiconductors",
    category: "tech",
    hasAiForecast: true,
  },
  {
    symbol: "AAPL",
    name: "Apple Inc.",
    sector: "Consumer Tech",
    category: "tech",
    hasAiForecast: true,
  },
  {
    symbol: "MSFT",
    name: "Microsoft Corp.",
    sector: "Cloud & AI",
    category: "tech",
    hasAiForecast: true,
  },
  {
    symbol: "TSLA",
    name: "Tesla Inc.",
    sector: "EV & AI",
    category: "growth",
    hasAiForecast: true,
  },
  {
    symbol: "AMZN",
    name: "Amazon.com Inc.",
    sector: "E-Commerce & Cloud",
    category: "consumer",
    hasAiForecast: true,
  },
  {
    symbol: "META",
    name: "Meta Platforms",
    sector: "Digital Media & AI",
    category: "growth",
    hasAiForecast: true,
  },
  {
    symbol: "NFLX",
    name: "Netflix Inc.",
    sector: "Streaming Media",
    category: "consumer",
    hasAiForecast: false,
  },
  {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF",
    sector: "Index ETF",
    category: "index",
    hasAiForecast: true,
  },
  {
    symbol: "QQQ",
    name: "Invesco QQQ Trust",
    sector: "Nasdaq-100 ETF",
    category: "index",
    hasAiForecast: true,
  },
];

export const SECTOR_TABS = [
  { id: "all", label: "All Sectors" },
  { id: "tech", label: "AI & Tech" },
  { id: "growth", label: "Growth" },
  { id: "consumer", label: "Consumer" },
  { id: "index", label: "Index ETFs" },
] as const;

export const MARKET_TOPICS: {
  id: MarketInterest;
  name: string;
  icon: React.ElementType;
}[] = [
  { id: "ai_tech", name: "AI & Tech", icon: Cpu },
  { id: "energy", name: "Energy", icon: Sparkles },
  { id: "finance", name: "Finance", icon: Landmark },
  { id: "healthcare", name: "Healthcare", icon: Bell },
  { id: "growth", name: "Growth Stocks", icon: ArrowRight },
  { id: "consumer", name: "Consumer", icon: ShoppingBag },
];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  marketInterests: ["ai_tech", "growth"],
  inAppAlertsEnabled: true,
  emailVolatilityAlertsEnabled: true,
  dailyDigestEnabled: true,
};

export const ALERT_CHANNEL_OPTIONS: {
  key: NotificationPreferenceToggle;
  title: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    key: "inAppAlertsEnabled",
    title: "In-App Real-Time Alerts",
    description: "Live notifications for watchlist triggers.",
    icon: Bell,
  },
  {
    key: "emailVolatilityAlertsEnabled",
    title: "Email Volatility Alerts",
    description: "Email for watchlist alert events.",
    icon: Mail,
  },
  {
    key: "dailyDigestEnabled",
    title: "Daily Pre-Market Digest",
    description: "Weekday email briefing at 8:30 AM New York time.",
    icon: FileText,
  },
];
