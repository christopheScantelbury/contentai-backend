import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY é obrigatório');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
});

/** Price IDs por plano — CLAUDE.md § Planos e Créditos */
export const PRICE_IDS: Record<'starter' | 'pro', string> = {
  starter: process.env.STRIPE_PRICE_STARTER ?? 'price_starter',
  pro:     process.env.STRIPE_PRICE_PRO     ?? 'price_pro',
};
