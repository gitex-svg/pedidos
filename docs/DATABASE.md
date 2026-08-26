# Pedidos da Fase 4

`orders` e `order_items` preservam snapshots comerciais e de identificação ERP
do produto. A sequence PostgreSQL `orders_internal_number_seq` aloca
`internal_number`; sequences são seguras sob concorrência e podem conter
lacunas. As colunas usam `NUMERIC`: unitários `(18,6)`, quantidades `(18,4)`,
descontos `(7,4)` e totais persistidos de itens/pedidos `(20,2)`.
`orders.version` fornece a verificação otimista, enquanto as mutações também
bloqueiam a linha do pedido com `FOR UPDATE`.
## Concorrência de integração

UPSERTs da Fase 2 usam `ON CONFLICT DO UPDATE` condicionado a uma versão de origem estritamente
mais nova. `integration_logs.correlation_id` permite localizar cada lote sem armazenar credenciais.

# Banco de dados

## Entidades da Fase 1

- `users`: identidade, perfil, situação e campos obrigatórios do Better Auth.
- `accounts`: credenciais de senha do provider `credential`; a senha não permanece em `users`.
- `sessions`: sessões gerenciadas pelo Better Auth, com token assinado no cookie, expiração e vínculo com usuário.
- `verifications`: estrutura do Better Auth para fluxos futuros de verificação.
- `representatives`: cadastro ERP e vínculo opcional 1:1 com usuário.

## Catálogos e integração da Fase 2

- `representatives`: chave externa `erp_code`; a sincronização atualiza o
  cadastro sem substituir o vínculo existente `user_id`.
- `customers`: chave externa `erp_code`, com vínculo ao representante resolvido
  a partir de `representative_erp_code` recebido do ERP.
- `products`: chave externa `erp_id`.
- `payment_terms`: chave externa `erp_code`.
- `carriers`: chave externa `erp_code`.
- Os registros de catálogo preservam `active` e `source_updated_at`; os logs de
  integração registram o processamento e seu `correlation_id`.

As chaves externas são usadas em UPSERT idempotente. Uma mensagem cuja
`source_updated_at` seja mais antiga que a versão já persistida é ignorada,
impedindo que entregas fora de ordem revertam o catálogo. `active=false` não
remove o registro: ele é mantido para histórico e auditoria.

## Enums

- `user_role`: `ADMIN`, `REPRESENTATIVE`.
- `internal_order_status`: `DRAFT`, `SUBMITTED`.
- `erp_status`: estados comerciais enviados pelo ERP.
- `price_origin`: `CUSTOMER`, `REPRESENTATIVE`, `STANDARD`, `SPECIAL`;
  o resolvedor da Fase 3 produz somente os três primeiros e `SPECIAL` fica
  reservado para a futura camada de pedidos.

Sincronização técnica não é status comercial. Na Fase 2, a ordenação da origem
é controlada por `source_updated_at`, e os logs de integração preservam a
rastreabilidade por `correlation_id`.

## Tabelas de preço — Fase 3

- `price_tables`: chave externa única `erp_code`, `price_type`, escopo opcional
  por `representative_id` ou `customer_id`, estado, vigência e metadados de
  sincronização.
- `price_table_items`: vínculo único `(price_table_id, product_id)`,
  `unit_price NUMERIC(18,6)` e metadados de sincronização.
- `price_type`: `STANDARD`, `REPRESENTATIVE`, `CUSTOMER`.

Constraints de escopo mantêm STANDARD sem cliente/representante,
REPRESENTATIVE com representante e sem cliente, e CUSTOMER somente com cliente.
O representante de uma tabela CUSTOMER é derivado do cliente. Registros
inativos não são apagados, preservando histórico.

`valid_from` e `valid_until` são limites inclusivos; valores nulos deixam o
respectivo lado em aberto. Sobreposições temporais não podem ser integralmente
excluídas por uma unicidade simples, por isso o serviço detecta mais de uma
tabela aplicável no mesmo nível e falha explicitamente. A constraint
`price_tables_validity_range_check` impede que `valid_from` seja posterior a
`valid_until` quando ambas as datas forem informadas.

Preço unitário usa `NUMERIC(18,6)`: até 12 dígitos inteiros e 6 fracionários.
Na API e no driver ele é string decimal; a entrada aceita zeros à esquerda e o
servidor preserva a parte inteira, preenchendo a fração até seis casas na saída.
Não se usa float/double nem `number` JavaScript para valores monetários.

## Fase 5 — saída de pedidos e auditoria ERP

A migration manual `0009_phase_5_erp_orders.sql` acrescenta:

- `orders.erp_import_id` (único), `orders.erp_last_status_at` e o índice de
  fila `(internal_status, erp_synced_at, submitted_at, id)`;
- `order_items.product_erp_id_snapshot`, preenchido a partir do produto
  existente e tornado obrigatório, para que a saída ERP não dependa de uma
  nova consulta ao catálogo;
- `order_status_history`, com tipo de status (`INTERNAL`/`ERP`), status
  anterior/novo, origem, `correlation_id`, `source_updated_at` e criação;
- índices por pedido/ordem de criação e por `correlation_id` no histórico;
- backfill do evento interno `DRAFT → SUBMITTED` para pedidos já finalizados.

A migration `0010_woozy_prima.sql` é o **checkpoint do snapshot do schema**
posterior à migration manual 0009; ela não contém mudanças executáveis nem
backfill adicional. As duas migrations devem permanecer na sequência para que
ambientes novos e existentes tenham o mesmo histórico.

A migration `0011_wise_impossible_man.sql` acrescenta os snapshots dos códigos
ERP de representante, cliente, condição de pagamento e transportadora na capa.
Ela preenche pedidos `SUBMITTED` existentes e cria uma restrição que impede um
pedido finalizado sem os três códigos obrigatórios. A transportadora permanece
opcional.

`erp_synced_at` marca a confirmação de importação e define a remoção da fila
pull; não reabre nem recalcula o pedido. `erp_order_number` deve ser estável por
pedido, enquanto `erp_import_id`, quando utilizado, é globalmente único. O
serviço bloqueia a linha do pedido na confirmação/status e aplica o checkpoint
`erp_last_status_at`: eventos ERP com `source_updated_at` menor ou igual são
ignorados. Evento com data mais nova e status igual apenas atualiza esse
checkpoint, sem inserir outra linha de histórico.

Os snapshots do cabeçalho e itens são a fonte da exportação. Quantidade é
`NUMERIC(18,4)`, preço unitário/sugerido/líquido é `NUMERIC(18,6)`, descontos
são `NUMERIC(7,4)` e totais são `NUMERIC(20,2)`. Drivers e API os mantêm como
strings; não há recalculação nem conversão para ponto flutuante durante a
integração.