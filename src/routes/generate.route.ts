import { Router, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { authMiddleware } from '../middlewares/auth';
import { generateController } from '../controllers/generate.controller';
import { AuthenticatedRequest } from '../types';

const router = Router();

/** 10 req/min por userId (CLAUDE.md — Regras de Segurança) */
const generateRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req as AuthenticatedRequest).userId ?? req.ip ?? 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Limite de requisições excedido. Tente novamente em 1 minuto.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

router.post(
  '/generate',
  authMiddleware as RequestHandler,
  generateRateLimiter,
  generateController as RequestHandler,
);

export default router;
