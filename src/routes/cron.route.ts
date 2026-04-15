import { Router, RequestHandler } from 'express';
import { resetCreditsController } from '../controllers/cron.controller';

const router = Router();

// Sem authMiddleware — protegido por CRON_SECRET no controller
router.post('/internal/reset-credits', resetCreditsController as unknown as RequestHandler);

export default router;
