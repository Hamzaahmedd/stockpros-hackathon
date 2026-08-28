// src/hooks/useSocket.ts - UPDATED
import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { socketManager, Trade } from "@/shared/utils/socketManager";

export const useSocket = (autoConnect = true) => {
  const [connected, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const tradesRef = useRef<Map<string, Trade>>(new Map());
  const [tradeCount, setTradeCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Log component lifecycle
  console.log('🔧 useSocket hook rendering. Connected:', connected, 'Trade count:', tradeCount);

  useEffect(() => {
    console.log('🎯 useSocket useEffect running. AutoConnect:', autoConnect);

    const onConnect = (socketId: unknown) => {
      console.log('✅ useSocket: Connected with ID:', socketId);
      setConnected(true);
      setError(null);
    };

    const onDisconnect = (reason: unknown) => {
      console.log('❌ useSocket: Disconnected. Reason:', reason);
      setConnected(false);
    };

    const onTrade = (payload: unknown) => {
      const trade = payload as Trade;
      console.log('📥 useSocket: Processing trade for', trade.s, {
        price: trade.p,
        snapshot: trade.snapshot,
        timestamp: trade.t ? new Date(trade.t).toLocaleTimeString() : 'no time'
      });

      tradesRef.current.set(trade.s.toUpperCase(), trade);
      setTradeCount(prev => prev + 1);
      setLastUpdate(new Date());
    };

    const onFinnhubErr = (payload: unknown) => {
      const asRecord = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : undefined;
      const errorMsg =
        typeof payload === "string"
          ? payload
          : typeof asRecord?.message === "string"
            ? asRecord.message
            : JSON.stringify(payload);
      console.error('🔥 useSocket: Finnhub error:', errorMsg);
      setError(errorMsg);
    };

    const onSubscribed = (payload: unknown) => {
      console.log('✅ useSocket: Subscribed to', (payload as { symbol?: string })?.symbol);
    };

    const onUnsubscribed = (payload: unknown) => {
      console.log('❌ useSocket: Unsubscribed from', (payload as { symbol?: string })?.symbol);
    };

    // Register all listeners
    socketManager.on("connect", onConnect);
    socketManager.on("disconnect", onDisconnect);
    socketManager.on("trade", onTrade);
    socketManager.on("finnhub_error", onFinnhubErr);
    socketManager.on("subscribed", onSubscribed);
    socketManager.on("unsubscribed", onUnsubscribed);
    socketManager.on("connect_error", (e) => {
      const message = e instanceof Error ? e.message : undefined;
      console.error('🔥 useSocket: Connect error:', message ?? "connect_error");
      setError(message ?? "Connection error");
    });
    socketManager.on("error", (e) => {
      const message = e instanceof Error ? e.message : undefined;
      console.error('🔥 useSocket: Socket error:', message ?? String(e));
      setError(message ?? "Socket error");
    });

    if (autoConnect) {
      console.log('🔌 useSocket: Auto-connecting...');
      socketManager.connect();
    } else {
      console.log('⏸️ useSocket: Auto-connect disabled');
    }

    return () => {
      console.log('🧹 useSocket: Cleaning up listeners');
      socketManager.off("connect", onConnect);
      socketManager.off("disconnect", onDisconnect);
      socketManager.off("trade", onTrade);
      socketManager.off("finnhub_error", onFinnhubErr);
      socketManager.off("subscribed", onSubscribed);
      socketManager.off("unsubscribed", onUnsubscribed);
      socketManager.off("connect_error");
      socketManager.off("error");
    };
  }, [autoConnect]);

  const subscribe = useCallback((symbol: string) => {
    console.log('📝 useSocket.subscribe() called for:', symbol);
    socketManager.subscribe(symbol);
  }, []);

  const unsubscribe = useCallback((symbol: string) => {
    console.log('🗑️ useSocket.unsubscribe() called for:', symbol);
    socketManager.unsubscribe(symbol);
  }, []);

  const getTrades = useCallback(() => {
    const trades = Array.from(tradesRef.current.values());
    console.log('📊 useSocket.getTrades(): Returning', trades.length, 'trades');
    return trades;
  }, []);

  const getTradeMap = useCallback(() => {
    const map = tradesRef.current;
    console.log('🗺️ useSocket.getTradeMap(): Map size:', map.size);
    return map;
  }, []);

  const status = useCallback(() => {
    const status = socketManager.getStatus();
    console.log('📈 useSocket.status():', status);
    return status;
  }, []);

  // Memoized trade count by symbol
  const tradeStats = useMemo(() => {
    const stats = new Map<string, number>();
    const trades = tradesRef.current;
    trades.forEach((_trade, symbol) => {
      const count = stats.get(symbol) || 0;
      stats.set(symbol, count + 1);
    });
    console.log('📊 Trade stats:', Object.fromEntries(stats));
    return stats;
  }, [tradeCount]);

  return {
    connected,
    error,
    subscribe,
    unsubscribe,
    getTrades,
    getTradeMap,
    status,
    tradeStats,
    lastUpdate,
    tradeCount
  };
};