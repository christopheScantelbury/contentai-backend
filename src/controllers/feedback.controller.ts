import { Response } from 'express';
import { z } from 'zod';
import { supabase } from '../services/supabase';
import { AuthenticatedRequest, ApiError } from '../types';

// ── Schemas de validação ──────────────────────────────────────────────────────

const feedbackSchema = z.object({
  generation_id: z.string().uuid('generation_id deve ser um UUID válido'),
  rating:        z.number().int().min(1).max(5),
  comment:       z.string().max(1000).optional(),
});

// ── POST /api/feedback ────────────────────────────────────────────────────────

interface FeedbackResponse {
  id:           string;
  generation_id: string;
  rating:        number;
  comment?:      string | null;
  created_at:    string;
}

export async function createFeedbackController(
  req: AuthenticatedRequest,
  res: Response<FeedbackResponse | ApiError>,
): Promise<void> {
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({
      error: parsed.error.errors[0].message,
      code:  'VALIDATION_ERROR',
    });
    return;
  }

  const { generation_id, rating, comment } = parsed.data;

  // Verifica que a geração pertence ao usuário autenticado
  const { data: gen, error: genErr } = await supabase
    .from('generations')
    .select('id')
    .eq('id', generation_id)
    .eq('user_id', req.userId)
    .single();

  if (genErr || !gen) {
    res.status(404).json({
      error: 'Geração não encontrada ou não pertence ao usuário',
      code:  'GENERATION_NOT_FOUND',
    });
    return;
  }

  const { data, error } = await supabase
    .from('generation_feedback')
    .insert({
      generation_id,
      user_id: req.userId,
      rating,
      comment: comment ?? null,
    })
    .select('id, generation_id, rating, comment, created_at')
    .single();

  if (error) {
    res.status(500).json({
      error: 'Erro ao salvar feedback',
      code:  'DB_ERROR',
    });
    return;
  }

  res.status(201).json(data as FeedbackResponse);
}

// ── GET /api/feedback/stats ───────────────────────────────────────────────────

interface FeedbackStats {
  average_rating: number;
  total:          number;
}

/**
 * Retorna estatísticas de feedback.
 * Admin only — requer ADMIN_SECRET no header X-Admin-Secret.
 */
export async function feedbackStatsController(
  req: AuthenticatedRequest,
  res: Response<FeedbackStats | ApiError>,
): Promise<void> {
  const adminSecret = process.env.ADMIN_SECRET;
  const provided    = req.headers['x-admin-secret'];

  if (!adminSecret || provided !== adminSecret) {
    res.status(403).json({
      error: 'Acesso negado',
      code:  'FORBIDDEN',
    });
    return;
  }

  const { data, error } = await supabase
    .from('generation_feedback')
    .select('rating');

  if (error) {
    res.status(500).json({ error: 'Erro ao buscar estatísticas', code: 'DB_ERROR' });
    return;
  }

  const ratings = (data ?? []).map((r) => r.rating as number);
  const total   = ratings.length;
  const average = total > 0
    ? Math.round((ratings.reduce((s, r) => s + r, 0) / total) * 100) / 100
    : 0;

  res.status(200).json({ average_rating: average, total });
}
