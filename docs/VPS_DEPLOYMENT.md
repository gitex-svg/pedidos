# Implantação em VPS Ubuntu LTS

Este guia é um procedimento operacional para este repositório, não evidência de
que uma VPS, DNS, certificado, backup fora do host ou ERP real tenham sido
validados. Os comandos pressupõem o checkout no diretório do projeto e Docker
Engine com o plugin `docker compose` instalado.

## Host e acesso

Use Ubuntu LTS atualizado, com disco e memória dimensionados pelo responsável.
Crie um usuário dedicado, por exemplo `deploy`, e conceda somente o acesso
necessário ao Docker (a participação no grupo `docker` é equivalente a acesso
administrativo ao host e deve ser controlada). Não opere o serviço como `root`.

Para uma VPS nova com **Ubuntu 24.04 LTS**, o repositório fornece um bootstrap
idempotente para instalar os pacotes e serviços base. Execute-o como `root`,
revise as variáveis opcionais e não coloque secrets no comando:

```bash
DEPLOY_USER=deploy \
APP_DIR=/srv/pedidos-gitex \
BACKUP_DIR=/var/backups/pedidos-gitex \
SSH_PORT=22 \
ENABLE_UFW=1 \
bash deploy/scripts/bootstrap-ubuntu-24.04.sh
```

O script instala Docker Engine com Compose plugin, Nginx, Certbot, Git, UFW,
Fail2ban, OpenSSH Server, `unattended-upgrades`, ferramentas TLS e utilitários operacionais;
habilita os serviços, prepara os diretórios e configura rotação de logs do
Docker apenas quando não existe configuração prévia. Ele recusa outros
sistemas/versões do Ubuntu, preserva um `daemon.json` existente e não clona
Git, cria secrets, altera SSH, configura DNS, emite certificado, executa
migrations ou inicia a aplicação. A associação ao grupo `docker` deve ser
tratada como acesso administrativo. Confirme `SSH_PORT` antes de executar com
`ENABLE_UFW=1`, pois o script habilita o firewall após liberar essa porta.

Instale a chave pública SSH do operador em `~deploy/.ssh/authorized_keys`, com
permissões `700` no diretório e `600` no arquivo. Em `sshd_config`, desabilite
login de root e autenticação por senha depois de testar uma segunda sessão por
chave:

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
```

Restrinja o firewall UFW às portas públicas necessárias:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Não exponha `8080`, `5432` ou o socket Docker. O Compose atual vincula a
aplicação a `127.0.0.1:${APP_BIND_PORT:-8080}` e mantém PostgreSQL na rede
interna; o Nginx do host é a única borda HTTP.

## Código, imagem e configuração

Faça clone privado sem colocar token na URL remota, em documentação ou em shell
history. Prefira uma deploy key somente-leitura cadastrada no provedor Git:

```bash
sudo -iu deploy
git clone git@<GIT_HOST>:<ORGANIZACAO>/<REPOSITORIO>.git pedidos-gitex
cd pedidos-gitex
git remote -v
```

Crie a configuração de produção a partir de `.env.example`, sem versioná-la, e
restrinja seu acesso:

```bash
cp .env.example .env.production
chmod 600 .env.production
```

Preencha valores reais de `POSTGRES_DB`, credenciais bootstrap `POSTGRES_*`,
credenciais separadas `APP_DB_*` e `MIGRATION_DB_*`, `DATABASE_URL`,
`MIGRATION_DATABASE_URL`, `SESSION_SECRET`, `ERP_API_KEY` e `BETTER_AUTH_URL`.
As duas URLs devem usar `postgres` como host da rede Compose e senha
URL-encoded. O serviço web recebe somente `DATABASE_URL` do papel de runtime;
apenas o serviço one-off `migration` recebe a credencial elevada de migration.
Em upgrade de volume existente, preserve o `POSTGRES_USER` que inicializou o
volume e escolha nomes distintos para `APP_DB_USER` e `MIGRATION_DB_USER`; os
três nomes devem ser diferentes. O deploy executa um bootstrap idempotente que
cria/atualiza esses papéis e transfere apenas os objetos das schemas da
aplicação para o migrador. Faça backup antes dessa primeira transição.
Nunca use `source .env.production`; os scripts chamam
`docker compose --env-file .env.production`, que interpreta o arquivo apenas
como arquivo de ambiente do Compose. Não exiba seu conteúdo, nem valores de
secret em tickets, logs ou comandos.

O serviço `app` é construído pela revisão atual e pode receber `APP_IMAGE` para
uma tag local. Não há push externo neste procedimento. Registre a revisão Git e
a tag aprovada antes de cada janela.

## Nginx, DNS e TLS

O primeiro carregamento não pode apontar para certificados ainda inexistentes.
Ajuste o hostname nos dois arquivos de site e em `BETTER_AUTH_URL`, instale o
snippet e habilite primeiro o site HTTP:

```bash
sudo install -d -m 755 /etc/nginx/snippets /var/www/certbot
sudo install -m 644 deploy/nginx/pedidos-gitex-proxy.conf \
  /etc/nginx/snippets/pedidos-gitex-proxy.conf
sudo install -m 644 deploy/nginx/pedidos-gitex-http.conf \
  /etc/nginx/sites-available/pedidos-gitex.conf
sudo ln -sfn /etc/nginx/sites-available/pedidos-gitex.conf \
  /etc/nginx/sites-enabled/pedidos-gitex.conf
sudo nginx -t
sudo systemctl reload nginx
```

O proxy é same-origin: Nginx encaminha `/` e `/api` ao mesmo
`127.0.0.1:8080`; não crie domínio separado para a API sem revisão explícita
de origem/cookies.

Crie o registro DNS A apontando para a VPS e aguarde sua propagação. Publique
AAAA somente se a VPS e o Nginx também tiverem IPv6 configurado e validado. Antes
do TLS, mantenha a porta 80 disponível para `/.well-known/acme-challenge/`.
Com o HTTP válido e o DNS propagado, obtenha o certificado por webroot. Só
depois instale a configuração TLS, que referencia os arquivos já existentes:

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
  -d pedidos.gitex.com.br
sudo install -m 644 deploy/nginx/pedidos-gitex.conf \
  /etc/nginx/sites-available/pedidos-gitex.conf
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Substitua o exemplo de hostname pelo domínio aprovado. Valide DNS, Nginx e TLS
no host real antes de declarar sucesso; este documento não faz essa validação.

## Primeiro início e dados

Execute o deploy a partir de checkout limpo. Ele sobe PostgreSQL, aguarda sua
prontidão, constrói a imagem da revisão, executa explicitamente
o serviço one-off `migration` com credencial própria, inicia a aplicação e
verifica `/health` e `/ready` por clientes one-off na rede Compose, usando
`http://app:8080`. A aplicação anterior é parada antes da migration: a janela
aceita downtime explícito em vez de presumir compatibilidade de schema:

```bash
chmod 700 deploy/scripts/*.sh
ENV_FILE=.env.production deploy/scripts/deploy.sh
```

Não use `drizzle-kit push` ou `push-force` em produção. Antes da migration,
confirme backup recuperável, histórico de migrations e plano de rollback. O
rollback de código só é seguro quando o schema é compatível; migrations/dados
não são desfeitos automaticamente e normalmente exigem migration corretiva
forward-only ou recuperação aprovada.

Depois das migrations, crie o primeiro ADMIN com valores temporários fornecidos
por mecanismo seguro. Execute dentro do container, sem gravar a senha no
repositório ou histórico:

```bash
docker compose --env-file .env.production run --rm -T --no-deps \
  -e ADMIN_EMAIL -e ADMIN_PASSWORD app \
  node --enable-source-maps /app/dist/create-admin.mjs
```

`ADMIN_EMAIL` e `ADMIN_PASSWORD` devem estar no ambiente do processo, injetados
pelo cofre ou obtidos sem eco, e removidos depois; não coloque seus valores na
linha de comando. Não há conta padrão. Em seguida, o dono do ERP deve fazer o primeiro sync
autorizado com a `ERP_API_KEY` de produção; isso é uma operação coordenada e
não deve ser simulada contra o ERP real sem autorização.

Depois de o representante existir no banco por meio do sync ERP, crie ou
redefina sua credencial com valores temporários injetados de forma segura:

```bash
docker compose --env-file .env.production run --rm -T --no-deps \
  -e REPRESENTATIVE_ERP_CODE -e REPRESENTATIVE_EMAIL -e REPRESENTATIVE_PASSWORD \
  app node --enable-source-maps /app/dist/create-representative.mjs
```

`REPRESENTATIVE_NAME` é opcional. O comando exige um representante ERP existente,
recusa e-mails de ADMIN e não substitui o vínculo de outro usuário. Remova os
valores do ambiente após a execução e não os registre no histórico. Ao redefinir
a senha, as sessões existentes do representante são encerradas.

## Atualização e rollback

Para uma atualização, busque uma tag/revisão já aprovada, faça checkout
destacado da tag (ou revisão), confirme `git status --porcelain` vazio, registre
o SHA e execute o mesmo script:

```bash
git fetch --tags
git checkout --detach <TAG_APROVADA>
ENV_FILE=.env.production deploy/scripts/deploy.sh
```

O script se recusa a operar com checkout sujo e não faz `git pull`, push nem
alteração remota. Para rollback apenas da aplicação, faça checkout da revisão
anterior aprovada e repita o deploy **somente após** confirmar compatibilidade
com o schema já migrado. Não restaure ou delete o banco de produção como atalho.

## Logs, espaço e backup

Veja logs sem copiar secrets para registros externos:

```bash
docker compose --env-file .env.production logs --tail=200 app postgres
docker system df
df -h
```

Investigue e aumente disco antes de a retenção de logs/volumes esgotá-lo. O
Compose limita logs JSON dos containers, mas isso não substitui monitoramento,
alerta nem uma política aprovada de retenção.

O backup gera um dump PostgreSQL custom-format, checksum SHA-256 e aplica
retenção local configurável:

```bash
sudo install -d -m 700 -o deploy -g deploy /var/backups/pedidos-gitex
BACKUP_DIR=/var/backups/pedidos-gitex BACKUP_RETENTION_DAYS=14 \
  ENV_FILE=.env.production deploy/scripts/backup-postgres.sh
```

Defina cron/systemd timer e copie o artefato por processo aprovado para
armazenamento fora da VPS, com criptografia e acesso mínimo. O proprietário do
backup deve aprovar frequência, retenção, RPO/RTO, destino e restore drill.
Uma cópia no mesmo host não é recuperação de desastre.

Para um drill, crie previamente um banco vazio e isolado, sem tráfego/ERP
produtivo, e restaure somente mediante confirmação explícita:

```bash
docker compose --env-file .env.production run --rm -T --no-deps postgres sh -ec \
  'export PGPASSWORD="$POSTGRES_PASSWORD"
   createdb -h postgres -U "$POSTGRES_USER" pedidos_gitex_restore'
ENV_FILE=.env.production deploy/scripts/restore-postgres-isolated.sh \
  /var/backups/pedidos-gitex/pedidos-gitex-<UTC>.dump \
  pedidos_gitex_restore --confirm RESTORE-pedidos_gitex_restore
```

O restore recusa o banco configurado como produção, identificadores inválidos e
alvos não vazios; ele não cria, limpa ou sobrescreve banco. A aprovação para
qualquer recuperação produtiva continua sendo responsabilidade do dono de dados
e do DBA.