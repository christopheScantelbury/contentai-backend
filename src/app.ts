// Sentry DEVE ser o primeiro import para instrumentar automaticamente
import { initSentry, Sentry } from './services/sentry';
initSentry();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import generateRoute    from './routes/generate.route';
import checkoutRoute    from './routes/checkout.route';
import webhookRoute     from './routes/webhook.route';
import meRoute          from './routes/me.route';
import cronRoute        from './routes/cron.route';
import usageRoute       from './routes/usage.route';
import feedbackRoute    from './routes/feedback.route';
import checkDeviceRoute  from './routes/checkDevice.route';
import adminRevenueRoute from './routes/admin/revenue.route';
import { ipRateLimiter } from './middlewares/ipRateLimit';

const app  = express();
const PORT = Number(process.env.PORT) || 3000;

// Trust Railway's reverse proxy so req.ip reflects the real client IP
app.set('trust proxy', 1);

// ── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'https://www.descricaoai.com.br',
  'https://descricaoai.com.br',
  'https://www.descricaoai.com.br',
];

app.use(cors({
  origin: (origin, callback) => {
    // Permite requests sem origin (ex: curl, Postman, server-to-server)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqueado: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

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

// ── Rate limit por IP — 20 req/hora (antes de todas as rotas de API) ─────────
app.use('/api', ipRateLimiter);

// ── Rotas da API ──────────────────────────────────────────────────────────────
app.use('/api', webhookRoute);     // sem auth — Stripe assina a request
app.use('/api', cronRoute);        // sem auth JWT — protegido por CRON_SECRET
app.use('/api', checkDeviceRoute); // sem auth JWT — público, rate-limitado por IP
app.use('/api', generateRoute);
app.use('/api', checkoutRoute);
app.use('/api', usageRoute);
app.use('/api', feedbackRoute);
app.use('/api', meRoute);
app.use('/api', adminRevenueRoute);

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
