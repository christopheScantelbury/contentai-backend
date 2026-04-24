import { Router, RequestHandler } from 'express';
import { adminAuthMiddleware } from '../../middlewares/adminAuth';
import { adminUsersController } from '../../controllers/admin/users.controller';

const router = Router();

router.get(
  '/admin/users',
  adminAuthMiddleware as RequestHandler,
  adminUsersController as RequestHandler,
);

export default router;
