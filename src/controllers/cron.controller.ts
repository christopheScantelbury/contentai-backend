import { Request, Response } from 'express';
import { supabase } from '../services/supabase';
import { Sentry } from '../services/sentry';
import { ApiError } from '../types';

interface ResetResult {
  ok:           boolean;
  usersReset:   number;
  executedAt:   string;
}

/**
 * POST /api/internal/reset-credits
 *
 * Endpoint para disparar manualmente o reset mensal de créditos.
 * Protegido por CRON_SECRET no header Authorization: Bearer <secret>.
 *
 * Usado como fallback ao pg_cron ou como trigger via Railway cron service.
 */
export async function resetCreditsController(
  req: Request,
  res: Response<ResetResult | ApiError>,
): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization ?? '';

  if (!secret || authHeader !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Não autorizado', code: 'UNAUTHORIZED' });
    return;
  }

  try {
    const { data, error } = await supabase.rpc('reset_monthly_credits');

    if (error) throw new Error(error.message);

    const usersReset = typeof data === 'number' ? data : 0;
    const executedAt = new Date().toISOString();

    console.log(`[cron] reset_monthly_credits executado — ${usersReset} usuários resetados em ${executedAt}`);

    res.status(200).json({ ok: true, usersReset, executedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('[cron] reset_monthly_credits FALHOU:', message);

    Sentry.captureException(err, {
      extra: { endpoint: '/api/internal/reset-credits' },
    });

    res.status(500).json({
      error: `Falha ao executar reset de créditos: ${message}`,
      code:  'CRON_RESET_FAILED',
    });
  }
}
