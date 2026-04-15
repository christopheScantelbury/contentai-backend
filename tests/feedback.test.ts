import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import {
  createFeedbackController,
  feedbackStatsController,
} from '../src/controllers/feedback.controller';
import { AuthenticatedRequest } from '../src/types';

// ── Mock Supabase ─────────────────────────────────────────────────────────────

const genSingleMock      = vi.fn();
const insertSingleMock   = vi.fn();
const statSelectMock     = vi.fn();

vi.mock('../src/services/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'generations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          single: genSingleMock,
        };
      }
      if (table === 'generation_feedback') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn().mockReturnThis(),
            single: insertSingleMock,
          })),
          select: statSelectMock,
        };
      }
      return {};
    }),
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockRes() {
  return {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
  } as unknown as Response;
}

function makeReq(
  body: object = {},
  headers: Record<string, string> = {},
  userId = 'uid-1',
): AuthenticatedRequest {
  return { userId, body, headers } as unknown as AuthenticatedRequest;
}

// ── POST /api/feedback ────────────────────────────────────────────────────────

describe('createFeedbackController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna 422 quando rating ausente', async () => {
    const res = mockRes();
    await createFeedbackController(
      makeReq({ generation_id: 'a0000000-0000-0000-0000-000000000001' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('retorna 422 quando rating fora do range (0)', async () => {
    const res = mockRes();
    await createFeedbackController(
      makeReq({ generation_id: 'a0000000-0000-0000-0000-000000000001', rating: 0 }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('retorna 422 quando generation_id não é UUID', async () => {
    const res = mockRes();
    await createFeedbackController(
      makeReq({ generation_id: 'nao-e-uuid', rating: 5 }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('retorna 404 quando geração não pertence ao usuário', async () => {
    genSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'no rows' } });

    const res = mockRes();
    await createFeedbackController(
      makeReq({ generation_id: 'a0000000-0000-0000-0000-000000000001', rating: 4 }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'GENERATION_NOT_FOUND' }),
    );
  });

  it('salva feedback e retorna 201', async () => {
    const genId    = 'a0000000-0000-0000-0000-000000000001';
    const feedback = {
      id:            'f0000000-0000-0000-0000-000000000002',
      generation_id: genId,
      rating:        5,
      comment:       'Ótimo resultado!',
      created_at:    '2026-04-15T10:00:00.000Z',
    };

    genSingleMock.mockResolvedValueOnce({ data: { id: genId }, error: null });
    insertSingleMock.mockResolvedValueOnce({ data: feedback, error: null });

    const res = mockRes();
    await createFeedbackController(
      makeReq({ generation_id: genId, rating: 5, comment: 'Ótimo resultado!' }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ rating: 5, generation_id: genId }),
    );
  });

  it('retorna 500 quando insert falha', async () => {
    const genId = 'a0000000-0000-0000-0000-000000000001';
    genSingleMock.mockResolvedValueOnce({ data: { id: genId }, error: null });
    insertSingleMock.mockResolvedValueOnce({ data: null, error: { message: 'db error' } });

    const res = mockRes();
    await createFeedbackController(
      makeReq({ generation_id: genId, rating: 3 }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'DB_ERROR' }));
  });
});

// ── GET /api/feedback/stats ───────────────────────────────────────────────────

describe('feedbackStatsController', () => {
  const ADMIN = 'super-secret';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ADMIN_SECRET', ADMIN);
  });

  it('retorna 403 sem X-Admin-Secret', async () => {
    const res = mockRes();
    await feedbackStatsController(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FORBIDDEN' }));
  });

  it('retorna 403 com secret errado', async () => {
    const res = mockRes();
    await feedbackStatsController(makeReq({}, { 'x-admin-secret': 'wrong' }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('retorna média e total com secret correto', async () => {
    statSelectMock.mockResolvedValueOnce({
      data:  [{ rating: 5 }, { rating: 4 }, { rating: 3 }],
      error: null,
    });

    const res = mockRes();
    await feedbackStatsController(
      makeReq({}, { 'x-admin-secret': ADMIN }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      average_rating: 4,
      total: 3,
    });
  });

  it('retorna average_rating=0 e total=0 quando não há feedbacks', async () => {
    statSelectMock.mockResolvedValueOnce({ data: [], error: null });

    const res = mockRes();
    await feedbackStatsController(
      makeReq({}, { 'x-admin-secret': ADMIN }),
      res,
    );

    expect(res.json).toHaveBeenCalledWith({ average_rating: 0, total: 0 });
  });
});
