## API de cadastros

As consultas autenticadas de clientes, produtos, condições de pagamento e transportadoras usam
`page`, `pageSize` (padrão efetivo 20, limitado a 100), `totalItems` e `totalPages`. O parâmetro `limit`
continua aceito apenas como compatibilidade quando `pageSize` não é informado; `pageSize` tem prioridade.

Os lotes ERP, inclusive tabelas de preço e seus itens, retornam contadores, `item_errors` e um `results` ordenado por item, além do
`correlation_id` persistido para rastreabilidade.

# Pedidos Fitas Gitex

Fundação do sistema web para representantes comerciais criarem e acompanharem pedidos e orçamentos. A Fase 1 entrega autenticação e autorização, a Fase 2 entrega os cadastros sincronizados pelo ERP e a Fase 3 entrega tabelas e resolução de preços.

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

## Fase 3 — motor de preços

O ERP também é a fonte de verdade das tabelas de preço e de seus itens. Ele
sincroniza `POST /api/v1/erp/price-tables/sync` e
`POST /api/v1/erp/price-table-items/sync` usando somente códigos externos.
Usuários com sessão resolvem preços por
`GET /api/v1/pricing/resolve?customerId=...&productId=...`.

A resolução segue **CUSTOMER → REPRESENTATIVE → STANDARD**. O representante é
derivado do cliente, a vigência (`valid_from`/`valid_until`) é inclusiva e a
ausência de preço retorna `found: false`, nunca preço zero. Sobreposição no
mesmo nível retorna `409`, sem escolha arbitrária. Valores monetários cruzam a
API como strings decimais e são armazenados em `NUMERIC(18,6)`; não são
convertidos em `number` JavaScript. A entrada aceita zeros à esquerda e de uma
a seis casas; o servidor completa a fração para seis casas na saída.

Pedidos, itens de pedido, descontos, preço especial e integração de pedidos
continuam fora do escopo da Fase 3.

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

Consulte `docs/` para arquitetura, banco, regras e contratos ERP das Fases 2 e 3.