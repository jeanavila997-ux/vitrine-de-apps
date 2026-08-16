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

## Estado do domínio (verificado em 16/08/2026)

- HTTPS funcionando, `http` e `https` respondem
- Serve a **página padrão da Hostinger**, rodando PHP — o Node.js ainda não
  foi configurado, então `/api/saude` devolve 404
- O tráfego passa pelo **CDN da Hostinger** (`Server: hcdn`), e o domínio
  resolve para IPs do CDN, não para o IP da hospedagem. Isso significa que
  respostas podem ser cacheadas: se um deploy parecer não ter efeito, limpe
  o cache do CDN no hPanel antes de investigar o código.
- `www` resolve via `cdn.hstgr.net`

## Antes do primeiro deploy

1. **Sincronize o catálogo**, senão o site sobe com a vitrine vazia:
   ```bash
   npm run db:sync
   npm run db:check     # confirma o que ficou lá
   ```

2. **Cadastre a chave SSH.** O par já existe em `.keys/` (git-ignorado).
   Cole o conteúdo de `.keys/vitrine_deploy.pub` no hPanel:
   Avançado → Acesso SSH → Adicionar chave SSH.

   Para gerar outro par, se necessário:
   ```bash
   ssh-keygen -t ed25519 -C "vitrine-deploy" -f .keys/vitrine_deploy
   ```

3. **Configure a aplicação Node.js** no hPanel (Avançado → Node.js):
   - Versão: **24.x** (a mesma usada em desenvolvimento)
   - Arquivo de entrada: `server/index.js`
   - Raiz da aplicação: `public_html`

   Sem esse passo o domínio continua servindo a página padrão em PHP.

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
