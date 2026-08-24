import { prisma } from '../../shared/infrastructure/database';
import type { AlertType } from '@prisma/client';
import { enqueueEmail } from './infrastructure/email-worker';
import { SocketServer } from '../../shared/infrastructure/realtime/socket-server';

// ─── Notification Title/Body Formatters ───────────────────────────────────────

export const formatNotification = (
  symbol:       string,
  alertType:    AlertType,
  currentPrice: number,
  threshold?:   number | null,
): { title: string; body: string } => {
  const price = currentPrice.toFixed(2);

  switch (alertType) {
    case 'PRICE_ABOVE':
      return {
        title: `${symbol} crossed above $${threshold?.toFixed(2)}`,
        body:  `${symbol} is now trading at $${price}, above your alert threshold of $${threshold?.toFixed(2)}.`,
      };
    case 'PRICE_BELOW':
      return {
        title: `${symbol} dropped below $${threshold?.toFixed(2)}`,
        body:  `${symbol} is now trading at $${price}, below your alert threshold of $${threshold?.toFixed(2)}.`,
      };
    case 'PCT_CHANGE_UP':
      return {
        title: `${symbol} up ${threshold}% today`,
        body:  `${symbol} has risen ${threshold}% or more today. Current price: $${price}.`,
      };
    case 'PCT_CHANGE_DOWN':
      return {
        title: `${symbol} down ${threshold}% today`,
        body:  `${symbol} has fallen ${threshold}% or more today. Current price: $${price}.`,
      };
    case 'ENTRY_ZONE':
      return {
        title: `${symbol} is in your entry zone`,
        body:  `${symbol} is now trading at $${price}, within 2% of your target entry price.`,
      };
    case 'STOP_LOSS_BREACHED':
      return {
        title: `${symbol} breached your stop loss`,
        body:  `${symbol} is now trading at $${price}, at or below your stop loss level.`,
      };
    case 'EARNINGS_APPROACHING':
      return {
        title: `${symbol} earnings are approaching`,
        body:  `${symbol} has an earnings event within the next 3 days.`,
      };
    case 'DIVIDEND_APPROACHING':
      return {
        title: `${symbol} dividend ex-date approaching`,
        body:  `${symbol} has a dividend ex-date within the next 3 days.`,
      };
    case 'ANALYST_RATING_CHANGE':
      return {
        title: `${symbol} analyst rating changed`,
        body:  `A new analyst rating has been published for ${symbol}.`,
      };
    case 'NEWS_PUBLISHED':
      return {
        title: `New news for ${symbol}`,
        body:  `A new news article has been published about ${symbol}.`,
      };
    case 'SEC_FILING':
      return {
        title: `${symbol} SEC filing published`,
        body:  `A new SEC filing has been published for ${symbol}.`,
      };
    case 'AI_SIGNAL_CHANGED':
      return {
        title: `${symbol} AI signal updated`,
        body:  `The AI suggested trade zones for ${symbol} have been updated.`,
      };
    default:
      return {
        title: `${symbol} alert triggered`,
        body:  `An alert condition was met for ${symbol} at $${price}.`,
      };
  }
};

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export const dispatchNotification = async (
  userId:       string,
  symbol:       string,
  alertType:    AlertType,
  currentPrice: number,
  threshold?:   number | null,
): Promise<void> => {
  const { title, body } = formatNotification(symbol, alertType, currentPrice, threshold);
 
  // Step 1: Write in-app notification row
  const notification = await prisma.notification.create({
    data: { userId, title, body },
  });

  // Step 2: Emit direct Socket event for real-time frontend update
  try {
    const socketServer = SocketServer.getInstance();
    if (socketServer) {
        socketServer.io.to(`user:${userId}`).emit('notification', {
            ...notification,
            read: false
        });
    }
  } catch (err) {
    console.error(`[NotificationService] Unexpected error during Socket emission:`, err);
  }

  // Step 3: Enqueue email — fetch the user's email address, then add to queue.
  // Fire-and-forget — a failed email enqueue must never block or throw here,
  // as this function is called from the tick pipeline and cron jobs.
  try {
    const user = await prisma.user.findUnique({
      where:  { id: userId },
      select: { email: true },
    });
 
    if (user?.email) {
      await enqueueEmail({
        to:        user.email,
        symbol,
        alertType,
        title,
        body,
      });
    }
  } catch (err) {
    // Non-fatal — in-app notification was already written successfully
    console.error(`[NotificationService] Failed to enqueue email for user ${userId}:`, err);
  }
};