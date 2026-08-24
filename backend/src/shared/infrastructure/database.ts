import { logger } from "./logger";
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// Helper function to handle Neon's cold starts
export const connectPrismaWithRetry = async (retries = 5, delayMs = 4000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();
      logger.info('Successfully connected to Postgres database.');
      return;
    } catch (error) {
      logger.warn(`Database connection attempt ${i + 1} failed. Retrying in ${delayMs}ms...`);
      if (i === retries - 1) throw error; // If it fails on the last try, then throw
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
};