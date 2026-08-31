import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { socketManager, Trade } from "@/shared/utils/socketManager";

export const useSocket = (autoConnect = true) => {
  const [connected, setConnected] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const tradesRef = useRef<Map<string, Trade>>(new Map());
  const updateCountsRef = useRef<Map<string, number>>(new Map());
  const [tradeCount, setTradeCount] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const onConnect = (socketId: string) => {
      setConnected(true);
      setError(null);
    };

    const onDisconnect = () => {
      setConnected(false);
    };

    const onTrade = (trade: Trade) => {
      const key = trade.s.toUpperCase();
      tradesRef.current.set(key, trade);
      updateCountsRef.current.set(key, (updateCountsRef.current.get(key) ?? 0) + 1);
      setTradeCount(prev => prev + 1);
      setLastUpdate(new Date());
    };

    const onFinnhubErr = (payload: any) => {
      const errorMsg = typeof payload === "string" ? payload : payload?.message ?? JSON.stringify(payload);
      setError(errorMsg);
    };

    socketManager.on("connect", onConnect);
    socketManager.on("disconnect", onDisconnect);
    socketManager.on("trade", onTrade);
    socketManager.on("finnhub_error", onFinnhubErr);
    socketManager.on("connect_error", (e) => setError(e?.message ?? "Connection error"));
    socketManager.on("error", (e) => setError(e?.message ?? "Socket error"));

    if (autoConnect) socketManager.connect();

    return () => {
      socketManager.off("connect", onConnect);
      socketManager.off("disconnect", onDisconnect);
      socketManager.off("trade", onTrade);
      socketManager.off("finnhub_error", onFinnhubErr);
      socketManager.off("connect_error");
      socketManager.off("error");
    };
  }, [autoConnect]);

  const subscribe = useCallback((symbol: string) => {
    socketManager.subscribe(symbol);
  }, []);

  const unsubscribe = useCallback((symbol: string) => {
    socketManager.unsubscribe(symbol);
  }, []);

  const getTrades = useCallback(() => {
    return Array.from(tradesRef.current.values());
  }, []);

  const getTradeMap = useCallback(() => {
    return tradesRef.current;
  }, []);

  const status = useCallback(() => {
    return socketManager.getStatus();
  }, []);

  // Actual per-symbol update counts, updated whenever a trade arrives
  const tradeStats = useMemo(() => {
    return new Map(updateCountsRef.current);
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
    tradeCount,
  };
};