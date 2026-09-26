import type { Trade } from "@/modules/markets/types";
import { io, Socket } from "socket.io-client";
import { API_URL } from "../config";
import { getAccessToken } from "./token";
import { SocketEvent } from "./socket-events";
import type { SocketListener as Listener } from "../types/socket";

class SocketManager {
  private socket?: Socket;
  private url: string;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;
  private listeners = new Map<string, Set<Listener>>();
  private pendingSubs = new Set<string>();
  private subscribed = new Set<string>();
  private subThrottleMs = 120;
  private subTimer?: number;
  private manualDisconnect = false;

  constructor(url: string) {
    this.url = url;
  }

  connect() {
    if (this.socket && this.connected) return;
    this.manualDisconnect = false;
    this.createSocket();
  }

  disconnect() {
    this.manualDisconnect = true;
    if (this.socket) {
      try { this.socket.disconnect(); } catch { /* socket already closed */ }
      this.socket = undefined;
    }
    this.connected = false;
  }

  private createSocket() {
    if (this.socket) return;
    this.socket = io(this.url, {
      transports: ["websocket"],
      reconnection: false,
      auth: { token: getAccessToken() },
    });

    this.socket.on("connect", () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emitLocal("connect", this.socket?.id);
      this.flushPendingSubscriptions();
    });

    this.socket.on("disconnect", (reason: any) => {
      this.connected = false;
      this.emitLocal("disconnect", reason);
      if (!this.manualDisconnect) this.retryConnect();
    });

    this.socket.on(SocketEvent.Trade, (trade: Trade) => {
      this.emitLocal(SocketEvent.Trade, trade);
    });

    this.socket.on(SocketEvent.Subscribed, (payload: any) => this.emitLocal(SocketEvent.Subscribed, payload));
    this.socket.on(SocketEvent.Unsubscribed, (payload: any) => this.emitLocal(SocketEvent.Unsubscribed, payload));
    this.socket.on(SocketEvent.FinnhubError, (payload: any) => this.emitLocal(SocketEvent.FinnhubError, payload));
    this.socket.on(SocketEvent.PlanRestricted, (payload: any) => this.emitLocal(SocketEvent.PlanRestricted, payload));

    this.socket.on("connect_error", (err: any) => {
      this.connected = false;
      this.emitLocal("connect_error", err);
      this.retryConnect();
    });

    this.socket.on(SocketEvent.Error, (err: any) => {
      this.emitLocal(SocketEvent.Error, err);
    });
  }

  private retryConnect() {
    if (this.manualDisconnect) return;
    this.reconnectAttempts++;
    const delay = Math.min(this.maxReconnectDelay, 1000 * 2 ** Math.min(this.reconnectAttempts - 1, 6));
    setTimeout(() => {
      if (!this.socket || !this.socket.connected) {
        try {
          this.socket?.removeAllListeners();
        } catch { /* socket already torn down */ }
        this.socket = undefined;
        this.createSocket();
      }
    }, delay);
  }

  private emitLocal(event: string, payload?: any) {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of Array.from(set)) {
      try { fn(payload); } catch { /* listener threw; isolate from other listeners */ }
    }
  }

  on(event: string, fn: Listener) {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(fn);
    this.listeners.set(event, set);
  }

  off(event: string, fn?: Listener) {
    if (!fn) { this.listeners.delete(event); return; }
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(fn);
    if (set.size === 0) this.listeners.delete(event);
  }

  subscribe(symbol: string) {
    const s = symbol.toUpperCase();
    if (this.subscribed.has(s) || this.pendingSubs.has(s)) return;
    this.pendingSubs.add(s);
    this.scheduleFlush();
  }

  unsubscribe(symbol: string) {
    const s = symbol.toUpperCase();
    this.pendingSubs.delete(s);
    if (this.subscribed.has(s)) {
      this.subscribed.delete(s);
      this.socket?.emit(SocketEvent.Unsubscribe, { symbol: s });
    }
  }

  private scheduleFlush() {
    if (this.subTimer) return;
    this.subTimer = window.setTimeout(() => {
      this.flushPendingSubscriptions();
      this.subTimer = undefined;
    }, this.subThrottleMs);
  }

  private flushPendingSubscriptions() {
    if (!this.socket || !this.connected) return;
    const batch = Array.from(this.pendingSubs);
    if (batch.length === 0) return;
    for (let i = 0; i < batch.length; i++) {
      const s = batch[i];
      const gap = i * 120;
      window.setTimeout(() => {
        if (!this.subscribed.has(s)) {
          this.socket?.emit(SocketEvent.Subscribe, { symbol: s });
          this.subscribed.add(s);
        }
      }, gap);
    }
    this.pendingSubs.clear();
  }

  getStatus() {
    return {
      connected: this.connected,
      subscribed: Array.from(this.subscribed),
      pending: Array.from(this.pendingSubs),
    };
  }

  getSocketId() {
    return this.socket?.id;
  }

  emit(event: string, payload: any) {
    if (!this.socket || !this.connected) return;
    this.socket.emit(event, payload);
  }
}

export const socketManager = new SocketManager(API_URL);
export type { Trade };
