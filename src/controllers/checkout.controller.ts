import { Response } from 'express';
import { z } from 'zod';
import { stripe, PRICE_IDS } from '../services/stripe';
import { supabase } from '../services/supabase';
import { AuthenticatedRequest, ApiError } from '../types';

const checkoutSchema = z.object({
  plan: z.enum(['starter', 'pro'], { message: 'Plano deve ser starter ou pro' }),
});

interface CheckoutResponse {
  url: string;
}

export async function checkoutController(
  req: AuthenticatedRequest,
  res: Response<CheckoutResponse | ApiError>,
): Promise<void> {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.errors[0].message, code: 'VALIDATION_ERROR' });
    return;
  }

  const { plan } = parsed.data;
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3001';

  // Busca ou cria customer Stripe para o usuário
  let customerId: string | undefined;
  const { data: credits } = await supabase
    .from('user_credits')
    .select('stripe_customer_id')
    .eq('user_id', req.userId)
    .single();

  if (credits?.stripe_customer_id) {
    customerId = credits.stripe_customer_id as string;
  } else {
    // Busca email do usuário no Supabase Auth
    const { data: { user } } = await supabase.auth.admin.getUserById(req.userId);
    const customer = await stripe.customers.create({ email: user?.email, metadata: { supabase_uid: req.userId } });
    customerId = customer.id;

    // Persiste o customer id (fire-and-forget)
    supabase
      .from('user_credits')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', req.userId)
      .then(({ error }) => { if (error) console.error('[checkout] update customer_id:', error.message); });
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      customer:   customerId,
      mode:       'subscription',
      line_items: [{ price: PRICE_IDS[plan], quantity: 1 }],
      success_url: `${frontendUrl}/dashboard?checkout=success`,
      cancel_url:  `${frontendUrl}/pricing?checkout=cancelled`,
      metadata:    { supabase_uid: req.userId, plan },
    });
  } catch (err) {
    console.error('[checkout] Stripe error:', err);
    res.status(502).json({ error: 'Falha ao criar sessão de checkout.', code: 'STRIPE_ERROR' });
    return;
  }

  res.status(200).json({ url: session.url! });
}
