## Sincronização e paginação

- O ERP é a fonte dos cadastros e versões anteriores ou iguais são ignoradas.
- Cada item de lote recebe resultado `created`, `updated`, `ignored` ou `error`.
- Consultas usam `pageSize` (20 por padrão, máximo efetivo 100); `limit` é legado.

# Regras de negócio

## Preços

Hierarquia obrigatória: `CUSTOMER` → `REPRESENTATIVE` → `STANDARD`.

O item preservará `suggested_price_origin` e `effective_price_origin`. Preço especial usa origem efetiva `SPECIAL` sem apagar a origem sugerida.

## Descontos

Descontos 1 a 4 são aplicados em cascata. Itens com preço especial não recebem os descontos, mas preservam o snapshot informado na capa.

## Segurança

- `ADMIN` pode administrar todos os dados.
- `REPRESENTATIVE` acessa somente clientes e pedidos vinculados ao seu representante.
- O backend deriva identidade e escopo da sessão; não confia em IDs de representante enviados pelo navegador.

## Produto ERP

Grupo, tipo, produto e referência são textos e preservam zeros à esquerda. A combinação terá índice composto, sem `UNIQUE` até confirmação do ERP.

## Catálogos ERP — Fase 2

- O ERP é a fonte de verdade para representantes, clientes, produtos, condições
  de pagamento e transportadoras. A web apenas consulta esses dados; não há
  manutenção manual pelo navegador.
- Cada entrada de sincronização faz UPSERT idempotente por sua chave externa:
  `erp_code` para representantes, clientes, condições e transportadoras; e
  `erp_id` para produtos.
- `source_updated_at` define a precedência temporal. Eventos mais antigos que o
  estado persistido são ignorados, mesmo que sejam reenviados.
- `active=false` inativa logicamente o cadastro; não há exclusão física pelo
  fluxo de sincronização.
- Ao atualizar um representante, o vínculo local `user_id` é preservado. O ERP
  não pode desvincular ou trocar o usuário representante por esse endpoint.
- Ao sincronizar um cliente, `representative_erp_code` deve resolver um
  representante cadastrado; falha nessa resolução é erro daquele item.
- Lotes têm máximo de 500 itens e validação por item. Itens válidos podem ser
  processados quando outros falham; nesse caso a resposta é `207
  Multi-Status`, com erros por índice/chave externa.
- Toda sincronização pode trazer `correlation_id`, utilizado nos logs de
  integração e devolvido na resposta para rastreabilidade.

## Escopo explicitamente fora da Fase 2 (Fase 3)

- Criação, edição, envio ou aprovação de pedidos e orçamentos.
- Cálculo e aplicação operacional de preços, descontos, impostos, fretes ou
  condições comerciais em pedidos.
- Integração de pedidos, status comerciais, faturamento ou retorno operacional
  do ERP.
- Operações de escrita de catálogo na interface web.