import { Router } from 'express';
import * as WatchlistController from './controller';
import { authTokenMiddleware as authenticate } from '../auth';

const router = Router();

router.use(authenticate);

// ─── Watchlist CRUD ──────────────────────────────────────────────────────────
router.post('/',         WatchlistController.addToWatchlist);
router.get('/',          WatchlistController.getWatchlist);
router.patch('/:symbol', WatchlistController.updateWatchlistEntry);
router.delete('/:symbol',WatchlistController.removeFromWatchlist);

// ─── Convert to Position ─────────────────────────────────────────────────────
router.post('/:symbol/convert-to-position', WatchlistController.convertToPosition);

// ─── Alert Management ─────────────────────────────────────────────────────────
router.post(  '/:symbol/alerts',     WatchlistController.createAlert);
router.get(   '/:symbol/alerts',     WatchlistController.getAlerts);
router.patch( '/:symbol/alerts/:id', WatchlistController.updateAlert);
router.delete('/:symbol/alerts/:id', WatchlistController.deleteAlert);

export default router;
