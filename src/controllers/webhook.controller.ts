import { Request, Response } from 'express';
import { stripe } from '../services/stripe';
import { supabase } from '../services/supabase';
import { Plan } from '../types';
import type Stripe from 'stripe';

const PLAN_BY_PRICE: Record<string, Plan> = {
  price_starter: 'starter',
  price_pro:     'pro',
};

const PLAN_CREDITS: Record<Plan, number> = {
  free:    10,
  starter: 200,
  pro:     999999, // representação de ilimitado no DB
};

export async function webhookController(req: Request, res: Response): Promise<void> {
  const sig     = req.headers['stripe-signature'] as string;
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET não configurado');
    res.status(500).json({ error: 'Webhook secret não configurado', code: 'CONFIG_ERROR' });
    return;
  }

  let event: Stripe.Event;
  try {
    // req.body é Buffer (raw) quando a rota usa express.raw()
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret);
  } catch (err) {
    console.error('[webhook] Assinatura inválida:', err);
    res.status(400).json({ error: 'Assinatura do webhook inválida', code: 'INVALID_SIGNATURE' });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        // Evento não tratado — ignora silenciosamente
        break;
    }
  } catch (err) {
    console.error(`[webhook] Erro ao processar evento ${event.type}:`, err);
    res.status(500).json({ error: 'Falha ao processar evento', code: 'HANDLER_ERROR' });
    return;
  }

  res.status(200).json({ received: true });
}

// ── Handlers de evento ────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.supabase_uid;
  const plan   = session.metadata?.plan as Plan | undefined;

  if (!userId || !plan) return;

  const limit = PLAN_CREDITS[plan] ?? PLAN_CREDITS.free;

  await supabase
    .from('user_credits')
    .upsert(
      {
        user_id:                userId,
        plan,
        credits_limit:          limit,
        credits_used:           0,
        stripe_customer_id:     session.customer as string,
        stripe_subscription_id: session.subscription as string,
        payment_failed:         false,
        reset_at:               nextMonthFirstDay(),
      },
      { onConflict: 'user_id' },
    );
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  // Identifica plano pelo price id da fatura
  const priceId = (invoice as unknown as { lines?: { data?: Array<{ price?: { id?: string } }> } })
    .lines?.data?.[0]?.price?.id ?? '';
  const plan = PLAN_BY_PRICE[priceId];
  if (!plan) return;

  await supabase
    .from('user_credits')
    .update({ payment_failed: false, plan, credits_limit: PLAN_CREDITS[plan], credits_used: 0, reset_at: nextMonthFirstDay() })
    .eq('stripe_customer_id', customerId);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string;
  if (!customerId) return;

  await supabase
    .from('user_credits')
    .update({ payment_failed: true })
    .eq('stripe_customer_id', customerId);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  if (!customerId) return;

  // Downgrade para free
  await supabase
    .from('user_credits')
    .update({
      plan:                   'free',
      credits_limit:          PLAN_CREDITS.free,
      stripe_subscription_id: null,
      payment_failed:         false,
    })
    .eq('stripe_customer_id', customerId);
}

function nextMonthFirstDay(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}
