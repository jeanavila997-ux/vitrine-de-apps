# Deploy — vitrinedeapps.cloud

A hospedagem roda Node.js (18 a 24) com suporte a Express, então o mesmo
servidor da Vitrine roda em produção. Não há build separado nem site estático.

## O que muda em produção

| | Local | Hospedado |
|---|---|---|
| Fonte dos dados | SQLite (`data/vitrine.db`) | MariaDB da Hostinger |
| Iniciar/parar apps | Sim | **Não** — o servidor não alcança sua máquina |
| Escuta em | `127.0.0.1` | `0.0.0.0`, porta definida pela plataforma |

O modo é decidido por `VITRINE_MODO` (`local` ou `hospedado`). Se não for
definido, `NODE_ENV=production` já implica `hospedado`.

## Antes do primeiro deploy

1. **Sincronize o catálogo**, senão o site sobe com a vitrine vazia:
   ```bash
   npm run db:sync
   npm run db:check     # confirma o que ficou lá
   ```

2. **Prefira chave SSH a senha.** No hPanel: Avançado → Acesso SSH →
   Adicionar chave SSH. Gere com:
   ```bash
   ssh-keygen -t ed25519 -C "vitrine-deploy" -f ~/.ssh/vitrine_deploy
   ```
   Cole o conteúdo de `~/.ssh/vitrine_deploy.pub` no painel e aponte
   `SSH_KEY_PATH` no `.env` para a chave privada.

## Deploy

```bash
npm run deploy
```

O script envia os arquivos, roda `npm ci --omit=dev` no servidor e reinicia
a aplicação. Não envia: `node_modules`, `.env`, `data/`, `.git`.

## Variáveis no servidor

O `.env` **não** é enviado — configure as variáveis no painel da Hostinger
(Avançado → Node.js → variáveis de ambiente):

```
NODE_ENV=production
VITRINE_MODO=hospedado
SESSION_SECRET=<string aleatória de 32+ caracteres>
DB_HOST=...
DB_PORT=3306
DB_NAME=...
DB_USER=...
DB_PASSWORD=...
PUBLIC_URL=https://vitrinedeapps.cloud
```

Gere o `SESSION_SECRET` com:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Verificação depois de subir

```bash
curl https://vitrinedeapps.cloud/api/saude
# espera: {"ok":true,"modo":"hospedado","podeControlarProcessos":false,...}

curl https://vitrinedeapps.cloud/api/apps
# espera: {"total":5,...}
```

Se `/api/apps` devolver erro de conexão, o MariaDB não está acessível a partir
do servidor — confira as variáveis `DB_*` no painel.
