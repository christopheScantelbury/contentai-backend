import { Request, Response } from 'express';
import { supabase } from '../../services/supabase';

export async function adminStatsController(req: Request, res: Response): Promise<void> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // totalUsers: count from user_credits table
    const { count: totalUsers, error: usersError } = await supabase
      .from('user_credits')
      .select('*', { count: 'exact', head: true });

    if (usersError) throw usersError;

    // totalGenerations
    const { count: totalGenerations, error: genError } = await supabase
      .from('generations')
      .select('*', { count: 'exact', head: true });

    if (genError) throw genError;

    // activeUsersLast7d: fetch distinct user_ids in last 7 days
    const { data: recentGens, error: recentError } = await supabase
      .from('generations')
      .select('user_id')
      .gte('created_at', sevenDaysAgo);

    if (recentError) throw recentError;

    const activeUsersLast7d = new Set(recentGens?.map((g) => g.user_id) ?? []).size;

    // planBreakdown
    const { data: credits, error: creditsError } = await supabase
      .from('user_credits')
      .select('plan')
      .returns<{ plan: string }[]>();

    if (creditsError) throw creditsError;

    const planBreakdown: Record<string, number> = { free: 0, starter: 0, pro: 0 };
    for (const row of credits ?? []) {
      const plan = row.plan as string;
      planBreakdown[plan] = (planBreakdown[plan] ?? 0) + 1;
    }

    // avgRating + totalFeedback
    const { data: feedback, error: feedbackError } = await supabase
      .from('generation_feedback')
      .select('rating');

    if (feedbackError) throw feedbackError;

    const totalFeedback = feedback?.length ?? 0;
    const avgRating =
      totalFeedback > 0
        ? Math.round(
            ((feedback ?? []).reduce((sum, f) => sum + (f.rating as number), 0) /
              totalFeedback) *
              10,
          ) / 10
        : 0;

    res.json({
      totalUsers:       totalUsers ?? 0,
      totalGenerations: totalGenerations ?? 0,
      activeUsersLast7d,
      planBreakdown,
      avgRating,
      totalFeedback,
    });
  } catch (err) {
    console.error('[admin/stats]', err);
    res.status(500).json({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' });
  }
}
