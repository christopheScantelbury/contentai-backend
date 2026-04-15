import { Response } from 'express';
import { supabase } from '../services/supabase';
import { AuthenticatedRequest, ApiError, Plan } from '../types';
import { PLAN_LIMITS } from '../middlewares/credits';

// ── Cache em memória (60 s por userId) ───────────────────────────────────────

interface UsageResponse {
  plan:               Plan;
  credits_used:       number;
  credits_limit:      number | null;
  credits_remaining:  number | null;
  reset_at:           string;
  total_generations:  number;
  last_generation_at: string | null;
}

interface CacheEntry {
  data:      UsageResponse;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();

// ── Controller ────────────────────────────────────────────────────────────────

export async function usageController(
  req: AuthenticatedRequest,
  res: Response<UsageResponse | ApiError>,
): Promise<void> {
  const { userId } = req;

  // Verifica cache
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    res.status(200).json(cached.data);
    return;
  }

  // Busca créditos e totais em paralelo
  const [creditsResult, generationsResult] = await Promise.all([
    supabase
      .from('user_credits')
      .select('plan, credits_used, credits_limit, reset_at')
      .eq('user_id', userId)
      .single(),

    supabase
      .from('generations')
      .select('created_at', { count: 'exact', head: false })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  // Monta dados de créditos (fallback para free se não existir)
  const plan  = ((creditsResult.data?.plan as Plan) ?? 'free');
  const used  = (creditsResult.data?.credits_used  as number)  ?? 0;
  const limit = (creditsResult.data?.credits_limit as number)  ?? PLAN_LIMITS[plan];
  const isPro = plan === 'pro';

  const resetAt = creditsResult.data?.reset_at as string | undefined
    ?? new Date(Date.UTC(
        new Date().getUTCFullYear(),
        new Date().getUTCMonth() + 1,
        1,
      )).toISOString();

  // Total de gerações via contagem + última geração via ordenação
  const total    = generationsResult.count ?? 0;
  const lastRow  = generationsResult.data?.[0];
  const lastGenAt = (lastRow?.created_at as string | undefined) ?? null;

  const data: UsageResponse = {
    plan,
    credits_used:       used,
    credits_limit:      isPro ? null : limit,
    credits_remaining:  isPro ? null : Math.max(0, limit - used),
    reset_at:           resetAt,
    total_generations:  total,
    last_generation_at: lastGenAt,
  };

  // Armazena no cache
  cache.set(userId, { data, expiresAt: Date.now() + CACHE_TTL_MS });

  res.status(200).json(data);
}

/** Invalida o cache de um usuário (útil após geração) */
export function invalidateUsageCache(userId: string): void {
  cache.delete(userId);
}
