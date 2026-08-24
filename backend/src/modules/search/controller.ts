import { validateOrThrow } from "../../shared/errors";
import { searchSymbols } from "./service";
import { AuthenticatedRequest } from '../auth';
import { symbolLookupQueryValidator } from "./validation";
import { NextFunction, Response } from "express";
import { sendSuccess } from "../../shared/utils";

export const symbolLookup = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { q, exchange } = validateOrThrow(symbolLookupQueryValidator, req.query);
    const results = await searchSymbols(q, (exchange as string) || 'US');

    sendSuccess(res, {
      message: 'Symbol lookup completed successfully.',
      data: results,
    });
  } catch (error) {
    next(error);
  }
};