import { Request, Response } from 'express';
import { supabase } from '../../services/supabase';

const PRICE_PER_PLAN: Record<string, number> = {
  free:    0,
  starter: 49,
  pro:     149,
};

export async function adminRevenueController(_req: Request, res: Response): Promise<void> {
  try {
    const { data: credits, error } = await supabase
      .from('user_credits')
      .select('plan');

    if (error) throw error;

    const planBreakdown: Record<string, number> = { free: 0, starter: 0, pro: 0 };
    for (const row of credits ?? []) {
      const plan = row.plan as string;
      planBreakdown[plan] = (planBreakdown[plan] ?? 0) + 1;
    }

    const paying       = (planBreakdown['starter'] ?? 0) + (planBreakdown['pro'] ?? 0);
    const estimatedMRR =
      (planBreakdown['starter'] ?? 0) * PRICE_PER_PLAN['starter']! +
      (planBreakdown['pro']     ?? 0) * PRICE_PER_PLAN['pro']!;

    res.json({
      planBreakdown,
      paying,
      estimatedMRR,
      pricePerPlan: PRICE_PER_PLAN,
    });
  } catch (err) {
    console.error('[admin/revenue]', err);
    res.status(500).json({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' });
  }
}
