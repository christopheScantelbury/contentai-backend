import { Router, RequestHandler } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import { adminRevenueController } from '../../controllers/admin/revenue.controller';

const router = Router();

router.get(
  '/admin/revenue',
  adminAuthMiddleware as RequestHandler,
  adminRevenueController as RequestHandler,
);

export default router;
