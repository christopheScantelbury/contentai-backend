import * as Sentry from '@sentry/node';

/**
 * Inicializa o Sentry uma única vez.
 * Deve ser chamado ANTES de qualquer import de rotas/controllers.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.warn('[sentry] SENTRY_DSN não configurado — monitoramento desabilitado');
    return;
  }

  Sentry.init({
    dsn,
    environment:    process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0.2,
  });
}

export { Sentry };
