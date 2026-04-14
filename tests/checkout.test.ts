import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Response } from 'express';
import { checkoutController } from '../src/controllers/checkout.controller';
import { AuthenticatedRequest } from '../src/types';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../src/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { stripe_customer_id: 'cus_existing' }, error: null }),
    })),
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'u@test.com' } } }) } },
  },
}));

vi.mock('../src/services/stripe', () => ({
  stripe: {
    customers:         { create: vi.fn().mockResolvedValue({ id: 'cus_new' }) },
    checkout: { sessions: { create: vi.fn() } },
  },
  PRICE_IDS: { starter: 'price_starter', pro: 'price_pro' },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
}

function makeReq(body: unknown): AuthenticatedRequest {
  return { body, userId: 'uid-1', headers: {} } as unknown as AuthenticatedRequest;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkoutController', () => {
  beforeEach(() => vi.clearAllMocks());

  it('422 — plan ausente', async () => {
    const res = mockRes();
    await checkoutController(makeReq({}), res);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('422 — plan inválido', async () => {
    const res = mockRes();
    await checkoutController(makeReq({ plan: 'enterprise' }), res);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('200 — retorna URL de checkout para plano starter', async () => {
    const { stripe } = await import('../src/services/stripe');
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValueOnce({ url: 'https://checkout.stripe.com/pay/cs_test_123' } as never);

    const res = mockRes();
    await checkoutController(makeReq({ plan: 'starter' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ url: 'https://checkout.stripe.com/pay/cs_test_123' });
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'subscription', line_items: [{ price: 'price_starter', quantity: 1 }] }),
    );
  });

  it('200 — retorna URL de checkout para plano pro', async () => {
    const { stripe } = await import('../src/services/stripe');
    vi.mocked(stripe.checkout.sessions.create).mockResolvedValueOnce({ url: 'https://checkout.stripe.com/pay/cs_pro' } as never);

    const res = mockRes();
    await checkoutController(makeReq({ plan: 'pro' }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(stripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ line_items: [{ price: 'price_pro', quantity: 1 }] }),
    );
  });

  it('502 — erro no Stripe', async () => {
    const { stripe } = await import('../src/services/stripe');
    vi.mocked(stripe.checkout.sessions.create).mockRejectedValueOnce(new Error('Stripe down'));

    const res = mockRes();
    await checkoutController(makeReq({ plan: 'starter' }), res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'STRIPE_ERROR' }));
  });
});
