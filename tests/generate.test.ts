import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { generateController } from '../src/controllers/generate.controller';
import { authMiddleware } from '../src/middlewares/auth';
import { AuthenticatedRequest } from '../src/types';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../src/services/supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
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
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockAuthReq(body: unknown, userId = 'user-123'): AuthenticatedRequest {
  return { body, userId, headers: {} } as unknown as AuthenticatedRequest;
}

const VALID_OUTPUT = {
  title: 'Tênis Nike Air Max Confortável',
  shortDescription: 'Tênis esportivo com amortecimento superior para seu dia a dia.',
  longDescription: 'Parágrafo 1\n\nParágrafo 2\n\nParágrafo 3',
  bullets: ['Benefit 1', 'Benefit 2', 'Benefit 3', 'Benefit 4', 'Benefit 5'],
};

// ── generate.controller ───────────────────────────────────────────────────────

describe('generateController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna 422 quando body está vazio', async () => {
    const req = mockAuthReq({});
    const res = mockRes();

    await generateController(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
  });

  it('retorna 422 quando features está ausente', async () => {
    const req = mockAuthReq({ name: 'Tênis', category: 'Calçados' });
    const res = mockRes();

    await generateController(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('retorna 200 com output correto em cenário de sucesso', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockResolvedValueOnce(VALID_OUTPUT);

    const req = mockAuthReq({
      name: 'Tênis Nike',
      category: 'Calçados',
      features: 'Amortecimento, leve, respirável',
    });
    const res = mockRes();

    await generateController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(VALID_OUTPUT);
  });

  it('retorna 502 quando a API Anthropic falha', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockRejectedValueOnce(new Error('API timeout'));

    const req = mockAuthReq({
      name: 'Tênis Nike',
      category: 'Calçados',
      features: 'Amortecimento, leve, respirável',
    });
    const res = mockRes();

    await generateController(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_ERROR' }),
    );
  });

  it('imageUrl opcional é aceito sem erro', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockResolvedValueOnce(VALID_OUTPUT);

    const req = mockAuthReq({
      name: 'Tênis Nike',
      category: 'Calçados',
      features: 'Amortecimento',
      imageUrl: 'https://example.com/image.jpg',
    });
    const res = mockRes();

    await generateController(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('imageUrl inválida retorna 422', async () => {
    const req = mockAuthReq({
      name: 'Tênis Nike',
      category: 'Calçados',
      features: 'Amortecimento',
      imageUrl: 'nao-e-uma-url',
    });
    const res = mockRes();

    await generateController(req, res);

    expect(res.status).toHaveBeenCalledWith(422);
  });
});

// ── authMiddleware ────────────────────────────────────────────────────────────

describe('authMiddleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna 401 quando Authorization header está ausente', async () => {
    const req = { headers: {} } as unknown as Request;
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req as AuthenticatedRequest, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('retorna 401 quando token é inválido', async () => {
    const { supabase } = await import('../src/services/supabase');
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'invalid token' } as never,
    });

    const req = {
      headers: { authorization: 'Bearer token-invalido' },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('chama next() e seta userId quando token é válido', async () => {
    const { supabase } = await import('../src/services/supabase');
    vi.mocked(supabase.auth.getUser).mockResolvedValueOnce({
      data: { user: { id: 'user-abc' } as never },
      error: null,
    });

    const req = {
      headers: { authorization: 'Bearer token-valido' },
    } as unknown as AuthenticatedRequest;
    const res = mockRes();
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(req.userId).toBe('user-abc');
    expect(next).toHaveBeenCalledOnce();
  });
});
