import { Response, NextFunction, RequestHandler } from 'express';
import { supabase } from '../services/supabase';
import { AuthenticatedRequest, ApiError, Plan } from '../types';

export const PLAN_LIMITS: Record<Plan, number> = {
  free:    10,
  starter: 200,
  pro:     Infinity,
};

export async function creditsMiddleware(
  req: AuthenticatedRequest,
  res: Response<ApiError>,
  next: NextFunction,
): Promise<void> {
  const { data, error } = await supabase
    .from('user_credits')
    .select('plan, credits_used, credits_limit, reset_at')
    .eq('user_id', req.userId)
    .single();

  if (error || !data) {
    // Cria registro padrão free se não existir
    const { error: insertErr } = await supabase
      .from('user_credits')
      .insert({ user_id: req.userId, plan: 'free', credits_used: 0, credits_limit: 10 });
    if (insertErr) {
      console.error('[credits] insert error:', insertErr.message);
    }
    // Deixa passar — novo usuário tem 10 créditos
    next();
    return;
  }

  // Reset automático se reset_at passou
  const resetAt = new Date(data.reset_at as string);
  if (resetAt <= new Date()) {
    await supabase
      .from('user_credits')
      .update({
        credits_used: 0,
        reset_at: nextMonthFirstDay(),
      })
      .eq('user_id', req.userId);
    data.credits_used = 0;
  }

  const plan  = (data.plan as Plan) ?? 'free';
  const limit = data.credits_limit ?? PLAN_LIMITS[plan];
  const used  = data.credits_used  ?? 0;

  req.userPlan = plan;

  // Pro tem gerações ilimitadas
  if (plan === 'pro') {
    next();
    return;
  }

  if (used >= limit) {
    res.status(402).json({
      error: 'Créditos esgotados. Faça upgrade do seu plano.',
      code:  'CREDITS_EXHAUSTED',
    });
    return;
  }

  // Incrementa crédito usado (fire-and-forget)
  supabase
    .from('user_credits')
    .update({ credits_used: used + 1 })
    .eq('user_id', req.userId)
    .then(({ error: updErr }) => {
      if (updErr) console.error('[credits] update error:', updErr.message);
    });

  next();
}

/** Primeiro dia do próximo mês em UTC */
function nextMonthFirstDay(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}

export default creditsMiddleware as unknown as RequestHandler;
