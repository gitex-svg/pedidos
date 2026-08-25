# Pedidos Fitas Gitex

Sistema web responsivo para representantes comerciais digitarem e acompanharem pedidos e orçamentos.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-server run test` — testes de autenticação/autorização
- `pnpm run create-admin` — cria ou redefine o primeiro ADMIN usando ADMIN_EMAIL e ADMIN_PASSWORD
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — contrato da API
- `lib/db/src/schema` e `lib/db/drizzle` — schema e migrations
- `artifacts/api-server/src` — autenticação, autorização e serviços
- `artifacts/pedidos-gitex/src` — login e dashboard
- `docs/` — decisões técnicas e regras comerciais

## Architecture decisions

- Sincronização ERP é fato técnico, separado de status comercial.
- Autenticação e sessões são gerenciadas pelo Better Auth com adaptador Drizzle/PostgreSQL.
- Identidade e escopo do representante sempre são derivados da sessão no backend.
- Regras financeiras serão centralizadas em services e usarão decimais.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
