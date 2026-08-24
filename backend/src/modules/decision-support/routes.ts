import { Router } from 'express';
import * as DecisionController from './controller';
import { authTokenMiddleware as authenticate } from '../auth';
import { rbacMiddleware } from '../access-control';
import { upload } from '../../shared/middlewares';
import { Resource, Action } from '../access-control';

const router = Router();

router.use(authenticate);

// ─── Market Intelligence ─────────────────────────────────────────────────────
router.get('/market/decision/:symbol', DecisionController.getMarketBasedTradeDecision);

// ─── Portfolio Analysis ──────────────────────────────────────────────────────
router.post(
  '/upload-portfolio',
  rbacMiddleware(Resource.PORTFOLIO, Action.CREATE),
  upload.single('portfolio'),
  DecisionController.uploadTraderPortfolio
);

router.post(
  '/portfolio/decision',
  rbacMiddleware(Resource.PORTFOLIO, Action.CREATE),
  DecisionController.getPortfolioBasedTradeDecision
);

router.get(
  '/portfolio/latest',
  rbacMiddleware(Resource.PORTFOLIO, Action.READ),
  DecisionController.getLatestPortfolio
);

export default router;
