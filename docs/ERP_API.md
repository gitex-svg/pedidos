# API de integração ERP — Fase 2

## Responsabilidade e segurança

O ERP é a fonte de verdade de representantes, clientes, produtos, condições de
pagamento e transportadoras. A aplicação web consome esses dados apenas para
leitura; os usuários da web não alteram os cadastros.

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

Os consumidores web consultam, respectivamente, `GET /api/v1/customers`,
`/products`, `/payment-terms` e `/carriers`. As listagens usam `page=1` e
`limit=20` por padrão; o máximo de `limit` é 100.

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
- Eventos com `source_updated_at` anterior ao registro já persistido são
  ignorados (`ignored`); reenvios não devem criar duplicidade.
- `active=false` é retenção/inativação lógica, não exclusão física.
- A sincronização de representante preserva o `user_id` já associado ao
  representante local.
- O item de cliente traz `representative_erp_code`; esse código precisa
  resolver um representante existente para que o cliente seja aceito.

Os campos obrigatórios e formatos de cada item estão definidos no contrato
OpenAPI em `lib/api-spec/openapi.yaml`.

## Fora do escopo da Fase 2

A Fase 3 abrange, e portanto permanece fora deste contrato: criação e gestão
de pedidos/orçamentos; preços, descontos, impostos e fretes operacionais;
aprovação e status comerciais; faturamento; e a integração de pedidos e seus
retornos com o ERP.