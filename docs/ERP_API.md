# API de integração ERP — Fases 2 a 5

## Responsabilidade e segurança

O ERP é a fonte de verdade de representantes, clientes, produtos, condições de
pagamento, transportadoras, tabelas de preço e preços por produto. A aplicação
web não mantém esses dados manualmente.

Os endpoints de integração exigem:

```http
Authorization: Bearer <ERP_API_KEY>
Content-Type: application/json
```

`ERP_API_KEY` deve ser configurada somente como secret/variável de ambiente no
servidor. Não inclua a chave em código versionado, payloads de cliente,
capturas de tela ou logs. Uma chave ausente ou inválida recebe `401`.

## Rate limit da integração

Depois de validar a `ERP_API_KEY`, todas as rotas `/api/v1/erp/*` compartilham
um limite próprio, independente das políticas de login e das rotas web. O
padrão é de 5.000 requisições a cada 60 segundos, configurável por
`ERP_RATE_LIMIT_MAX` e `ERP_RATE_LIMIT_WINDOW_MS`.

O caminho da URL não é uma exceção de segurança: uma credencial ausente ou
inválida recebe `401` antes de participar desse contador. Ao exceder o limite
ERP, a resposta é `429` e inclui `Retry-After`, `RateLimit-Limit`,
`RateLimit-Remaining` e `RateLimit-Reset`.

## Endpoints

| Cadastro | Endpoint |
| --- | --- |
| Representantes | `POST /api/v1/erp/representatives/sync` |
| Clientes | `POST /api/v1/erp/customers/sync` |
| Produtos | `POST /api/v1/erp/products/sync` |
| Condições de pagamento | `POST /api/v1/erp/payment-terms/sync` |
| Transportadoras | `POST /api/v1/erp/carriers/sync` |
| Tabelas de preço | `POST /api/v1/erp/price-tables/sync` |
| Itens das tabelas | `POST /api/v1/erp/price-table-items/sync` |

Os consumidores web consultam, respectivamente, `GET /api/v1/customers`,
`/products`, `/payment-terms` e `/carriers`. As listagens usam `page=1` e
`pageSize=20` efetivo por padrão. Valores de `pageSize` acima de 100 são
limitados a 100. `limit` é legado: só é usado quando `pageSize` não é enviado;
quando ambos existem, `pageSize` tem prioridade.

## Lotes, validação e resultado

Cada requisição recebe `{ "correlation_id": "UUID opcional", "items": [] }` e
aceita no máximo 500 itens. O campo `source_updated_at` é obrigatório em cada
item; `active` é opcional e assume `true`.

Itens são validados individualmente. Um lote estruturalmente inválido retorna
`400`. Quando todos os itens são processados sem erro, a resposta é `200`.
Quando um ou mais itens falham e os demais podem ser processados, a resposta é
`207 Multi-Status`.

A resposta contém `correlation_id`, contadores `received`, `created`,
`updated`, `ignored`, `errors` e `item_errors`. Cada erro de item informa ao
menos `index`, `external_id` quando disponível, e `error`. O
`correlation_id` é registrado nos logs de integração para correlação ponta a
ponta.

## Semântica de sincronização

- O processamento faz UPSERT idempotente por chave externa: `erp_code` para
  representantes, clientes, condições e transportadoras; `erp_id` para
  produtos.
- Eventos com `source_updated_at` anterior ou igual ao registro já persistido
  são ignorados (`ignored`) atomicamente;
  reenvios não devem criar duplicidade.
- `active=false` é retenção/inativação lógica, não exclusão física.
- A sincronização de representante preserva o `user_id` já associado ao
  representante local.
- O item de cliente traz `representative_erp_code`; esse código precisa
  resolver um representante existente para que o cliente seja aceito.

Os campos obrigatórios e formatos de cada item estão definidos no contrato
OpenAPI em `lib/api-spec/openapi.yaml`.

Para produtos, `reference_code` é texto com 1 a 8 caracteres. O valor é
preservado como recebido pelo ERP, sem conversão numérica, padding ou
truncamento. Exemplos válidos incluem `A`, `01CR`, `CPA/1` e `12345678`;
`""` e valores com mais de 8 caracteres são inválidos.

Cada resposta mantém contadores e `item_errors` e inclui um `results` em ordem,
com um resultado por item. As razões estáveis são `STALE_SOURCE_VERSION`,
`REPRESENTATIVE_NOT_FOUND`, `CUSTOMER_NOT_FOUND`, `PRODUCT_NOT_FOUND`,
`PRICE_TABLE_NOT_FOUND`, `VALIDATION_ERROR` e `PERSISTENCE_ERROR`.
O `correlation_id` UUID fornecido é preservado; quando ausente, é gerado e
persistido em `integration_logs`.

## Preços — contrato da Fase 3

Uma tabela envia `erp_code`, `name`, `price_type`, vigência, estado e
`source_updated_at`. `price_type` aceita `STANDARD`, `REPRESENTATIVE` e
`CUSTOMER`. STANDARD não envia escopo; REPRESENTATIVE envia
`representative_erp_code`; CUSTOMER envia `customer_erp_code`.

Cada item envia `price_table_erp_code`, `product_erp_id`, `unit_price` e
`source_updated_at`. A integração **não aceita UUIDs internos**: referências
são sempre códigos externos e resolvidas no servidor. Tabela, produto, cliente
ou representante inexistente falham somente o item e produzem a razão estável
correspondente.

`unit_price` é string decimal, nunca JSON number, com até 12 dígitos inteiros e
de 1 a 6 casas, inclusive zeros à esquerda (`"003.25"` ou `"3.250000"`). O
servidor preserva a parte inteira e completa a fração até seis casas. O banco
usa `NUMERIC(18,6)` e a leitura web devolve exatamente seis casas, sem
conversão por `number` JavaScript.

As tabelas obedecem a vigência inclusiva: `valid_from` nulo ou menor/igual à
referência e `valid_until` nulo ou maior/igual à referência. A resolução web
autenticada usa `GET /api/v1/pricing/resolve`, com `customerId`, `productId` e
`referenceDate` opcional, seguindo CUSTOMER → REPRESENTATIVE → STANDARD.
REPRESENTATIVE só consulta cliente próprio; ADMIN tem escopo global. Ausência
retorna `found=false`; ambiguidade no mesmo nível retorna `409`.
O banco rejeita uma tabela cujo `valid_from` seja posterior a `valid_until`
quando as duas datas existirem.

## Fora do escopo da Fase 3

Permanecem fora deste contrato: criação e gestão de pedidos/orçamentos e itens;
descontos e preço especial; impostos e fretes operacionais; aprovação e status
comerciais; faturamento; e integração de pedidos e seus retornos com o ERP.

## Pedidos — contrato da Fase 5

### Fluxo pull e autenticação

A saída de pedidos é **pull-based**. A aplicação não envia pedidos ao ERP, não
executa webhook e não tenta reenviar importações: o ERP consulta a fila,
obtém o detalhe persistido e confirma quando terminar sua importação. Todas as
rotas desta seção exigem exatamente:

```http
Authorization: Bearer <ERP_API_KEY>
Content-Type: application/json
```

`<ERP_API_KEY>` é somente um placeholder nos exemplos. A chave real deve ficar
em secret/variável de ambiente do servidor ERP e nunca em código, frontend,
documentação preenchida ou logs.

| Operação | Endpoint |
| --- | --- |
| Fila de pedidos pendentes | `GET /api/v1/erp/orders/submitted` |
| Detalhe congelado | `GET /api/v1/erp/orders/:id` |
| Confirmação de importação | `POST /api/v1/erp/orders/:id/confirm` |
| Atualização de status ERP | `PATCH /api/v1/erp/orders/:id/status` |

### Fila e snapshot

`GET /api/v1/erp/orders/submitted` retorna somente pedidos internos
`SUBMITTED` cujo `erp_synced_at` ainda é nulo. A ordem determinística é
`submitted_at` crescente e, em empate, `id` crescente. Aceita `page` (padrão
1) e `pageSize` (padrão 50, máximo 100). A resposta usa `snake_case`:

```json
{
  "items": [
    {
      "id": "<ORDER_ID>",
      "internal_number": 12345,
      "submitted_at": "2025-01-15T10:30:00.000Z",
      "representative_erp_code": "REP-001",
      "customer_erp_code": "CLI-001",
      "gross_total": "1500.00",
      "net_total": "1425.00"
    }
  ],
  "page": 1,
  "page_size": 50,
  "total_items": 1,
  "total_pages": 1
}
```

O detalhe contém cabeçalho, códigos ERP e itens com todos os snapshots
comerciais. `GET /api/v1/erp/orders/:id` não recalcula preços, descontos,
quantidades nem totais e não confirma o pedido. Preços unitários são strings
`NUMERIC(18,6)`, quantidades são strings `NUMERIC(18,4)` e totais são strings
`NUMERIC(20,2)`; o consumidor deve preservar essas strings, sem `float` ou
`number` JavaScript.

### Confirmação, idempotência e conflitos

O corpo da confirmação usa apenas `snake_case`:

```json
{
  "erp_order_number": "ERP-ORDER-000123",
  "erp_import_id": "ERP-IMPORT-000123",
  "status": "EM_ANALISE",
  "source_updated_at": "2025-01-15T10:35:00.000Z",
  "correlation_id": "<CORRELATION_UUID>"
}
```

`erp_order_number` e `source_updated_at` são obrigatórios; `erp_import_id`,
`status` e `correlation_id` são opcionais. A mesma confirmação, com o mesmo
número ERP e o mesmo identificador de importação, é idempotente: retorna `200`
com `result: "ignored"` e `reason: "ALREADY_CONFIRMED"`. Alterar um
`erp_order_number` já associado ou fornecer `erp_import_id` divergente/atribuído
a outro pedido retorna `409` (`ERP_ORDER_NUMBER_CONFLICT` ou
`ERP_IMPORT_ID_CONFLICT`). O pedido precisa existir e estar `SUBMITTED`;
caso contrário, a API retorna `404` ou `409`.

`correlation_id` é UUID opcional. Quando omitido, o servidor gera um; em ambos
os casos ele é devolvido na resposta e registrado em `integration_logs` e no
histórico de status quando houver transição.

### Status, ordenação temporal e histórico

Os únicos status aceitos são `EM_ANALISE`, `APROVADO`, `FECHADO`, `FATURADO` e
`REPROVADO`. O ERP os atualiza por `PATCH` com `status`,
`source_updated_at` e `correlation_id` opcional. Se `source_updated_at` for
anterior **ou igual** ao último status ERP, a resposta é `200` com
`result: "ignored"` e `reason: "STALE_SOURCE_VERSION"`. Se o timestamp for
mais novo, mas o status for igual ao atual, o checkpoint é atualizado e a
resposta usa `STATUS_UNCHANGED`; não há linha repetida no histórico. Uma
mudança real registra status anterior/novo, fonte `ERP`, correlação e timestamp
de origem em `order_status_history`.

Na interface, os códigos são apresentados como Em Análise, Aprovado, Fechado,
Faturado e Reprovado, juntamente com o número ERP, data de integração e
histórico de status. A ausência de status não é inferida como aprovação ou
qualquer outro estado.

### Exemplos completos com `curl`

Todos os valores entre `<...>` são placeholders; substitua-os no ambiente de
integração e nunca use uma chave real em documentação ou repositório.

**Fila:**

```bash
curl --request GET \
  --url 'https://<API_HOST>/api/v1/erp/orders/submitted?page=1&pageSize=50' \
  --header 'Authorization: Bearer <ERP_API_KEY>' \
  --header 'Content-Type: application/json'
```

**Detalhe:**

```bash
curl --request GET \
  --url 'https://<API_HOST>/api/v1/erp/orders/<ORDER_ID>' \
  --header 'Authorization: Bearer <ERP_API_KEY>' \
  --header 'Content-Type: application/json'
```

**Confirmação:**

```bash
curl --request POST \
  --url 'https://<API_HOST>/api/v1/erp/orders/<ORDER_ID>/confirm' \
  --header 'Authorization: Bearer <ERP_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{
    "erp_order_number": "<ERP_ORDER_NUMBER>",
    "erp_import_id": "<ERP_IMPORT_ID>",
    "status": "EM_ANALISE",
    "source_updated_at": "<SOURCE_UPDATED_AT_ISO_8601>",
    "correlation_id": "<CORRELATION_UUID>"
  }'
```

**Status `EM_ANALISE`:**

```bash
curl --request PATCH \
  --url 'https://<API_HOST>/api/v1/erp/orders/<ORDER_ID>/status' \
  --header 'Authorization: Bearer <ERP_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"status":"EM_ANALISE","source_updated_at":"<SOURCE_UPDATED_AT_ISO_8601>","correlation_id":"<CORRELATION_UUID>"}'
```

**Status `APROVADO`:**

```bash
curl --request PATCH \
  --url 'https://<API_HOST>/api/v1/erp/orders/<ORDER_ID>/status' \
  --header 'Authorization: Bearer <ERP_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"status":"APROVADO","source_updated_at":"<SOURCE_UPDATED_AT_ISO_8601>","correlation_id":"<CORRELATION_UUID>"}'
```

**Status `FECHADO`:**

```bash
curl --request PATCH \
  --url 'https://<API_HOST>/api/v1/erp/orders/<ORDER_ID>/status' \
  --header 'Authorization: Bearer <ERP_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"status":"FECHADO","source_updated_at":"<SOURCE_UPDATED_AT_ISO_8601>","correlation_id":"<CORRELATION_UUID>"}'
```

**Status `FATURADO`:**

```bash
curl --request PATCH \
  --url 'https://<API_HOST>/api/v1/erp/orders/<ORDER_ID>/status' \
  --header 'Authorization: Bearer <ERP_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"status":"FATURADO","source_updated_at":"<SOURCE_UPDATED_AT_ISO_8601>","correlation_id":"<CORRELATION_UUID>"}'
```

**Status `REPROVADO`:**

```bash
curl --request PATCH \
  --url 'https://<API_HOST>/api/v1/erp/orders/<ORDER_ID>/status' \
  --header 'Authorization: Bearer <ERP_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{"status":"REPROVADO","source_updated_at":"<SOURCE_UPDATED_AT_ISO_8601>","correlation_id":"<CORRELATION_UUID>"}'
```

## Escopo explicitamente fora da Fase 5

Não fazem parte deste contrato: push/callback/webhook ou retentativa automática
de entrega; criação, edição, finalização ou aprovação de pedidos pelo ERP;
cancelamento, estorno, devolução e estoque; fiscal/impostos, emissão de nota,
pagamento, frete e regras de faturamento; e recalcular ou substituir snapshots,
preços, descontos, quantidades e totais durante a exportação.