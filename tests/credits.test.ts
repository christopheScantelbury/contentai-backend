import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import { creditsMiddleware, PLAN_LIMITS } from '../src/middlewares/credits';
import { meController } from '../src/controllers/me.controller';
import { AuthenticatedRequest } from '../src/types';

// ── Mock Supabase ─────────────────────────────────────────────────────────────

vi.mock('../src/services/supabase', () => {
  const updateMock  = vi.fn().mockResolvedValue({ error: null });
  const insertMock  = vi.fn().mockResolvedValue({ error: null });
  const singleMock  = vi.fn();

  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq:     vi.fn().mockReturnThis(),
        single: singleMock,
        insert: insertMock,
        update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
      })),
    },
    __singleMock: singleMock,
    __insertMock: insertMock,
    __updateMock: updateMock,
  };
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function makeReq(userId = 'uid-1'): AuthenticatedRequest {
  return { userId, headers: {} } as unknown as AuthenticatedRequest;
}

function dbRow(overrides: object = {}) {
  return {
    plan:          'free',
    credits_used:  0,
    credits_limit: 10,
    reset_at:      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

async function getSingleMock() {
  const mod = await import('../src/services/supabase');
  return (mod as unknown as { __singleMock: ReturnType<typeof vi.fn> }).__singleMock;
}

// ── creditsMiddleware ─────────────────────────────────────────────────────────

describe('creditsMiddleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('chama next() quando usuário free tem créditos disponíveis', async () => {
    const single = await getSingleMock();
    single.mockResolvedValueOnce({ data: dbRow({ credits_used: 5 }), error: null });

    const next = vi.fn();
    await creditsMiddleware(makeReq(), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('retorna 402 quando créditos esgotados', async () => {
    const single = await getSingleMock();
    single.mockResolvedValueOnce({ data: dbRow({ credits_used: 10, credits_limit: 10 }), error: null });

    const res  = mockRes();
    const next = vi.fn();
    await creditsMiddleware(makeReq(), res, next);

    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CREDITS_EXHAUSTED' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('plan pro ignora limite e chama next()', async () => {
    const single = await getSingleMock();
    single.mockResolvedValueOnce({
      data: dbRow({ plan: 'pro', credits_used: 9999, credits_limit: 200 }),
      error: null,
    });

    const next = vi.fn();
    await creditsMiddleware(makeReq(), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('plan starter com créditos disponíveis chama next()', async () => {
    const single = await getSingleMock();
    single.mockResolvedValueOnce({
      data: dbRow({ plan: 'starter', credits_used: 100, credits_limit: 200 }),
      error: null,
    });

    const next = vi.fn();
    await creditsMiddleware(makeReq(), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('cria registro free quando usuário não existe e chama next()', async () => {
    const single = await getSingleMock();
    single.mockResolvedValueOnce({ data: null, error: { message: 'no rows' } });

    const next = vi.fn();
    await creditsMiddleware(makeReq(), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });
});

// ── PLAN_LIMITS ───────────────────────────────────────────────────────────────

describe('PLAN_LIMITS', () => {
  it('free = 10', () => expect(PLAN_LIMITS.free).toBe(10));
  it('starter = 200', () => expect(PLAN_LIMITS.starter).toBe(200));
  it('pro = Infinity', () => expect(PLAN_LIMITS.pro).toBe(Infinity));
});

// ── meController ──────────────────────────────────────────────────────────────

describe('meController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna plano e créditos do usuário free', async () => {
    const single = await getSingleMock();
    single.mockResolvedValueOnce({
      data: dbRow({ credits_used: 3 }),
      error: null,
    });

    const res = mockRes();
    await meController(makeReq('u-1'), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        plan:         'free',
        creditsUsed:  3,
        creditsLimit: 10,
        creditsLeft:  7,
      }),
    );
  });

  it('plan pro retorna creditsLimit e creditsLeft null', async () => {
    const single = await getSingleMock();
    single.mockResolvedValueOnce({
      data: dbRow({ plan: 'pro', credits_used: 50, credits_limit: 200 }),
      error: null,
    });

    const res = mockRes();
    await meController(makeReq('u-2'), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ creditsLimit: null, creditsLeft: null }),
    );
  });

  it('usuário sem registro retorna free padrão', async () => {
    const single = await getSingleMock();
    single.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });

    const res = mockRes();
    await meController(makeReq('u-new'), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'free', creditsUsed: 0, creditsLimit: 10 }),
    );
  });
});
