import { Router, RequestHandler } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import { adminGenerationsController } from '../../controllers/admin/generations.controller';

const router = Router();

router.get(
  '/admin/generations',
  adminAuthMiddleware as RequestHandler,
  adminGenerationsController as RequestHandler,
);

export default router;
