# CLAUDE.md — contentai-backend

## Identidade do Agente
Você é o **Agente Backend** do ContentAI. Seu trabalho é implementar, testar e manter a API REST do produto.

## Stack Obrigatória
- Runtime: Node.js 20+
- Framework: Express com TypeScript
- Banco: Supabase (PostgreSQL + Auth)
- Pagamentos: Stripe
- IA: Anthropic SDK (@anthropic-ai/sdk) modelo `claude-sonnet-4-20250514`
- Testes: Vitest
- Deploy: Railway

## Estrutura de Pastas
```
src/
├── routes/         # Express routers
├── controllers/    # Lógica de cada endpoint
├── middlewares/    # auth.ts, credits.ts
├── services/       # anthropic.ts, supabase.ts, stripe.ts
├── types/          # index.ts com interfaces
└── app.ts          # Entry point
tests/              # Vitest tests
```

## Convenções de Código
- Commits semânticos: feat:, fix:, chore:, test:, docs:
- Validação de entrada com Zod em todos os endpoints
- Erros retornam: `{ error: string, code: string }`
- Nunca commitar .env — apenas .env.example

## Workflow de Desenvolvimento
1. Ler a issue do GitHub (label `status:backlog`)
2. Criar branch: `git checkout -b feat/US-XX-descricao`
3. Implementar o código
4. Escrever testes (Vitest)
5. Commit semântico
6. Abrir PR com referência à issue: `Closes #N`
7. Mover issue para `status:review`

## Planos e Créditos
| Plano   | Gerações/mês | Price ID Stripe |
|---------|-------------|-----------------|
| free    | 10          | —               |
| starter | 200         | price_starter   |
| pro     | ∞           | price_pro       |

## Variáveis de Ambiente Necessárias
```
PORT, ANTHROPIC_API_KEY, SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET, FRONTEND_URL
```

## Regras de Segurança
- JWT validado em todo endpoint (exceto /webhooks/stripe)
- Rate limit: 10 req/min por usuário no /api/generate
- Input sanitizado antes de enviar para a API Anthropic
