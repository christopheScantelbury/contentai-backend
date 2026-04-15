import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import { usageController } from '../src/controllers/usage.controller';
import { AuthenticatedRequest } from '../src/types';

// ── Mock Supabase ─────────────────────────────────────────────────────────────

const singleMock  = vi.fn();
const selectMock  = vi.fn();

vi.mock('../src/services/supabase', () => {
  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === 'user_credits') {
          return {
            select: vi.fn().mockReturnThis(),
            eq:     vi.fn().mockReturnThis(),
            single: singleMock,
          };
        }
        // generations table
        return {
          select: vi.fn(() => ({
            eq:     vi.fn().mockReturnThis(),
            order:  vi.fn().mockReturnThis(),
            limit:  selectMock,
          })),
        };
      }),
    },
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

function creditsRow(overrides = {}) {
  return {
    plan:          'free',
    credits_used:  3,
    credits_limit: 10,
    reset_at:      '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function generationsResult(count = 15, lastDate = '2026-04-15T10:00:00.000Z') {
  return {
    data:  lastDate ? [{ created_at: lastDate }] : [],
    count,
    error: null,
  };
}

// ── Testes ────────────────────────────────────────────────────────────────────

describe('usageController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna métricas completas de usuário free', async () => {
    singleMock.mockResolvedValueOnce({ data: creditsRow({ credits_used: 3 }), error: null });
    selectMock.mockResolvedValueOnce(generationsResult(15));

    const res = mockRes();
    await usageController(makeReq('u-free'), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        plan:              'free',
        credits_used:      3,
        credits_limit:     10,
        credits_remaining: 7,
        reset_at:          '2026-05-01T00:00:00.000Z',
        total_generations: 15,
        last_generation_at: '2026-04-15T10:00:00.000Z',
      }),
    );
  });

  it('plan pro retorna credits_limit e credits_remaining null', async () => {
    singleMock.mockResolvedValueOnce({
      data: creditsRow({ plan: 'pro', credits_used: 500, credits_limit: 200 }),
      error: null,
    });
    selectMock.mockResolvedValueOnce(generationsResult(500));

    const res = mockRes();
    await usageController(makeReq('u-pro'), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        plan:             'pro',
        credits_limit:    null,
        credits_remaining: null,
      }),
    );
  });

  it('usuário sem registro retorna defaults free', async () => {
    singleMock.mockResolvedValueOnce({ data: null, error: { message: 'not found' } });
    selectMock.mockResolvedValueOnce(generationsResult(0, ''));

    const res = mockRes();
    await usageController(makeReq('u-new'), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        plan:              'free',
        credits_used:      0,
        credits_limit:     10,
        credits_remaining: 10,
        total_generations: 0,
        last_generation_at: null,
      }),
    );
  });

  it('credits_remaining não fica negativo quando credits_used > limit', async () => {
    singleMock.mockResolvedValueOnce({
      data: creditsRow({ credits_used: 15, credits_limit: 10 }),
      error: null,
    });
    selectMock.mockResolvedValueOnce(generationsResult(15));

    const res = mockRes();
    await usageController(makeReq('u-over'), res);

    const payload = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(payload.credits_remaining).toBe(0);
  });

  it('responde do cache na segunda chamada', async () => {
    singleMock.mockResolvedValue({ data: creditsRow(), error: null });
    selectMock.mockResolvedValue(generationsResult(5));

    const res1 = mockRes();
    const res2 = mockRes();

    await usageController(makeReq('u-cache'), res1);
    await usageController(makeReq('u-cache'), res2);

    // Supabase deve ter sido chamado apenas uma vez (cache hit na segunda)
    expect(singleMock).toHaveBeenCalledTimes(1);
    expect(res2.status).toHaveBeenCalledWith(200);
  });

  it('usuários diferentes têm cache independente', async () => {
    singleMock.mockResolvedValue({ data: creditsRow(), error: null });
    selectMock.mockResolvedValue(generationsResult(0));

    await usageController(makeReq('u-A'), mockRes());
    await usageController(makeReq('u-B'), mockRes());

    expect(singleMock).toHaveBeenCalledTimes(2);
  });
});
