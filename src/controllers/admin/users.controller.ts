import { Request, Response } from 'express';
import { supabase } from '../../services/supabase';

export async function adminUsersController(req: Request, res: Response): Promise<void> {
  try {
    const page    = Math.max(1, parseInt(String(req.query.page    ?? '1'),  10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(String(req.query.perPage ?? '20'), 10) || 20));
    const plan    = req.query.plan as string | undefined;

    const from = (page - 1) * perPage;
    const to   = from + perPage - 1;

    // Build query for user_credits with optional plan filter
    let query = supabase
      .from('user_credits')
      .select('user_id, plan, credits_used', { count: 'exact' })
      .range(from, to);

    if (plan && ['free', 'starter', 'pro'].includes(plan)) {
      query = query.eq('plan', plan);
    }

    const { data: credits, count, error: creditsError } = await query;

    if (creditsError) throw creditsError;

    // Fetch all auth users to merge email data (avoid N+1)
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });

    if (authError) throw authError;

    const authUserMap = new Map<string, { email: string; created_at: string }>(
      (authData.users ?? []).map((u) => [
        u.id,
        { email: u.email ?? '', created_at: u.created_at ?? '' },
      ]),
    );

    const users = (credits ?? []).map((row) => {
      const authUser = authUserMap.get(row.user_id);
      return {
        id:          row.user_id,
        email:       authUser?.email ?? '',
        plan:        row.plan,
        creditsUsed: row.credits_used,
        createdAt:   authUser?.created_at ?? '',
      };
    });

    res.json({
      users,
      total:   count ?? 0,
      page,
      perPage,
    });
  } catch (err) {
    console.error('[admin/users]', err);
    res.status(500).json({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' });
  }
}
