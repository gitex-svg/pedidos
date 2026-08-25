# Arquitetura

## Componentes

- **Web:** React, Vite, TypeScript, Tailwind e React Query.
- **API:** Express com contrato OpenAPI versionado em `/api/v1`.
- **Banco:** PostgreSQL com Drizzle ORM e migrations versionadas.
- **Validação:** Zod nas fronteiras HTTP.
- **Autenticação:** Better Auth completo, com adaptador Drizzle para PostgreSQL. A biblioteca valida credenciais, cria e valida sessões, assina cookies, controla expiração e revoga a sessão no logout.

## Separação

- `artifacts/pedidos-gitex`: interface.
- `artifacts/api-server`: rotas, autorização e serviços.
- `lib/api-spec`: contrato OpenAPI.
- `lib/db`: schema e migrations.
- `services`: contratos de regras comerciais, sem implementação nesta fase.

Regras comerciais não devem ser implementadas em componentes React.

## Compatibilidade HTTP

Rotas finas preservam os contratos públicos `/api/v1/auth/login`, `/me` e `/logout`, delegando a autenticação e a sessão ao Better Auth. `requireAuth` usa `auth.api.getSession`; `requireRole` permanece responsável somente pela autorização da aplicação.

Em produção, `BETTER_AUTH_URL` é obrigatório e deve conter a origem pública exata. Origens de desenvolvimento também são adicionadas de forma exata; curingas de domínios compartilhados não são aceitos.