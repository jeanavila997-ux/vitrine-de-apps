# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## O que é

Orquestrador dos projetos do usuário: catálogo dos apps, controle de processos
e um agente Claude. `vitrinedeapps.cloud` foi perdido — o catálogo público
hoje é estático, publicado via GitHub Pages em
**jeanavila997-ux.github.io/vitrine-de-apps** (gerado por `npm run
pages:build`, ver `scripts/build-pages.mjs`). O servidor Node na Hostinger
(modo `hospedado`, seção abaixo) segue existindo para quem acessa direto,
mas não tem mais domínio público apontando pra ele.

Repositório: `jeanavila997-ux/vitrine-de-apps` (**público** — ver a seção de
segredos antes de commitar qualquer coisa).

## Comandos

```bash
npm start                 # servidor em 127.0.0.1:4400
npm run dev               # idem, reinicia ao salvar
npm run check             # node --check nos arquivos do servidor

npm run db:init           # cria as 9 tabelas no SQLite local
npm run db:init:mysql     # cria as mesmas no MariaDB da Hostinger
npm run db:seed           # popula o catálogo a partir de apps-registry.json
npm run db:sync           # envia catálogo local -> MariaDB
npm run db:check          # lista o que existe de fato no servidor remoto

npm run deploy            # rsync + ssh (ver deploy/ESTADO.md antes)
npm run plano:pdf         # regenera PLANO.html a partir do PLANO.md
npm run pages:build       # regenera docs/index.html (catálogo do GitHub Pages)
```

Todos os scripts de banco são idempotentes (`CREATE ... IF NOT EXISTS`,
UPSERT por slug). Rodar de novo nunca apaga dados.

Testes de regressão em `server/test/` — `npm test` valida o registry contra
os constraints do schema e o fluxo `db:init` + `db:seed` em banco novo.

## Arquitetura

### Dois bancos, uma direção

O SQLite (`data/vitrine.db`) é a **fonte da verdade**. O servidor controla
processos da máquina do usuário, então precisa funcionar sem internet. O
MariaDB da Hostinger recebe a cópia que alimenta o site público.

A sincronização é sempre **SQLite → MariaDB**, nunca o contrário
(`server/sync-mysql.js`). Como os ids divergem entre os dois bancos, o sync
faz UPSERT por `slug` e remapeia `app_id` consultando os ids remotos.

### Dois modos de execução

`config.modo` decide tudo (`server/config.js`):

| | `local` | `hospedado` |
|---|---|---|
| Fonte dos dados | SQLite | MariaDB |
| Controle de processos | sim | **não** |
| Bind | `127.0.0.1` | `0.0.0.0` |

O modo vem de `VITRINE_MODO`; sem ele, `NODE_ENV=production` implica
`hospedado`. Rotas que leem dados usam as funções `*PorModo` de `db.js`, que
escolhem a fonte — nunca chame `listarApps()` direto numa rota.

O servidor hospedado não alcança a máquina do usuário. Isso não é limitação a
corrigir: iniciar/parar apps só existe no modo local, por construção.

### Catálogo

`server/apps-registry.json` é a definição dos apps (caminho, porta, comando,
cor, ícone). `npm run db:seed` o carrega para a tabela `apps` e marca como
`indisponivel` o que não existe no disco — a Estante de Ebooks mora em `F:`,
que nem sempre está montado.

### Schema

9 tabelas + 1 view, espelhadas em `schema.sqlite.sql` e `schema.mysql.sql`:
`usuarios`, `sessoes`, `apps`, `app_status`, `execucoes`, `automacoes`,
`integracoes`, `logs_agente`, e a view `v_apps_com_status`.

**Ao alterar o schema, altere os dois arquivos.** Eles não são gerados um do
outro.

## Catálogo público (GitHub Pages)

`docs/index.html` é gerado por `scripts/build-pages.mjs` a partir de
`server/apps-registry.json` — sem status ao vivo, sem banco: é só a lista de
apps pra quem só tem o link público. Rode `npm run pages:build` e commite o
resultado sempre que o registry mudar (não é gerado em CI).

No GitHub, em **Settings → Pages**, a fonte precisa estar como "Deploy from a
branch", branch `main`, pasta `/docs` — é um toggle manual, único, que
nenhuma ferramenta de agente configura por aqui.

## Portas

`4400` (servidor), `4401` (Vite), `4410–4460` (pool para apps lançados).
Escolhidas fora das faixas que já colidem no ambiente do usuário: a `3000` é
disputada por três projetos e a `5173` por dois. Ao adicionar qualquer porta,
verifique conflito antes.

## Agente — cadeia de backends

O chat do agente tenta os backends em ordem até um responder: **Ollama →
Dify → Anthropic**. Cada um é opcional; sem credenciais, é pulado.

O Dify (plataforma de agentes/workflows de LLM) mantém o estado da conversa
no servidor dele: `agente.js` guarda o `conversation_id` entre mensagens e o
botão de limpar o chat reinicia o thread via `/api/dify/conversa/limpar`.
Config em `config.dify` (`DIFY_API_URL` com prefixo de versão, `DIFY_API_KEY`
por app, `DIFY_USER`). Guia de criação do app no Dify: `docs/dify-setup.md`.

### Agente controla processos

Os comandos `iniciar/parar` do chat executam de fato via `executarAcao` do
`process-manager.js` — mesma allowlist, mesma auditoria (`origem = 'agente'`
em `execucoes`). `parar` é destrutivo: exige `confirmar <slug>` em até 2
minutos (confirmação em memória, um pending por app). Apps sem
`comando_start` (ex.: HomeoVet) são recusados com aviso.

Atenção: em apps com porta compartilhada (issue #4), `verificarStatus`
ainda infere estado pela porta — evitar parar via agente enquanto a
colisão da 5173 existir.

## Segredos — o repositório é público

- Credenciais só no `.env` (git-ignorado). `.env.example` nunca leva valor real.
- **Nunca** escreva host, usuário, nome do banco, IP ou porta SSH em arquivo
  versionado — nem em documentação, nem em comentário de SQL, nem em HTML de
  componente. Refira-se às chaves do `.env`.
- Antes de qualquer push, varra o que está staged:

```powershell
# Monte a lista a partir do seu .env — não escreva os valores aqui.
$alvos = (Get-Content .env) -match '^(DB_HOST|DB_USER|DB_NAME|SSH_HOST|SSH_PORT)=' |
         ForEach-Object { ($_ -split '=', 2)[1].Trim() } | Where-Object { $_ }
foreach ($p in $alvos) { git grep --cached -n -F $p -- ':!*.pdf' }
```

- A chave SSH de deploy fica em `.keys/` (git-ignorado). No Windows, o SSH a
  recusa por ACL aberta — corrija com `icacls`.
- O histórico também vaza: dados sensíveis já commitados exigem reescrever o
  histórico, não só corrigir o arquivo.

## Ambiente de produção

- MariaDB **11.8.8**, não MySQL — não conte com recursos exclusivos do MySQL 8.
- Node do servidor: `/opt/alt/alt-nodejs24/root/usr/bin/node` (v24.6.0).
  **Não está no PATH** — exporte antes de cada comando remoto.
- Destino do deploy: `~/domains/vitrinedeapps.cloud/public_html`.
- A conta hospeda **22 domínios**. Nunca use `rsync --delete` sem listar o
  destino antes; prefira extrair tarball, que não apaga.
- O tráfego passa pelo CDN (`Server: hcdn`) — respostas ficam cacheadas.
- **O site é do tipo PHP/HTML, não Web App (Node.js).** Por isso o domínio
  ainda serve `default.php` apesar do código estar no servidor e funcionar.
  Ver `deploy/ESTADO.md`.

## Convenções

- ESM (`"type": "module"`), Node >= 20.
- Código e mensagens de commit em português; commits convencionais
  (`feat:`, `fix:`, `docs:`, `chore:`).
- Nomes de identificadores e colunas em português, sem acento
  (`atualizado_em`, `podeControlarProcessos`).
- `server/config.js` centraliza tudo que vem do ambiente — não espalhe
  `process.env` pelo código.
- O domínio aparece em `config.dominio`, no `homepage` do `package.json` e em
  `PUBLIC_URL`.

## Documentos

- `PLANO.md` — plano completo, 8 fases, decisões e riscos
- `deploy/ESTADO.md` — o que já foi feito no deploy e o que está bloqueado
- `deploy/README.md` — passo a passo e variáveis do painel
- `design-system/` — componentes, sincronizados com claude.ai/design
