# API ERP

A integração funcional não faz parte da Fase 1.

## Contrato planejado

- prefixo `/api/v1/erp`;
- autenticação server-to-server;
- segredo somente em Replit Secrets;
- validação Zod;
- rate limiting;
- idempotência e UPSERT por identificador externo;
- `correlation_id` em logs;
- nenhum token ou segredo em logs.

Entidades previstas: representantes, clientes, produtos, condições de pagamento, transportadoras, tabelas de preço e pedidos submetidos.