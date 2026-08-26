# Relatório — Fase 6.1: portabilidade VPS

**Classificação:** preparação técnica concluída; validações externas pendentes.

## Evidência obtida

| Verificação | Resultado |
| --- | --- |
| Build da imagem | concluído com a imagem oficial `node:24.13.0-bookworm-slim` |
| PostgreSQL Compose | `postgres:17.6-bookworm` |
| Serviço na imagem | frontend e API servidos pela imagem |
| Suíte no host | 48 testes de API + 1 teste frontend aprovados |
| Suíte em container | migration containerizada e os mesmos 48 + 1 aprovados contra banco descartável |
| Smoke da imagem final | SPA, `/health`, `/ready`, login com proxy HTTPS simulado, dashboard, catálogos, pricing, pedidos e fila ERP responderam conforme esperado |
| Persistência local | ADMIN continuou autenticando após stop, rebuild e recriação do container da aplicação com o mesmo volume PostgreSQL |
| Backup/restore local | dump custom-format, checksum e restore em banco isolado aprovados; dados restaurados foram consultados |
| Privilégios PostgreSQL | runtime e migrador são `NOSUPERUSER`, sem `CREATEDB`/`CREATEROLE`; o container web não recebe a credencial de migration |
| Upgrade de volume legado | bootstrap idempotente criou papéis, transferiu objetos/ACLs existentes, reaplicou migration e preservou dados previamente gravados |
| Nginx | configurações de bootstrap HTTP e TLS passaram `nginx -t` em `nginx:1.28-alpine`; o teste TLS usou certificado local descartável |

Durante a validação neste ambiente, o daemon Replit OCI não permitiu `setns`
necessário para `docker compose exec`/healthchecks de containers. Por isso a
validação containerizada usou um override temporário, não versionado, apenas
para esse ambiente. Os healthchecks de produção em `compose.yaml` permanecem
intactos. Os scripts operacionais usam containers clientes one-off com
`docker compose run -T --rm --no-deps` e DNS de serviço, sem depender de
`docker compose exec`. Em uma tentativa descartável adicional, o daemon também
manteve PostgreSQL como `Up` sem entregar DNS ao cliente one-off; a mesma suíte
reconstruída passou em outro stack descartável cuja rede continuava funcional.
Essas limitações do daemon não são evidência de falha nem de sucesso da VPS.

## Evidências ainda pendentes

- Smoke test na VPS/dominio real: `<PENDENTE>`.
- Persistência de volume PostgreSQL após recriação/restart na VPS:
  `<PENDENTE>`.
- DNS, Nginx, TLS/Certbot e renovação no domínio real: não validados.
- ERP real, credenciais e primeiro sync: não validados.
- Cópia de backup fora do host, agendamento e restore drill na VPS: não validados.

Consulte `VPS_DEPLOYMENT.md`, `DISASTER_RECOVERY.md` e
`GO_LIVE_CHECKLIST.md`. Nenhum resultado acima autoriza afirmar validação remota
ou produção em operação.