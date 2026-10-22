#!/usr/bin/env bash
# provision.sh - gera o .env.prod com segredos novos, na propria maquina.
#
#   bash provision.sh [caminho-do-.env-de-dev] [dominio]
#
# O dominio tambem pode vir da variavel de ambiente $DOMAIN.
# Os segredos NUNCA saem daqui: sao gerados e gravados localmente.
set -euo pipefail
cd /opt/rss-news-hub

DEV_ENV="${1:-/tmp/rss-dev.env}"
SITE_DOMAIN="${2:-${DOMAIN:-}}"

echo ">> puxando chaves de API do .env de desenvolvimento"
# shellcheck disable=SC1090
set -a
if [ -f "$DEV_ENV" ]; then
  . "$DEV_ENV"
fi
set +a

# ATENCAO: os segredos sao gerados DEPOIS de carregar o .env de desenvolvimento.
# O .env de dev tambem tem JWT_SECRET= (vazio, porque em dev o app usa um
# fallback inseguro). Se os segredos fossem gerados antes, o source sobrescreveria
# o JWT_SECRET recem-gerado com a string vazia - e a app nao sobe em producao.
echo ">> gerando segredos"
# ADMIN_EMAIL nao tem default de proposito: nao embutir e-mail pessoal no repo.
ADMIN_EMAIL="${ADMIN_EMAIL:?defina ADMIN_EMAIL (ex: voce@exemplo.com) antes de rodar}"
JWT_SECRET="$(openssl rand -base64 48)"
ADMIN_PASSWORD="$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 20)"

cat > .env.prod <<EOF
# Gerado por provision.sh em $(date -u +%Y-%m-%dT%H:%M:%SZ)
# PERMISSOES 600 - nao versionar, nao compartilhar.

JWT_SECRET=$JWT_SECRET
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD

# Dominio com registro DNS apontando para o IP publico desta maquina.
#   preenchido -> o Caddy emite e renova certificado Let's Encrypt sozinho (443)
#   vazio      -> sem TLS publico; a :5678 so redireciona (nao serve conteudo)
DOMAIN=$SITE_DOMAIN

TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN:-}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID:-}

SENSENOVA_API_KEY=${SENSENOVA_API_KEY:-}
SENSENOVA_BASE_URL=${SENSENOVA_BASE_URL:-}
SENSENOVA_MODEL=${SENSENOVA_MODEL:-}

DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}
DEEPSEEK_BASE_URL=${DEEPSEEK_BASE_URL:-}
DEEPSEEK_MODEL=${DEEPSEEK_MODEL:-}

OPENAI_API_KEY=${OPENAI_API_KEY:-}
OPENAI_BASE_URL=${OPENAI_BASE_URL:-}
OPENAI_MODEL=${OPENAI_MODEL:-}

PORT=3000
EOF

chmod 600 .env.prod
rm -f "$DEV_ENV"

echo
echo "======================================================"
echo " CREDENCIAIS (guarde agora, nao vao aparecer de novo)"
echo "======================================================"
echo " Login do app (Web UI / API)"
echo "   usuario : $ADMIN_EMAIL"
echo "   senha   : $ADMIN_PASSWORD"
echo
echo " Nao existe mais Basic Auth: o Caddy bloqueia /api/auth/register"
echo " com 403 e o app cuida do login (JWT)."
echo "======================================================"
echo
echo "Arquivo: /opt/rss-news-hub/.env.prod"
