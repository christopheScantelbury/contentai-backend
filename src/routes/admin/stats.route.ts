import { Router, RequestHandler } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import { adminStatsController } from '../../controllers/admin/stats.controller';

const router = Router();

router.get(
  '/admin/stats',
  adminAuthMiddleware as RequestHandler,
  adminStatsController as RequestHandler,
);

export default router;
