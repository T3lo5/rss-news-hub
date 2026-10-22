#!/usr/bin/env bash
# setup-offsite.sh - configura o rclone para o bucket de backup na OCI.
#
# Rode como o MESMO usuario do rss-backup.service (ubuntu), SEM sudo:
#
#   bash setup-offsite.sh
#
# A credencial e lida do teclado, com `read -s` para o secret nao aparecer
# na tela nem entrar no historico do shell.
set -euo pipefail

REMOTE="${REMOTE:-oci}"
CONF="$HOME/.config/rclone/rclone.conf"
BACKUP_ENV="${BACKUP_ENV:-/opt/rss-news-hub/backup.env}"
PASSFILE="${PASSFILE:-/opt/rss-news-hub/.backup-passphrase}"
REGION="${REGION:-sa-saopaulo-1}"

if [ "$(id -un)" != "${SERVICE_USER:-ubuntu}" ]; then
  echo "Rode como '${SERVICE_USER:-ubuntu}' (sem sudo): o systemd executa o"
  echo "backup com esse usuario e o rclone le o config do HOME dele."
  exit 1
fi

cat <<'TXT'
Antes de continuar, na consola da OCI voce precisa ter:

  1. um bucket privado na regiao sa-saopaulo-1 (ex: rss-news-hub-backups)
  2. um usuario IAM dedicado so ao backup
  3. uma Customer Secret Key desse usuario (gera Access Key + Secret Key)
  4. uma policy restrita ao bucket, no compartimento dele:

       Allow group rss-backup to read buckets in compartment <COMPARTIMENTO>
       Allow group rss-backup to manage objects in compartment <COMPARTIMENTO>
         where target.bucket.name = 'rss-news-hub-backups'

O namespace do Object Storage aparece em Object Storage > Buckets, no topo
da lista (ou nos detalhes do bucket).

TXT

read -rp "Namespace do Object Storage: " NAMESPACE
[ -n "$NAMESPACE" ] || { echo "  namespace vazio"; exit 1; }

read -rp "Bucket [rss-news-hub-backups]: " BUCKET
BUCKET="${BUCKET:-rss-news-hub-backups}"

read -rp "Access Key: " ACCESS_KEY
[ -n "$ACCESS_KEY" ] || { echo "  access key vazia"; exit 1; }

read -rsp "Secret Key (nao aparece): " SECRET_KEY
echo
[ -n "$SECRET_KEY" ] || { echo "  secret key vazia"; exit 1; }

read -rp "Regiao [$REGION]: " REPLY_REGION
REGION="${REPLY_REGION:-$REGION}"

ENDPOINT="https://${NAMESPACE}.compat.objectstorage.${REGION}.oraclecloud.com"

mkdir -p "$(dirname "$CONF")"
chmod 700 "$(dirname "$CONF")"
if [ -f "$CONF" ]; then
  cp "$CONF" "$CONF.bak.$(date +%s)"
fi
# Remove um remote anterior com o mesmo nome, se existir.
rclone config delete "$REMOTE" >/dev/null 2>&1 || true

cat >>"$CONF" <<EOF

[$REMOTE]
type = s3
provider = Other
access_key_id = $ACCESS_KEY
secret_access_key = $SECRET_KEY
endpoint = $ENDPOINT
region = $REGION
# A OCI nao aceita virtual-host style: o namespace vai no host e o bucket
# no caminho, entao o path style e obrigatorio.
force_path_style = true
acl = private
EOF
chmod 600 "$CONF"
echo "  config gravado em $CONF (permissoes 600)"

echo
echo "== testando acesso ao bucket =="
if ! rclone lsd "$REMOTE:$BUCKET" >/dev/null 2>&1; then
  echo "  FALHOU. Confira namespace, bucket, chaves e a policy."
  rclone lsd "$REMOTE:$BUCKET" 2>&1 | tail -5
  exit 1
fi
echo "  leitura ok"

echo "rclone $(date -u +%FT%TZ)" >/tmp/rclone-write-test.txt
if ! rclone copyto /tmp/rclone-write-test.txt "$REMOTE:$BUCKET/.write-test.txt" 2>/dev/null; then
  echo "  FALHOU na escrita. A policy permite 'manage objects'?"
  rm -f /tmp/rclone-write-test.txt
  exit 1
fi
rclone deletefile "$REMOTE:$BUCKET/.write-test.txt" >/dev/null 2>&1 || true
rm -f /tmp/rclone-write-test.txt
echo "  escrita ok"

if [ ! -f "$BACKUP_ENV" ]; then
  cat >"$BACKUP_ENV" <<EOF
# Gerado por setup-offsite.sh - lido pelo backup.sh
OFFSITE_REMOTE="$REMOTE:$BUCKET"
OFFSITE_KEEP_DAILY_DAYS=30
OFFSITE_KEEP_WEEKLY_DAYS=60
EOF
  chmod 600 "$BACKUP_ENV"
  echo "  $BACKUP_ENV criado"
else
  echo "  $BACKUP_ENV ja existia (nao sobrescrito)"
fi

if [ ! -s "$PASSFILE" ]; then
  openssl rand -base64 24 >"$PASSFILE"
  chmod 600 "$PASSFILE"
  echo
  echo "=============================================================="
  echo " GUARDE ESTA SENHA. Ela cifra o .env.prod no bucket."
  echo " Sem ela nao da para restaurar JWT_SECRET nem chaves de IA."
  echo
  cat "$PASSFILE"
  echo "=============================================================="
else
  echo "  senha de cifra ja existia em $PASSFILE"
fi

echo
echo "Pronto. Para testar o fluxo completo agora:"
echo "  systemctl start rss-backup.service && journalctl -u rss-backup.service -n 20"
