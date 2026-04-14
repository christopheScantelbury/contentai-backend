import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';

const router = Router();

/**
 * POST /api/webhooks/stripe
 * SEM auth middleware — Stripe assina a request com STRIPE_WEBHOOK_SECRET.
 * Usa express.raw() para preservar o body buffer necessário para
 * stripe.webhooks.constructEvent().
 */
router.post(
  '/webhooks/stripe',
  // express.raw() aplicado apenas nesta rota (app.ts usa express.json global)
  (req, res, next) => {
    // Se body já veio como Buffer (via express.raw no app.ts), passa direto
    if (Buffer.isBuffer(req.body)) return next();
    // Caso contrário lê o raw body manualmente
    let data = Buffer.alloc(0);
    req.on('data', (chunk: Buffer) => { data = Buffer.concat([data, chunk]); });
    req.on('end', () => { req.body = data; next(); });
  },
  webhookController,
);

export default router;
