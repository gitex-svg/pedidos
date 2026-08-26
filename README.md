## API de cadastros

As consultas autenticadas de clientes, produtos, condições de pagamento e transportadoras usam
`page`, `pageSize` (padrão efetivo 20, limitado a 100), `totalItems` e `totalPages`. O parâmetro `limit`
continua aceito apenas como compatibilidade quando `pageSize` não é informado; `pageSize` tem prioridade.

Os lotes ERP, inclusive tabelas de preço e seus itens, retornam contadores, `item_errors` e um `results` ordenado por item, além do
`correlation_id` persistido para rastreabilidade.

# Pedidos Fitas Gitex

Sistema web mobile-first para representantes comerciais criarem e acompanharem
orçamentos. A Fase 1 entrega autenticação e autorização, a Fase 2 os cadastros
sincronizados pelo ERP, a Fase 3 o motor de preços e a Fase 4 a digitação,
totalização e finalização imutável dos pedidos. A Fase 5 entrega ao ERP a
integração de saída **pull-based** dos pedidos finalizados e o retorno de sua
confirmação e de seus status comerciais.

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

## Fase 4 — orçamentos

Representantes criam orçamentos em `DRAFT`, alteram a capa e os descontos,
incluem produtos com preço sugerido pelo motor da Fase 3 e podem definir preço
especial. Ao finalizar, o estado passa a `SUBMITTED` e fica imutável. ADMIN
consulta todos os pedidos, sem permissão de escrita.

- Listagem e digitação: `/orders`, `/orders/new` e `/orders/:id`.
- API autenticada: `/api/v1/orders` e sub-recursos de itens/finalização.
- O representante é sempre derivado da sessão; o frontend não fornece
  `representative_id`, status, totais ou snapshots.
- Quantidades, preços e descontos trafegam como strings decimais. Os descontos
  D1–D4 são aplicados em cascata com aritmética exata.
- Cada total de item é arredondado para duas casas com `ROUND_HALF_UP`; o total
  do pedido é a soma desses itens já arredondados.
- Preços e dados comerciais do produto são snapshots. Preço especial preserva
  o preço sugerido para auditoria e não recebe os descontos da capa.

A integração de saída de pedidos com o ERP, confirmação, faturamento e estados
comerciais posteriores permanecem fora do escopo desta fase.

## Fase 5 — integração de saída com o ERP

O ERP consulta, com sua API key, a fila de pedidos `SUBMITTED` ainda não
confirmados; a aplicação não faz callback, webhook nem tentativa automática de
envio. O ciclo é:

1. `GET /api/v1/erp/orders/submitted` lê a fila paginada, ordenada por
   `submitted_at` e `id`;
2. `GET /api/v1/erp/orders/:id` obtém o snapshot congelado para importação;
3. `POST /api/v1/erp/orders/:id/confirm` confirma a importação;
4. `PATCH /api/v1/erp/orders/:id/status` devolve um dos status comerciais
   `EM_ANALISE`, `APROVADO`, `FECHADO`, `FATURADO` ou `REPROVADO`.

As quatro rotas exigem `Authorization: Bearer <ERP_API_KEY>`. A fila usa
`page=1` e `pageSize=50` por padrão, aceita no máximo 100 itens e responde com
`page_size`, `total_items` e `total_pages`. A confirmação é idempotente quando
repetida com a mesma identidade ERP; número do pedido ou `erp_import_id`
divergentes retornam `409`. Cada confirmação/status aceita `correlation_id`
UUID opcional, que é devolvido e registrado para auditoria.

O detalhe é uma leitura de snapshots: não recalcula catálogo, preços,
descontos, quantidades ou totais. Decimais são strings, inclusive na UI, para
preservar `NUMERIC(18,6)` nos unitários, `NUMERIC(18,4)` nas quantidades e
`NUMERIC(20,2)` nos totais. A interface exibe o status ERP em português, o
número do pedido ERP, a data de integração e o histórico de status.

Consulte `docs/ERP_API.md` para todos os endpoints, payloads `snake_case`,
respostas e exemplos `curl` completos.

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

Para VPS Ubuntu com Docker Compose, Nginx same-origin, migrations explícitas e
operação de backup/restore, siga `docs/VPS_DEPLOYMENT.md`. Os comandos
operacionais são `deploy/scripts/deploy.sh`,
`deploy/scripts/backup-postgres.sh` e
`deploy/scripts/restore-postgres-isolated.sh`; eles usam
`docker compose --env-file`, não devem receber arquivo de ambiente via `source`.
DNS, TLS, VPS, backup fora do host e ERP real continuam validações externas,
nunca presumidas por esses scripts.

Consulte `docs/` para arquitetura, banco, regras e contratos ERP das Fases 2 a 5.