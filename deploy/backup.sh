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

log "pronto - diarios: $(ls -1 "$DEST_DIR"/daily/rss-news-hub-*.db.gz 2>/dev/null | wc -l), semanais: $(ls -1 "$DEST_DIR"/weekly/rss-news-hub-*.db.gz 2>/dev/null | wc -l)"
