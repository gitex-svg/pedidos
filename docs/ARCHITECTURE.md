# Arquitetura

## Componentes

- **Web:** React, Vite, TypeScript, Tailwind e React Query.
- **API:** Express com contrato OpenAPI versionado em `/api/v1`.
- **Banco:** PostgreSQL com Drizzle ORM e migrations versionadas.
- **Validação:** Zod nas fronteiras HTTP.
- **Autenticação:** senha protegida pelas primitivas auditadas de hash do Better Auth; sessão opaca persistida no PostgreSQL, rotacionada em novo login e invalidada no logout.

## Separação

- `artifacts/pedidos-gitex`: interface.
- `artifacts/api-server`: rotas, autorização e serviços.
- `lib/api-spec`: contrato OpenAPI.
- `lib/db`: schema e migrations.
- `services`: contratos de regras comerciais, sem implementação nesta fase.

Regras comerciais não devem ser implementadas em componentes React.