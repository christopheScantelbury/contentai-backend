import { Router, RequestHandler } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { meController } from '../controllers/me.controller';

const router = Router();

router.get('/me', authMiddleware as unknown as RequestHandler, meController as unknown as RequestHandler);

export default router;
