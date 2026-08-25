# Banco de dados

## Entidades da Fase 1

- `users`: identidade, perfil, situação e campos obrigatórios do Better Auth.
- `accounts`: credenciais de senha do provider `credential`; a senha não permanece em `users`.
- `sessions`: sessões gerenciadas pelo Better Auth, com token assinado no cookie, expiração e vínculo com usuário.
- `verifications`: estrutura do Better Auth para fluxos futuros de verificação.
- `representatives`: cadastro ERP e vínculo opcional 1:1 com usuário.

## Enums

- `user_role`: `ADMIN`, `REPRESENTATIVE`.
- `internal_order_status`: `DRAFT`, `SUBMITTED`.
- `erp_status`: estados comerciais enviados pelo ERP.
- `price_origin`: `CUSTOMER`, `REPRESENTATIVE`, `STANDARD`, `SPECIAL`.

Sincronização técnica não é status comercial: futuramente será representada por timestamps como `last_synced_at` e `erp_synced_at`.

## Precisão financeira planejada

- preço unitário: `NUMERIC(18,6)`;
- percentual: `NUMERIC(7,4)`;
- total: `NUMERIC(20,6)`.

As tabelas comerciais serão adicionadas somente nas fases correspondentes.