-- Migration: 001_pg_cron_reset_credits
-- Configura o cron job mensal de reset de créditos via Supabase pg_cron.
--
-- Pré-requisito: extensão pg_cron habilitada no Supabase (já disponível no plano free).
-- A função reset_monthly_credits() deve existir no schema public.
--
-- Execute no SQL Editor do Supabase ou via psql como superuser.

-- Habilita a extensão pg_cron (idempotente)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove job anterior se existir (idempotente)
SELECT cron.unschedule('reset-credits') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reset-credits'
);

-- Agenda reset no 1º dia de cada mês às 00:00 UTC
SELECT cron.schedule(
  'reset-credits',
  '0 0 1 * *',
  $$SELECT reset_monthly_credits()$$
);

-- Verifica agendamento
SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname = 'reset-credits';
