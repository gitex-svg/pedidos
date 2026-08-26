#!/usr/bin/env bash
# Prepare a fresh Ubuntu 24.04 LTS host for the Pedidos Fitas Gitex VPS.
#
# This script intentionally does not clone repositories, install application
# secrets, issue certificates, run migrations, or publish the application.
set -Eeuo pipefail

export DEBIAN_FRONTEND=noninteractive

DEPLOY_USER=${DEPLOY_USER:-deploy}
APP_DIR=${APP_DIR:-/srv/pedidos-gitex}
BACKUP_DIR=${BACKUP_DIR:-/var/backups/pedidos-gitex}
SSH_PORT=${SSH_PORT:-22}
SERVER_TIMEZONE=${SERVER_TIMEZONE:-UTC}
ENABLE_UFW=${ENABLE_UFW:-1}
readonly DEPLOY_USER APP_DIR BACKUP_DIR SSH_PORT SERVER_TIMEZONE ENABLE_UFW

die() {
  printf '%s\n' "bootstrap: $*" >&2
  exit 1
}

log() {
  printf '%s\n' "bootstrap: $*"
}

is_non_negative_integer() {
  case $1 in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

[ "$(id -u)" -eq 0 ] || die "execute como root"
[ -r /etc/os-release ] || die "não foi possível identificar o sistema operacional"
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = ubuntu ] || die "este script exige Ubuntu 24.04 LTS"
[ "${VERSION_ID:-}" = 24.04 ] || die "este script exige Ubuntu 24.04 LTS"
is_non_negative_integer "$SSH_PORT" || die "SSH_PORT deve ser um inteiro"
[ "$SSH_PORT" -ge 1 ] && [ "$SSH_PORT" -le 65535 ] ||
  die "SSH_PORT deve estar entre 1 e 65535"
case $ENABLE_UFW in
  0|1) ;;
  *) die "ENABLE_UFW deve ser 0 ou 1" ;;
esac
case $DEPLOY_USER in
  [a-z_]*)
    case $DEPLOY_USER in *[!a-z0-9_-]*) die "DEPLOY_USER possui caracteres inválidos" ;; esac ;;
  *) die "DEPLOY_USER possui caracteres inválidos" ;;
esac
case $APP_DIR:$BACKUP_DIR in
  *[!A-Za-z0-9_./:-]*) die "APP_DIR/BACKUP_DIR possuem caracteres inválidos" ;;
esac
case $APP_DIR in /*) ;; *) die "APP_DIR deve ser um caminho absoluto" ;; esac
case $BACKUP_DIR in /*) ;; *) die "BACKUP_DIR deve ser um caminho absoluto" ;; esac

log "atualizando pacotes do Ubuntu"
apt-get update
apt-get upgrade -y
apt-get install -y \
  apt-transport-https \
  ca-certificates \
  certbot \
  curl \
  fail2ban \
  git \
  gnupg \
  jq \
  nginx \
  openssh-client \
  openssh-server \
  python3-certbot-nginx \
  software-properties-common \
  ufw \
  unattended-upgrades \
  openssl \
  tzdata

timedatectl set-timezone "$SERVER_TIMEZONE"

log "configurando o repositório oficial do Docker"
install -m 0755 -d /etc/apt/keyrings
curl --fail --silent --show-error --location \
  https://download.docker.com/linux/ubuntu/gpg |
  gpg --dearmor --yes -o /etc/apt/keyrings/docker.gpg
chmod 0644 /etc/apt/keyrings/docker.gpg
arch=$(dpkg --print-architecture)
codename=${UBUNTU_CODENAME:-${VERSION_CODENAME:?não foi possível identificar o codename}}
cat > /etc/apt/sources.list.d/docker.list <<EOF
deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu ${codename} stable
EOF
apt-get update
apt-get install -y \
  containerd.io \
  docker-buildx-plugin \
  docker-ce \
  docker-ce-cli \
  docker-compose-plugin
systemctl enable --now docker

if [ ! -e /etc/docker/daemon.json ]; then
  install -d -m 0755 /etc/docker
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "5"
  }
}
EOF
  systemctl restart docker
else
  jq empty /etc/docker/daemon.json >/dev/null ||
    die "/etc/docker/daemon.json existente não é JSON válido"
  log "preservando /etc/docker/daemon.json existente"
fi

if ! getent group docker >/dev/null; then
  groupadd --system docker
fi
if id "$DEPLOY_USER" >/dev/null 2>&1; then
  usermod --append --groups docker "$DEPLOY_USER"
else
  useradd --create-home --shell /bin/bash --groups docker "$DEPLOY_USER"
fi

install -d -m 0750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
install -d -m 0700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$BACKUP_DIR"
install -d -m 0755 /var/www/certbot
install -d -m 0755 /etc/nginx/snippets /etc/nginx/sites-available /etc/nginx/sites-enabled

cat > /etc/fail2ban/jail.d/pedidos-gitex-sshd.local <<EOF
[sshd]
enabled = true
port = ${SSH_PORT}
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF

cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

if [ "$ENABLE_UFW" = 1 ]; then
  ufw --force default deny incoming
  ufw --force default allow outgoing
  ufw allow "${SSH_PORT}/tcp" comment 'SSH'
  ufw allow 80/tcp comment 'HTTP ACME and redirect'
  ufw allow 443/tcp comment 'HTTPS application'
  ufw --force enable
fi

systemctl enable --now nginx
systemctl enable --now fail2ban
systemctl enable --now ssh
systemctl enable --now apt-daily.timer apt-daily-upgrade.timer

docker --version >/dev/null
docker compose version >/dev/null
nginx -t
certbot --version >/dev/null
fail2ban-client ping >/dev/null
if [ "$ENABLE_UFW" = 1 ]; then
  ufw status verbose >/dev/null
fi

log "bootstrap concluído"
log "usuário de deploy: ${DEPLOY_USER}"
log "diretório da aplicação: ${APP_DIR}"
log "diretório de backups: ${BACKUP_DIR}"
log "próximo passo: clone privado, .env.production com chmod 600 e deploy.sh"
log "se o kernel foi atualizado, reinicie a VPS em uma janela aprovada"