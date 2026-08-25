# Changelog

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