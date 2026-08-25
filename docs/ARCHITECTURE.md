# Arquitetura

## Componentes

- **Web:** React, Vite, TypeScript, Tailwind e React Query.
- **API:** Express com contrato OpenAPI versionado em `/api/v1`.
- **Banco:** PostgreSQL com Drizzle ORM e migrations versionadas.
- **Validação:** Zod nas fronteiras HTTP.
- **Autenticação:** Better Auth completo, com adaptador Drizzle para PostgreSQL. A biblioteca valida credenciais, cria e valida sessões, assina cookies, controla expiração e revoga a sessão no logout.
- **Integração ERP (Fase 2):** endpoints de entrada autenticados por Bearer
  token para sincronizar os cadastros de referência.

## Separação

- `artifacts/pedidos-gitex`: interface.
- `artifacts/api-server`: rotas, autorização e serviços.
- `lib/api-spec`: contrato OpenAPI.
- `lib/db`: schema e migrations.
- `services`: contratos de regras comerciais, sem implementação nesta fase.

Regras comerciais não devem ser implementadas em componentes React.

## Catálogo e integração ERP — Fase 2

O ERP é a fonte de verdade de representantes, clientes, produtos, condições de
pagamento e transportadoras. A web não possui operações de escrita para esses
cadastros; é uma consumidora read-only dos dados sincronizados.

- A web consulta `GET /api/v1/customers`, `/products`, `/payment-terms` e
  `/carriers`, protegidos por sessão.
- O ERP publica lotes em `POST /api/v1/erp/representatives/sync`,
  `/customers/sync`, `/products/sync`, `/payment-terms/sync` e
  `/carriers/sync`, protegidos por `Authorization: Bearer <ERP_API_KEY>`.
- `ERP_API_KEY` é secret de ambiente exclusivo do servidor. Seu valor não pode
  ser exposto ao navegador, versionado ou incluído em logs.
- Cada lote comporta até 500 itens. Itens são validados individualmente:
  sucesso integral retorna `200`; lote com erros por item retorna `207` e
  informa os erros sem descartar os itens válidos.
- Toda execução é rastreável por `correlation_id`, propagado na resposta e nos
  logs de integração.
- Listagens são paginadas com `page=1` e `limit=20` por padrão; `limit` máximo
  é 100.

O contrato de payloads e respostas está em `docs/ERP_API.md` e em
`lib/api-spec/openapi.yaml`.

## Compatibilidade HTTP

Rotas finas preservam os contratos públicos `/api/v1/auth/login`, `/me` e `/logout`, delegando a autenticação e a sessão ao Better Auth. `requireAuth` usa `auth.api.getSession`; `requireRole` permanece responsável somente pela autorização da aplicação.

Em produção, `BETTER_AUTH_URL` é obrigatório e deve conter a origem pública exata. Origens de desenvolvimento também são adicionadas de forma exata; curingas de domínios compartilhados não são aceitos.