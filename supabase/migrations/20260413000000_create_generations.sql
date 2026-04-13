-- Tabela de gerações de conteúdo (US-01)
CREATE TABLE IF NOT EXISTS public.generations (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  input       JSONB       NOT NULL,
  output      JSONB       NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Índice para consultas por usuário
CREATE INDEX IF NOT EXISTS generations_user_id_idx
  ON public.generations (user_id, created_at DESC);

-- Row Level Security: cada usuário vê apenas suas próprias gerações
ALTER TABLE public.generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view own generations"
  ON public.generations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "service role bypass rls"
  ON public.generations FOR ALL
  USING (true)
  WITH CHECK (true);
