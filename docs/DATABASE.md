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
- `price_origin`: `CUSTOMER`, `REPRESENTATIVE`, `STANDARD`, `SPECIAL`.

Sincronização técnica não é status comercial. Na Fase 2, a ordenação da origem
é controlada por `source_updated_at`, e os logs de integração preservam a
rastreabilidade por `correlation_id`.

## Precisão financeira planejada

- preço unitário: `NUMERIC(18,6)`;
- percentual: `NUMERIC(7,4)`;
- total: `NUMERIC(20,6)`.

As tabelas comerciais serão adicionadas somente nas fases correspondentes.