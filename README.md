# Pedidos Fitas Gitex

Fundação do sistema web para representantes comerciais criarem e acompanharem pedidos e orçamentos. A Fase 1 entrega autenticação, autorização inicial, login, logout, dashboard protegido, banco e contratos de serviços.

## Executar

Os workflows gerenciados iniciam:

- `artifacts/api-server: API Server`
- `artifacts/pedidos-gitex: web`

Validações locais:

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test
```

## Banco e migrations

```bash
pnpm --filter @workspace/db run generate
pnpm --filter @workspace/db run push
```

## Criar ou redefinir um ADMIN

Use variáveis de ambiente temporárias; não grave senhas no repositório:

```bash
ADMIN_EMAIL=admin@empresa.com.br \
ADMIN_PASSWORD='uma-senha-forte' \
pnpm run create-admin
```

Consulte `docs/` para arquitetura, banco, regras e contrato ERP planejado.