-- Migration: 002_generation_feedback
-- Cria a tabela generation_feedback para NPS e feedback por geração.
--
-- Execute no SQL Editor do Supabase ou via psql.

CREATE TABLE IF NOT EXISTS public.generation_feedback (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  generation_id uuid        REFERENCES public.generations(id) ON DELETE CASCADE,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  rating        integer     NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       text,
  created_at    timestamptz DEFAULT now() NOT NULL
);

-- Índices para queries frequentes
CREATE INDEX IF NOT EXISTS generation_feedback_user_id_idx
  ON public.generation_feedback (user_id);

CREATE INDEX IF NOT EXISTS generation_feedback_generation_id_idx
  ON public.generation_feedback (generation_id);

-- RLS: usuário só pode ver e inserir seu próprio feedback
ALTER TABLE public.generation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_feedback" ON public.generation_feedback
  FOR ALL USING (auth.uid() = user_id);

-- Service role ignora RLS (já é o comportamento padrão com service_role key)
