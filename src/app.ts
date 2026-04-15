// Sentry DEVE ser o primeiro import para instrumentar automaticamente
import { initSentry, Sentry } from './services/sentry';
initSentry();

import express, { Request, Response, NextFunction } from 'express';
import generateRoute from './routes/generate.route';
import checkoutRoute  from './routes/checkout.route';
import webhookRoute   from './routes/webhook.route';
import meRoute        from './routes/me.route';
import cronRoute       from './routes/cron.route';
import usageRoute     from './routes/usage.route';
import feedbackRoute  from './routes/feedback.route';

const app  = express();
const PORT = Number(process.env.PORT) || 3000;

// ── Webhook Stripe — raw body ANTES do express.json() ────────────────────────
// stripe.webhooks.constructEvent() exige o body como Buffer original.
app.use(
  '/api/webhooks/stripe',
  express.raw({ type: 'application/json' }),
);

// ── JSON parser global ────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));

// ── Health check — público, sem auth ─────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── Rotas da API ──────────────────────────────────────────────────────────────
app.use('/api', webhookRoute);   // sem auth — Stripe assina a request
app.use('/api', cronRoute);      // sem auth JWT — protegido por CRON_SECRET
app.use('/api', generateRoute);
app.use('/api', checkoutRoute);
app.use('/api', usageRoute);
app.use('/api', feedbackRoute);
app.use('/api', meRoute);

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada', code: 'NOT_FOUND' });
});

// ── Sentry error handler — deve ser o último middleware, após rotas ──────────
Sentry.setupExpressErrorHandler(app);

// ── Error handler 5xx — loga no Sentry com contexto userId ──────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  Sentry.captureException(err, {
    extra: {
      userId:   (req as unknown as { userId?: string }).userId,
      endpoint: req.path,
      method:   req.method,
    },
  });
  console.error('[500]', err.message);
  res.status(500).json({ error: 'Erro interno do servidor.', code: 'INTERNAL_ERROR' });
});

app.listen(PORT, () => {
  console.log(`ContentAI Backend running on port ${PORT}`);
});

export default app;
