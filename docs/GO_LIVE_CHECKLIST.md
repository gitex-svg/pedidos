# Checklist de go-live — Fase 6

Marcar somente com evidência (responsável, data, revisão e link/registro
restrito). Itens pendentes impedem a declaração de pronto para produção.

## Plataforma, acesso e dados

- [ ] Ambiente PRODUCTION separado de DEVELOPMENT e HOMOLOGATION.
- [ ] Banco de produção configurado, com acesso mínimo.
- [ ] Backup: proprietário, frequência, retenção, local e criptografia
  aprovados e evidenciados; `deploy/scripts/backup-postgres.sh` agendado e cópia
  fora da VPS confirmada.
- [ ] Restore drill executado ou exceção de risco formalmente aprovada.
- [ ] Secrets configurados fora do repositório; `SESSION_SECRET` forte e única.
- [ ] `ERP_API_KEY` exclusiva de produção configurada; procedimento de revogação
  comunicado.
- [ ] `BETTER_AUTH_URL` é a origem pública exata.
- [ ] Primeiro ADMIN criado pelo comando aprovado; sem usuário/senha padrão.
- [ ] Dados demo/fixtures ausentes de produção.

## Release e segurança

- [x] Validação de código concluída: baseline 41/41, API final 46/46,
  frontend 1/1,
  typecheck, builds API/web e OpenAPI codegen aprovados em 2026-08-26.
- [ ] A mesma revisão foi identificada e aprovada para implantar.
- [ ] Checkout limpo implantado com `ENV_FILE=.env.production
  deploy/scripts/deploy.sh`; o resultado de `/health` e `/ready` foi registrado.
- [ ] Migrations versionadas aplicadas; não foi usado `push`/`push-force`.
- [ ] Drift verificado pelo operador e ausente, ou exceção aprovada.
- [ ] Plano de rollback, contatos e backup pré-migration registrados.
- [x] Configuração centralizada, erros seguros, `X-Request-Id`, headers de
  segurança, rate limiting e proteção de origem confiável para mutações cookie
  foram implementados e cobertos pela validação técnica.
- [ ] CORS/origens, cookies e headers foram verificados no domínio/deployment real.
- [ ] Capacidade do rate limit em múltiplas instâncias foi avaliada, caso a
  plataforma escale horizontalmente.
- [ ] Não há achado CRITICAL/HIGH conhecido sem mitigação aceita.

## Operação e validação

- [x] `GET /health` e `GET /ready` com consulta PostgreSQL foram implementados e
  validados tecnicamente.
- [ ] `/health` e `/ready` aprovados no deployment de produção.
- [ ] DNS, Nginx same-origin, certificado TLS e renovação Certbot validados no
  host/domínio reais; não inferir isso dos arquivos ou scripts do repositório.
- [ ] Smoke test: login, dashboard, consulta de cliente, produto e pedidos,
  sem criar pedido comercial.
- [ ] Isolamento entre representantes aprovado.
- [ ] PricingService, precisão financeira e pedido `SUBMITTED` aprovados.
- [ ] ERP homologado tecnicamente e homologação real registrada quando aplicável.
- [ ] Idempotência/conflito/status ERP aprovados.
- [ ] Logs sem secrets e rastreabilidade por `correlation_id` revisados.
- [ ] Política de retenção de logs, `integration_logs` e histórico comercial
  aprovada.
- [ ] Observabilidade/alertas de indisponibilidade, 5xx, falhas ERP e lentidão
  configurados no recurso existente da plataforma, ou lacuna aprovada.
- [ ] Responsividade mobile/tablet/desktop e navegadores foram executados e
  evidenciados; não presumir aprovação.

Consulte `VPS_DEPLOYMENT.md` para os comandos de host e
`restore-postgres-isolated.sh` para o drill. A documentação e os scripts não
realizam validação remota, ERP real ou cópia offsite por conta própria.
