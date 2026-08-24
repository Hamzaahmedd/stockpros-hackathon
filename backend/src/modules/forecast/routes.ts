import { Router } from "express";
import { getStockForecast } from "./controller";
import { authTokenMiddleware } from '../auth';

const router = Router();

router.get("/", authTokenMiddleware, getStockForecast);

export default router;
