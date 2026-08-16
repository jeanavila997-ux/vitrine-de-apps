# Vitrine de Apps — Plano de Criação

**Domínio público:** https://vitrinedeapps.cloud
**Pasta do projeto:** `C:\Users\Jeanc\vitrine-de-apps` (repositório git próprio)
**Última atualização:** 16/08/2026

---

## 1. O que é

Um **app gerenciador dos seus projetos**: uma dashboard inicial com visão geral
de tudo, um menu lateral, e uma seção dedicada para cada aplicativo.

Objetivo declarado: **automações, integrações e redirecionamentos completos
entre os seus aplicativos**.

### Navegação

```
┌─────────────┬──────────────────────────────────────┐
│             │                                      │
│  MENU       │   DASHBOARD (tela inicial)           │
│             │   ─────────────────────────          │
│  ⌂ Dashboard│   • Cards de status dos 5 apps       │
│             │   • Quais estão online/offline       │
│  ─ APPS ─   │   • Atividade recente                │
│  💬 Mult-Chat│   • Atalhos rápidos                  │
│  📚 Estante  │                                      │
│  🐂 Cruzamento│  ── ou, ao clicar num app ──        │
│  🖥 Mestre PC│   SEÇÃO DO APP                       │
│  🐄 BoiControl│  • Status, versão, repo, porta      │
│             │   • Botão iniciar/parar              │
│  ─ ─ ─ ─    │   • Abrir app / abrir código         │
│  ⚙ Automações│  • Logs e histórico                 │
│  🤖 Agente   │   • Integrações com outros apps      │
│  📊 Logs     │                                      │
└─────────────┴──────────────────────────────────────┘
```

---

## 2. Os 5 aplicativos da vitrine

Levantamento feito direto no disco e no GitHub (16/08/2026):

| App | Stack | Porta | Tipo | Banco | Login próprio |
|---|---|---|---|---|---|
| **MULT-CHAT-HUB** | Monorepo pnpm+turbo, Vite+React+Electron / Next.js | 3001 (lite), 3000 (API), 3002 (cloud) | Web + Electron | Supabase | Parcial |
| **Estante de Ebooks** | Electron + React + Vite + Fastify + PWA | 5173 (Vite), 3000 (Fastify) | Desktop + Web | SQLite | **Sim** (bcrypt+JWT) |
| **app-cruzamento-bovinos** | React 19 + Vite + Tailwind v4 + Electron | 5173 (dev), 3000 (prod) | SPA + Electron | Supabase | Não |
| **Mestre do PC V10** | Node + PowerShell + MCP + Ollama | 7777 | Serviço local | Nenhum | Não |
| **BoiControl** | React + Vite + shadcn + PWA | 8080 | SPA / PWA | Supabase + IndexedDB | Não |

### Onde cada um está

| App | Pasta local | Repositório |
|---|---|---|
| MULT-CHAT-HUB | `C:\Users\Jeanc\MULT-CHAT-HUB` | `avila2026/MULT-CHAT-HUB` |
| Estante de Ebooks | `F:\DOWNLOADS\Estante de Ebooks\app` | `jeanavila997-ux/Estante-de-Ebooks` |
| app-cruzamento-bovinos | `C:\Users\Jeanc\projects\app-cruzamento-bovinos` | `avila2026/app-cruzamento-bovinos` |
| Mestre do PC V10 | `C:\Users\Jeanc\Mestre-do-PC-V10-clean` | `jeanavila997-ux/Mestre-do-PC-V10` |
| BoiControl | `C:\Users\Jeanc\projects\boicontrol` | `jeanavila997-ux/boicontrol` |

### Divergências encontradas — precisam da sua decisão

1. **Estante de Ebooks tem dois repositórios**, ambos públicos e com conteúdo:
   `avila2026/Estante-de-Ebooks` e `jeanavila997-ux/Estante-de-Ebooks`. A cópia
   local aponta para o segundo. Qual é o oficial?
2. **A Estante mora no drive F:** (`F:\DOWNLOADS\...`). Se esse drive for
   removível, a vitrine não vai encontrá-la quando estiver desconectado.
3. **`app-cruzamento-bovinos` tem branch padrão `main-`** (com hífen no fim) —
   provavelmente um erro de digitação em algum momento.
4. **Cópias duplicadas**: MULT-CHAT-HUB e Mestre do PC existem em dois lugares
   cada. A vitrine vai catalogar a mais recente e ignorar a antiga.

---

## 3. ⚠ Ação urgente de segurança

**`C:\Users\Jeanc\projects\boicontrol\.env` está commitado no GitHub, num
repositório público.** Confirmado com `git ls-files .env`. A chave do Supabase
está exposta publicamente.

Correção recomendada (fora do escopo desta vitrine, mas urgente):

```bash
cd C:\Users\Jeanc\projects\boicontrol
git rm --cached .env
echo ".env" >> .gitignore
git commit -m "fix: remove .env do versionamento"
git push
```

E depois **rotacionar a chave no painel do Supabase** — remover do git não apaga
o histórico, a chave antiga continua acessível para quem procurar.

Outros pontos, menos graves:
- `MULT-CHAT-HUB/.env.example` lista chaves sensíveis (conferir se são
  placeholders de verdade antes de qualquer publicação)
- Senha do MySQL da Hostinger apareceu num print de tela — trocar após a Fase 7

---

## 4. Decisões tomadas

| Decisão | Escolha |
|---|---|
| Linguagem do agente | **TypeScript E Python** — mesmo agente espelhado nos dois SDKs |
| Banco de dados | **SQLite local** (fonte da verdade offline) **+ MySQL Hostinger** (produção) |
| Autenticação | Login próprio, e-mail e senha (bcrypt + cookie httpOnly) |
| Escopo do MVP | Dashboard + menu + seções dos 5 apps + iniciar/parar + agente |
| Deploy | `vitrinedeapps.cloud` via SSH (Hostinger) |

---

## 5. Dois modos de operação

Essa distinção é o ponto mais importante da arquitetura, porque os apps são
muito diferentes entre si:

### Modo Local (na sua máquina, porta 4400)

A vitrine controla os apps de verdade: inicia, para, mostra status ao vivo,
abre o código. Funciona com todos os 5, inclusive o Mestre do PC (que só roda
em `127.0.0.1`) e os Electron.

### Modo Público (vitrinedeapps.cloud)

O servidor da Hostinger não tem como iniciar processos na sua máquina. Lá a
vitrine é um **portal**: mostra cada app, o que faz, prints, e leva para onde
o app realmente está.

| App | Como aparece no site público |
|---|---|
| MULT-CHAT-HUB | Link para a versão cloud (Next.js) |
| Estante de Ebooks | Página do app + download do instalador |
| app-cruzamento-bovinos | Build estático hospedado em subpasta |
| Mestre do PC V10 | Página de apresentação + download (é local-only) |
| BoiControl | Build estático (PWA) hospedado em subpasta |

Estrutura no servidor:

```
vitrinedeapps.cloud/                    → dashboard (portal)
vitrinedeapps.cloud/apps/boicontrol/    → build estático
vitrinedeapps.cloud/apps/cruzamento/    → build estático
vitrinedeapps.cloud/apps/estante/       → página + download
vitrinedeapps.cloud/apps/mestre-pc/     → página + download
vitrinedeapps.cloud/apps/mult-chat/     → redireciona para o cloud
```

---

## 6. Infraestrutura Hostinger

### Banco MySQL

Banco provisionado no hPanel da Hostinger. Host, nome, usuário e senha ficam
todos em `.env` (git-ignorado) — ver `.env.example` para as chaves esperadas:
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

> O banco roda **MariaDB 11.8.8**, não MySQL. O schema passou sem ajuste, mas
> vale lembrar disso se um dia precisarmos de recurso específico do MySQL 8.

### Acesso SSH

Habilitado no hPanel (Avançado → Acesso SSH). Host, porta e usuário ficam em
`.env`: `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_REMOTE_PATH`.

> **Recomendação:** troque a autenticação por senha por **chave SSH** (o hPanel
> tem a opção "Adicionar chave SSH"). Isso permite deploy automatizado sem senha
> digitada e é bem mais seguro. Eu gero o par de chaves quando você quiser.

**Por que dois bancos?** O app roda na sua máquina controlando processos locais,
então precisa funcionar sem internet — daí o SQLite. O MySQL guarda a cópia
sincronizada que alimenta o site público.

---

## 7. Portas escolhidas

Seu ambiente já tem colisões — **3000** é disputada por MULT-CHAT-HUB, Estante e
cruzamento-bovinos; **5173** por Estante e cruzamento-bovinos. A vitrine usa
faixa livre:

| Porta | Uso |
|---|---|
| **4400** | Servidor Express (API + serve a UI em produção) |
| **4401** | Vite dev server (só em desenvolvimento) |
| **4410–4460** | Pool reservado para apps lançados pela Vitrine |

A vitrine vai **detectar colisão antes de iniciar** um app e avisar, em vez de
falhar silenciosamente.

---

## 8. Estrutura de pastas

```
vitrine-de-apps/
├── server/                     # Backend Express (porta 4400)
│   ├── index.js                # Entrada do servidor
│   ├── db.js                   # SQLite + pool MySQL
│   ├── auth.js                 # Login, sessão, bcrypt
│   ├── scanner.js              # Varre o disco e cataloga projetos
│   ├── process-manager.js      # Inicia/para apps (spawn + taskkill)
│   ├── sync-mysql.js           # Sincroniza SQLite → MySQL Hostinger
│   ├── apps-registry.json      # Os 5 apps: caminho, comando, porta, ícone
│   ├── allowed-commands.json   # Allowlist de comandos permitidos
│   └── schema.sql              # DDL das tabelas
│
├── web/                        # Frontend Vite + React + TypeScript
│   ├── src/
│   │   ├── layouts/AppShell.tsx    # Menu lateral + área de conteúdo
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx       # Tela inicial
│   │   │   ├── AppSection.tsx      # Seção individual de cada app
│   │   │   ├── Automacoes.tsx
│   │   │   ├── Agente.tsx
│   │   │   └── Logs.tsx
│   │   └── components/
│   └── vite.config.ts
│
├── agent-ts/                   # Agente em TypeScript
├── agent-py/                   # Agente em Python (espelho)
├── shared/agent-contract.json  # Fonte única das ferramentas
├── deploy/deploy.sh            # Build + rsync via SSH
├── .env                        # Credenciais (git-ignorado)
└── PLANO.md                    # Este arquivo
```

---

## 9. Schema do banco

Oito tabelas, iguais no SQLite e no MySQL:

| Tabela | Guarda |
|---|---|
| `usuarios` | Login: e-mail, hash da senha, data de criação |
| `sessoes` | Sessões ativas com expiração |
| `apps` | Os 5 apps: nome, slug, caminho, repo, stack, porta, comando, ícone |
| `app_status` | Última checagem: online/offline, PID, uptime |
| `execucoes` | Histórico de quem iniciou/parou qual app e quando |
| `automacoes` | Regras "quando X acontecer, faça Y" |
| `integracoes` | Ligações entre apps (ex.: app A chama a API do app B) |
| `logs_agente` | Tudo que o agente fez, para auditoria |

---

## 10. As 7 ferramentas do agente

Definidas uma vez em `shared/agent-contract.json` e implementadas identicamente
nos dois SDKs — é isso que garante que o agente TS e o Python sejam o mesmo
agente.

| # | Ferramenta | O que faz | Destrutiva? |
|---|---|---|---|
| 1 | `listar_apps` | Lista os apps do catálogo | Não |
| 2 | `detalhar_app` | Detalhes de um app específico | Não |
| 3 | `status_apps` | Quais apps estão rodando agora | Não |
| 4 | `escanear_disco` | Varre o disco procurando projetos novos | Não |
| 5 | `iniciar_app` | Sobe um app | **Sim — pede confirmação** |
| 6 | `parar_app` | Derruba um app | **Sim — pede confirmação** |
| 7 | `registrar_automacao` | Cria uma regra de automação | Sim |

---

## 11. Segurança

Regras herdadas do Mestre do PC V10, que já provaram valor:

1. **Allowlist obrigatória** — todo comando executável fica registrado em
   `allowed-commands.json`. Nada de comando livre ou gerado por IA.
2. **Sanitização de entrada** — argumentos passam por filtro que rejeita
   qualquer coisa fora de `[a-zA-Z0-9_. \-]`, máximo 128 caracteres.
3. **Confirmação para operações destrutivas** — `iniciar_app`, `parar_app` e
   qualquer escrita em disco exigem confirmação explícita.
4. **Segredos só no `.env`** — nunca em `.env.example`, nunca commitado.
   *(O caso do `boicontrol` na seção 3 é exatamente o que não pode acontecer.)*
5. **Validação de origem** — POST só aceita requisições da própria origem.
   Sem CORS `*`.
6. **Sessão em cookie httpOnly** + rate limit no login.

---

## 12. Fases de construção

| Fase | Entrega | Como saber que funcionou |
|---|---|---|
| **0** | Plano + PDF + estrutura de pastas | Você lê e aprova |
| **1** | Banco + login | Criar conta, entrar, sair |
| **2** | Registro dos 5 apps + scanner | Catálogo mostra os 5 corretamente |
| **3** | Gerenciador de processos | Iniciar e parar o BoiControl pela API |
| **4** | Dashboard + menu + seções | Navegar entre os 5 apps na interface |
| **5** | Agente TypeScript | Perguntar "quais apps estão rodando?" e ter resposta |
| **6** | Agente Python (espelho) | Mesma pergunta, mesma resposta |
| **7** | Sync MySQL | Dados aparecem no phpMyAdmin da Hostinger |
| **8** | Deploy SSH | `vitrinedeapps.cloud` no ar |

---

## 13. O que vem depois do MVP

- **Redirecionamentos entre apps** (o objetivo original): clicar num app e cair
  direto na rota certa de outro, com sessão compartilhada
- Automações agendadas (Windows Task Scheduler)
- Notificações quando um app cai
- Métricas de uso: qual projeto você mais abre
- Deploy automático: push no GitHub → build → rsync para a Hostinger

---

## 14. Riscos conhecidos

| Risco | Mitigação |
|---|---|
| SQLite é padrão novo no seu portfólio | `better-sqlite3`, síncrono e simples |
| Estante de Ebooks mora no drive `F:` | Detectar drive ausente e marcar como indisponível |
| Estante tem dois repositórios | Você decide qual é o oficial |
| Chave do Supabase do BoiControl exposta | Rotacionar — ver seção 3 |
| Senha do MySQL exposta em print | Trocar no hPanel após a Fase 7 |
| Matar processo no Windows é traiçoeiro | `taskkill /PID /T /F` mata a árvore inteira |
| Portas em conflito | Verificar antes de subir e avisar |
| Mestre do PC não roda hospedado | No site público vira página de download |
