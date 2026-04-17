import { describe, it, expect } from 'vitest';
import express, { Request, Response } from 'express';
import request from 'supertest';
import rateLimit from 'express-rate-limit';

// ── Helper: cria app de teste com limite configurável ─────────────────────────

function createTestApp(max: number) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    rateLimit({
      windowMs: 60 * 60 * 1000,
      max,
      keyGenerator: (req) => req.ip ?? 'unknown',
      standardHeaders: true,
      legacyHeaders:   false,
      handler: (_req: Request, res: Response) => {
        res.set('Retry-After', '3600');
        res.status(429).json({
          error:      'Muitas requisições. Tente novamente em 1 hora.',
          code:       'RATE_LIMIT_EXCEEDED',
          retryAfter: 3600,
        });
      },
    }),
  );

  app.get('/api/test', (_req, res) => res.json({ ok: true }));
  return app;
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('ipRateLimiter', () => {
  it('permite requisições dentro do limite', async () => {
    const app = createTestApp(5);
    const res = await request(app).get('/api/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('retorna 429 quando o limite é excedido', async () => {
    const app = createTestApp(2);

    await request(app).get('/api/test');
    await request(app).get('/api/test');
    const res = await request(app).get('/api/test'); // 3ª — excede o limite

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('inclui Retry-After no header quando 429', async () => {
    const app = createTestApp(1);

    await request(app).get('/api/test');
    const res = await request(app).get('/api/test');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('3600');
  });

  it('inclui headers RateLimit-* em respostas normais', async () => {
    const app = createTestApp(20);
    const res = await request(app).get('/api/test');

    expect(res.status).toBe(200);
    expect(res.headers['ratelimit-limit']).toBeDefined();
    expect(res.headers['ratelimit-remaining']).toBeDefined();
  });

  it('body do 429 contém error, code e retryAfter', async () => {
    const app = createTestApp(1);

    await request(app).get('/api/test');
    const res = await request(app).get('/api/test');

    expect(res.status).toBe(429);
    expect(res.body).toMatchObject({
      error:      expect.any(String),
      code:       'RATE_LIMIT_EXCEEDED',
      retryAfter: 3600,
    });
  });
});
