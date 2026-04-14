import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { webhookController } from '../src/controllers/webhook.controller';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const upsertMock = vi.fn().mockResolvedValue({ error: null });
const updateMock = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

vi.mock('../src/services/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: upsertMock,
      update: updateMock,
    })),
  },
}));

vi.mock('../src/services/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: vi.fn() },
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as unknown as Response;
}

function makeReq(body: unknown, sig = 'valid-sig'): Request {
  return {
    headers: { 'stripe-signature': sig },
    body: Buffer.from(JSON.stringify(body)),
  } as unknown as Request;
}

async function getStripeConstructEvent() {
  const { stripe } = await import('../src/services/stripe');
  return vi.mocked(stripe.webhooks.constructEvent);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('webhookController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  });

  it('400 — assinatura inválida', async () => {
    const constructEvent = await getStripeConstructEvent();
    constructEvent.mockImplementationOnce(() => { throw new Error('signature mismatch'); });

    const res = mockRes();
    await webhookController(makeReq({}, 'bad-sig'), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVALID_SIGNATURE' }));
  });

  it('200 — checkout.session.completed atualiza user_credits', async () => {
    const constructEvent = await getStripeConstructEvent();
    constructEvent.mockReturnValueOnce({
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata:     { supabase_uid: 'uid-1', plan: 'starter' },
          customer:     'cus_1',
          subscription: 'sub_1',
        },
      },
    } as never);

    const res = mockRes();
    await webhookController(makeReq({}), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
    const { supabase } = await import('../src/services/supabase');
    expect(supabase.from).toHaveBeenCalledWith('user_credits');
  });

  it('200 — invoice.payment_failed seta flag no Supabase', async () => {
    const constructEvent = await getStripeConstructEvent();
    constructEvent.mockReturnValueOnce({
      type: 'invoice.payment_failed',
      data: { object: { customer: 'cus_1' } },
    } as never);

    const res = mockRes();
    await webhookController(makeReq({}), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ payment_failed: true }));
  });

  it('200 — customer.subscription.deleted faz downgrade para free', async () => {
    const constructEvent = await getStripeConstructEvent();
    constructEvent.mockReturnValueOnce({
      type: 'customer.subscription.deleted',
      data: { object: { customer: 'cus_1' } },
    } as never);

    const res = mockRes();
    await webhookController(makeReq({}), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({ plan: 'free' }));
  });

  it('200 — evento desconhecido ignorado silenciosamente', async () => {
    const constructEvent = await getStripeConstructEvent();
    constructEvent.mockReturnValueOnce({ type: 'unknown.event', data: { object: {} } } as never);

    const res = mockRes();
    await webhookController(makeReq({}), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ received: true });
  });
});
