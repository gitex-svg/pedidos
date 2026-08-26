## Integração ERP

A borda ERP é autenticada por API key e processa lotes item a item. UPSERTs e proteção de versão
são atômicos no PostgreSQL; consultas paginadas aplicam filtros, contagem e offset no banco.

# Arquitetura

## Componentes

- **Web:** React, Vite, TypeScript, Tailwind e React Query.
- **API:** Express com contrato OpenAPI versionado em `/api/v1`.
- **Banco:** PostgreSQL com Drizzle ORM e migrations versionadas.
- **Validação:** Zod nas fronteiras HTTP.
- **Autenticação:** Better Auth completo, com adaptador Drizzle para PostgreSQL. A biblioteca valida credenciais, cria e valida sessões, assina cookies, controla expiração e revoga a sessão no logout.
- **Integração ERP (Fases 2 e 3):** endpoints de entrada autenticados por Bearer
  token para sincronizar cadastros de referência, tabelas de preço e seus itens.

## Separação

- `artifacts/pedidos-gitex`: interface.
- `artifacts/api-server`: rotas, autorização e serviços.
- `lib/api-spec`: contrato OpenAPI.
- `lib/db`: schema e migrations.
- `services`: regras comerciais de backend; na Fase 3 inclui a resolução centralizada de preço.

Regras comerciais não devem ser implementadas em componentes React.

## Catálogo e integração ERP — Fase 2

O ERP é a fonte de verdade de representantes, clientes, produtos, condições de
pagamento e transportadoras. A web não possui operações de escrita para esses
cadastros; é uma consumidora read-only dos dados sincronizados.

- A web consulta `GET /api/v1/customers`, `/products`, `/payment-terms` e
  `/carriers`, protegidos por sessão.
- O ERP publica lotes em `POST /api/v1/erp/representatives/sync`,
  `/customers/sync`, `/products/sync`, `/payment-terms/sync` e
  `/carriers/sync`, protegidos por `Authorization: Bearer <ERP_API_KEY>`.
- `ERP_API_KEY` é secret de ambiente exclusivo do servidor. Seu valor não pode
  ser exposto ao navegador, versionado ou incluído em logs.
- Cada lote comporta até 500 itens. Itens são validados individualmente:
  sucesso integral retorna `200`; lote com erros por item retorna `207` e
  informa os erros sem descartar os itens válidos.
- Toda execução é rastreável por `correlation_id`, propagado na resposta e nos
  logs de integração.
- Listagens são paginadas com `page=1` e `pageSize=20` efetivo por padrão;
  valores acima de 100 são limitados a 100 e `limit` é fallback legado.

O contrato de payloads e respostas está em `docs/ERP_API.md` e em
`lib/api-spec/openapi.yaml`.

## Motor de preços — Fase 3

`PricingService` concentra vigência, escopo e a hierarquia
**CUSTOMER → REPRESENTATIVE → STANDARD**. A API recebe cliente e produto; o
representante é derivado do vínculo do cliente e nunca aceito do frontend. O
serviço valida cliente, representante e produto ativos, aplica
`valid_from <= referência <= valid_until` (limites inclusivos e nulos
ilimitados), e consulta somente tabelas ativas.

O endpoint autenticado `GET /api/v1/pricing/resolve` respeita o escopo da
sessão: ADMIN tem consulta global e REPRESENTATIVE somente clientes próprios.
Ausência é um resultado `found=false`. Se mais de uma tabela aplicável no mesmo
nível contiver o produto, a API retorna `409`; não existe desempate implícito.

O ERP publica tabelas e itens em `/api/v1/erp/price-tables/sync` e
`/api/v1/erp/price-table-items/sync`, com o mesmo processamento parcial,
versionamento e correlação da Fase 2. Essa borda usa apenas `erp_code`,
`representative_erp_code`, `customer_erp_code`, `price_table_erp_code` e
`product_erp_id`, resolvendo UUIDs internamente.

Preços trafegam como strings decimais e permanecem `NUMERIC(18,6)` no
PostgreSQL. A entrada aceita zeros à esquerda e o servidor completa a fração
para seis casas na resposta. Nenhuma etapa financeira os converte para `number`
JavaScript. O banco também rejeita intervalos cuja data inicial seja posterior
à final quando ambas existirem.
Pedidos, descontos e preço especial não pertencem à Fase 3.

## Compatibilidade HTTP

Rotas finas preservam os contratos públicos `/api/v1/auth/login`, `/me` e `/logout`, delegando a autenticação e a sessão ao Better Auth. `requireAuth` usa `auth.api.getSession`; `requireRole` permanece responsável somente pela autorização da aplicação.

Em produção, `BETTER_AUTH_URL` é obrigatório e deve conter a origem pública exata. Origens de desenvolvimento também são adicionadas de forma exata; curingas de domínios compartilhados não são aceitos.