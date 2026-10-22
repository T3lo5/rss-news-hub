#!/usr/bin/env bash
# backup.sh - snapshot consistente do banco do RSS News Hub + config dos plugins.
#
#   bash backup.sh                      # manual
#   systemctl start rss-backup.service  # via timer
#
# Por que NAO usar `cp`: o app roda em WAL mode, e o `-wal` costuma ficar no
# limiar do auto-checkpoint (~4 MB). Copiar so o `.db` perde as transacoes que
# ainda estao no WAL. O `.backup()` do better-sqlite3 faz um snapshot online
# consistente, com o app rodando.
set -euo pipefail

DEST_DIR="${DEST_DIR:-/opt/rss-news-hub/backups}"
CONTAINER="${CONTAINER:-rss-news-hub}"
KEEP_DAILY="${KEEP_DAILY:-7}"
KEEP_WEEKLY="${KEEP_WEEKLY:-4}"

STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"
DAY_OF_WEEK="$(date -u +%u)" # 7 = domingo

mkdir -p "$DEST_DIR/daily" "$DEST_DIR/weekly"
log() { printf '%s  %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

log "snapshot do banco"
docker exec "$CONTAINER" node -e '
const Database = require("better-sqlite3");
const db = new Database("/app/data/rss-news-hub.db", { readonly: true });
db.backup("/tmp/rss-snapshot.db")
  .then(() => console.log("  backup ok"))
  .catch((e) => { console.error("  falhou:", e.message); process.exit(1); });
'

log "verificando integridade do snapshot"
docker exec "$CONTAINER" node -e '
const Database = require("better-sqlite3");
const db = new Database("/tmp/rss-snapshot.db", { readonly: true });
const integrity = db.pragma("integrity_check", { simple: true });
if (integrity !== "ok") { console.error("  integrity_check:", integrity); process.exit(1); }
const news = db.prepare("select count(*) c from news_items").get().c;
const feeds = db.prepare("select count(*) c from feeds").get().c;
const users = db.prepare("select count(*) c from users").get().c;
console.log("  ok - " + news + " noticias, " + feeds + " feeds, " + users + " usuario(s)");
'

TARGET="$DEST_DIR/daily/rss-news-hub-$STAMP.db.gz"
docker cp "$CONTAINER:/tmp/rss-snapshot.db" /tmp/rss-snapshot.db >/dev/null
docker exec "$CONTAINER" rm -f /tmp/rss-snapshot.db
gzip -9 -c /tmp/rss-snapshot.db >"$TARGET"
rm -f /tmp/rss-snapshot.db
chmod 600 "$TARGET"
log "gravado $(basename "$TARGET") ($(du -h "$TARGET" | cut -f1))"

# Config dos plugins: pequeno, muda pouco, mas sem ele o app sobe com defaults.
docker exec "$CONTAINER" cat /app/config/plugins.yaml >"$DEST_DIR/daily/plugins-$STAMP.yaml"
chmod 600 "$DEST_DIR/daily/plugins-$STAMP.yaml"

if [ "$DAY_OF_WEEK" = "7" ]; then
  cp "$TARGET" "$DEST_DIR/weekly/"
  cp "$DEST_DIR/daily/plugins-$STAMP.yaml" "$DEST_DIR/weekly/"
  log "copia semanal criada"
fi

# Retencao: mantem os N mais recentes. `|| true` porque, sem arquivos, o ls
# falha e o pipefail derrubaria o script.
prune() {
  local dir="$1" pattern="$2" keep="$3"
  ls -1t "$dir"/$pattern 2>/dev/null | tail -n +$((keep + 1)) | while read -r f; do
    rm -f "$f"
  done
}
prune "$DEST_DIR/daily" "rss-news-hub-*.db.gz" "$KEEP_DAILY" || true
prune "$DEST_DIR/daily" "plugins-*.yaml" "$KEEP_DAILY" || true
prune "$DEST_DIR/weekly" "rss-news-hub-*.db.gz" "$KEEP_WEEKLY" || true
prune "$DEST_DIR/weekly" "plugins-*.yaml" "$KEEP_WEEKLY" || true

log "local pronto - diarios: $(ls -1 "$DEST_DIR"/daily/rss-news-hub-*.db.gz 2>/dev/null | wc -l), semanais: $(ls -1 "$DEST_DIR"/weekly/rss-news-hub-*.db.gz 2>/dev/null | wc -l)"

# --- Camada 2: offsite (opcional) ---------------------------------------
# Ativado por /opt/rss-news-hub/backup.env (gerado por setup-offsite.sh):
#   OFFSITE_REMOTE="oci:rss-news-hub-backups"
# Sem esse arquivo, o script termina aqui e o backup local segue funcionando.
BACKUP_ENV="${BACKUP_ENV:-/opt/rss-news-hub/backup.env}"
if [ -f "$BACKUP_ENV" ]; then
  # shellcheck disable=SC1090
  . "$BACKUP_ENV"
fi

if [ -n "${OFFSITE_REMOTE:-}" ]; then
  if ! command -v rclone >/dev/null 2>&1; then
    log "AVISO: OFFSITE_REMOTE definido mas rclone nao esta instalado; pulando"
  else
    export RCLONE_CONFIG="${RCLONE_CONFIG:-/home/ubuntu/.config/rclone/rclone.conf}"
    log "offsite: enviando para $OFFSITE_REMOTE"

    rclone copy "$TARGET" "$OFFSITE_REMOTE/daily/" --no-traverse
    rclone copy "$DEST_DIR/daily/plugins-$STAMP.yaml" "$OFFSITE_REMOTE/daily/" --no-traverse

    if [ "$DAY_OF_WEEK" = "7" ]; then
      rclone copy "$TARGET" "$OFFSITE_REMOTE/weekly/" --no-traverse
      rclone copy "$DEST_DIR/daily/plugins-$STAMP.yaml" "$OFFSITE_REMOTE/weekly/" --no-traverse
    fi

    # Copia cifrada do .env.prod. O bucket e privado, mas se alguem obtiver
    # acesso a ele nao leva JWT_SECRET nem chaves de IA. A senha fica em
    # .backup-passphrase (600) e precisa estar no gerenciador de senhas do dono.
    PASSFILE="${BACKUP_PASSPHRASE_FILE:-/opt/rss-news-hub/.backup-passphrase}"
    if [ -s "$PASSFILE" ] && [ -s /opt/rss-news-hub/.env.prod ]; then
      ENC="/tmp/rss-env-$STAMP.enc"
      openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
        -in /opt/rss-news-hub/.env.prod -out "$ENC" -pass "file:$PASSFILE"
      # nome fixo: guarda sempre a versao atual, sem acumular
      rclone copyto "$ENC" "$OFFSITE_REMOTE/secrets/env-prod.enc"
      rm -f "$ENC"
      log "offsite: .env.prod cifrado enviado"
    fi

    # Retencao remota por idade (nao por contagem: sobrevive a dias sem backup)
    rclone delete "$OFFSITE_REMOTE/daily/" --min-age "${OFFSITE_KEEP_DAILY_DAYS:-30}d" --include "rss-news-hub-*.db.gz"
    rclone delete "$OFFSITE_REMOTE/daily/" --min-age "${OFFSITE_KEEP_DAILY_DAYS:-30}d" --include "plugins-*.yaml"
    rclone delete "$OFFSITE_REMOTE/weekly/" --min-age "${OFFSITE_KEEP_WEEKLY_DAYS:-60}d" --include "rss-news-hub-*.db.gz"
    rclone delete "$OFFSITE_REMOTE/weekly/" --min-age "${OFFSITE_KEEP_WEEKLY_DAYS:-60}d" --include "plugins-*.yaml"

    log "offsite: ok ($(rclone lsf "$OFFSITE_REMOTE/daily/" | wc -l) arquivo(s) em daily/)"
  fi
fi
