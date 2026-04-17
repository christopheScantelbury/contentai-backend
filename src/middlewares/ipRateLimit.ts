import rateLimit from 'express-rate-limit';

const WINDOW_MS   = 60 * 60 * 1000; // 1 hora
const MAX_PER_IP  = 20;
const RETRY_AFTER = Math.ceil(WINDOW_MS / 1000); // 3600 s

/**
 * Rate limit global por IP: máx. 20 req/hora.
 * Retorna 429 com Retry-After quando o limite é excedido.
 * Deve ser aplicado em app.ts antes de todas as rotas de API.
 */
export const ipRateLimiter = rateLimit({
  windowMs:      WINDOW_MS,
  max:           MAX_PER_IP,
  keyGenerator:  (req) => req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req, res) => {
    res.set('Retry-After', String(RETRY_AFTER));
    res.status(429).json({
      error:      'Muitas requisições. Tente novamente em 1 hora.',
      code:       'RATE_LIMIT_EXCEEDED',
      retryAfter: RETRY_AFTER,
    });
  },
});
