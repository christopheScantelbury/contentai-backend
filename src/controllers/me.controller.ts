import { Response } from 'express';
import { supabase } from '../services/supabase';
import { AuthenticatedRequest, ApiError, Plan } from '../types';
import { PLAN_LIMITS } from '../middlewares/credits';

interface MeResponse {
  userId:        string;
  plan:          Plan;
  creditsUsed:   number;
  creditsLimit:  number | null; // null = ilimitado (pro)
  creditsLeft:   number | null;
  resetAt:       string;
}

export async function meController(
  req: AuthenticatedRequest,
  res: Response<MeResponse | ApiError>,
): Promise<void> {
  const { data, error } = await supabase
    .from('user_credits')
    .select('plan, credits_used, credits_limit, reset_at')
    .eq('user_id', req.userId)
    .single();

  if (error || !data) {
    // Usuário sem registro ainda → free padrão
    res.status(200).json({
      userId:       req.userId,
      plan:         'free',
      creditsUsed:  0,
      creditsLimit: PLAN_LIMITS.free,
      creditsLeft:  PLAN_LIMITS.free,
      resetAt:      nextMonthFirstDay(),
    });
    return;
  }

  const plan  = (data.plan as Plan) ?? 'free';
  const used  = (data.credits_used  as number) ?? 0;
  const limit = (data.credits_limit as number) ?? PLAN_LIMITS[plan];
  const isPro = plan === 'pro';

  res.status(200).json({
    userId:       req.userId,
    plan,
    creditsUsed:  used,
    creditsLimit: isPro ? null : limit,
    creditsLeft:  isPro ? null : Math.max(0, limit - used),
    resetAt:      data.reset_at as string,
  });
}

function nextMonthFirstDay(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString();
}
