# Vitrine de Apps

Gerenciador e orquestrador dos meus projetos: catálogo visual, controle de
processos e um agente Claude — com automações, integrações e redirecionamentos
entre os aplicativos.

**Site público:** https://vitrinedeapps.cloud
**Local:** http://127.0.0.1:4400

---

## Começando

```bash
npm install
cp .env.example .env      # preencha as credenciais
npm run db:init           # cria as tabelas no SQLite
npm run db:seed           # popula o catálogo com os 6 apps
npm start                 # sobe em 127.0.0.1:4400
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor na porta 4400 |
| `npm run dev` | Igual, mas reinicia ao salvar arquivo |
| `npm run db:init` | Cria as tabelas no SQLite local |
| `npm run db:init:mysql` | Cria as tabelas no MariaDB da Hostinger |
| `npm run db:seed` | Popula o catálogo a partir de `apps-registry.json` |
| `npm run db:sync` | Envia o catálogo local para a Hostinger |
| `npm run db:check` | Mostra o que existe de fato no servidor |
| `npm run check` | Verifica sintaxe dos arquivos do servidor |
| `npm run plano:pdf` | Regenera `PLANO.html` a partir do `PLANO.md` |

Todos os scripts de banco são idempotentes — rodar de novo não apaga nada.

## Arquitetura

```
server/          Backend Express (porta 4400)
├── config.js         Configuração central — o domínio mora aqui
├── db.js             SQLite local + pool MariaDB
├── sync-mysql.js     SQLite → Hostinger (nunca o contrário)
├── apps-registry.json Os 6 apps: caminho, porta, comando, cor
├── schema.sqlite.sql  9 tabelas + view
└── schema.mysql.sql   As mesmas, em MariaDB

public/          Interface — dashboard, menu, seção por app
design-system/   Componentes (sincronizados com claude.ai/design)
```

**Dois bancos, uma direção.** O SQLite local é a fonte da verdade: o app
controla processos na sua máquina e precisa funcionar sem internet. O MariaDB
da Hostinger recebe a cópia que alimenta o site público. A sincronização é
sempre SQLite → MariaDB.

**Dois modos.** Localmente a Vitrine inicia e para os apps de verdade — pelo
botão da UI ou pelo agente de chat (com confirmação para parar). Em
`vitrinedeapps.cloud` ela é um portal: mostra cada app e leva para onde ele
está — o servidor não tem como iniciar processos na sua máquina.

**Agente com três backends.** O chat tenta em ordem: Ollama (local) →
[Dify](docs/dify-setup.md) → Anthropic. Cada um é opcional; a configuração do
app no Dify está em `docs/dify-setup.md`.

## Os aplicativos

| App | Porta | Tipo | Repositório |
|---|---|---|---|
| MULT-CHAT-HUB | 3001 | híbrido | `avila2026/MULT-CHAT-HUB` |
| Estante de Ebooks | 5173 | híbrido | `jeanavila997-ux/Estante-de-Ebooks` |
| Cruzamento Bovinos | 5173 | web | `avila2026/app-cruzamento-bovinos` |
| Mestre do PC V10 | 7777 | serviço | `jeanavila997-ux/Mestre-do-PC-V10` |
| BoiControl | 8080 | web | `jeanavila997-ux/boicontrol` |
| HomeoVet | — | desktop | `jeanavila997-ux/homeovet` |

O HomeoVet é um agente de IA em Python para terminal — sem servidor nem
porta, por isso não tem botão de iniciar na Vitrine.

A porta 4400 (servidor), 4401 (Vite) e a faixa 4410–4460 (apps lançados) foram
escolhidas fora das que já colidem: 3000 é disputada por três projetos e 5173
por dois.

## Segurança

- Credenciais só no `.env`, que é git-ignorado. `.env.example` nunca leva valor real.
- Todo comando executável fica registrado em allowlist — nada de comando livre.
- Argumentos passam por sanitização antes de chegar ao shell.
- Operações destrutivas exigem confirmação.
- POST valida origem. Sem CORS `*`.

## Estado atual

Fases concluídas: **0** (plano), **1** (banco), **2** (catálogo) e a base da
**4** (interface). Ver `PLANO.md` para o roteiro completo.

O que já funciona: dashboard com métricas reais, menu com os 6 apps e status,
seção individual de cada app, **iniciar/parar apps de verdade** (modo local,
via allowlist de comandos), agente de chat com Ollama, Dify e Anthropic
(cadeia de fallback), sincronização com a Hostinger e painel de conexões.

O que ainda não: login, automações, integrações e redirecionamentos entre apps.
