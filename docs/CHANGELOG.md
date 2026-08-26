## Fase 2 — revisão pós-entrega

- Resultado ordenado por item e razões estáveis nos lotes ERP.
- Correlação fornecida ou gerada registrada em logs.
- Paginação canônica com `pageSize`, `totalItems` e `totalPages`.
- Timestamp de origem igual passou a ser explicitamente ignorado.

# Changelog

## Fase 5 — Integração ERP de saída

- Fluxo pull-based para o ERP listar pedidos `SUBMITTED` pendentes, obter seu
  detalhe congelado e confirmar a importação, sem webhook ou push.
- Rotas Bearer API key: fila paginada, detalhe de snapshot, confirmação
  idempotente e atualização de status comercial.
- Confirmação transacional com lock, `erp_order_number`, `erp_import_id` único e
  conflitos explícitos para identidades ERP divergentes.
- Cinco status ERP: `EM_ANALISE`, `APROVADO`, `FECHADO`, `FATURADO` e
  `REPROVADO`; histórico auditável com origem, timestamp e `correlation_id`.
- Eventos de status antigos ou com timestamp igual são ignorados; status igual
  com timestamp novo atualiza o checkpoint sem duplicar o histórico.
- Snapshots dos códigos ERP da capa e de `product_erp_id` nos itens; a
  exportação não consulta códigos cadastrais atuais nem recalcula preços,
  descontos ou totais. Decimais continuam strings de precisão fixa.
- Interface passou a exibir status ERP localizado, pedido ERP, data de
  integração e histórico de status.
- Migration manual `0009_phase_5_erp_orders.sql` e checkpoint de snapshot
  `0010_woozy_prima.sql`; `0011_wise_impossible_man.sql` congela e faz backfill
  dos códigos ERP da capa.

## Fase 4 — Orçamentos

- Pedidos `DRAFT`/`SUBMITTED` com número interno gerado por sequence, escopo por
  representante e consulta global read-only para ADMIN.
- CRUD de capa e itens com lock pessimista, versão otimista e imutabilidade
  após finalização.
- Snapshots de produto, preço sugerido, origem e tabela no momento da inclusão.
- Descontos D1–D4 em cascata com aritmética exata; unitários em seis casas,
  quantidades em quatro e totais em duas.
- Total do pedido calculado pela soma dos totais de itens já arredondados.
- Preço especial sem descontos, preservando preço sugerido e descontos copiados
  para auditoria.
- Interface mobile-first para listar, criar, editar itens e finalizar pedidos,
  integrada apenas aos contratos OpenAPI gerados.
- Testes HTTP/PostgreSQL para autorização, snapshots, precisão, concorrência,
  finalização e imutabilidade.

## Fase 3 — Motor de preços

- Tabelas `STANDARD`, `REPRESENTATIVE` e `CUSTOMER` sincronizadas pelo ERP,
  usando exclusivamente identificadores externos.
- Itens de preço sincronizados por tabela e `product_erp_id`, mantendo o padrão
  de lotes, correlação, processamento parcial e proteção contra versões antigas.
- Resolução autenticada na hierarquia CUSTOMER → REPRESENTATIVE → STANDARD,
  derivando o representante do cliente e respeitando o escopo da sessão.
- Vigência com limites inclusivos e referência opcional; ausência explícita com
  `found=false` e ambiguidade explícita por HTTP `409`.
- `unit_price` contratado como string decimal e persistido em `NUMERIC(18,6)`,
  sem uso de `number` JavaScript, aceitando zeros à esquerda na entrada e com
  saída fixa em seis casas.
- Constraint de banco adicionada para rejeitar intervalo de vigência com início
  posterior ao fim.
- Razões estáveis adicionadas: `CUSTOMER_NOT_FOUND`, `PRODUCT_NOT_FOUND` e
  `PRICE_TABLE_NOT_FOUND`.
- Pedidos, itens, descontos, preço especial e integração de pedidos permanecem
  fora do escopo.

## Fase 2 — Cadastros e sincronização ERP

- Catálogos read-only na web para clientes, produtos, condições de pagamento e
  transportadoras, com paginação padrão de 20 itens e máximo de 100.
- ERP estabelecido como fonte de verdade para representantes e catálogos.
- Endpoints de sincronização para representantes, clientes, produtos, condições
  de pagamento e transportadoras, autenticados por Bearer `ERP_API_KEY`.
- Lotes de até 500 itens, validação individual e resposta `207 Multi-Status`
  para processamento parcial.
- UPSERT idempotente por chaves externas, ignorando eventos obsoletos por
  `source_updated_at` e retendo registros inativos com `active=false`.
- Preservação do `user_id` do representante e resolução de clientes por
  `representative_erp_code`.
- Logs de integração e rastreabilidade por `correlation_id`.
- Documentação do contrato ERP e delimitação do escopo então futuro do motor
  de preços.

## Fase 1

- Estrutura web e API.
- PostgreSQL, Drizzle e migration inicial.
- Usuários, sessões e representantes.
- Perfis `ADMIN` e `REPRESENTATIVE`.
- Login, logout e dashboard protegido.
- Contratos iniciais de serviços.
- Documentação técnica inicial.

## Fase 1.1 — Hardening da Fundação

- Migração integral de autenticação e sessões para Better Auth.
- Compatibilidade mantida para login, usuário atual e logout.
- Conta de credencial separada da identidade do usuário.
- Rota administrativa real protegida por perfil.
- Resolução centralizada do representante autenticado.
- Testes HTTP para usuário inativo, sessão, logout e autorização ADMIN.