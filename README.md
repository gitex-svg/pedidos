## API de cadastros

As consultas autenticadas de clientes, produtos, condições de pagamento e transportadoras usam
`page`, `pageSize` (padrão efetivo 20, limitado a 100), `totalItems` e `totalPages`. O parâmetro `limit`
continua aceito apenas como compatibilidade quando `pageSize` não é informado; `pageSize` tem prioridade.

Os lotes ERP retornam contadores, `item_errors` e um `results` ordenado por item, além do
`correlation_id` persistido para rastreabilidade.

# Pedidos Fitas Gitex

Fundação do sistema web para representantes comerciais criarem e acompanharem pedidos e orçamentos. A Fase 1 entrega autenticação, autorização inicial, login, logout, dashboard protegido, banco e contratos de serviços. A Fase 2 entrega os cadastros de catálogo sincronizados pelo ERP.

## Fase 2 — catálogo sincronizado

O **ERP é a fonte de verdade** para representantes, clientes, produtos, condições de pagamento e transportadoras. A aplicação web é consumidora **somente de leitura** desses cadastros: usuários autenticados consultam o catálogo, mas não o alteram.

- Consultas web: `GET /api/v1/customers`, `/products`, `/payment-terms` e `/carriers`.
- Integração de entrada ERP: `POST /api/v1/erp/representatives/sync`,
  `/customers/sync`, `/products/sync`, `/payment-terms/sync` e `/carriers/sync`.
- Cada lote aceita no máximo 500 itens; a paginação de catálogo usa `page=1`,
  `pageSize=20` efetivo por padrão e limita valores acima de 100.
- A integração usa `Authorization: Bearer <ERP_API_KEY>`. Configure
  `ERP_API_KEY` exclusivamente como secret/variável de ambiente; nunca a
  registre no repositório, no frontend ou em logs.

Consulte `docs/ERP_API.md` para o contrato operacional completo.

## Executar

Os workflows gerenciados iniciam:

- `artifacts/api-server: API Server`
- `artifacts/pedidos-gitex: web`

Validações locais:

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/pedidos-gitex run build
```

## Banco e migrations

```bash
pnpm --filter @workspace/db run generate
pnpm --filter @workspace/db run migrate
```

## Criar ou redefinir um ADMIN

Use variáveis de ambiente temporárias; não grave senhas no repositório:

```bash
ADMIN_EMAIL=admin@empresa.com.br \
ADMIN_PASSWORD='uma-senha-forte' \
pnpm run create-admin
```

## Produção

Defina `BETTER_AUTH_URL` com a origem pública exata da aplicação, por exemplo
`https://pedidos.exemplo.com.br`. A API interrompe a inicialização em produção
quando essa configuração estiver ausente, evitando aceitar origens genéricas.

Consulte `docs/` para arquitetura, banco, regras e contrato ERP da Fase 2.