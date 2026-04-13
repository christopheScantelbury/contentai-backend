-- Migration 001: Schema inicial ContentAI
-- Applied: 2026-04-13
-- =============================================

-- Tabela de controle de versões
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz DEFAULT now(),
  description text
);

-- Tabela de créditos e planos
CREATE TABLE IF NOT EXISTS public.user_credits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan text DEFAULT 'free' CHECK (plan IN ('free','starter','pro')),
  credits_used integer DEFAULT 0,
  credits_limit integer DEFAULT 10,
  stripe_customer_id text,
  stripe_subscription_id text,
  payment_failed boolean DEFAULT false,
  reset_at timestamptz DEFAULT (date_trunc('month', now()) + interval '1 month'),
  cancellation_reason text,
  trial_ends_at timestamptz,
  last_generation_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Tabela de gerações de conteúdo
CREATE TABLE IF NOT EXISTS public.generations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  product_name text NOT NULL,
  category text,
  features text,
  image_url text,
  result jsonb NOT NULL,
  tokens_used integer DEFAULT 0,
  generation_time_ms integer DEFAULT 0,
  model_used text DEFAULT 'claude-sonnet-4-20250514',
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own credits" ON public.user_credits FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "users own generations" ON public.generations FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "service role credits" ON public.user_credits FOR ALL TO service_role USING (true);
CREATE POLICY "service role generations" ON public.generations FOR ALL TO service_role USING (true);

-- Índices
CREATE INDEX IF NOT EXISTS idx_generations_user_id ON public.generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON public.generations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_user_created ON public.generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_credits_stripe_customer ON public.user_credits(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_plan ON public.user_credits(plan);
CREATE INDEX IF NOT EXISTS idx_user_credits_reset_at ON public.user_credits(reset_at);

-- Funções
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  INSERT INTO public.user_credits (user_id, plan, credits_used, credits_limit)
  VALUES (NEW.id, 'free', 0, 10)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$func$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$;

CREATE OR REPLACE FUNCTION public.update_last_generation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  UPDATE public.user_credits
  SET last_generation_at = now(), updated_at = now()
  WHERE user_id = NEW.user_id;
  RETURN NEW;
END;
$func$;

CREATE OR REPLACE FUNCTION public.increment_credits_used(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  UPDATE public.user_credits
  SET credits_used = credits_used + 1, updated_at = now()
  WHERE user_id = p_user_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $func$
BEGIN
  UPDATE public.user_credits
  SET credits_used = 0,
      reset_at = date_trunc('month', now()) + interval '1 month',
      updated_at = now()
  WHERE reset_at <= now();
END;
$func$;

-- Triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

DROP TRIGGER IF EXISTS handle_user_credits_updated_at ON public.user_credits;
CREATE TRIGGER handle_user_credits_updated_at
  BEFORE UPDATE ON public.user_credits
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();

DROP TRIGGER IF EXISTS on_generation_created ON public.generations;
CREATE TRIGGER on_generation_created
  AFTER INSERT ON public.generations
  FOR EACH ROW EXECUTE PROCEDURE public.update_last_generation();

-- View ops
CREATE OR REPLACE VIEW public.ops_dashboard AS
SELECT
  uc.plan,
  COUNT(DISTINCT uc.user_id) as total_users,
  COUNT(DISTINCT CASE WHEN uc.plan != 'free' THEN uc.user_id END) as paid_users,
  COUNT(DISTINCT CASE WHEN uc.last_generation_at >= now() - interval '7 days' THEN uc.user_id END) as active_7d,
  COUNT(DISTINCT CASE WHEN uc.last_generation_at < now() - interval '7 days' AND uc.plan != 'free' THEN uc.user_id END) as churn_risk,
  SUM(uc.credits_used) as total_generations,
  AVG(uc.credits_used) as avg_generations_per_user
FROM public.user_credits uc
GROUP BY uc.plan;
