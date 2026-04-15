import { Router, RequestHandler } from 'express';
import { authMiddleware } from '../middlewares/auth';
import {
  createFeedbackController,
  feedbackStatsController,
} from '../controllers/feedback.controller';

const router = Router();

router.post(
  '/feedback',
  authMiddleware         as unknown as RequestHandler,
  createFeedbackController as unknown as RequestHandler,
);

// Stats: requer auth JWT + X-Admin-Secret no controller
router.get(
  '/feedback/stats',
  authMiddleware          as unknown as RequestHandler,
  feedbackStatsController as unknown as RequestHandler,
);

export default router;
