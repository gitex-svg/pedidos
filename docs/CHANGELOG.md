# Changelog

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
- Documentação do contrato ERP e delimitação explícita do escopo futuro da
  Fase 3.

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