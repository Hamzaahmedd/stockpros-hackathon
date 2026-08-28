import { io, Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, it, jest } from '@jest/globals'

jest.setTimeout(180000); // allow 3 minutes for continuous real-time streaming

/** Shape emitted by the backend Socket.IO server (Finnhub trade + snapshot variants). */
interface TradePayload {
  s?: unknown;
  [key: string]: unknown;
}

describe("Socket.IO Finnhub real-time streaming (continuous test)", () => {
  let socket: Socket;
  const symbols = ["AAPL", "MSFT", "NVDA", "AMZN", "TSLA", "GOOG", "META"];
  const receivedCounts: Record<string, number> = {};

  beforeAll((done) => {
    socket = io("http://localhost:3000");

    socket.on("connect", () => {
      console.log("Connected to Socket.IO server:", socket.id);
      done();
    });

    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
    });
  });

  afterAll(() => {
    if (socket.connected) {
      symbols.forEach((s) => socket.emit("unsubscribe", { symbol: s }));
      socket.disconnect();
    }
  });

  it("streams trades continuously for 3 minutes", (done) => {
    symbols.forEach((s) => (receivedCounts[s] = 0));

    socket.on("trade", (trade: TradePayload) => {
      const symbol = typeof trade.s === "string" ? trade.s.toUpperCase() : undefined;
      if (!symbol || !symbols.includes(symbol)) return;

      receivedCounts[symbol] += 1;
      console.log(`[${symbol}] Trade #${receivedCounts[symbol]}:`, trade);
    });

    symbols.forEach((s) => socket.emit("subscribe", { symbol: s }));

    setTimeout(() => {
      const noTrades = symbols.filter((s) => receivedCounts[s] === 0);

      if (noTrades.length > 0) {
        done(new Error(`No trades received for symbols: ${noTrades.join(", ")}`));
      } else {
        console.log("Continuous streaming test passed. Trade counts:", receivedCounts);
        done();
      }
    }, 180000); // run full 3 minutes
  });
});
