import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { generateController } from '../src/controllers/generate.controller';
import { authMiddleware } from '../src/middlewares/auth';
import { AuthenticatedRequest, GenerateOutput } from '../src/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/services/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
    })),
  },
}));

vi.mock('../src/services/anthropic', () => ({
  generateContent: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function makeReq(body: unknown, userId = 'user-123'): AuthenticatedRequest {
  return { body, userId, headers: {} } as unknown as AuthenticatedRequest;
}

const VALID_OUTPUT: GenerateOutput = {
  title:            'Tênis Nike Air Max Confortável',
  shortDescription: 'Amortecimento superior para o dia a dia.',
  longDescription:  'Parágrafo 1.\n\nParágrafo 2.\n\nParágrafo 3.',
  bullets:          ['Leve', 'Respirável', 'Durável', 'Confortável', 'Estiloso'],
  tokensUsed:        250,
  generationTimeMs:  1200,
};

// ── generateController ────────────────────────────────────────────────────────

describe('generateController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('422 — body vazio', async () => {
    const res = mockRes();
    await generateController(makeReq({}), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('422 — features ausente', async () => {
    const res = mockRes();
    await generateController(makeReq({ name: 'Tênis', category: 'Calçados' }), res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — imageUrl inválida', async () => {
    const res = mockRes();
    await generateController(
      makeReq({ name: 'Tênis', category: 'Calçados', features: 'Leve', imageUrl: 'nao-e-url' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('200 — sucesso com campos obrigatórios', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockResolvedValueOnce(VALID_OUTPUT);

    const res = mockRes();
    await generateController(
      makeReq({ name: 'Tênis Nike', category: 'Calçados', features: 'Leve, respirável' }),
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
    const body = vi.mocked(res.json).mock.calls[0][0] as GenerateOutput;
    expect(body.title).toBe(VALID_OUTPUT.title);
    expect(body.bullets).toHaveLength(5);
    // campos internos NÃO devem aparecer na resposta pública
    expect(body.tokensUsed).toBeUndefined();
    expect(body.generationTimeMs).toBeUndefined();
  });

  it('200 — imageUrl opcional aceita', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockResolvedValueOnce(VALID_OUTPUT);

    const res = mockRes();
    await generateController(
      makeReq({
        name: 'Tênis', category: 'Calçados', features: 'Leve',
        imageUrl: 'https://example.com/img.jpg',
      }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('502 — falha na API Anthropic', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockRejectedValueOnce(new Error('timeout'));

    const res = mockRes();
    await generateController(
      makeReq({ name: 'X', category: 'Y', features: 'Z' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_ERROR' }),
    );
  });

  it('persistência fire-and-forget: supabase.from chamado em sucesso', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockResolvedValueOnce(VALID_OUTPUT);
    const { supabase } = await import('../src/services/supabase');

    const res = mockRes();
    await generateController(
      makeReq({ name: 'X', category: 'Y', features: 'Z' }),
      res,
    );
    expect(supabase.from).toHaveBeenCalledWith('generations');
  });
});

// ── authMiddleware ────────────────────────────────────────────────────────────

describe('authMiddleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('401 — sem Authorization header', async () => {
    const req  = { headers: {} } as unknown as AuthenticatedRequest;
    const res  = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('401 — token inválido', async () => {
    const { supabase } = await import('../src/services/supabase');
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'jwt invalid' } as never,
    });

    const req  = { headers: { authorization: 'Bearer bad-token' } } as unknown as AuthenticatedRequest;
    const res  = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('next() chamado e userId setado — token válido', async () => {
    const { supabase } = await import('../src/services/supabase');
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-abc' } as never },
      error: null,
    });

    const req  = { headers: { authorization: 'Bearer valid-token' } } as unknown as AuthenticatedRequest;
    const res  = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res as Response, next);

    expect(req.userId).toBe('user-abc');
    expect(next).toHaveBeenCalledOnce();
  });
});
