import { Router, RequestHandler } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { checkoutController } from '../controllers/checkout.controller';

const router = Router();

router.post(
  '/checkout',
  authMiddleware as unknown as RequestHandler,
  checkoutController as unknown as RequestHandler,
);

export default router;
