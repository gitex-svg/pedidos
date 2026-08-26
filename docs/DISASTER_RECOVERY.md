# Recuperação de desastre

## Estado conhecido e responsabilidades

O banco é PostgreSQL e as migrations Drizzle são versionadas. A Fase 6.1
adicionou scripts locais de backup e restore e validou tecnicamente um dump
custom-format com checksum, restaurado e consultado em banco Docker isolado em
2026-08-26. Isso não comprova agendamento, retenção, criptografia, cópia fora do
host nem restore na VPS; essas capacidades permanecem pendentes de configuração
e evidência no ambiente real.

Antes de produção, nomear:

| Decisão | Responsável a registrar |
| --- | --- |
| proprietário do backup e aprovador de restore | `<OWNER>` |
| operador de banco/plataforma | `<DBA_OR_PLATFORM_OPERATOR>` |
| frequência, retenção e janela de execução | `<BACKUP_POLICY_APPROVED>` |
| local/conta/região de armazenamento | `<BACKUP_LOCATION_APPROVED>` |
| criptografia em trânsito, repouso e gestão de chaves | `<ENCRYPTION_DECISION_APPROVED>` |
| RPO/RTO aceitos e contato de escalonamento | `<RPO_RTO_AND_CONTACTS_APPROVED>` |

O operador deve confirmar a capacidade real da plataforma escolhida; não é
aceitável presumir que um serviço gerenciado faça backup. A decisão deve cobrir
ao menos backups automáticos consistentes, retenção, cópia fora do banco
primário quando necessário, acesso mínimo, criptografia em trânsito/repouso,
rotação de chaves e descarte seguro conforme a política aplicável.

## Procedimento de backup

1. Verificar a política aprovada, capacidade disponível, sucesso do último job e
   ausência de alerta pendente.
2. No deployment Compose VPS, executar o mecanismo concreto sem imprimir
   `DATABASE_URL` ou credenciais:

   ```bash
   BACKUP_DIR=/var/backups/pedidos-gitex BACKUP_RETENTION_DAYS=14 \
     ENV_FILE=.env.production deploy/scripts/backup-postgres.sh
   ```

   Ele usa `pg_dump` custom-format dentro do container PostgreSQL, `umask 077`,
   arquivo temporário/rename atômico, checksum SHA-256 e retenção configurável.
   Não envia cópia para fora do host: o proprietário deve operar e evidenciar a
   transferência criptografada para o destino aprovado.
3. Registrar identificador do backup, horário UTC, tamanho/resultado, revisão
   de schema, ambiente, retenção e local no registro operacional restrito.
4. Proteger o artefato com o método de criptografia aprovado e restringir acesso
   ao proprietário/operador designados.

Frequência, retenção e local permanecem pendências explícitas até
`<BACKUP_POLICY_APPROVED>` ser preenchido por quem administra a plataforma.

## Restore em ambiente isolado

Nunca restaurar primeiro sobre produção. Para um drill ou incidente:

1. Declarar incidente, congelar mudanças e, quando necessário, coordenar a
   pausa de operações ERP para evitar divergência de dados.
2. Selecionar backup aprovado e verificar identidade, integridade e janela de
   dados contra o RPO.
3. Criar banco PostgreSQL temporário **isolado**, com credenciais novas e sem
   acesso público/ERP produtivo.
4. Restaurar usando o mecanismo documentado da plataforma. Não colocar URI,
   senha ou chave em terminal gravado, ticket ou logs.

   Para o Compose VPS, o mecanismo é
   `deploy/scripts/restore-postgres-isolated.sh BACKUP.dump
   NOME_DO_BANCO --confirm RESTORE-NOME_DO_BANCO`. Ele verifica o formato (e o
   checksum adjacente quando existe), aceita somente identificador PostgreSQL
   seguro, exige banco existente/vazio e recusa o banco configurado como
   produção. Não cria, limpa ou sobrescreve banco.
5. Conferir histórico de migrations contra a revisão restaurada; não usar
   `drizzle-kit push`/`push-force` para ajustar o banco restaurado. Aplicar
   apenas migrations versionadas necessárias e aprovadas.
6. Apontar uma instância isolada da aplicação ao banco restaurado, com
   `SESSION_SECRET`, `ERP_API_KEY` e `BETTER_AUTH_URL` não produtivos.
7. Validar `GET /health` e `GET /ready`, login autorizado, consulta de
   clientes/produtos e um pedido histórico sem modificar dados. Validar integridade de
   `integration_logs` e `order_status_history` conforme o escopo do drill.
8. Registrar duração, backup utilizado, dados recuperados, falhas e evidências.
   Destruir o ambiente temporário e revogar suas credenciais quando concluído.

## Recuperação de produção

Restauração produtiva exige aprovação do dono do negócio e do responsável de
backup. Preserve o banco afetado para análise quando for seguro, restaure para
um alvo controlado, valide migrations e smoke test, e só então altere o
roteamento/conexão conforme plano aprovado. Após retorno, reconciliar pedidos
`SUBMITTED` e confirmações/status ERP por `correlation_id`, `erp_import_id`,
`erp_order_number` e timestamps de origem. O fluxo ERP é pull-based; a
aplicação não reenvia pedidos automaticamente.

## Drill e critério

Periodicidade do drill: `<RESTORE_DRILL_FREQUENCY_APPROVED>`. O resultado só é
“aprovado” se o procedimento acima for executado em homologação/isolado e houver
evidência registrada de restore, migrations, acesso da aplicação e consultas
seguras. **Status atual:** mecanismo aprovado em ambiente Docker local
descartável; drill operacional na VPS, destino externo e política aprovada
permanecem pendentes.

`VPS_DEPLOYMENT.md` explica permissões, destino fora do host e a criação do alvo
isolado. A existência desses scripts não é validação de backup, restore,
armazenamento externo ou ambiente remoto.
