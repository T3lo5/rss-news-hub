#!/usr/bin/env bash
# deploy.sh - deploy de uma imagem já publicada no GHCR, com backup e rollback.
#
# NÃO é chamado por um humano: é o comando forçado da chave de deploy.
#
#   /home/ubuntu/.ssh/authorized_keys:
#     command="/opt/rss-news-hub/deploy.sh",no-pty,no-port-forwarding,\
#     no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... rss-news-hub-deploy
#
# O GitHub Actions manda:  ssh -i deploy_key ubuntu@host "<sha>"
# O sshd ignora o comando pedido, roda este script e expõe o pedido em
# $SSH_ORIGINAL_COMMAND. Só um SHA em hex é aceito — nada de shell.
#
#   ssh ubuntu@host "<sha>"     deploy da imagem <sha>
#
# O que faz, em ordem:
#   1. backup do banco (as migrações rodam no boot: rollback de imagem não
#      desfaz migração, o snapshot é a saída de emergência)
#   2. docker pull da imagem nova (falhou? para aqui, sem tocar em nada)
#   3. troca IMAGE_TAG no .env.prod e sobe o app
#   4. espera o healthcheck do Docker (até 120s)
#   5. falhou? volta a imagem anterior, sobe e sai com código 1
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/rss-news-hub}"
IMAGE="${IMAGE:-ghcr.io/t3lo5/rss-news-hub}"
CONTAINER="${CONTAINER:-rss-news-hub}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"
LOG="${LOG:-$APP_DIR/deploy.log}"

TAG="${SSH_ORIGINAL_COMMAND:-}"

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG"; }

die() { log "ERRO: $*"; exit 1; }

# --- 1. validação da entrada -------------------------------------------------
# 7 a 40 caracteres hex. Sem espaço, sem ;, sem $(...) — nada que vire comando.
if [[ ! "$TAG" =~ ^[0-9a-f]{7,40}$ ]]; then
  die "tag inválida: '$TAG' (esperado SHA em hex de 7-40 caracteres)"
fi

cd "$APP_DIR" || die "diretório não encontrado: $APP_DIR"
[ -f docker-compose.prod.yml ] || die "docker-compose.prod.yml não encontrado"
[ -f .env.prod ] || die ".env.prod não encontrado"

# Dois deploys simultâneos (CI + manual) pegariam o mesmo container.
exec 9>"$APP_DIR/.deploy.lock"
flock -n 9 || die "outro deploy em andamento (lock: $APP_DIR/.deploy.lock)"

compose() { docker compose -f docker-compose.prod.yml --env-file .env.prod "$@"; }

current_image() {
  local v
  v="$(sed -n 's/^IMAGE_TAG=//p' .env.prod | tail -1)"
  printf '%s' "${v:-rss-news-hub:amd64}"
}

health_status() {
  docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
    "$CONTAINER" 2>/dev/null || printf 'missing'
}

wait_healthy() {
  local waited=0
  while [ "$waited" -lt "$HEALTH_TIMEOUT" ]; do
    case "$(health_status)" in
      healthy) return 0 ;;
      unhealthy) return 1 ;;
    esac
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

PREV="$(current_image)"
NEW="$IMAGE:$TAG"

log "deploy solicitado: $NEW (atual: $PREV)"

# --- 2. backup pré-deploy ----------------------------------------------------
log "backup: snapshot antes do deploy"
if ! bash "$APP_DIR/backup.sh" >>"$LOG" 2>&1; then
  die "backup falhou; deploy abortado (nada foi alterado)"
fi

# --- 3. pull (antes de mexer no .env.prod) -----------------------------------
log "pull $NEW"
if ! docker pull "$NEW" >>"$LOG" 2>&1; then
  die "docker pull falhou (imagem existe? pacote público?); deploy abortado"
fi

# --- 4. troca o tag e sobe ---------------------------------------------------
if grep -q '^IMAGE_TAG=' .env.prod; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$NEW|" .env.prod
else
  printf 'IMAGE_TAG=%s\n' "$NEW" >>.env.prod
fi

log "subindo $TAG"
compose up -d app >>"$LOG" 2>&1 || die "docker compose up falhou"

# --- 5. healthcheck ----------------------------------------------------------
log "aguardando healthcheck (até ${HEALTH_TIMEOUT}s)"
if wait_healthy; then
  health_status >/dev/null
  log "OK: $TAG saudável ($(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER"))"
  # Remove camadas órfãs do build antigo; imagens tagueadas ficam intactas.
  docker image prune -f >>"$LOG" 2>&1 || true
  exit 0
fi

# --- 6. rollback -------------------------------------------------------------
log "FALHOU: $TAG não ficou saudável; voltando para $PREV"
if grep -q '^IMAGE_TAG=' .env.prod; then
  sed -i "s|^IMAGE_TAG=.*|IMAGE_TAG=$PREV|" .env.prod
else
  printf 'IMAGE_TAG=%s\n' "$PREV" >>.env.prod
fi
compose up -d app >>"$LOG" 2>&1 || log "ERRO: compose up do rollback também falhou"

if wait_healthy; then
  log "rollback OK: $PREV está saudável de novo"
else
  log "rollback INCOMPLETO: $PREV não ficou saudável — intervenção manual necessária"
fi

log "últimos logs do container:"
docker logs --tail 40 "$CONTAINER" 2>&1 | tee -a "$LOG" || true

exit 1
