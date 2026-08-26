# API de integração ERP — Fases 2 e 3

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