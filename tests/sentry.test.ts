import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@sentry/node', () => ({
  init:                    vi.fn(),
  captureException:        vi.fn(),
  setupExpressErrorHandler: vi.fn(),
  expressErrorHandler:     vi.fn(() => (_err: unknown, _req: unknown, _res: unknown, next: () => void) => next()),
}));

describe('initSentry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('não inicializa quando SENTRY_DSN não está definido', async () => {
    delete process.env.SENTRY_DSN;
    const { initSentry } = await import('../src/services/sentry');
    initSentry();
    const Sentry = await import('@sentry/node');
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('inicializa com DSN quando SENTRY_DSN está definido', async () => {
    process.env.SENTRY_DSN = 'https://test@sentry.io/123';
    const { initSentry } = await import('../src/services/sentry');
    initSentry();
    const Sentry = await import('@sentry/node');
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://test@sentry.io/123' }),
    );
    delete process.env.SENTRY_DSN;
  });
});

describe('Sentry.captureException', () => {
  it('é chamado com erro e contexto userId+endpoint', async () => {
    const Sentry = await import('@sentry/node');
    const err = new Error('test error');
    Sentry.captureException(err, { extra: { userId: 'u1', endpoint: '/api/generate' } });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      err,
      expect.objectContaining({ extra: expect.objectContaining({ userId: 'u1' }) }),
    );
  });
});
