import { Router, RequestHandler } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { usageController } from '../controllers/usage.controller';

const router = Router();

router.get(
  '/usage',
  authMiddleware as unknown as RequestHandler,
  usageController as unknown as RequestHandler,
);

export default router;
