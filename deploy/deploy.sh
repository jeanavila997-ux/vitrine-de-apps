#!/usr/bin/env bash
# Envia a Vitrine de Apps para a Hostinger.
#   npm run deploy
#
# Lê as variáveis SSH_* do .env. Não envia .env, node_modules, data/ nem .git —
# as variáveis de ambiente são configuradas no painel da Hostinger.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Erro: .env não encontrado. Copie de .env.example e preencha." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${SSH_HOST:?defina SSH_HOST no .env}"
: "${SSH_PORT:?defina SSH_PORT no .env}"
: "${SSH_USER:?defina SSH_USER no .env}"
: "${SSH_REMOTE_PATH:?defina SSH_REMOTE_PATH no .env}"

SSH_OPTS=(-p "$SSH_PORT")
if [ -n "${SSH_KEY_PATH:-}" ]; then
  SSH_OPTS+=(-i "$SSH_KEY_PATH")
  echo "Autenticando por chave: $SSH_KEY_PATH"
else
  echo "Autenticando por senha (recomendado migrar para chave SSH — ver deploy/README.md)"
fi

echo
echo "Destino: $SSH_USER@$SSH_HOST:$SSH_REMOTE_PATH"
echo

# Confere que o catálogo foi sincronizado — sem isso o site sobe vazio.
echo "Sincronizando catálogo com o MariaDB…"
npm run db:sync

echo
echo "Enviando arquivos…"
rsync -avz --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'data/' \
  --exclude '.env' \
  --exclude '*.log' \
  --exclude 'design-system/' \
  -e "ssh ${SSH_OPTS[*]}" \
  ./ "$SSH_USER@$SSH_HOST:$SSH_REMOTE_PATH/"

echo
echo "Instalando dependências no servidor…"
ssh "${SSH_OPTS[@]}" "$SSH_USER@$SSH_HOST" \
  "cd '$SSH_REMOTE_PATH' && npm ci --omit=dev"

echo
echo "Pronto. Verifique:"
echo "  curl ${PUBLIC_URL:-https://vitrinedeapps.cloud}/api/saude"
