import EventEmitter from "events";
import WebSocket from "ws";
import finnhubClient from '../../../shared/infrastructure/clients/finnhub-client';
import config from "../../../shared/infrastructure/config/env";
import { logger } from '../../../shared/infrastructure/logger';
import { FinnhubQuote, FinnhubTradeMsg } from './finnhub-types';

export class FinnhubService extends EventEmitter {
  private ws?: WebSocket;
  private subscribed = new Set<string>();
  private reconnectAttempts = 0;
  private heartbeat?: NodeJS.Timeout;
  private closed = false;
  private lastCloseWas429 = false;
  // IMPROVEMENT 1: Memory cache to prevent "Rate Limit" bans on dashboard refresh
  private quoteCache = new Map<string, { data: FinnhubQuote; ts: number }>();

  constructor(private apiKey: string) {
    super();
    this.connect();
  }

  private connect() {
    const url = `wss://ws.finnhub.io?token=${encodeURIComponent(this.apiKey)}`;
    this.ws = new WebSocket(url, { handshakeTimeout: 10000 })

    this.ws.on('unexpected-response', (_req, res) => {
      logger.error(`[ERROR] Finnhub WS Unexpected Response: ${res.statusCode}`);
      if (res.statusCode === 429) {
        this.lastCloseWas429 = true;
      }
    });

    this.ws.on('open', async () => {
      logger.info('Finnhub WS connected');
      this.reconnectAttempts = 0;
      this.lastCloseWas429 = false;
      // IMPROVEMENT 2: Slightly slower batching (1000ms) is safer for free-tier keys
      await this.resubscribeInBatches(Array.from(this.subscribed), 10, 1000);
      this.startHeartbeat();
      this.emit('open');
    });

    this.ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as FinnhubTradeMsg;
        if (msg.type === 'trade' && Array.isArray(msg.data)) {
          for (const td of msg.data) {
            this.emit('trade', td);
          }
        } else if (msg.type === 'error') {
          // IMPROVEMENT 3: Catch rate-limit errors sent INSIDE the socket stream
          logger.warn(`Finnhub reported error: ${msg.msg || JSON.stringify(msg)}`);
          if (String(msg.msg).includes('Rate Limit')) {
            this.lastCloseWas429 = true;
          }
        } else {
          this.emit('raw', msg);
        }
      } catch (err) {
        this.emit('error', err);
      }
    });

    this.ws.on('close', (code, reason) => {
      logger.warn(`Finnhub WS closed ${code} ${reason?.toString()}`);
      this.stopHeartbeat();

      // Double check for 429 in the close reason
      if (code === 429 || (reason && reason.toString().includes('429'))) {
        this.lastCloseWas429 = true;
      }

      if (!this.closed) this.reconnectWithBackoff();
      this.emit('close', { code, reason: reason?.toString() });
    });

    this.ws.on('error', (err: Error) => {
      // Prevents ECONNRESET from crashing the Node process
      logger.error(`Finnhub WS internal error: ${err.message}`);
      if (err.message && err.message.includes('429')) {
        this.lastCloseWas429 = true;
      }
      this.emit('error', err);
    });
  }

  private async resubscribeInBatches(symbols: string[], batchSize = 10, delayMs = 1000) {
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      batch.forEach((s) => this._send("subscribe", s));
      if (i + batchSize < symbols.length) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }
  }

  async getQuote(symbol: string): Promise<FinnhubQuote> {
    const s = symbol.toUpperCase();
    const cached = this.quoteCache.get(s);

    // 30-second cache: prevents hammering the API during rapid UI navigation
    if (cached && Date.now() - cached.ts < 30000) {
      return cached.data;
    }

    try {
      const res = await finnhubClient.get<FinnhubQuote>(`/quote`, {
        params: { symbol: s },
      });
      this.quoteCache.set(s, { data: res.data, ts: Date.now() });
      return res.data;
    } catch (err) {
      // Fallback: If API fails but we have old data, show that instead of an error
      if (cached) return cached.data;
      throw new Error(err instanceof Error ? err.message : 'Failed to fetch quote');
    }
  }

  private reconnectWithBackoff() {
    this.reconnectAttempts++;

    // Logic: If we were rate limited, wait at least 20 seconds. Otherwise, start at 2s.
    const baseDelay = this.lastCloseWas429 ? 20000 : 2000;

    // IMPROVEMENT: Add random jitter (0-3s) so retries are not perfectly synchronized
    const jitter = Math.random() * 3000;
    const delay = Math.min(60_000, baseDelay * Math.pow(2, Math.min(this.reconnectAttempts - 1, 5))) + jitter;

    logger.info(`RECONNECTING to Finnhub in ${Math.round(delay)}ms... (Jitter added: ${Math.round(jitter)}ms)`);

    setTimeout(() => {
      if (!this.closed) this.connect();
    }, delay);

    this.lastCloseWas429 = false; // Reset for the next attempt
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      try {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.ping();
        }
      } catch {
        // Heartbeat failure is non-fatal — reconnect logic handles dead sockets
      }
    }, 20000);
  }

  private stopHeartbeat() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
  }

  private _send(type: string, symbol: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, symbol }));
  }

  subscribe(symbol: string) {
    const s = symbol.toUpperCase();
    if (this.subscribed.has(s)) return { ok: true, capReached: false };
    if (this.subscribed.size >= 100) return { ok: false, capReached: true };
    this.subscribed.add(s);
    this._send('subscribe', s);
    logger.info(`Subscribed to ${s}`);
    return { ok: true, capReached: false };
  }

  unsubscribe(symbol: string) {
    const s = symbol.toUpperCase();
    if (!this.subscribed.has(s)) return;
    this.subscribed.delete(s);
    this._send('unsubscribe', s);
    logger.info(`Unsubscribed from ${s}`);
  }

  status() {
    return {
      connected: !!this.ws && this.ws.readyState === WebSocket.OPEN,
      subscribed: Array.from(this.subscribed),
    };
  }

  async close() {
    this.closed = true;
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Socket already closed or broken — nothing to clean up
      }
    }
  }
}

export const finnhubService = new FinnhubService(config.finnhub.apiKey);
