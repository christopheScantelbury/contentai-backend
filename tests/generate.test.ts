import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
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
  return {
    status: vi.fn().mockReturnThis(),
    json:   vi.fn().mockReturnThis(),
  } as unknown as Response;
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

const BASE_BODY = { name: 'Tênis Nike', category: 'Calçados', features: 'Leve, respirável' };

// Pixel JPEG 1x1 válido em base64
const JPEG_1PX =
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
  'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
  'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
  'MjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAA' +
  'AAAAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA' +
  '/9oADAMBAAIRAxEAPwCwABmX/9k=';

const VALID_JPEG_DATA_URI = `data:image/jpeg;base64,${JPEG_1PX}`;

// ── generateController — texto apenas ─────────────────────────────────────────

describe('generateController — texto', () => {
  beforeEach(() => vi.clearAllMocks());

  it('422 — body vazio', async () => {
    const res = mockRes();
    await generateController(makeReq({}), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('422 — features ausente', async () => {
    const res = mockRes();
    await generateController(makeReq({ name: 'X', category: 'Y' }), res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('422 — imageUrl inválida', async () => {
    const res = mockRes();
    await generateController(makeReq({ ...BASE_BODY, imageUrl: 'nao-e-url' }), res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('200 — sucesso sem imagem', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockResolvedValueOnce(VALID_OUTPUT);

    const res = mockRes();
    await generateController(makeReq(BASE_BODY), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const body = vi.mocked(res.json).mock.calls[0][0] as GenerateOutput;
    expect(body.title).toBe(VALID_OUTPUT.title);
    expect(body.bullets).toHaveLength(5);
    // campos internos não expostos
    expect((body as GenerateOutput & { tokensUsed?: number }).tokensUsed).toBeUndefined();
  });

  it('502 — falha na API Anthropic', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockRejectedValueOnce(new Error('timeout'));

    const res = mockRes();
    await generateController(makeReq(BASE_BODY), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AI_ERROR' }));
  });
});

// ── generateController — vision (imagem base64) ───────────────────────────────

describe('generateController — vision', () => {
  beforeEach(() => vi.clearAllMocks());

  it('200 — JPG válido enviado como data URI', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockResolvedValueOnce(VALID_OUTPUT);

    const res = mockRes();
    await generateController(makeReq({ ...BASE_BODY, image: VALID_JPEG_DATA_URI }), res);

    expect(res.status).toHaveBeenCalledWith(200);

    // Verifica que generateContent recebeu imageBase64 e imageMimeType
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        imageBase64:   JPEG_1PX,
        imageMimeType: 'image/jpeg',
      }),
    );
  });

  it('200 — PNG válido como data URI', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockResolvedValueOnce(VALID_OUTPUT);

    // Pequeno PNG válido em base64
    const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const res = mockRes();
    await generateController(makeReq({ ...BASE_BODY, image: `data:image/png;base64,${pngB64}` }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ imageMimeType: 'image/png' }),
    );
  });

  it('200 — sem imagem ainda funciona (campo image ausente)', async () => {
    const { generateContent } = await import('../src/services/anthropic');
    vi.mocked(generateContent).mockResolvedValueOnce(VALID_OUTPUT);

    const res = mockRes();
    await generateController(makeReq(BASE_BODY), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(generateContent).toHaveBeenCalledWith(
      expect.objectContaining({ imageBase64: undefined, imageMimeType: undefined }),
    );
  });

  it('422 — formato inválido (BMP não suportado)', async () => {
    const res = mockRes();
    await generateController(
      makeReq({ ...BASE_BODY, image: 'data:image/bmp;base64,Qk0=' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_IMAGE' }));
  });

  it('422 — data URI sem separador base64', async () => {
    const res = mockRes();
    await generateController(
      makeReq({ ...BASE_BODY, image: 'data:image/jpeg,naobase64' }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_IMAGE' }));
  });

  it('422 — imagem excede 5MB', async () => {
    // Gera string base64 equivalente a ~5.1MB (cada char = ~0.75 bytes → 5.1MB / 0.75 ≈ 6.8M chars)
    const bigB64 = 'A'.repeat(7_000_000);
    const res = mockRes();
    await generateController(
      makeReq({ ...BASE_BODY, image: `data:image/jpeg;base64,${bigB64}` }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'INVALID_IMAGE', error: expect.stringContaining('5MB') }),
    );
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
    const req  = { headers: { authorization: 'Bearer bad' } } as unknown as AuthenticatedRequest;
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
    const req  = { headers: { authorization: 'Bearer valid' } } as unknown as AuthenticatedRequest;
    const res  = mockRes();
    const next = vi.fn();
    await authMiddleware(req, res as Response, next);
    expect(req.userId).toBe('user-abc');
    expect(next).toHaveBeenCalledOnce();
  });
});
