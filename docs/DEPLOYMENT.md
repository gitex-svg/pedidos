# Implantação e operação — Fase 6

Este documento descreve o procedimento para o estado atual do repositório. Não
constitui confirmação de que algum recurso gerenciado da plataforma (backup,
alerta, domínio, TLS ou deploy de produção) já esteja habilitado.

## Ambientes e separação obrigatória

| Ambiente | Finalidade | Dados/credenciais |
| --- | --- | --- |
| DEVELOPMENT | desenvolvimento local e testes de engenharia | banco, secrets e chave ERP próprios; pode usar dados de teste |
| HOMOLOGATION | validação integrada, inclusive com ERP de homologação quando disponibilizado | banco e secrets próprios; nunca reutilizar produção |
| PRODUCTION | tráfego comercial real | banco, secrets, URL pública e chave ERP exclusivos |

Cada ambiente deve ser um deployment e banco distintos, com controle de acesso
separado. Não copiar dump de produção para development/homologation sem
aprovação, minimização de dados e controles aplicáveis. As origens, URLs e
níveis de log também devem ser configurados por ambiente.

## Configuração e secrets

Defina secrets no mecanismo seguro do ambiente de execução, nunca no
repositório, frontend, payload de cliente ou log:

| Variável | Uso e requisito conhecido |
| --- | --- |
| `DATABASE_URL` | conexão PostgreSQL; obrigatória para o banco |
| `SESSION_SECRET` | obrigatória, mínimo de 32 caracteres; valor diferente em cada ambiente |
| `BETTER_AUTH_URL` | origem pública exata; obrigatória quando `NODE_ENV=production` |
| `ERP_API_KEY` | Bearer token exclusivo do servidor para as rotas `/api/v1/erp/...`; não expor |
| `PORT` | exigida pelo processo da API |
| `NODE_ENV` | use `production` somente no deployment produtivo |
| `LOG_LEVEL` | nível do Pino; padrão atual `info` |
| `REPLIT_DEV_DOMAIN` | somente suporte ao domínio de desenvolvimento, quando fornecido pela plataforma |

Antes de promover, o responsável deve conferir nomes (sem revelar valores),
origem de `BETTER_AUTH_URL`, força/independência dos secrets e acesso mínimo ao
cofre de secrets. A validação centralizada falha sem expor valores quando
`DATABASE_URL`, `SESSION_SECRET`, `ERP_API_KEY` ou `PORT` são ausentes/inválidos,
quando o secret de sessão tem menos de 32 caracteres, ou quando
`BETTER_AUTH_URL` está ausente/inválida em produção.

O repositório ignora artefatos de build, mas o `.gitignore` atual **não contém
uma regra explícita para `.env`**. Não criar nem versionar arquivos `.env` com
secrets; o responsável deve adicionar a proteção apropriada antes de usá-los.

## Ciclo de vida da chave ERP

1. **Criar:** um administrador de secrets gera uma chave criptograficamente
   aleatória no cofre aprovado, identifica ambiente, proprietário e data de
   expiração/revisão, e a entrega ao operador ERP por canal seguro.
2. **Configurar:** cadastrar o valor apenas como `ERP_API_KEY` no secret store
   do ambiente correspondente e reiniciar/republicar conforme a plataforma.
   Fazer uma chamada de homologação sem registrar o header; a configuração
   ausente impede a inicialização e uma chave de chamada inválida retorna `401`.
3. **Rotacionar:** como a aplicação atual aceita uma única `ERP_API_KEY`, não há
   período de duas chaves implementado. Agendar janela coordenada: gerar nova
   chave, atualizar ERP e aplicação de modo controlado, validar uma operação
   segura e revogar a antiga imediatamente. Se for indispensável zero downtime,
   aprovar e implementar suporte explícito antes da mudança; não manter chave
   antiga informalmente.
4. **Revogar:** em suspeita de vazamento, desabilitar/substituir imediatamente
   o secret, invalidar a credencial no ERP, registrar o incidente sem o valor,
   investigar logs e repetir a validação com nova chave. A revogação de
   `ERP_API_KEY` não revoga sessões web; trate incidentes de sessão
   separadamente.

O limite ERP existente é 120 requisições por 60 segundos, identificado pelo
header Authorization (ou IP se ausente); o login possui limite de 5 tentativas
por IP em 15 minutos. São limitadores em memória da instância, portanto a
efetividade em múltiplas instâncias deve ser validada antes de produção.

## Build, migrations e verificação de drift

Use somente migrations versionadas em produção:

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run test
pnpm run build
pnpm --filter @workspace/db run migrate
```

`pnpm --filter @workspace/db run push` é indicado pelo projeto apenas para
desenvolvimento; não o use em homologação ou produção. Não gere migrations
durante a janela de deploy e nunca apague/edite migrations já aplicadas. Antes
da migration, compare a revisão que será implantada com o histórico aplicado no
banco usando a ferramenta aprovada pelo operador; registre o resultado como
**drift ausente** ou interrompa a promoção. O repositório não fornece hoje um
comando automatizado de detecção de drift.

Há migrations manuais de Fase 5 (`0009_phase_5_erp_orders.sql`), seu checkpoint
`0010_woozy_prima.sql` e `0011_wise_impossible_man.sql`; a sequência deve ser
preservada.

## Sequência de release

1. Aprovar revisão, resultados de build/testes e checklist de go-live.
2. Confirmar backup recuperável conforme `DISASTER_RECOVERY.md`.
3. Registrar versão/revisão, operador, horário, ambiente e plano de rollback.
4. Aplicar migrations uma única vez contra o banco do ambiente alvo.
5. Publicar API e web da mesma revisão. Os artefatos atuais são
   `artifacts/api-server` e `artifacts/pedidos-gitex`.
6. Verificar liveness em `GET /health`, que responde `{ "status": "ok" }`.
7. Verificar readiness em `GET /ready`: ela executa uma consulta PostgreSQL e
   responde `200`/`{ "status": "ok" }` ou `503`/`{ "status": "unavailable" }`.
8. Executar o smoke test seguro descrito abaixo e registrar evidências.
9. Monitorar logs e erros durante a janela de estabilização; só então encerrar a
   mudança.

Configure a sonda de processo para `GET /health` e a sonda que decide receber
tráfego para `GET /ready`. O endpoint legado `GET /api/healthz` continua
existindo, mas é liveness sob o prefixo da API e não substitui readiness.

## Smoke test pós-deploy

Sem criar pedido real nem chamar ERP real sem autorização:

1. `GET /health` deve retornar `200` e `status: ok`.
2. `GET /ready` deve retornar `200` e `status: ok`.
3. Fazer login com uma conta autorizada, abrir dashboard e consultar cliente,
   produto e listagem de pedidos dentro de seu escopo.
4. Confirmar que não há erros 5xx ou conteúdo sensível nos logs da janela.

O smoke test não substitui a homologação ERP; o fluxo pull, confirmação e status
deve ser executado separadamente em homologação.

## ADMIN inicial e dados

Não há usuário ou senha padrão autorizados. Após o banco estar migrado, um
operador autorizado deve executar, com valores temporários injetados pelo cofre:

```bash
ADMIN_EMAIL=<email-administrativo> \
ADMIN_PASSWORD='<senha-forte-e-exclusiva>' \
pnpm run create-admin
```

Não registrar os valores no shell history, ticket, documentação ou log. Confirme
o login e guarde a credencial conforme política organizacional. Produção não
deve executar fixtures nem criar automaticamente usuários, representantes,
catálogos, tabelas/preços ou pedidos demo. Cadastros de referência vêm do ERP;
o primeiro ADMIN é a exceção administrativa explícita acima.

## Rollback

Interrompa a promoção se migration, início da API, liveness ou smoke test falhar.
Para rollback de aplicação sem alteração incompatível de schema, publique a
revisão anteriormente aprovada e repita liveness/smoke test. Migrations não são
revertidas automaticamente pelo projeto: para schema/dados, decida com o DBA
entre migration corretiva forward-only ou restauração do backup, segundo
`DISASTER_RECOVERY.md`. Nunca aplique `push-force` para “resolver” produção.

Riscos principais: migration parcialmente aplicada, incompatibilidade
app/schema entre versões, secret/origem incorretos e importação ERP durante a
janela. Pausar a integração ERP deve ser uma decisão coordenada com o dono do
ERP; o sistema não possui push ou retentativa automática.

## Logs, observabilidade, alertas e retenção

A API usa Pino/Pino HTTP. Cada requisição recebe ou preserva UUID em
`X-Request-Id`, que é incluído nos logs e nas respostas de rate limit/erro.
O logger registra método, URL sem query e status e mascara `Authorization`,
`Cookie` e `Set-Cookie`; `LOG_LEVEL` é configurável. CSP, `nosniff`, anti-frame,
Referrer-Policy, Permissions-Policy e HSTS em produção são emitidos pela API.
Mutações autenticadas por cookie exigem origem confiável; essa proteção não é
aplicada ao Bearer server-to-server do ERP. `integration_logs` e
`order_status_history` preservam correlação e histórico comercial. Não foi
verificada configuração de agregação, métricas, uptime ou alertas na plataforma.

O responsável pela plataforma deve usar primeiro os recursos já disponíveis para
reter logs e alertar sobre indisponibilidade/liveness, falhas repetidas ERP,
5xx e lentidão. Se não existir recurso nativo, registrar a lacuna e obter
aprovação antes de adicionar serviço externo. Política a aprovar antes de
produção: prazo e local de retenção de logs técnicos, prazo de `integration_logs`
e preservação de `order_status_history` enquanto a regra comercial/legal não
autorizar exclusão. Não apagar histórico comercial por rotina sem essa decisão.
