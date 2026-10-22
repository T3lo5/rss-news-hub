#!/usr/bin/env bash
# setup-instance.sh - prepara uma instancia OCI (Ubuntu 22.04) para o RSS News Hub
#
#   sudo bash setup-instance.sh
#
# Idempotente: pode rodar de novo sem quebrar nada.
# O que faz:
#   1. Docker CE + plugin do Compose v2 (o v1 nao parseia o env_file longo)
#   2. Swap de 2 GB (a instancia tem 1-2 GB de RAM; sem swap o OOM killer
#      derruba tudo - foi exatamente o que travou a instancia do n8n)
#   3. sysctl tuning para swap minimo
#   4. UFW: 22, 80, 443
#   5. Keepalive opcional contra o "idle reclamation" do Always Free

set -euo pipefail

SWAP_GB="${SWAP_GB:-2}"
KEEPALIVE="${KEEPALIVE:-1}"
APP_DIR="${APP_DIR:-/opt/rss-news-hub}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo " rode como root"; exit 1; }

# --------------------------------------------------------------------------
log "1/5 Docker CE + Compose v2"
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
else
  echo "   docker e compose v2 ja presentes"
fi
docker --version
docker compose version

# --------------------------------------------------------------------------
log "2/5 Swap de ${SWAP_GB} GB"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l "${SWAP_GB}G" /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=$((SWAP_GB * 1024)) status=progress
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "   swap criado"
else
  echo "   swap ja ativo"
fi

cat > /etc/sysctl.d/99-oci-swap.conf <<'EOF'
# Swap minimo: evita que o OOM killer escolha o processo errado quando a RAM aperta.
vm.swappiness=10
vm.vfs_cache_pressure=50
EOF
sysctl --system >/dev/null
free -h

# --------------------------------------------------------------------------
log "3/5 Diretorio da aplicacao"
install -d -m 0755 "$APP_DIR"
install -d -m 0700 "$APP_DIR/data" "$APP_DIR/config"

# --------------------------------------------------------------------------
log "4/5 UFW (22, 80, 443)"
if command -v ufw >/dev/null 2>&1; then
  ufw --force enable >/dev/null
  ufw allow 22/tcp  >/dev/null
  ufw allow 80/tcp  >/dev/null
  ufw allow 443/tcp >/dev/null
  ufw allow 443/udp >/dev/null
  ufw status verbose
else
  warn "ufw nao instalado; a protecao fica so na Security List da OCI"
fi

# --------------------------------------------------------------------------
log "5/5 Keepalive contra idle reclamation"
if [ "$KEEPALIVE" = "1" ]; then
  cat > /usr/local/bin/rss-keepalive.sh <<'EOF'
#!/usr/bin/env bash
# Mantem a instancia fora da definicao de "idle" da Oracle:
# CPU p95 < 20% E rede < 20% E memoria < 20% (A1), por 7 dias seguidos.
# Uma checagem real de saude a cada 10 min ja produz activity suficiente.
set -euo pipefail
curl -fsS --max-time 10 http://127.0.0.1:3000/api/health >/dev/null 2>&1 || true
EOF
  chmod +x /usr/local/bin/rss-keepalive.sh

  cat > /etc/systemd/system/rss-keepalive.service <<'EOF'
[Unit]
Description=RSS News Hub keepalive (anti idle-reclamation)

[Service]
Type=oneshot
ExecStart=/usr/local/bin/rss-keepalive.sh
EOF

  cat > /etc/systemd/system/rss-keepalive.timer <<'EOF'
[Unit]
Description=Dispara o keepalive a cada 10 minutos

[Timer]
OnBootSec=5min
OnUnitActiveSec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF

  systemctl daemon-reload
  systemctl enable --now rss-keepalive.timer
  systemctl list-timers rss-keepalive.timer --no-pager
fi

log "Pronto"
cat <<EOF

 proximos passos:
   1. scp da imagem:  scp rss-news-hub-arm64.tar.gz ubuntu@<IP>:/tmp/
      e na instancia:  docker load -i /tmp/rss-news-hub-arm64.tar.gz
   2. copiar os arquivos de deploy para $APP_DIR
   3. cp .env.prod.example .env.prod && chmod 600 .env.prod  (preencher)
   4. docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
   5. docker compose -f docker-compose.prod.yml ps && curl -s localhost/api/health

EOF
