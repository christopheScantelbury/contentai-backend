import { Request, Response } from 'express';
import { supabase } from '../../services/supabase';

export async function adminGenerationsController(req: Request, res: Response): Promise<void> {
  try {
    const page    = Math.max(1, parseInt(String(req.query.page    ?? '1'),  10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(String(req.query.perPage ?? '20'), 10) || 20));

    const from = (page - 1) * perPage;
    const to   = from + perPage - 1;

    // Fetch generations page
    const { data: gens, count, error: gensError } = await supabase
      .from('generations')
      .select('id, user_id, product_name, category, created_at, tokens_used', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (gensError) throw gensError;

    const ids = (gens ?? []).map((g) => g.id as string);

    // Fetch ratings for this page's generations
    let ratingMap = new Map<string, number | null>();
    if (ids.length > 0) {
      const { data: feedbackRows, error: feedbackError } = await supabase
        .from('generation_feedback')
        .select('generation_id, rating')
        .in('generation_id', ids);

      if (feedbackError) throw feedbackError;

      ratingMap = new Map(
        (feedbackRows ?? []).map((f) => [f.generation_id as string, f.rating as number | null]),
      );
    }

    const generations = (gens ?? []).map((g) => ({
      id:          g.id,
      userId:      g.user_id,
      productName: g.product_name,
      category:    g.category,
      createdAt:   g.created_at,
      tokensUsed:  g.tokens_used,
      rating:      ratingMap.get(g.id as string) ?? null,
    }));

    res.json({
      generations,
      total:   count ?? 0,
      page,
      perPage,
    });
  } catch (err) {
    console.error('[admin/generations]', err);
    res.status(500).json({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' });
  }
}
