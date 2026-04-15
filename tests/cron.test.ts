import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { resetCreditsController } from '../src/controllers/cron.controller';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/services/supabase', () => {
  const rpcMock = vi.fn();
  return {
    supabase: { rpc: rpcMock },
    __rpcMock: rpcMock,
  };
});

vi.mock('../src/services/sentry', () => ({
  initSentry:   vi.fn(),
  Sentry: {
    captureException:       vi.fn(),
    setupExpressErrorHandler: vi.fn(),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function makeReq(authHeader?: string): Request {
  return {
    headers: { authorization: authHeader },
  } as unknown as Request;
}

async function getRpcMock() {
  const mod = await import('../src/services/supabase');
  return (mod as unknown as { __rpcMock: ReturnType<typeof vi.fn> }).__rpcMock;
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('resetCreditsController', () => {
  const SECRET = 'test-cron-secret';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', SECRET);
  });

  it('retorna 401 quando Authorization está ausente', async () => {
    const res = mockRes();
    await resetCreditsController(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'UNAUTHORIZED' }),
    );
  });

  it('retorna 401 quando secret incorreto', async () => {
    const res = mockRes();
    await resetCreditsController(makeReq('Bearer wrong-secret'), res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('executa reset e retorna 200 com usersReset', async () => {
    const rpc = await getRpcMock();
    rpc.mockResolvedValueOnce({ data: 42, error: null });

    const res = mockRes();
    await resetCreditsController(makeReq(`Bearer ${SECRET}`), res);

    expect(rpc).toHaveBeenCalledWith('reset_monthly_credits');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, usersReset: 42 }),
    );
  });

  it('retorna usersReset=0 quando rpc retorna null', async () => {
    const rpc = await getRpcMock();
    rpc.mockResolvedValueOnce({ data: null, error: null });

    const res = mockRes();
    await resetCreditsController(makeReq(`Bearer ${SECRET}`), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, usersReset: 0 }),
    );
  });

  it('retorna 500 e captura no Sentry quando rpc falha', async () => {
    const rpc = await getRpcMock();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'db error' } });

    const res = mockRes();
    await resetCreditsController(makeReq(`Bearer ${SECRET}`), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'CRON_RESET_FAILED' }),
    );

    const { Sentry } = await import('../src/services/sentry');
    expect(Sentry.captureException).toHaveBeenCalled();
  });
});
